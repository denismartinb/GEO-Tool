/**
 * ENTITY-HYGIENE-1 (P1-02, Fase 9 of docs/external-audit-2026-08.md). A
 * generic AI assistant/engine ("ChatGPT") or GEO-industry jargon term ("GEO
 * Score") is never a real, trackable competitor and never a real alias of the
 * user's own brand. Both corrupt everything downstream that reads
 * `project_competitors` or `brand_aliases` without knowing it: share of
 * voice gets a fabricated denominator and a nonsense bar, and Recomendaciones
 * can literally say "Disputa a ChatGPT" (docs/brand/design-decisions-log.md
 * §194).
 *
 * This is a SEPARATE list from `GENERIC_ALIAS_TERMS`
 * (lib/projects/brand-aliases.ts) on purpose. That list rejects an alias by
 * TOKEN overlap — every word of the candidate is a bare category noun
 * ("app", "platform") — which is right for catching category words but wrong
 * here: "score" and "geo" are each too common a word to ban alone, yet "GEO
 * Score" together is exactly the kind of term this list exists for. So this
 * one matches the FULL, normalized phrase, never a token.
 */

/** AI assistants, engines and model families — never a real competitor or a real brand alias. */
const GENERIC_AI_TOOL_NAMES: readonly string[] = [
  "chatgpt",
  "gpt",
  "gpt-4",
  "gpt-5",
  "openai",
  "gemini",
  "google gemini",
  "bard",
  "claude",
  "anthropic",
  "copilot",
  "microsoft copilot",
  "bing chat",
  "bing ai",
  "grok",
  "xai",
  "perplexity",
  "perplexity ai",
  "deepseek",
  "meta ai",
  "llama",
  "mistral",
  "mistral ai",
  "le chat",
  "poe",
  "character.ai",
  "character ai",
  "you.com",
  "ai overviews",
  "google ai overviews",
  "sge"
];

/**
 * GEO/AI-visibility industry jargon — a category label, not a business name.
 * Deliberately does NOT include bare "geo": real companies are named "Geo"
 * or "GEO" on their own (e.g. The GEO Group), so a single three-letter
 * abbreviation is too broad to ban outright — "GEO Score" together is the
 * specific term the audit found being accepted as a brand alias, and that
 * full phrase is what this list bans.
 */
const GENERIC_INDUSTRY_TERMS: readonly string[] = [
  "geo score",
  "seo",
  "aeo",
  "generative engine optimization",
  "answer engine optimization",
  "share of voice",
  "sov",
  "visibility score",
  "ai visibility",
  "brand visibility",
  "llm",
  "llm visibility",
  "large language model"
];

const GENERIC_ENTITY_NAMES = new Set([...GENERIC_AI_TOOL_NAMES, ...GENERIC_INDUSTRY_TERMS]);

/** Domains of well-known AI tools — a suggested/added competitor can name the tool differently ("Bing AI") while pointing at a domain this list already knows ("bing.com"). */
const GENERIC_ENTITY_DOMAINS = new Set([
  "chatgpt.com",
  "openai.com",
  "gemini.google.com",
  "bard.google.com",
  "claude.ai",
  "anthropic.com",
  "copilot.microsoft.com",
  "bing.com",
  "grok.com",
  "x.ai",
  "perplexity.ai",
  "deepseek.com",
  "meta.ai",
  "mistral.ai",
  "chat.mistral.ai",
  "poe.com",
  "character.ai",
  "you.com"
]);

/** Same shape of normalization as `normalizeName` in lib/projects/brand-aliases.ts and `normalizeKey` in lib/brand-aliases/normalize-aliases.ts, kept as its own copy here because this list matches whole phrases, not tokens, and the two must not silently start disagreeing on what counts as a match. */
function normalizeEntityName(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function normalizeEntityDomain(value: string): string {
  return value.trim().toLowerCase().replace(/^www\./, "");
}

/** True when `name` is, as a whole normalized phrase, a known AI tool/engine or GEO-industry generic term — never a partial/token match. */
export function isGenericEntityName(name: string): boolean {
  return GENERIC_ENTITY_NAMES.has(normalizeEntityName(name));
}

/** True when `domain` is a known AI tool/engine's own domain. */
export function isGenericEntityDomain(domain: string): boolean {
  return GENERIC_ENTITY_DOMAINS.has(normalizeEntityDomain(domain));
}

/**
 * True when either the proposed name or its domain identifies a generic AI
 * assistant/engine or GEO-industry term rather than a real, trackable
 * business — the single check every competitor/alias entry point below runs
 * before accepting a candidate.
 */
export function isGenericEntity(candidate: { name: string; domain?: string | null }): boolean {
  if (isGenericEntityName(candidate.name)) return true;
  if (candidate.domain && isGenericEntityDomain(candidate.domain)) return true;
  return false;
}
