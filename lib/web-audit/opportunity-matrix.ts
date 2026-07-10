import { COULD_NOT_VERIFY_NOTE, type DomainCoverageMap, type DomainCoverageTopic } from "@/lib/web-audit/coverage-map";

/**
 * "Opportunity matrix" (WEB-AUDIT-1): classifies every topic of a coverage
 * map along two axes — does the domain have verified own content on the
 * topic (`found`), and does the latest scan actually cite that domain for
 * the same topic's prompt (`aiCitesOwnDomain`)? Each of the resulting
 * outcomes needs an opposite fix (create vs. optimize vs. maintain), which is
 * the whole point of joining the coverage side (DOMAIN-COVERAGE-1) with the
 * scan-citation side instead of showing them as two disconnected features.
 *
 * Deliberately NOT marked `import "server-only"`: pure classification logic
 * over plain data, importable from Vitest (same rationale as
 * lib/recommendations/coverage-overlay.ts, which this module sits next to
 * conceptually).
 *
 * See docs/specs/web-audit/README.md for the canonical classification table
 * this function implements — keep both in sync on change.
 */

export type TopicOutcome =
  | "performing"
  | "invisible"
  | "content_gap"
  | "open_opportunity"
  | "unverified_cited"
  | "inconclusive";

export type PromptResultLite = {
  prompt_id: string | null;
  extracted_json: unknown;
  provider: string | null;
  mentioned_competitors_count: number;
};

export type ClassifiedTopic = DomainCoverageTopic & { outcome: TopicOutcome };

export type WebAuditSummary = {
  topics: ClassifiedTopic[];
  conclusiveCount: number;
  coveredCount: number;
  coveragePct: number | null;
  surfacedCount: number;
  surfacingPct: number | null;
};

/**
 * Providers whose generation call includes real grounding (Google Search)
 * and can therefore produce genuine citation evidence. Mirrors the private
 * GROUNDED_PROVIDERS set in lib/scoring/run-scoring.ts (ADR-0012) — kept as a
 * separate copy rather than an import so the reviewed scoring module stays
 * untouched; opportunity-matrix.test.ts guards the two from silently
 * diverging.
 */
const GROUNDED_PROVIDERS = new Set<string>(["gemini"]);

function isGroundedProvider(provider: string | null): boolean {
  return !provider || GROUNDED_PROVIDERS.has(provider);
}

/** Mirrors lib/recommendations/domain-coverage.ts's normalizeDomain exactly. */
function normalizeDomain(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "");
}

/** Mirrors lib/recommendations/domain-coverage.ts's isSameOrSubdomain exactly (label-boundary match). */
function isSameOrSubdomain(domain: string, root: string): boolean {
  if (!domain || !root) return false;
  return domain === root || domain.endsWith(`.${root}`);
}

type ExtractedCitation = { domain?: string | null; source?: "grounding" | "inline" };

function readCitations(value: unknown): ExtractedCitation[] {
  if (!value || typeof value !== "object") return [];
  const citations = (value as Record<string, unknown>).citations;
  if (!Array.isArray(citations)) return [];
  return citations as ExtractedCitation[];
}

/**
 * True when a scan result row carries at least one real grounding citation
 * (never an inline one) whose domain matches, or is a label-boundary
 * subdomain of, the project's own domain — identical semantics to the
 * private hasOwnDomainCitation in lib/scoring/run-scoring.ts (ADR-0013).
 * Rows from ungrounded providers never count (ADR-0012).
 */
export function hasOwnDomainGroundingCitation(
  extractedJson: unknown,
  projectDomainNormalized: string,
  provider: string | null
): boolean {
  if (!projectDomainNormalized) return false;
  if (!isGroundedProvider(provider)) return false;
  for (const citation of readCitations(extractedJson)) {
    if (citation.source !== "grounding") continue;
    const rawDomain = citation.domain?.trim();
    if (!rawDomain) continue;
    if (isSameOrSubdomain(normalizeDomain(rawDomain), projectDomainNormalized)) return true;
  }
  return false;
}

function classifyTopic(
  topic: DomainCoverageTopic,
  result: PromptResultLite | undefined,
  projectDomainNormalized: string
): TopicOutcome {
  if (topic.note === COULD_NOT_VERIFY_NOTE) return "inconclusive";
  if (!result) return "inconclusive";

  const cited = hasOwnDomainGroundingCitation(result.extracted_json, projectDomainNormalized, result.provider);

  if (topic.found) return cited ? "performing" : "invisible";

  // !topic.found (conclusive, since we already excluded COULD_NOT_VERIFY_NOTE)
  if (cited) return "unverified_cited";
  return result.mentioned_competitors_count > 0 ? "content_gap" : "open_opportunity";
}

export function buildWebAuditSummary(input: {
  coverage: DomainCoverageMap;
  results: PromptResultLite[];
  projectDomain: string;
}): WebAuditSummary {
  const projectDomainNormalized = normalizeDomain(input.projectDomain);
  const resultByPromptId = new Map<string, PromptResultLite>();
  for (const result of input.results) {
    if (result.prompt_id) resultByPromptId.set(result.prompt_id, result);
  }

  const topics: ClassifiedTopic[] = input.coverage.topics.map((topic) => ({
    ...topic,
    outcome: classifyTopic(topic, resultByPromptId.get(topic.promptId), projectDomainNormalized)
  }));

  const conclusive = topics.filter((t) => t.outcome !== "inconclusive");
  const covered = conclusive.filter((t) => t.found);
  const performing = topics.filter((t) => t.outcome === "performing");

  return {
    topics,
    conclusiveCount: conclusive.length,
    coveredCount: covered.length,
    coveragePct: conclusive.length > 0 ? Math.round((covered.length / conclusive.length) * 100) : null,
    surfacedCount: performing.length,
    surfacingPct: covered.length > 0 ? Math.round((performing.length / covered.length) * 100) : null
  };
}
