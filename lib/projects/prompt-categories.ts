/**
 * Fixed taxonomy of prompt topic categories used to group prompts on the
 * Prompts page. These are exact-match Spanish grouping keys regardless of the
 * prompt's own language — Gemini is constrained to return one of these
 * literal strings (see lib/llm/gemini.ts suggestPrompts), and any value
 * outside this set must be treated as absent (null), never persisted as-is.
 *
 * This module has no dependencies (no "server-only", no Next.js imports) so
 * it can be safely imported from both server-only Gemini code and pure,
 * vitest-tested form-parsing code.
 */
export const PROMPT_CATEGORIES = [
  "Comparación",
  "Alternativas",
  "Cómo hacer / guía",
  "Precio y planes",
  "Reseñas y opiniones",
  "Casos de uso"
] as const;

export type PromptCategory = (typeof PROMPT_CATEGORIES)[number];
