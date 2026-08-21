/**
 * Anti-hallucination guard for Slice 2's LLM-rewrite layer
 * (lib/recommendations/rewrite-recommendation.ts). Gemini is instructed in the
 * prompt to use only the given facts, but a prompt instruction is not a safety
 * boundary by itself — this is the server-side check that actually enforces
 * it before a rewrite is ever persisted or shown to the user.
 *
 * Two closed-set checks, both fail-closed (reject on any doubt):
 * - Competitors: rejects if the rewritten text names ANY competitor from the
 *   project's full tracked roster (`project_competitors`) that isn't part of
 *   THIS recommendation's already-anchored allowlist. This catches Gemini
 *   swapping in a real-but-wrong-for-this-card competitor, not just a fully
 *   invented one.
 * - Domains: rejects if the rewritten text contains a domain-like token
 *   (matched against a common-TLD list to avoid false positives on
 *   abbreviations like "p.ej.") that isn't the brand's own domain or one of
 *   this recommendation's already-anchored citation domains.
 *
 * Deliberately not exhaustive (no full NLP/entity-recognition) — a pragmatic
 * safety net consistent with CLAUDE.md's "no fake recommendations" given a
 * closed, known competitor roster and a closed, known domain list. Pure logic,
 * no I/O — importable from Vitest with no server-only shim needed.
 *
 * El vocabulario de dominios (qué token parece un dominio, cómo se normaliza)
 * vive en `anchored-domains.ts` y se importa de allí: la primitiva es "qué es
 * un dominio" y esto es el juicio que la usa, nunca al revés.
 */
import { extractDomainTokens, normalizeDomain } from "@/lib/recommendations/anchored-domains";



// Structured-data vocabulary domains that legitimately appear in any JSON-LD
// example (e.g. `"@context": "https://schema.org"`). They are not citation or
// competitor domains, so they must never trip the anti-fabrication guard.
const ALWAYS_ALLOWED_DOMAINS = ["schema.org", "www.w3.org"];

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function mentionsTerm(normalizedText: string, normalizedTerm: string): boolean {
  if (!normalizedTerm) return false;
  const pattern = new RegExp(`(?:^|[^a-z0-9áéíóúñ])${escapeRegExp(normalizedTerm)}(?:[^a-z0-9áéíóúñ]|$)`, "i");
  return pattern.test(normalizedText);
}

export type RewriteValidationInput = {
  title: string;
  description: string;
  /** Competitor names already anchored to THIS recommendation's evidence (mentioned_competitors + dominant_competitor, if any). */
  allowedCompetitors: string[];
  /**
   * Domains already anchored to THIS recommendation's evidence — the FULL
   * anchored set (`lib/recommendations/anchored-domains.ts`), which is what the
   * prompt's own allowlist is built from. Passing anything narrower than what
   * the prompt offered is how a rewrite gets rejected for obeying its
   * instructions.
   */
  allowedDomains: string[];
  /** The project's FULL tracked-competitor roster — used to catch a swap to a real-but-unanchored competitor, not just a fully invented name. */
  trackedCompetitors: string[];
  brandDomain: string;
};

export type RewriteValidationResult =
  | { valid: true }
  | {
      valid: false;
      reason: "untracked_competitor_mentioned" | "unanchored_domain_mentioned";
      /**
       * The exact term that tripped the guard. Logged (never shown to the
       * user) so a rejection can be diagnosed without re-running anything: a
       * bare `reason` says the rewrite named something unanchored, which is
       * one step short of the only question worth asking — WHAT did it name?
       * That step cost a full investigation on 2026-08-20, when two cards
       * failed with the same opaque message for what may not be the same
       * cause.
       */
      offending: string;
    };

export function validateRewriteAgainstEvidence(input: RewriteValidationInput): RewriteValidationResult {
  const rawText = `${input.title} ${input.description}`;
  const normalizedText = normalize(rawText);
  const allowedCompetitors = new Set(input.allowedCompetitors.map(normalize).filter(Boolean));

  for (const competitor of input.trackedCompetitors) {
    const normalizedCompetitor = normalize(competitor);
    if (!normalizedCompetitor || allowedCompetitors.has(normalizedCompetitor)) continue;
    if (mentionsTerm(normalizedText, normalizedCompetitor)) {
      return { valid: false, reason: "untracked_competitor_mentioned", offending: competitor };
    }
  }

  const allowedDomains = new Set(
    [...input.allowedDomains, input.brandDomain, ...ALWAYS_ALLOWED_DOMAINS].map(normalizeDomain).filter(Boolean)
  );
  for (const domain of extractDomainTokens(rawText)) {
    if (!allowedDomains.has(domain)) {
      return { valid: false, reason: "unanchored_domain_mentioned", offending: domain };
    }
  }

  return { valid: true };
}
