import { NextResponse } from "next/server";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/service";
import { cleanDomain, isWellFormedDomain } from "@/lib/projects/project-form";
import { resolveBusinessContext } from "@/lib/projects/business-profile";
import { suggestPrompts } from "@/lib/projects/prompt-suggestions-llm";
import { generateOpenAIVisibilityAnswer, extractOpenAIStructuredData } from "@/lib/llm/openai";
import { extractGeminiStructuredData } from "@/lib/llm/gemini";
import { verifyExtractedMentions } from "@/lib/scan/extraction";
import {
  checkPublicCheckLimits,
  clientIpFromHeaders,
  hashIp
} from "@/lib/free-checker/rate-limit";
import {
  PUBLIC_CHECK_ENGINE,
  PUBLIC_CHECK_ENGINE_LABEL,
  runPublicCheck
} from "@/lib/free-checker/run-check";
import type { PublicCheckResponse } from "@/lib/free-checker/api-contract";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * FREE-CHECKER-1 Fase B3 — la comprobación anónima.
 *
 * **La única ruta del producto que gasta dinero sin sesión**, así que el
 * orden de lo que hace aquí no es estilo:
 *
 *   1. Valida la forma del dominio (barato, antes de tocar nada).
 *   2. Resuelve la IP y la hashea. Sin sal configurada NO se degrada a
 *      "contar sin IP": se corta, porque contar sin IP es no contar.
 *   3. Comprueba los tres límites. Fallan cerrado.
 *   4. **Inserta la fila ANTES de gastar.** Si se insertara después, una
 *      comprobación que revienta a mitad no contaría para el techo y un fallo
 *      repetido sería gasto ilimitado e invisible — el techo dejaría de ser
 *      un techo justo cuando más falta hace.
 *   5. Ejecuta con un deadline calculado contra ESTA invocación.
 *   6. Cierra la fila con el resultado.
 *
 * El paso 6 es el único que puede fallar sin consecuencia: si la fila se
 * queda en `pending`, sigue contando para el techo, que es la dirección
 * segura.
 */

const RequestSchema = z.object({ domain: z.string().min(1).max(255) });

/** Margen bajo `maxDuration` para que el cierre de la fila y la respuesta quepan. */
const INVOCATION_BUDGET_MS = 52_000;

const LOG_PREFIX = "[geo:free-checker]";

function json(body: PublicCheckResponse, init?: number) {
  return NextResponse.json(body, { status: init ?? 200 });
}

export async function POST(request: Request) {
  const startedAt = Date.now();

  let domain: string;
  try {
    const parsed = RequestSchema.parse(await request.json());
    domain = cleanDomain(parsed.domain);
  } catch {
    return json({ status: "failed", error: "site_unreachable" }, 400);
  }
  if (!isWellFormedDomain(domain)) {
    return json({ status: "failed", error: "site_unreachable" }, 400);
  }

  // La IP se hashea o no se comprueba. Un fallback "sin IP" haría que todos
  // los visitantes compartieran contador, que es un límite global disfrazado
  // de límite por IP — peor que no tenerlo, porque parece que lo tienes.
  const ip = clientIpFromHeaders(request.headers);
  let ipHash: string;
  try {
    if (!ip) throw new Error("no client ip");
    ipHash = hashIp(ip, process.env.PUBLIC_CHECK_IP_SALT);
  } catch {
    console.error(`${LOG_PREFIX} ip_hash_unavailable`);
    return json({ status: "degraded", reason: "limit_check_failed" });
  }

  let service: ReturnType<typeof createServiceClient>;
  try {
    service = createServiceClient();
  } catch {
    console.error(`${LOG_PREFIX} service_client_unavailable`);
    return json({ status: "degraded", reason: "limit_check_failed" });
  }

  const limits = await checkPublicCheckLimits(service, { ipHash, domain });
  if (!limits.allowed) {
    // El techo global y el fallo de conteo caen a la Fase A: no es culpa del
    // visitante y no gana nada sabiendo la causa. Los límites por IP y por
    // dominio sí se le dicen, porque puede actuar (crear cuenta).
    if (limits.reason === "global_ceiling_reached" || limits.reason === "limit_check_failed") {
      return json({ status: "degraded", reason: limits.reason });
    }
    return json({ status: "degraded", reason: limits.reason });
  }

  // ANTES de gastar. Ver la cabecera.
  const { data: inserted, error: insertError } = await service
    .from("public_checks")
    .insert({ domain, ip_hash: ipHash, status: "pending", engine: PUBLIC_CHECK_ENGINE })
    .select("id")
    .single();

  if (insertError || !inserted) {
    console.error(`${LOG_PREFIX} insert_failed`);
    return json({ status: "degraded", reason: "limit_check_failed" });
  }

  const outcome = await runPublicCheck(
    domain,
    {
      resolveBusinessContext,
      suggestPrompts,
      generateAnswer: generateOpenAIVisibilityAnswer,
      extract: extractOpenAIStructuredData,
      // Leer la respuesta de ChatGPT es un paso interno. Ver `extractFallback`.
      extractFallback: extractGeminiStructuredData,
      verify: (data, rawResponseText, brand) =>
        verifyExtractedMentions(data as never, rawResponseText, brand) as never
    },
    { deadlineAt: startedAt + INVOCATION_BUDGET_MS }
  );

  // La causa, saneada y escrita por este repositorio, va a los dos sitios donde
  // un operador la busca: el log de ejecución y la propia fila. Se escribe
  // TAMBIÉN cuando la comprobación salió adelante por el motor de reserva —
  // recuperarse en silencio de un proveedor roto es cómo los 429 de OpenAI
  // corrieron cuatro días sin que nadie se enterara (`docs/adr/0029`).
  if (outcome.detail) {
    console.error(
      `${LOG_PREFIX} ${outcome.status} domain=${domain} error=${outcome.status === "failed" ? outcome.error : "none"} cause=${outcome.detail}`
    );
  }

  // Cerrar la fila. Un fallo aquí deja `pending`, que sigue contando para el
  // techo — la dirección segura.
  await service
    .from("public_checks")
    .update(
      outcome.status === "completed"
        ? {
            status: "completed",
            brand_mentioned: outcome.brandMentioned,
            error_category: outcome.detail ?? null
          }
        : {
            status: "failed",
            error_category: outcome.detail ? `${outcome.error}:${outcome.detail}` : outcome.error
          }
    )
    .eq("id", inserted.id)
    .then(undefined, () => console.error(`${LOG_PREFIX} close_row_failed`));

  // `detail` no sale de aquí: es diagnóstico de servidor y lo lee un
  // desconocido (`.claude/rules/gemini.md`, "sanitize all errors").
  if (outcome.status !== "completed") {
    return json({ status: "failed", error: outcome.error });
  }

  return json({
    status: "completed",
    brand: outcome.brand,
    prompt: outcome.prompt,
    engineLabel: PUBLIC_CHECK_ENGINE_LABEL,
    answer: outcome.answer,
    brandMentioned: outcome.brandMentioned,
    // `outcome.brandPosition` NO se reenvía. Ver el comentario de
    // `PublicCheckResponse.otherBrands` en api-contract.ts — sigue fuera del
    // contrato tras Fase D2, a propósito.
    otherBrands: outcome.otherBrands,
    citedOwnDomain: outcome.citedOwnDomain,
    sources: outcome.sources
  });
}
