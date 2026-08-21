import { COULD_NOT_VERIFY_NOTE, dedupeMapsByScanId, type DomainCoverageMap, type DomainCoverageTopic } from "@/lib/web-audit/coverage-map";

/**
 * "Opportunity matrix" (WEB-AUDIT-1): classifies every topic of a coverage
 * map along two axes — does the domain have verified own content on the
 * topic (`found`), and does the domain get cited for the same topic's
 * prompt across a recent window of scans (`aiCitesOwnDomain`)? Each of the
 * resulting outcomes needs an opposite fix (create vs. optimize vs.
 * maintain), which is the whole point of joining the coverage side
 * (DOMAIN-COVERAGE-1) with the scan-citation side instead of showing them as
 * two disconnected features.
 *
 * Citation is classified over a fixed window of recent scans rather than the
 * single latest scan (WEB-AUDIT-R6 phase 2, geo-strategy methodology review
 * 2026-07-17) — grounding is a noisy sensor (see sample-confidence.ts), so a
 * single scan's citation flip should not by itself flip a topic between
 * "performing" and "invisible". A majority-of-window rule was chosen
 * deliberately over "cited in ANY of the last N scans", which is a
 * monotonically-upward-biased estimator (widening the window can only add
 * citations, never remove them) and would inflate the metric — see that
 * phase's Task Intake for the full rejection rationale.
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

/** One scan's prompt results, dated — the unit the citation window is built from. */
export type ScanResultsWindow = {
  scanId: string;
  generatedAt: string;
  results: PromptResultLite[];
};

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
 * and can therefore produce genuine citation evidence. Mirrors
 * GROUNDED_PROVIDERS in lib/scoring/run-scoring.ts (ADR-0012) — copia y no
 * import para que este módulo no arrastre el de scoring entero por una
 * constante.
 *
 * **`openai` faltaba aquí desde ENGINES-2a** (2026-07-18): ChatGPT genera con
 * la herramienta `web_search` y produce citas reales, y tanto el scoring como
 * `ENGINE_META` lo daban por grounded — sólo esta copia se quedó atrás. El
 * efecto era que un tema que ChatGPT SÍ citaba se clasificaba como `invisible`
 * o `content_gap`. La cabecera anterior afirmaba que un test impedía la
 * divergencia; ese test no existía. Ahora sí, y cubre las tres copias
 * (`opportunity-matrix.test.ts`, "paridad de motores grounded").
 */
const GROUNDED_PROVIDERS = new Set<string>(["gemini", "openai"]);

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

/** Fixed methodology constant — not user-configurable. geo-strategy review 2026-07-17 (WEB-AUDIT-R6 phase 2). */
export const CITATION_WINDOW_SIZE = 3;

/**
 * Scans older than this many days before the reference point are excluded
 * from the citation window — a citation from months ago says nothing about
 * whether the domain is cited today, so it must not prop up a stale
 * "performing" verdict.
 */
export const CITATION_WINDOW_MAX_AGE_DAYS = 30;

const CITATION_WINDOW_MAX_AGE_MS = CITATION_WINDOW_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;

/**
 * Selects the scans that make up the citation window for a given reference
 * date: only scans at-or-before `asOf` (never a future scan — avoids
 * look-ahead bias when this is called per historical trend point), within
 * the recency guard, most recent first, capped at CITATION_WINDOW_SIZE.
 */
function buildCitationWindow(candidates: ScanResultsWindow[], asOf: string): ScanResultsWindow[] {
  const asOfMs = Date.parse(asOf);
  return candidates
    .filter((c) => c.generatedAt <= asOf)
    .filter((c) => {
      const ms = Date.parse(c.generatedAt);
      return Number.isFinite(ms) && asOfMs - ms <= CITATION_WINDOW_MAX_AGE_MS;
    })
    .sort((a, b) => b.generatedAt.localeCompare(a.generatedAt))
    .slice(0, CITATION_WINDOW_SIZE);
}

type CitationFrequency = { citedRuns: number; totalRuns: number };

/**
 * Counts, across the window, how many scans actually had a result for this
 * prompt (totalRuns) and how many of those cited the domain (citedRuns). A
 * scan missing a result for this specific prompt contributes no data point
 * either way — it is not counted as "not cited".
 */
function citationFrequency(
  promptId: string,
  window: ScanResultsWindow[],
  projectDomainNormalized: string
): CitationFrequency {
  let citedRuns = 0;
  let totalRuns = 0;
  for (const scan of window) {
    const result = scan.results.find((r) => r.prompt_id === promptId);
    if (!result) continue;
    totalRuns += 1;
    if (hasOwnDomainGroundingCitation(result.extracted_json, projectDomainNormalized, result.provider)) {
      citedRuns += 1;
    }
  }
  return { citedRuns, totalRuns };
}

/**
 * Majority rule over the window: cited when at least half of the runs that
 * had data cite the domain. Deliberately NOT "cited in ANY run of the
 * window" — that estimator only ever goes up as the window widens, which
 * would inflate the metric rather than stabilize it (rejected in the phase 2
 * Task Intake).
 */
function isCitedByMajority(freq: CitationFrequency): boolean {
  return freq.totalRuns > 0 && freq.citedRuns * 2 >= freq.totalRuns;
}

function classifyTopic(
  topic: DomainCoverageTopic,
  currentResult: PromptResultLite | undefined,
  citationWindow: ScanResultsWindow[],
  projectDomainNormalized: string
): TopicOutcome {
  if (topic.note === COULD_NOT_VERIFY_NOTE) return "inconclusive";
  if (!currentResult) return "inconclusive";

  const cited = isCitedByMajority(citationFrequency(topic.promptId, citationWindow, projectDomainNormalized));

  if (topic.found) return cited ? "performing" : "invisible";

  // !topic.found (conclusive, since we already excluded COULD_NOT_VERIFY_NOTE)
  if (cited) return "unverified_cited";
  return currentResult.mentioned_competitors_count > 0 ? "content_gap" : "open_opportunity";
}

/**
 * Builds the {scanId, generatedAt, results} candidates the citation window
 * is drawn from. Dedupes by scanId (see dedupeMapsByScanId) so trend.ts and
 * this module's own callers agree on exactly one results list per scan.
 */
export function buildCitationWindowCandidates(
  maps: DomainCoverageMap[],
  resultsByScanId: Map<string, PromptResultLite[]>
): ScanResultsWindow[] {
  return dedupeMapsByScanId(maps).map((map) => ({
    scanId: map.scanId,
    generatedAt: map.generatedAt,
    results: resultsByScanId.get(map.scanId) ?? []
  }));
}

export function buildWebAuditSummary(input: {
  coverage: DomainCoverageMap;
  citationWindowCandidates: ScanResultsWindow[];
  projectDomain: string;
}): WebAuditSummary {
  const projectDomainNormalized = normalizeDomain(input.projectDomain);
  const citationWindow = buildCitationWindow(input.citationWindowCandidates, input.coverage.generatedAt);

  const currentResults = input.citationWindowCandidates.find((c) => c.scanId === input.coverage.scanId)?.results ?? [];
  const resultByPromptId = new Map<string, PromptResultLite>();
  for (const result of currentResults) {
    if (result.prompt_id) resultByPromptId.set(result.prompt_id, result);
  }

  const topics: ClassifiedTopic[] = input.coverage.topics.map((topic) => ({
    ...topic,
    outcome: classifyTopic(topic, resultByPromptId.get(topic.promptId), citationWindow, projectDomainNormalized)
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
