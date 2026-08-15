import type { BusinessProfile } from "@/lib/llm/contracts";
import { deriveBrandFromDomain } from "@/lib/projects/project-form";

/**
 * FREE-CHECKER-1 Fase B2 — una comprobación anónima, de principio a fin.
 *
 * **Qué NO es.** No es un escaneo recortado. No crea proyecto, no toca
 * `scan_runs`, `jobs` ni `scan_prompt_results`, y no importa nada de
 * `lib/scan/**`. Meter a un anónimo por el pipeline exigiría inventarle un
 * proyecto propiedad de alguien, que es basura en la tabla de un cliente y
 * contamina sus métricas. Lo que sí reutiliza es la capa de LLM, que es la
 * dirección correcta según `.claude/rules/scan.md`: **el escaneo sabe que
 * llama a LLMs; la capa de LLM no tiene por qué saber que existe un
 * escaneo.**
 *
 * **La comprobación es real o no hay comprobación.** Llamada en vivo,
 * respuesta cruda devuelta al visitante, y la mención decidida por la
 * extracción con `verifyExtractedMentions` — nunca por un `includes()` sobre
 * el texto, que daría falsos positivos en cuanto la marca sea una palabra
 * común. Si algo de eso falla, el resultado es un error categorizado y la
 * página lo dice; no hay camino que produzca un resultado inventado.
 *
 * **Un solo prompt, y por eso el veredicto está acotado.** El producto exige
 * diez respuestas antes de etiquetar una puntuación como fiable, así que aquí
 * no se calcula ninguna: se devuelve lo observado en ESTA respuesta y el aviso
 * de que una tirada no es una medición. Cualquier cifra agregada que saliera
 * de aquí sería una métrica inventada.
 */

/**
 * El motor de la comprobación gratuita: **ChatGPT** (decisión del fundador,
 * 2026-08-15, revisando la de Gemini unas horas antes).
 *
 * Cuesta 5,5× más por llamada ($0,0117 contra $0,0020, medidos en
 * `docs/llm-cost-analysis-2026-08.md` — el 86% es la tarifa de `web_search`,
 * no el modelo). Lo que se compra con esa diferencia es que la página pueda
 * llamarse por su nombre: **"¿te menciona ChatGPT?" es la consulta que la
 * gente escribe**, y preguntándole a Gemini el titular habría sido un reclamo
 * falso. El ahorro estaba en el eje equivocado — recortaba la factura y tiraba
 * la palabra clave que justifica la página entera.
 *
 * El perfil del negocio y la derivación de la pregunta siguen en Gemini a
 * propósito: son pasos internos que el visitante nunca ve, así que ahí el
 * motor barato no cuesta nada en honestidad ni en posicionamiento.
 */
export const PUBLIC_CHECK_ENGINE = "openai" as const;

/** Cómo se nombra el motor ANTE EL VISITANTE. Nunca "openai" ni "gpt-4o-mini". */
export const PUBLIC_CHECK_ENGINE_LABEL = "ChatGPT";

/** País e idioma por defecto: el mercado del producto. */
export const PUBLIC_CHECK_COUNTRY = "es";
export const PUBLIC_CHECK_LANGUAGE = "es";

/**
 * Categorías de fallo. Constantes de este repositorio, nunca el mensaje crudo
 * del proveedor (`.claude/rules/gemini.md`, "sanitize all errors") — un
 * mensaje de proveedor puede filtrar endpoints, cuotas o trazas, y aquí lo
 * lee un desconocido.
 */
export type PublicCheckError =
  /** No se pudo leer la portada y sin ella no hay ni marca ni pregunta. */
  | "site_unreachable"
  /** La IA no devolvió respuesta utilizable. */
  | "engine_unavailable"
  /** Se obtuvo respuesta pero no se pudo interpretar. */
  | "extraction_failed"
  /** No quedaba invocación para el siguiente paso. Ver `PUBLIC_CHECK_STEP_BUDGET_MS`. */
  | "budget_exhausted"
  /** Configuración del servidor. Nunca es culpa del visitante. */
  | "config";

