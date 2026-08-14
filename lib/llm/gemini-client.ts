import "server-only";

import { ExtractionError } from "@/lib/llm/extraction-errors";
import { fetchExtractionWithRetry } from "@/lib/llm/extraction-fetch";
import {
  LLM_CALL_MAX_ATTEMPTS,
  LLM_CALL_RETRY_BASE_DELAY_MS,
  LLM_CALL_RETRY_MAX_DELAY_MS
} from "@/lib/scan/constants";

/**
 * PRELAUNCH-HARDENING-1 Fase R5 (primera mitad) — el transporte de Gemini,
 * separado de los usos de producto.
 *
 * `lib/llm/gemini.ts` tenía 1.278 líneas y era dos cosas a la vez: el cliente
 * de un proveedor y **nueve funcionalidades de producto** (el escaneo, la
 * auditoría web, la extracción, el perfil de negocio, los alias de marca, los
 * competidores sugeridos, dos generadores de prompts y la reescritura de
 * recomendaciones). Cada una de esas nueve tiene su módulo dueño en otro
 * sitio; ninguna tiene por qué vivir dentro del cliente HTTP de Google.
 *
 * Este slice mueve **sólo el transporte** y no cambia ni un export público:
 * `gemini.ts` reexporta las dos clases de error, así que ningún sitio de
 * llamada se entera. Repartir las nueve funcionalidades a sus módulos es el
 * siguiente slice, y sale mucho más pequeño una vez que cada una depende de
 * un cliente limpio en vez del fichero entero.
 *
 * Lo que R2 ya unificó (`delay`, `fetchWithTimeout`) sigue en `lib/llm/http.ts`
 * y se comparte con OpenAI y Claude. Lo de aquí es lo que es específico de
 * Gemini: su URL, su modelo fijado, sus mensajes de error y sus dos formas de
 * pedir JSON.
 */

const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models";

// Pinned per docs/adr/0009-gemini-2.5-flash-model-pin.md — gemini-2.0-flash-001
// was shut down by Google on 2026-06-01. gemini-2.5-flash is the recommended
// replacement and has its own cutover date of 2026-10-16 to watch.
const DEFAULT_GEMINI_MODEL = "gemini-2.5-flash";
const GEMINI_MODEL_ERROR = "Invalid GEMINI_MODEL. Use a valid Gemini model id such as gemini-2.5-flash.";

/**
 * Hard per-call timeout shared by every direct Gemini `fetch`.
 */
const GEMINI_CALL_TIMEOUT_MS = 20_000;

/**
 * Thrown when a Gemini API call is aborted after `GEMINI_CALL_TIMEOUT_MS`.
 * Treated as a recoverable per-prompt error by the scan executor — same
 * handling as an HTTP failure or empty response.
 */
export class GeminiTimeoutError extends Error {
  constructor(message = "Gemini API request timed out.") {
    super(message);
    this.name = "GeminiTimeoutError";
  }
}

/**
 * Thrown for misconfiguration (missing API key, invalid model id) that
 * affects every request equally — retrying or skipping to the next prompt
 * cannot help, so callers should treat this as fatal for the whole run.
 */
export class GeminiConfigError extends Error {}

export function getGeminiApiError(status: number) {
  if (status === 429) return "Gemini API quota or rate limit reached.";
  if (status === 400) return "Gemini API rejected the request. Check GEMINI_MODEL and request configuration.";
  return `Gemini API request failed with status ${status}.`;
}

export function getGeminiModel() {
  // Lectura directa a propósito, NO por el accesor de R4. `serverEnv()` cachea
  // el entorno en el primer acceso, así que enrutar por él una variable que hoy
  // se lee fresca en cada llamada **no es neutro**: cambia cuándo se observa un
  // valor. Lo cazó `gemini.test.ts`, que cambia GEMINI_MODEL entre casos, y la
  // regla de la fase es que si un slice necesita cambiar un test es que no era
  // un refactor. Adoptar el accesor aquí es una decisión propia, no un efecto
  // colateral de mover código de sitio (log §78).
  const configuredValue = process.env.GEMINI_MODEL;
  const configuredModel = configuredValue === undefined ? DEFAULT_GEMINI_MODEL : configuredValue.trim();
  const model = configuredModel.startsWith("models/") ? configuredModel.slice("models/".length) : configuredModel;

  if (!/^gemini-[a-z0-9][a-z0-9._-]*$/i.test(model)) {
    throw new GeminiConfigError(GEMINI_MODEL_ERROR);
  }

  return model;
}

/**
 * LLM-RESILIENCE-1: the retrying HTTP path for every Gemini call that is NOT
 * the scan's per-prompt generation.
 *
 * Those calls — the wizard's suggestions, the web audit's grounded content
 * call, the recommendation rewrite — used a bare `fetchWithTimeout` and threw
 * on the first non-OK response. Only `generateGeminiVisibilityAnswer` retried,
 * and only once, on a fixed 1.5s wait. That asymmetry is why the 2026-08-09
 * Gemini 429 spike emptied the onboarding wizard on the first click while the
 * scan running at the same time survived it: same provider, same minute, one
 * of them backed off and the other did not. It is the same shape of gap
 * `docs/adr/0029` found between generation and extraction, one layer up, and
 * the fix is the same machinery — bounded attempts, exponential backoff with
 * full jitter, and a provider-sent `Retry-After` honored but clamped.
 *
 * Throws a categorized `ExtractionError`, which is what lets a caller tell
 * "out of quota" (worth alerting the operator about) apart from "the model
 * returned nonsense" (noise). `categorizeHttpStatus` already treats 400/401/403
 * as `config` and never retries them, so a wrong model id still fails fast.
 */
