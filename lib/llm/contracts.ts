import type { ExtractionOutput } from "@/lib/extraction/schema";

/**
 * PRELAUNCH-HARDENING-1 Fase R5 (segunda mitad) — los tipos que cruzan la capa
 * de LLM, en un módulo neutral.
 *
 * `lib/llm/openai.ts` y `lib/llm/claude.ts` importaban de `lib/llm/gemini.ts`.
 * No por casualidad: los tres motores devuelven la MISMA forma de respuesta —
 * es lo que permite que `lib/scan/executor.ts` los trate igual— y esa forma
 * estaba definida dentro de uno de ellos. El resultado es que el cliente de un
 * proveedor era dependencia de sus dos competidores, y que mover cualquier cosa
 * de sitio en `gemini.ts` amenazaba con ciclos.
 *
 * Aquí no hay `import "server-only"` a propósito: son tipos y una función pura
 * de texto, y `suggested-competitors-section.tsx` (componente de cliente) ya
 * importa uno de estos tipos. Nada de esto lee entorno ni llama a nadie.
 *
 * **Los nombres se conservan tal cual.** `GeminiVisibilityResponse` describe la
 * respuesta de los tres motores, no la de Gemini, así que el nombre miente;
 * pero renombrarlo toca ~15 ficheros por motivos cosméticos y este slice es un
 * refactor de estructura. Queda anotado como decisión aparte (log §79).
 */

/**
 * Lo que un motor devuelve para un prompt del escaneo. La comparten Gemini,
 * OpenAI y Claude — `lib/scan/executor.ts` no distingue entre ellos.
 */
export type GeminiVisibilityResponse = {
  text: string;
  model: string;
  tokensIn: number | null;
  tokensOut: number | null;
  totalTokens: number | null;
  /**
   * Google Search grounding sources returned by Gemini when the
   * `google_search` tool is enabled, per
   * docs/adr/0004-gemini-search-grounding.md. Absent/empty when the model
   * did not ground its answer in a search result.
   */
  groundingChunks?: Array<{ uri: string; title?: string }>;
};

/** Lo que devuelve la extracción estructurada, en cualquiera de los motores. */
export type GeminiStructuredExtractionResponse = {
  data: ExtractionOutput;
  model: string;
};

/**
 * El perfil de negocio inferido de la web del cliente. Lo escribe
 * `inferBusinessProfile`, y lo leen la extracción, los competidores sugeridos,
 * los prompts sugeridos y los tres motores.
 */
export type BusinessProfile = {
  whatItSells: string;
  sector: string;
  subSector: string;
  businessModel: "b2b" | "b2c" | "both" | "unknown";
  targetCustomer: string;
  geographicScope: string;
  sizeEstimate: string;
  /** "low" means Gemini itself judged the evidence insufficient to profile this business — callers must not use a low-confidence profile to suggest competitors/prompts unless the user supplied their own description. */
  confidence: "low" | "medium" | "high";
};

/** La evidencia de portada que alimenta a `inferBusinessProfile`. */
export type HomepageEvidenceInput =
  | { status: "ok"; title: string; description: string; headings: string[]; excerpt: string }
  | { status: "unavailable" };

/**
 * Extra instruction appended to the extraction prompt's `other_brands` rule
 * when the project has a cached business profile (ADR 0020).
 *
 * Without it, extraction was pulling in whatever brand names happened to appear
 * in a grounded answer regardless of industry — a shoe brand's report listing
 * Carrefour... just because a grounded search answer happened to cite an
 * unrelated shopping page. Returns "" when no profile is cached yet, which
 * keeps the instruction — and therefore extraction behavior — identical to
 * before this change.
 *
 * Vive aquí, y no en el cliente de Gemini, porque la usan los tres motores.
 */
export function otherBrandsRelevanceHint(profile?: BusinessProfile): string {
  if (!profile) return "";
  return ` Only include names that are plausible competitors or alternatives for a business in this category (sector: ${profile.sector}; what it sells: ${profile.whatItSells}) — exclude any brand from a clearly different industry or category even if it is genuinely present in the text (e.g. a general marketplace or retailer cited as unrelated context is not a competitor of a ${profile.subSector || profile.sector} business).`;
}