/**
 * Lo que hay que reservar antes de EMPEZAR un paso que llama a un LLM.
 *
 * `GEMINI_CALL_TIMEOUT_MS` son 20 s y esta comprobación encadena cuatro
 * llamadas (perfil, pregunta, generación, extracción): 80 s de peor caso
 * dentro de una función con `maxDuration = 60`. Sin presupuesto, la
 * comprobación lenta no devuelve un error — la mata Vercel a los 60 s con un
 * 504 sin cuerpo, **con el dinero ya gastado** y el visitante mirando una
 * página rota.
 *
 * La regla es de `.claude/rules/scan.md` y se aplica igual aquí: se calcula un
 * deadline absoluto al entrar y se pregunta **antes** de cada paso si su peor
 * caso entero cabe, nunca después si ya se pasó. Un paso que arranca a
 * segundo 45 y puede durar 20 es el fallo que ADR 0037 documenta.
 */
export const PUBLIC_CHECK_STEP_BUDGET_MS = 21_000;

export type PublicCheckOutcome =
  | {
      status: "completed";
      /** La marca que se buscó, ya resuelta desde la portada. */
      brand: string;
      /** La pregunta literal que se lanzó. Se enseña: es la prueba de que esto es real. */
      prompt: string;
      engine: typeof PUBLIC_CHECK_ENGINE;
      /** El texto real que devolvió la IA. */
      answer: string;
      /** Verificada contra el texto literal, no afirmada por el modelo. */
      brandMentioned: boolean;
      /** Puesto dentro de la respuesta. `null` si no apareció. */
      brandPosition: number | null;
      /** Quién SÍ apareció, en el orden en que la IA los nombró. */
      otherBrands: string[];
      /** Dominios que la IA citó como fuente. */
      citedDomains: string[];
      /** Si alguna cita es del dominio del visitante. */
      citedOwnDomain: boolean;
    }
  | { status: "failed"; error: PublicCheckError };

/** Las dependencias se inyectan para poder testar sin red ni claves. */
export type PublicCheckDeps = {
  resolveBusinessContext: (input: {
    domain: string;
    country: string;
    language: string;
  }) => Promise<{ status: string; profile?: BusinessProfile | null }>;
  suggestPrompts: (input: {
    brand: string;
    domain: string;
    country: string;
    language: string;
    profile: BusinessProfile;
    limit?: number;
  }) => Promise<Array<{ text: string }>>;
  generateAnswer: (input: {
    prompt: string;
    country: string;
    language: string;
  }) => Promise<{ text: string }>;
  extract: (input: {
    brand: string;
    competitors: string[];
    rawResponseText: string;
    promptText: string;
    profile?: BusinessProfile;
  }) => Promise<{
    data: {
      brand: { mentioned: boolean; position: number | null };
      citations: Array<{ domain: string | null }>;
      other_brands_mentioned: string[];
    };
  }>;
  /** Verifica la mención contra el texto crudo. Se inyecta para poder probar que se llama. */
  verify: <T extends { brand: { mentioned: boolean; position: number | null } }>(
    data: T,
    rawResponseText: string,
    brand: string
  ) => T;
  /** Inyectable para poder probar el presupuesto sin esperar de verdad. */
  now?: () => number;
};

export type RunPublicCheckOptions = {
  /**
   * Instante absoluto (epoch ms) a partir del cual ya no se empieza nada.
   * Lo calcula quien llama, UNA vez, contra su propia invocación.
   */
  deadlineAt?: number;
};