export async function fetchGeminiWithRetry(endpoint: string, requestBody: string): Promise<Response> {
  return fetchExtractionWithRetry(
    endpoint,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: requestBody
    },
    {
      timeoutMs: GEMINI_CALL_TIMEOUT_MS,
      maxAttempts: LLM_CALL_MAX_ATTEMPTS,
      baseDelayMs: LLM_CALL_RETRY_BASE_DELAY_MS,
      maxDelayMs: LLM_CALL_RETRY_MAX_DELAY_MS,
      describeStatus: getGeminiApiError,
      timeoutMessage: "Gemini API request timed out.",
      transportMessage: "Gemini request failed before reaching the provider."
    }
  );
}

/**
 * Normalizes anything thrown on a Gemini path into the categorized error
 * `reportLlmIncident` can read.
 *
 * `GeminiConfigError` predates the category vocabulary and is thrown for a
 * missing key or an invalid model id — exactly what `config` means — so it is
 * mapped rather than falling through to `unknown` and silently never alerting.
 */
export function toIncidentError(error: unknown): unknown {
  if (error instanceof GeminiConfigError) return new ExtractionError("config", error.message);
  if (error instanceof GeminiTimeoutError) return new ExtractionError("timeout", error.message);
  return error;
}

/** El endpoint de `generateContent` para el modelo configurado, con su clave. */
function generateContentEndpoint(apiKey: string): string {
  return `${GEMINI_API_URL}/${getGeminiModel()}:generateContent?key=${apiKey}`;
}

function firstCandidateText(data: {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
}): string {
  return data.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("\n").trim() ?? "";
}

export async function generateGeminiJson(promptBlock: string): Promise<unknown> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new ExtractionError("config", "Missing GEMINI_API_KEY");

  const response = await fetchGeminiWithRetry(
    generateContentEndpoint(apiKey),
    JSON.stringify({
      contents: [{ parts: [{ text: promptBlock }] }],
      // temperature: 0 — see ADR 0009 addendum (2026-06-19).
      generationConfig: { temperature: 0, responseMimeType: "application/json", thinkingConfig: { thinkingBudget: 0 } }
    })
  );

  const text = firstCandidateText(await response.json());
  if (!text) {
    throw new ExtractionError("empty", "Gemini suggestion returned empty JSON.");
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new ExtractionError("invalid_json", "Gemini suggestion returned invalid JSON.");
  }
}

/**
 * Extracts JSON from a Gemini response that could NOT be requested with
 * `responseMimeType: "application/json"` — the API rejects that option when
 * combined with `tools: [{ google_search: {} }]` (400), so grounded calls
 * ask for JSON via instruction text only. Search-grounded responses
 * sometimes wrap the JSON in a ```json fence despite being told not to.
 */
export function parseLenientJson(text: string): unknown {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced ? fenced[1] : trimmed).trim();
  return JSON.parse(candidate);
}

/**
 * Like generateGeminiJson, but with google_search grounding enabled — used
 * where the model needs real-world lookup (e.g. finding actual competitor
 * names/domains) rather than reasoning over given context alone. See
 * parseLenientJson for why this can't use responseMimeType: "application/json".
 *
 * **Inconsistencia conservada a propósito**: ante la MISMA condición —falta
 * `GEMINI_API_KEY`— esta función lanza `GeminiConfigError` y
 * `generateGeminiJson` lanza `ExtractionError("config", …)`. Son dos tipos
 * distintos para el mismo fallo, y quien los captura los trata distinto. Se
 * deja como está porque este slice es un refactor y unificarlo cambiaría qué
 * error ve un caller en producción. Queda anotado para decidirlo aparte
 * (log §78).
 */
export async function generateGroundedGeminiJson(promptBlock: string): Promise<unknown> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new GeminiConfigError("Missing GEMINI_API_KEY");

  const response = await fetchGeminiWithRetry(
    generateContentEndpoint(apiKey),
    JSON.stringify({
      contents: [{ parts: [{ text: promptBlock }] }],
      tools: [{ google_search: {} }],
      generationConfig: { temperature: 0, thinkingConfig: { thinkingBudget: 0 } }
    })
  );

  const text = firstCandidateText(await response.json());
  if (!text) {
    throw new ExtractionError("empty", "Gemini suggestion returned empty JSON.");
  }

  try {
    return parseLenientJson(text);
  } catch {
    throw new ExtractionError("invalid_json", "Gemini suggestion returned invalid JSON.");
  }
}

export { GEMINI_API_URL, GEMINI_CALL_TIMEOUT_MS };
