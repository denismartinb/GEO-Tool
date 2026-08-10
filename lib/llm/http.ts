import "server-only";

/**
 * Transporte HTTP común a los tres proveedores de LLM
 * (PRELAUNCH-HARDENING-1 Fase R, R2).
 *
 * `fetchWithTimeout` y `delay` estaban escritas tres veces —en `gemini.ts`,
 * `openai.ts` y `claude.ts`— y las de OpenAI y Claude diferían **en una sola
 * línea**: la clase de error que lanzan al expirar. Tres copias de la
 * semántica de timeout significa que un arreglo (un `AbortController` que no
 * se limpia, un caso de red que no se distingue de una cancelación) se corrige
 * en una y sigue roto en dos. Y el roadmap contempla un motor más
 * (Perplexity), que hoy heredaría la copia en vez del arreglo.
 *
 * **Lo que NO se unifica, y por qué:** los mensajes de error por proveedor
 * (`getGeminiApiError`, `getOpenAIApiError`, `getClaudeApiError`) se quedan
 * donde están. Parecen el mismo patrón, pero Gemini **no tiene rama para
 * 401** mientras OpenAI y Claude sí, así que un builder común o le añadiría a
 * Gemini un mensaje que hoy no emite, o necesitaría un parámetro para fingir
 * que no lo tiene. Esos textos se persisten como el error categorizado de un
 * escaneo (`.claude/rules/scan.md`: "mensajes de error propios y
 * categorizados"), así que cambiarlos no es refactor: es cambiar un dato que
 * el operador lee. Si algún día Gemini debe distinguir el 401, es una decisión
 * propia y con su entrada en el histórico, no un efecto colateral.
 */

/**
 * `fetch` con un presupuesto de reloj duro.
 *
 * `createTimeoutError` es una fábrica, no una clase: cada proveedor conserva
 * su propio tipo de error (`GeminiTimeoutError`, `OpenAITimeoutError`,
 * `ClaudeTimeoutError`) porque aguas abajo se distinguen por tipo para
 * categorizar el fallo. Compartir el transporte no puede costar esa
 * distinción.
 */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  createTimeoutError: () => Error
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    // Sólo se convierte en "timeout" si fuimos nosotros quienes abortamos: un
    // fallo de red real tiene que seguir subiendo como lo que es.
    if (controller.signal.aborted) {
      throw createTimeoutError();
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

/** Espera pasiva entre reintentos. */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