export async function runPublicCheck(
  domain: string,
  deps: PublicCheckDeps,
  options: RunPublicCheckOptions = {}
): Promise<PublicCheckOutcome> {
  const now = deps.now ?? Date.now;
  /** ¿Cabe entero el peor caso del siguiente paso? Se pregunta ANTES, no después. */
  const hasRoomForNextStep = (): boolean =>
    options.deadlineAt === undefined || now() + PUBLIC_CHECK_STEP_BUDGET_MS <= options.deadlineAt;
  // 1. Leer la portada y perfilar el negocio. Sin esto no hay pregunta que
  //    hacer: preguntar por una categoría inventada devolvería una respuesta
  //    real sobre un mercado que no es el del visitante, que es peor que no
  //    responder.
  if (!hasRoomForNextStep()) return { status: "failed", error: "budget_exhausted" };

  let context: { status: string; profile?: BusinessProfile | null };
  try {
    context = await deps.resolveBusinessContext({
      domain,
      country: PUBLIC_CHECK_COUNTRY,
      language: PUBLIC_CHECK_LANGUAGE
    });
  } catch {
    return { status: "failed", error: "site_unreachable" };
  }

  const profile = context.profile;
  if (context.status === "unidentified" || !profile) {
    return { status: "failed", error: "site_unreachable" };
  }

  // La marca sale del dominio. Es una aproximación declarada: el asistente de
  // alta deja corregirla y aquí también lo hará la pantalla, porque buscar el
  // nombre equivocado convierte una mención real en una ausencia (el caso
  // Mozilla/Firefox).
  const brand = deriveBrandFromDomain(domain);

  // 2. Derivar UNA pregunta. `limit: 1` no es un recorte cosmético: es lo que
  //    mantiene la comprobación en ~1 llamada de generación en vez de diez.
  if (!hasRoomForNextStep()) return { status: "failed", error: "budget_exhausted" };

  let prompt: string;
  try {
    const suggestions = await deps.suggestPrompts({
      brand,
      domain,
      country: PUBLIC_CHECK_COUNTRY,
      language: PUBLIC_CHECK_LANGUAGE,
      profile,
      limit: 1
    });
    const first = suggestions[0]?.text?.trim();
    if (!first) return { status: "failed", error: "engine_unavailable" };
    prompt = first;
  } catch {
    return { status: "failed", error: "engine_unavailable" };
  }

  // 3. Preguntar. La llamada es CIEGA A LA MARCA (ADR 0007): el motor no sabe
  //    a quién estamos midiendo, así que no puede complacernos nombrándolo.
  if (!hasRoomForNextStep()) return { status: "failed", error: "budget_exhausted" };

  let answer: string;
  try {
    const generated = await deps.generateAnswer({
      prompt,
      country: PUBLIC_CHECK_COUNTRY,
      language: PUBLIC_CHECK_LANGUAGE
    });
    answer = generated.text?.trim() ?? "";
    if (!answer) return { status: "failed", error: "engine_unavailable" };
  } catch {
    return { status: "failed", error: "engine_unavailable" };
  }

  // 4. Extraer y VERIFICAR. `competitors: []` a propósito: no rastreamos a
  //    nadie, así que todo lo que nombre la IA sale por `other_brands_mentioned`
  //    — que es justo "quién apareció en tu lugar".
  if (!hasRoomForNextStep()) return { status: "failed", error: "budget_exhausted" };

  try {
    const extracted = await deps.extract({
      brand,
      competitors: [],
      rawResponseText: answer,
      promptText: prompt,
      profile
    });

    // Sin esto, una mención la decide el modelo hablando de su propio trabajo.
    const verified = deps.verify(extracted.data, answer, brand);

    const citedDomains = verified.citations
      .map((c) => c.domain?.trim().toLowerCase())
      .filter((d): d is string => Boolean(d));

    return {
      status: "completed",
      brand,
      prompt,
      engine: PUBLIC_CHECK_ENGINE,
      answer,
      brandMentioned: verified.brand.mentioned,
      brandPosition: verified.brand.mentioned ? verified.brand.position : null,
      otherBrands: verified.other_brands_mentioned.filter((n) => n?.trim()),
      citedDomains,
      citedOwnDomain: citedDomains.some((d) => d === domain || d.endsWith(`.${domain}`))
    };
  } catch {
    return { status: "failed", error: "extraction_failed" };
  }
}
