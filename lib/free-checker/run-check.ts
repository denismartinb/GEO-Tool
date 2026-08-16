import type { BusinessProfile } from "@/lib/llm/contracts";
import { ExtractionError } from "@/lib/llm/extraction-errors";
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

/**
 * Una etiqueta corta y **escrita por este repositorio** que dice por qué falló
 * un paso. Nunca el mensaje del proveedor: la regla es la misma que persiste
 * `category: message` en el escaneo (`.claude/rules/gemini.md`, "sanitize all
 * errors"), y aquí importa el doble porque el visitante es un desconocido.
 *
 * Existe porque la primera versión de este fichero tenía cinco `catch {}` que
 * tiraban la causa entera. El 2026-08-15, en la primera ejecución real contra
 * producción, la comprobación devolvió `extraction_failed` y **no había forma
 * de saber si era un 400 del proveedor, un JSON roto, un timeout o un fallo de
 * esquema** — cinco causas que se arreglan de cinco maneras distintas. Un
 * `catch` que descarta la causa es un fallo, no un estilo
 * (`.claude/rules/gemini.md`).
 *
 * Lo que se conserva es sólo el nombre de la clase o la categoría del
 * `ExtractionError` —`quota`, `timeout`, `http`, `empty`, `invalid_json`,
 * `schema`, `config`—, saneado a letras. Nada de eso lo escribió un proveedor.
 */
export function describeCause(error: unknown): string {
  const raw =
    error instanceof ExtractionError
      ? error.category
      : error instanceof Error && error.name
        ? error.name
        : "unknown";
  return raw.replace(/[^A-Za-z_]/g, "").slice(0, 40) || "unknown";
}

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
      /**
       * Lo que el extractor dijo del puesto. **No sale al navegador** y no
       * debe: con `competitors: []` la marca es la única entidad rankeada, así
       * que esto vale 1 siempre que aparezca — un puesto sin conjunto contra el
       * que rankear (`PublicCheckResponse`, Fase C). Se conserva aquí porque es
       * el registro fiel de lo que devolvió el modelo, y porque la Fase D
       * necesita compararlo con las posiciones reales cuando existan.
       */
      brandPosition: number | null;
      /** Quién SÍ apareció, en el orden en que la IA los nombró. */
      otherBrands: string[];
      /** Dominios que la IA citó como fuente. */
      citedDomains: string[];
      /** Si alguna cita es del dominio del visitante. */
      citedOwnDomain: boolean;
      /**
       * Sólo cuando la comprobación salió adelante **por el motor de reserva**:
       * la causa por la que el principal no pudo. Va al operador, nunca al
       * visitante — que se haya recuperado no significa que no haya nada roto,
       * y una degradación silenciosa es justo lo que hizo que los 429 de
       * OpenAI corrieran cuatro días sin que nadie se enterara
       * (`docs/adr/0029`).
       */
      detail?: string;
    }
  | {
      status: "failed";
      error: PublicCheckError;
      /** Ver `describeCause`. Sólo para el operador: nunca sale en la respuesta HTTP. */
      detail?: string;
    };

/**
 * Una extracción estructurada. Misma firma que
 * `extractGeminiStructuredData` / `extractOpenAIStructuredData` para que
 * cualquiera de las dos encaje sin adaptador.
 */
export type PublicCheckExtractor = (input: {
  brand: string;
  competitors: string[];
  rawResponseText: string;
  promptText: string;
  profile?: BusinessProfile;
  /** Presupuesto absoluto del bucle de reintentos del proveedor. Ver más abajo. */
  deadlineAt?: number;
}) => Promise<{
  data: {
    brand: { mentioned: boolean; position: number | null };
    citations: Array<{ domain: string | null }>;
    other_brands_mentioned: string[];
  };
}>;

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
  extract: PublicCheckExtractor;
  /**
   * Motor de reserva para la extracción, y **sólo** para la extracción.
   *
   * No afloja ninguna promesa de la página: lo que el visitante ve —la
   * pregunta y la respuesta literal— lo sigue produciendo ChatGPT. Leer esa
   * respuesta y devolver el JSON estructurado es un paso interno que el
   * visitante nunca ve, exactamente igual que el perfil del negocio y la
   * derivación de la pregunta, que ya van por Gemini a propósito (ver
   * `PUBLIC_CHECK_ENGINE`). Un fallo ahí tiraba a la basura una llamada con
   * búsqueda ya pagada y le enseñaba "no hemos podido interpretarla" a alguien
   * cuya respuesta estaba entera y correcta en memoria.
   *
   * La causa del primer fallo **se conserva y se reporta igualmente** aunque
   * la reserva funcione: recuperarse en silencio de un proveedor roto es cómo
   * se pierden cuatro días (`docs/adr/0029`).
   */
  extractFallback?: PublicCheckExtractor;
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
  } catch (error) {
    return { status: "failed", error: "site_unreachable", detail: describeCause(error) };
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
    if (!first) return { status: "failed", error: "engine_unavailable", detail: "no_prompt" };
    prompt = first;
  } catch (error) {
    return { status: "failed", error: "engine_unavailable", detail: describeCause(error) };
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
    if (!answer) return { status: "failed", error: "engine_unavailable", detail: "empty_answer" };
  } catch (error) {
    return { status: "failed", error: "engine_unavailable", detail: describeCause(error) };
  }

  // 4. Extraer y VERIFICAR. `competitors: []` a propósito: no rastreamos a
  //    nadie, así que todo lo que nombre la IA sale por `other_brands_mentioned`
  //    — que es justo "quién apareció en tu lugar".
  if (!hasRoomForNextStep()) return { status: "failed", error: "budget_exhausted" };

  const extractionArgs = {
    brand,
    competitors: [],
    rawResponseText: answer,
    promptText: prompt,
    profile,
    // El bucle de reintentos del proveedor (3 intentos de hasta 20 s) NO cabe
    // en lo que queda de invocación, y sin este deadline no lo sabe: arrancaba
    // un segundo intento mientras quedara un milisegundo y se pasaba de los
    // 60 s de `maxDuration`, o sea un 504 sin cuerpo con el dinero gastado. Se
    // le resta un presupuesto de paso entero porque el helper sólo garantiza
    // "no EMPIEZO un intento pasado el deadline": hay que dejarle sitio para
    // terminar el que sí empiece (`.claude/rules/scan.md`, presupuestar contra
    // la invocación; `docs/adr/0037`).
    deadlineAt:
      options.deadlineAt === undefined
        ? undefined
        : options.deadlineAt - PUBLIC_CHECK_STEP_BUDGET_MS
  };

  let extracted: Awaited<ReturnType<PublicCheckExtractor>>;
  /** Se arrastra hasta el final aunque la reserva funcione. Ver `extractFallback`. */
  let detail: string | undefined;

  try {
    extracted = await deps.extract(extractionArgs);
  } catch (error) {
    const cause = describeCause(error);
    if (!deps.extractFallback || !hasRoomForNextStep()) {
      return { status: "failed", error: "extraction_failed", detail: cause };
    }
    try {
      extracted = await deps.extractFallback(extractionArgs);
      detail = `fallback:${cause}`;
    } catch (fallbackError) {
      return {
        status: "failed",
        error: "extraction_failed",
        detail: `${cause}+${describeCause(fallbackError)}`
      };
    }
  }

  try {
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
      citedOwnDomain: citedDomains.some((d) => d === domain || d.endsWith(`.${domain}`)),
      ...(detail ? { detail } : {})
    };
  } catch (error) {
    return { status: "failed", error: "extraction_failed", detail: describeCause(error) };
  }
}
