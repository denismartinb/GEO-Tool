import { isBrandDomain, normalizeDomain } from "@/lib/domains/brand-domain";
import { EXTRACTION_VERSION } from "@/lib/scan/constants";
import type { EngineCoverage } from "@/lib/scan/engine-coverage";
import type { ResolvedTechnicalComponent } from "@/lib/scoring/geo-score-technical";
import { MIN_RESPONSES_FOR_BAND } from "@/lib/scoring/score-reliability";

export const SCORING_VERSION = "phase9-geo-score-v4";

export type ScoreInputRow = {
  id: string;
  prompt_text_snapshot: string;
  brand_mentioned: boolean;
  citation_found: boolean;
  mentioned_competitors_count: number;
  citations_count: number;
  sentiment: "positive" | "neutral" | "negative" | "mixed" | "unknown";
  extracted_json: unknown;
  extraction_error: string | null;
  /**
   * Brand display name as snapshotted on scan_prompt_results
   * (project.brand at scan time). Used as the brand's identity in the
   * brand_position ranking — see docs/adr/0005-average-brand-position.md.
   * Optional for backward compatibility with existing call sites/tests that
   * don't pass it; brand_position is simply omitted when absent.
   */
  brand_snapshot?: string | null;
  /**
   * LLM provider for this row (e.g. "gemini", "claude"). Optional for
   * backward compatibility with single-engine-era data and existing call
   * sites/tests that don't pass it — a missing provider is treated as
   * grounded (see isGroundedRow), matching that historical Gemini-only
   * (always-grounded) behavior.
   */
  provider?: string | null;
  /**
   * scan_prompt_results.extraction_version at extraction time (lib/scan/
   * constants.ts). Optional for backward compatibility with existing call
   * sites/tests that don't pass it — a missing version is treated as
   * current (no gate applied), matching pre-SCAN-TRACKED-SET-1 behavior for
   * callers that haven't been updated to pass it. See
   * hasUntrustedCompetitorSet below for why this exists.
   */
  extraction_version?: string | null;
};

/**
 * True when at least one row in this run was genuinely extracted under an
 * OLD pipeline version — a staleness gate, not specific to one fix. Two
 * independent extraction-quality concerns have bumped this version so far,
 * and both are covered by the same check: SCAN-TRACKED-SET-1 (docs/
 * adr/0018) — extracted_json.competitors may contain entities the model
 * surfaced on its own rather than the project's actual tracked list — and
 * MENTION-VERIFY-1 (docs/adr/0021) — brand.mentioned/competitors[].mentioned
 * may be unverified (possibly hallucinated) rather than checked against the
 * raw response text. Runs almost always share one extraction_version (all
 * rows are extracted together right after the scan), so this gates at the
 * run level: computing brand_position/standing over a MIX of trustworthy and
 * stale rows would silently launder the old data's bias into new-looking
 * numbers, which is worse than dropping the components entirely for that
 * run. A future backfill bumps every row's extraction_version, which
 * resolves this cleanly without further code changes here.
 *
 * Requires `extracted_json` to be present, not just a version mismatch —
 * `extraction_version` defaults to `'v1'` at row-insert time (migration
 * 0001) and only advances to the current EXTRACTION_VERSION once that row's
 * extraction actually succeeds (lib/scan/extraction.ts). A row whose
 * extraction failed or is still pending never gets that update, so without
 * this guard a single transient per-prompt extraction failure — an
 * ordinary, expected occurrence, not evidence of a legacy pipeline — was
 * nulling brand_position for the ENTIRE run, including every other row that
 * extracted correctly (found via a real production case: a brand-new
 * project's first scan, fully populated mention/SOV data, zero position
 * data). A row with no extracted_json contributes nothing to
 * computeBrandPosition either way (it's skipped there), so it can't be
 * "untrusted" — there's no data from it to distrust.
 */
function hasUntrustedCompetitorSet(results: ScoreInputRow[]): boolean {
  return results.some(
    (row) =>
      row.extraction_version != null &&
      row.extraction_version !== EXTRACTION_VERSION &&
      row.extracted_json != null
  );
}

/**
 * Providers whose generation call includes real grounding (Gemini via Google
 * Search, docs/adr/0004-gemini-search-grounding.md; OpenAI via the Responses
 * API `web_search` tool, lib/llm/openai.ts) and can therefore produce genuine
 * citation evidence. citation_score and the authority component of geo_score
 * are computed only over rows from these providers — see
 * docs/adr/0012-grounding-aware-citation-score.md. An ungrounded provider's
 * citation_found is always false by construction (lib/llm/claude.ts, no web
 * search), so pooling it into the denominator only ever imposes a structural
 * ceiling on citation_score, never reflecting genuine citation performance.
 * Add a provider here only once it has real grounding wired up.
 *
 * Cross-reference (ENGINES-VALUE-1): the `grounded` flag on ENGINE_META in
 * lib/scan/engine-meta.ts deliberately duplicates this same semantics for
 * UI purposes (that module must stay import-free of scoring code). If a
 * provider gains real grounding, update BOTH this set and ENGINE_META.
 */
const GROUNDED_PROVIDERS = new Set<string>(["gemini", "openai"]);

/**
 * Minimum share of a run's results that must have extracted cleanly (parsed,
 * no extraction error) before the run's numbers are worth qualifying above
 * "low". Below this, too much of the sample is missing to put a figure on it.
 *
 * 0.8 is the tolerance ADR 0015 always intended; until 2026-08-04 the guard
 * above it made the branch unreachable, so the effective tolerance was zero.
 */
const CLEAN_COVERAGE_FLOOR = 0.8;

function isGroundedRow(row: ScoreInputRow): boolean {
  return !row.provider || GROUNDED_PROVIDERS.has(row.provider);
}

type ExtractedCitation = {
  domain?: string | null;
  source?: "grounding" | "inline";
};

function readCitations(value: unknown): ExtractedCitation[] {
  if (!value || typeof value !== "object") return [];
  const citations = (value as Record<string, unknown>).citations;
  if (!Array.isArray(citations)) return [];
  return citations as ExtractedCitation[];
}

/**
 * True when a row's extracted_json contains at least one real grounding
 * citation (docs/adr/0004) whose domain belongs to the brand — the same
 * host, a subdomain of it, or the same brand on another TLD (BRAND-DOMAIN-1,
 * lib/domains/brand-domain.ts: an ikea.com citation counts for an ikea.es
 * project). Mirrors the own_citation_share domain-match logic
 * (docs/adr/0010) — see docs/adr/0013-own-domain-citation-score.md for why
 * citation_score requires this instead of "any citation present".
 */
function hasOwnDomainCitation(row: ScoreInputRow, projectDomainNormalized: string): boolean {
  if (!projectDomainNormalized) return false;
  for (const citation of readCitations(row.extracted_json)) {
    if (citation.source !== "grounding") continue;
    const rawDomain = citation.domain?.trim();
    if (!rawDomain) continue;
    if (isBrandDomain(rawDomain, projectDomainNormalized)) return true;
  }
  return false;
}

/**
 * Minimal shape of a single entity (brand or competitor) extracted from
 * extracted_json, as relevant to brand_position. Mirrors
 * extractionOutputSchema's brand/competitor objects
 * (lib/extraction/schema.ts).
 */
type ExtractedEntity = {
  mentioned: boolean;
  position: number | null;
};

type ExtractedJsonShape = {
  brand: ExtractedEntity;
  competitors: Array<ExtractedEntity & { name: string }>;
};

/**
 * Defensively reads extracted_json as the position-relevant subset of
 * ExtractionOutput. Returns null if the shape doesn't look like a valid
 * extraction (e.g. older runs, or extraction_error rows).
 */
function readExtractedJson(value: unknown): ExtractedJsonShape | null {
  if (!value || typeof value !== "object") return null;
  const obj = value as Record<string, unknown>;
  const brand = obj.brand;
  const competitors = obj.competitors;

  if (!brand || typeof brand !== "object") return null;
  if (!Array.isArray(competitors)) return null;

  const brandEntity = readEntity(brand as Record<string, unknown>);
  if (!brandEntity) return null;

  const competitorEntities: Array<ExtractedEntity & { name: string }> = [];
  for (const item of competitors) {
    if (!item || typeof item !== "object") return null;
    const entity = readEntity(item as Record<string, unknown>);
    const name = (item as Record<string, unknown>).name;
    if (!entity || typeof name !== "string") return null;
    competitorEntities.push({ ...entity, name });
  }

  return { brand: brandEntity, competitors: competitorEntities };
}

function readEntity(obj: Record<string, unknown>): ExtractedEntity | null {
  if (typeof obj.mentioned !== "boolean") return null;
  const rawPosition = obj.position;
  const position = typeof rawPosition === "number" && Number.isFinite(rawPosition) ? rawPosition : null;

  // Defensive normalization: a non-null position with mentioned: false is
  // inconsistent data (Gemini contradiction). Treat as not-mentioned and
  // ignore the position — never fabricate evidence.
  if (!obj.mentioned) return { mentioned: false, position: null };

  return { mentioned: true, position };
}

type RunScoreOutput = {
  visibility_score: number;
  citation_score: number;
  competitor_gap_score: number;
  confidence: "low" | "medium" | "high";
  details_json: Record<string, unknown>;
};

function round2(n: number) {
  return Number(n.toFixed(2));
}

function clamp(min: number, max: number, x: number) {
  return Math.max(min, Math.min(max, x));
}

type BrandPositionRankingEntry = {
  name: string;
  is_brand: boolean;
  /**
   * Mean rank over ONLY the prompts where this entity was actually mentioned
   * — the metric a reader can interpret without further context: 1.0 means
   * "always listed first". Null when the entity was never mentioned.
   *
   * This replaces `avg_position` as the ranking signal (GEO-SCORE-POSITION-V3,
   * founder-approved 2026-08-03). The old figure averaged the N+1 penalty for
   * every non-mention into the same number, which made it a re-encoding of the
   * mention rate rather than a measure of rank: given eight entities that all
   * rank 2nd whenever they appear, it still spread them from 5.50 to 9.00,
   * purely by how often they appeared. It also flattered the tracked brand by
   * construction, since the prompt set is chosen around that brand — the
   * founder's own project showed Mozilla ranked above Chrome, Safari and Edge.
   */
  avg_position_when_mentioned: number | null;
  mention_count: number;
  /** Prompts this entity was evaluated over — the denominator of mention_rate. */
  prompt_count: number;
  /** 0..100, how often this entity appeared at all. The other half of the story. */
  mention_rate: number;
  /**
   * The pre-v3 figure: mean rank with every non-mention counted as N+1.
   * Retained for comparison across the transition only, exactly as ADR 0013
   * kept `citation_score_any_domain` and ADR 0015 kept `standing_v1`. Nothing
   * reads it for scoring or display.
   */
  avg_position_penalized: number;
};

type BrandPositionDetails = {
  prompts_with_position_data: number;
  total_entities: number;
  /** Ordered by rank when mentioned, best first; never-mentioned entities last. */
  ranking: BrandPositionRankingEntry[];
  /** The brand's own `avg_position_when_mentioned`; null if never mentioned. */
  brand_avg_position_when_mentioned: number | null;
  /** How many prompts the brand was actually mentioned in — prominence's sample. */
  brand_mention_count: number;
  /** Pre-v3 penalized figure for the brand, comparison only. */
  brand_avg_position_penalized: number | null;
  confidence: "low" | "high";
};

/**
 * Computes the "Average Brand Position" metric (docs/adr/0005) from the
 * per-prompt extracted_json of a run's completed results.
 *
 * Per prompt: N = 1 (brand) + competitors.length tracked entities. Each
 * mentioned entity's position is its 1-based first-mention rank (dense, no
 * gaps, brand and competitors share one ranking).
 *
 * avg_position_when_mentioned(entity) = mean(position) over ONLY the prompts
 * where that entity was mentioned; null when it was never mentioned. The
 * pre-v3 figure — which penalized every non-mention with N+1 and therefore
 * ordered by frequency rather than by rank — is kept per entity as
 * avg_position_penalized for comparison across the transition
 * (GEO-SCORE-POSITION-V3, docs/adr/0026).
 *
 * Returns null if no prompt has valid position data.
 */
function computeBrandPosition(results: ScoreInputRow[], totalResults: number): BrandPositionDetails | null {
  // entity name -> accumulators. `sumWhenMentioned`/`mentionCount` feed the v3
  // conditional rank; `sumPenalized`/`promptCount` keep the pre-v3 figure for
  // comparison across the transition.
  const accumulators = new Map<
    string,
    { sumWhenMentioned: number; sumPenalized: number; mentionCount: number; promptCount: number; isBrand: boolean }
  >();
  let promptsWithPositionData = 0;
  let maxTotalEntities = 0;

  for (const row of results) {
    const extracted = readExtractedJson(row.extracted_json);
    if (!extracted) continue;

    const brandName = row.brand_snapshot?.trim();
    if (!brandName) continue;

    const totalEntities = 1 + extracted.competitors.length;
    const penalizedPosition = totalEntities + 1;
    maxTotalEntities = Math.max(maxTotalEntities, totalEntities);
    promptsWithPositionData += 1;

    const entities: Array<{ name: string; isBrand: boolean; entity: ExtractedEntity }> = [
      { name: brandName, isBrand: true, entity: extracted.brand },
      ...extracted.competitors.map((c) => ({ name: c.name, isBrand: false, entity: c }))
    ];

    for (const { name, isBrand, entity } of entities) {
      const existing =
        accumulators.get(name) ??
        { sumWhenMentioned: 0, sumPenalized: 0, mentionCount: 0, promptCount: 0, isBrand };

      existing.promptCount += 1;

      if (entity.mentioned && entity.position !== null) {
        existing.sumWhenMentioned += entity.position;
        existing.sumPenalized += entity.position;
        existing.mentionCount += 1;
      } else {
        existing.sumPenalized += penalizedPosition;
      }

      accumulators.set(name, existing);
    }
  }

  if (promptsWithPositionData === 0) return null;

  const ranking: BrandPositionRankingEntry[] = Array.from(accumulators.entries())
    .map(([name, { sumWhenMentioned, sumPenalized, mentionCount, promptCount, isBrand }]) => ({
      name,
      is_brand: isBrand,
      avg_position_when_mentioned: mentionCount > 0 ? round2(sumWhenMentioned / mentionCount) : null,
      mention_count: mentionCount,
      prompt_count: promptCount,
      mention_rate: promptCount > 0 ? round2((mentionCount / promptCount) * 100) : 0,
      avg_position_penalized: round2(sumPenalized / promptCount)
    }))
    // Best rank first (founder decision, 2026-08-03: order by position, with
    // the appearance rate shown alongside). An entity that was never mentioned
    // has no rank at all and sorts last rather than being given a fabricated
    // one.
    .sort((a, b) => {
      if (a.avg_position_when_mentioned === null && b.avg_position_when_mentioned === null) return 0;
      if (a.avg_position_when_mentioned === null) return 1;
      if (b.avg_position_when_mentioned === null) return -1;
      return a.avg_position_when_mentioned - b.avg_position_when_mentioned;
    });

  const brandEntry = ranking.find((entry) => entry.is_brand);

  return {
    prompts_with_position_data: promptsWithPositionData,
    total_entities: maxTotalEntities,
    ranking,
    brand_avg_position_when_mentioned: brandEntry?.avg_position_when_mentioned ?? null,
    brand_mention_count: brandEntry?.mention_count ?? 0,
    brand_avg_position_penalized: brandEntry?.avg_position_penalized ?? null,
    confidence: promptsWithPositionData < totalResults ? "low" : "high"
  };
}

export function computeRunScoresFromResults(
  results: ScoreInputRow[],
  projectDomain: string,
  options?: {
    /**
     * The resolved `technical` component for this run (GEO-SCORE-V4,
     * docs/adr/0033), or null/absent when no technical audit is available.
     *
     * Optional on purpose: every existing call site and test that omits it
     * keeps producing a four-component composite whose weights renormalise to
     * exactly the v3 values, so omitting it is not a silent behaviour change.
     * See `lib/scoring/geo-score-technical.ts` for how it is resolved.
     */
    technical?: ResolvedTechnicalComponent | null;
    /** Why `technical` is absent, when it is — surfaced in the dropped-component reason. */
    technicalReason?: string | null;
    /**
     * Engine-coverage verdict for this run (GEO-SCORE-V4 Fase B,
     * `lib/scan/engine-coverage.ts`). Recorded in details_json so downstream
     * surfaces can tell a run that measured every engine the plan promises
     * from one that silently measured fewer.
     */
    engineCoverage?: EngineCoverage | null;
  }
): RunScoreOutput {
  const totalResults = results.length;
  const projectDomainNormalized = projectDomain ? normalizeDomain(projectDomain) : "";
  const safeTotal = Math.max(totalResults, 1);
  const untrustedCompetitorSet = hasUntrustedCompetitorSet(results);

  const extractedResultsCount = results.filter((row) => row.extracted_json && typeof row.extracted_json === "object").length;
  const extractionErrorCount = results.filter((row) => row.extraction_error).length;
  /**
   * Rows that are actually usable as evidence: extracted AND without an
   * extraction error. This — not the raw extracted count — is what confidence
   * is measured against (ADR 0015 rev. 2026-08-04).
   */
  const cleanResultsCount = results.filter(
    (row) => row.extracted_json && typeof row.extracted_json === "object" && !row.extraction_error
  ).length;
  const extractionCoverage = cleanResultsCount / safeTotal;

  const brandMentionedCount = results.filter((row) => row.brand_mentioned).length;
  const totalCitationsCount = results.reduce((acc, row) => acc + Math.max(0, row.citations_count ?? 0), 0);
  const totalCompetitorMentions = results.reduce((acc, row) => acc + Math.max(0, row.mentioned_competitors_count ?? 0), 0);

  const visibilityScore = round2((brandMentionedCount / safeTotal) * 100);

  // --- Own-domain citation_score (docs/adr/0013) ---
  // citation_score (and the authority component of geo_score) requires a
  // grounding citation whose domain actually matches the project's own
  // domain — "any source cited, regardless of whose" inflates the metric to
  // 100% as soon as the AI cites anything at all, even a competitor or an
  // unrelated third party (see docs/adr/0013 for the real Ikea case that
  // surfaced this). Domain-matching mirrors own_citation_share (docs/adr/0010).
  // Only rows from grounded providers (docs/adr/0012) are eligible, since an
  // ungrounded provider can never have a real grounding citation.
  const groundedResults = results.filter(isGroundedRow);
  const groundedTotal = groundedResults.length;
  const citationScoreDataAvailable = groundedTotal > 0 && projectDomainNormalized.length > 0;
  const ownDomainCitationCount = groundedResults.filter((row) =>
    hasOwnDomainCitation(row, projectDomainNormalized)
  ).length;
  const citationScore = citationScoreDataAvailable ? round2((ownDomainCitationCount / groundedTotal) * 100) : 0;

  // Secondary/comparison formulas, demoted from "official KPI" by docs/adr/0013:
  // - citation_score_any_domain: grounded-provider rows with ANY grounding
  //   citation present, regardless of domain (the official formula from
  //   docs/adr/0012, before this phase).
  // - citation_score_blended: all rows (including ungrounded providers) with
  //   ANY citation present (the original pre-0012 formula).
  const citationFoundCount = groundedResults.filter((row) => row.citation_found).length;
  const citationScoreAnyDomain = groundedTotal > 0 ? round2((citationFoundCount / groundedTotal) * 100) : 0;

  const citationFoundCountBlended = results.filter((row) => row.citation_found).length;
  const citationScoreBlended = round2((citationFoundCountBlended / safeTotal) * 100);

  const citationByProvider: Record<string, { total: number; citation_found_count: number }> = {};
  for (const row of results) {
    const key = row.provider ?? "unknown";
    const entry = citationByProvider[key] ?? { total: 0, citation_found_count: 0 };
    entry.total += 1;
    if (row.citation_found) entry.citation_found_count += 1;
    citationByProvider[key] = entry;
  }

  // --- Competitive Pressure (docs/adr/0011) ---
  // Counts prompts where the brand was displaced: at least one competitor
  // was mentioned AND the brand itself was NOT mentioned in that same
  // prompt. This replaces the old "competitor gap" formula, which summed
  // total competitor mentions across all prompts (a count that saturates
  // past total_results with just 2-3 competitors per prompt) without ever
  // checking co-occurrence with the brand. Field name (competitor_gap_score)
  // is kept unchanged to avoid a migration — only the computation changes.
  const displacedPromptsCount = results.filter(
    (row) => !row.brand_mentioned && Math.max(0, row.mentioned_competitors_count ?? 0) > 0
  ).length;
  const competitorGapScore = round2(clamp(0, 100, (displacedPromptsCount / safeTotal) * 100));

  // "high" requires >=20 clean results (was >=5): with one LLM sample per
  // prompt/engine, 5 results give each answer a 20-point swing on presence —
  // calling that sample "high confidence" overstated its statistical
  // reliability (docs/geo-methodology-audit-2026-07.md, finding 5 / ADR 0015).
  //
  // Revised 2026-08-04 (founder decision, ADR 0015 rev.): confidence for
  // "low" is now PROPORTIONAL to how much of the run extracted cleanly,
  // instead of collapsing to low the moment a single row failed. The old rule
  // read as if it tolerated 20% of rows failing — but its
  // `extractionCoverage >= 0.8` branch was unreachable, because the guard
  // above it already demanded that NOTHING had failed. So a 19-of-20 run was
  // rated exactly like a 0-of-20 one, and since
  // computeRecommendationPotentialPoints refuses to quantify a low-confidence
  // run, one bad row erased the "+X pt" figure from every recommendation on
  // the page. The floor stays: below CLEAN_COVERAGE_FLOOR of the run usable,
  // the sample is not worth putting a number on, and confidence really is low.
  //
  // "medium" requires >=MIN_RESPONSES_FOR_BAND (10) TOTAL responses, not just
  // clean ones (GEO-SCORE-RELIABILITY-1 / ADR 0024, which shipped on `main`
  // while this revision was still on its own branch — reconciled here rather
  // than reverting either fix). Two clean results were never a "medium
  // confidence" sample in any statistical sense: below 10 responses a single
  // AI answer moves the mention rate by >=10 points, and ~0.71x of that
  // reaches the composite. This also gates `computeRecommendationPotential
  // Points` below, which already refuses to publish a point estimate over a
  // "low" confidence run — so tiny runs stop showing "hasta +X pt" ceilings
  // they cannot support, which is the intended consequence, not a side
  // effect.
  let confidence: "low" | "medium" | "high" = "low";
  if (extractionCoverage < CLEAN_COVERAGE_FLOOR) {
    confidence = "low";
  } else if (cleanResultsCount >= 20) {
    confidence = "high";
  } else if (totalResults >= MIN_RESPONSES_FOR_BAND) {
    confidence = "medium";
  }

  const sentimentDistribution = results.reduce<Record<string, number>>((acc, row) => {
    acc[row.sentiment] = (acc[row.sentiment] ?? 0) + 1;
    return acc;
  }, {});

  // Never compute a position ranking from a competitor set that may be
  // contaminated with entities the model surfaced on its own rather than
  // the project's actual tracked list — see hasUntrustedCompetitorSet.
  const brandPosition = untrustedCompetitorSet ? null : computeBrandPosition(results, totalResults);

  // --- GEO Score composite (ADR 0008, revised by ADR 0015, 0026, 0033) ---
  const COMPOSITE_VERSION = "geo-score-v4";

  const presenceScore = visibilityScore; // 0..100, higher better
  const authorityScore: number | null = citationScoreDataAvailable ? citationScore : null; // 0..100, higher better

  // --- standing = Share of Voice (geo-score-v2, ADR 0015) ---
  // v1 used 100 - competitor_gap_score, which (a) double-counted the same
  // brand_mentioned signal that presence already carries, and (b) awarded a
  // perfect standing to a brand that is invisible in a market where the AI
  // mentions no competitors either (docs/geo-methodology-audit-2026-07.md,
  // finding 4). v2 uses real share of voice over per-prompt mention counts of
  // tracked entities: brand mentions / (brand + tracked competitor mentions).
  // With a zero denominator there is no voice to share — the component is
  // dropped and the remaining weights renormalize (same mechanism as
  // prominence/authority), instead of fabricating a 100. The v1 value is kept
  // below as standing_v1 for comparison only, mirroring how ADR 0013 retained
  // citation_score_any_domain.
  const standingV1 = clamp(0, 100, 100 - competitorGapScore);
  const sovDenominator = brandMentionedCount + totalCompetitorMentions;
  // A run with zero TRACKED competitors (brandPosition.total_entities <= 1,
  // i.e. only the brand itself) has no voice to share by construction — a
  // brand_mentioned-only denominator would fabricate a perfect 100 exactly
  // like the empty-market case ADR 0015 already eliminated for the
  // zero-denominator path below. This is distinct from "competitors are
  // tracked but weren't mentioned this run" (a real, valid 100).
  const hasNoTrackedCompetitors = brandPosition !== null && brandPosition.total_entities <= 1;
  const standingScore: number | null =
    untrustedCompetitorSet || hasNoTrackedCompetitors
      ? null
      : sovDenominator > 0
        ? round2((brandMentionedCount / sovDenominator) * 100)
        : null;

  // --- prominence = rank WHEN MENTIONED (geo-score-v3) ---
  // v2 fed this the penalized average, which counted every non-mention as
  // N+1. That made prominence a second encoding of the mention rate rather
  // than a measure of rank: presence (.40) and prominence (.25) were largely
  // the same signal, which is why a mention-rate swing reached the composite
  // at a measured 0.71x instead of the 0.40 presence's weight implies
  // (docs/geo-methodology-audit-2026-07.md finding 4 — ADR 0015 fixed
  // `standing` and left this one). Conditioning on mention makes prominence
  // answer a question presence does not: when the AI does name you, does it
  // put you first or fourth?
  //
  // Gated on the brand's own MENTION count, not the run's response count.
  // Removing the N+1 penalty removes what used to keep a single lucky
  // first-place mention honest: without a gate, one mention at rank 1 would
  // read as a perfect 100. Below the floor the component is dropped and the
  // remaining weights renormalize — the same mechanism authority and standing
  // already use, and the same threshold Fase 0 established for every other
  // claim on this data.
  let prominenceScore: number | null = null;
  const prominenceSampleSufficient =
    brandPosition !== null && brandPosition.brand_mention_count >= MIN_RESPONSES_FOR_BAND;
  if (
    brandPosition &&
    prominenceSampleSufficient &&
    brandPosition.brand_avg_position_when_mentioned !== null &&
    brandPosition.total_entities > 0
  ) {
    const p = brandPosition.brand_avg_position_when_mentioned; // 1..N, lower better
    const n = brandPosition.total_entities;
    prominenceScore = clamp(0, 100, (1 - (p - 1) / n) * 100);
  }

  // --- technical = readiness of the site itself (geo-score-v4, ADR 0033) ---
  // Founder decision, 2026-08-05: a site AI engines cannot read cleanly cannot
  // benefit from any other GEO work, so readiness belongs INSIDE the headline
  // number, not beside it.
  //
  // The weights below are NOT a recalibration. The four existing components
  // keep their v3 ratios exactly and are scaled by (1 - TECHNICAL_WEIGHT):
  //
  //     presence   .40 x .80 = .32        standing   .20 x .80 = .16
  //     prominence .25 x .80 = .20        authority  .15 x .80 = .12
  //
  // That is load-bearing in two ways, both deliberate:
  //
  //  1. It keeps ADR 0031's prohibition intact. Recalibrating the four while
  //     also adding a fifth would make no effect attributable to either
  //     change, and the calibration data (runs from 2026-08-05 onward) does
  //     not exist yet. Their RELATIVE weights are untouched, so every
  //     movement is attributable to the new component alone.
  //  2. Dropping `technical` renormalises the other four back to EXACTLY
  //     .40/.25/.20/.15 — .32/.80 = .40, and so on. A project with no audit
  //     therefore scores identically to v3. The change is strictly additive:
  //     nobody's number moves because of a weight, only because a real new
  //     measurement of their real site entered the composite.
  const TECHNICAL_WEIGHT = 0.2;
  const LEGACY_SCALE = 1 - TECHNICAL_WEIGHT;
  const technicalComponent = options?.technical ?? null;
  const technicalScore: number | null = technicalComponent ? technicalComponent.value : null;

  const geoScoreComponents = [
    { key: "presence", value: presenceScore, weight: round2(0.4 * LEGACY_SCALE) },
    { key: "prominence", value: prominenceScore, weight: round2(0.25 * LEGACY_SCALE) },
    { key: "standing", value: standingScore, weight: round2(0.2 * LEGACY_SCALE) },
    { key: "authority", value: authorityScore, weight: round2(0.15 * LEGACY_SCALE) },
    { key: "technical", value: technicalScore, weight: TECHNICAL_WEIGHT }
  ];

  const availableGeoScoreComponents = geoScoreComponents.filter((c) => c.value !== null);
  const geoScoreWeightSum = availableGeoScoreComponents.reduce((s, c) => s + c.weight, 0);

  let geoScore: Record<string, unknown> | undefined;
  if (totalResults > 0 && geoScoreWeightSum > 0) {
    const score = availableGeoScoreComponents.reduce(
      (s, c) => s + (c.value as number) * (c.weight / geoScoreWeightSum),
      0
    );

    const droppedProminence = prominenceScore === null;
    const droppedAuthority = authorityScore === null;
    const droppedStanding = standingScore === null;
    // `technical` is deliberately NOT part of this cap. The other three
    // components drop because the LLM measurement itself was too thin or too
    // stale to trust, which is exactly what `confidence` reports. A missing
    // technical audit says nothing about the quality of the AI-answer
    // measurement — it is normal on a project's first scan and structural on
    // plans without the audit. Folding it in would mark those runs less
    // confident than they are, which is its own kind of dishonesty.
    const compositeConfidence =
      (droppedProminence || droppedAuthority || droppedStanding) && confidence === "high" ? "medium" : confidence;

    /** Normalised weight actually applied to a component this run. */
    const normWeight = (baseWeight: number) => round2(baseWeight / geoScoreWeightSum);

    geoScore = {
      score: round2(score),
      composite_version: COMPOSITE_VERSION,
      confidence: compositeConfidence,
      inputs_used: availableGeoScoreComponents.map((c) => c.key),
      // v1 standing (100 - competitor_gap_score), retained for comparison
      // only across the v1 -> v2 transition (ADR 0015) — not part of the score.
      standing_v1: round2(standingV1),
      engine_coverage: options?.engineCoverage ?? null,
      technical_snapshot: technicalComponent
        ? {
            snapshot_id: technicalComponent.snapshot_id,
            captured_at: technicalComponent.captured_at,
            source: technicalComponent.source,
            age_days: technicalComponent.age_days
          }
        : null,
      components: {
        presence: { value: presenceScore, weight: normWeight(0.4 * LEGACY_SCALE) },
        prominence:
          prominenceScore === null
            ? {
                value: null,
                weight: 0,
                reason: untrustedCompetitorSet
                  ? "extraction predates the current pipeline version — competitor-set reconciliation and/or mention verification may be incomplete for this run (docs/adr/0018, docs/adr/0021)"
                  : brandPosition && !prominenceSampleSufficient
                    ? `the brand was mentioned in ${brandPosition.brand_mention_count} prompts; rank-when-mentioned needs at least ${MIN_RESPONSES_FOR_BAND} to mean anything (geo-score-v3)`
                    : "brand_position absent, or the brand was never mentioned in this run"
              }
            : { value: round2(prominenceScore), weight: normWeight(0.25 * LEGACY_SCALE) },
        standing:
          standingScore === null
            ? {
                value: null,
                weight: 0,
                reason: untrustedCompetitorSet
                  ? "extraction predates the current pipeline version — competitor-set reconciliation and/or mention verification may be incomplete for this run (docs/adr/0018, docs/adr/0021)"
                  : hasNoTrackedCompetitors
                    ? "no competitors tracked for this project (nothing to share voice with, docs/adr/0018)"
                    : "no brand or tracked-competitor mentions in this run (share-of-voice denominator is 0, ADR 0015)"
              }
            : { value: round2(standingScore), weight: normWeight(0.2 * LEGACY_SCALE) },
        authority:
          authorityScore === null
            ? {
                value: null,
                weight: 0,
                reason:
                  "no grounded (citation-capable) provider rows in this run, or no project domain to match citations against (docs/adr/0012, docs/adr/0013)"
              }
            : { value: authorityScore, weight: normWeight(0.15 * LEGACY_SCALE) },
        technical:
          technicalScore === null
            ? {
                value: null,
                weight: 0,
                reason: options?.technicalReason ?? "no technical readiness audit available for this run (docs/adr/0027, docs/adr/0033)"
              }
            : { value: round2(technicalScore), weight: normWeight(TECHNICAL_WEIGHT) }
      },
      formula:
        "geo_score = Σ(component_value * normalized_weight); base weights presence .32 / prominence .20 / standing .16 / authority .12 / technical .20 " +
        "(geo-score-v4, ADR 0033: the four v3 components keep their exact v3 ratios, scaled by 1-technical_weight, so dropping `technical` " +
        "renormalizes them back to precisely .40/.25/.20/.15 and a project with no audit scores identically to v3); " +
        "standing = share of voice = brand_mentioned_count / (brand_mentioned_count + total_competitor_mentions) * 100 " +
        "(v1 formula 100 - competitor_gap_score kept as standing_v1 for comparison, ADR 0015); " +
        "prominence = (1 - (brand_avg_position_when_mentioned-1)/total_entities)*100, dropped unless the brand was mentioned in at least MIN_RESPONSES_FOR_BAND prompts (geo-score-v3); " +
        "technical = web_audit_snapshots.readiness_score, a deterministic (no-LLM) measure of how readable the site is to AI engines (docs/adr/0033); " +
        "absent components dropped and remaining weights renormalized."
    };
  }

  const assumptions = [
    "visibility_score = % prompts with brand_mentioned",
    "citation_score = % of GROUNDED-provider prompts citing the brand's OWN domain (docs/adr/0013), not just any source. Ungrounded providers (e.g. Claude, no web search grounding) are excluded, same as docs/adr/0012, but still count toward visibility_score/standing. citation_score_any_domain (any grounding citation, regardless of domain — the pre-0013 formula) and citation_score_blended (all providers pooled, any domain) are kept in details_json for comparison only.",
    "competitor_gap_score (Competitive Pressure, docs/adr/0011) higher = worse: % of prompts where a competitor was mentioned but the brand was not (brand displacement), not raw competitor mention volume",
    extractionCoverage < 1
      ? `Extraction coverage ${Math.round(extractionCoverage * 100)}% (clean rows / total). Confidence is low only below ${Math.round(CLEAN_COVERAGE_FLOOR * 100)}%.`
      : "Extraction coverage is complete.",
    "brand_position (geo-score-v3): position = 1-based rank of an entity's first mention per prompt (dense ranking, brand and competitors share one ranking). avg_position_when_mentioned = mean rank over ONLY the prompts where that entity was mentioned; lower is better and 1.0 means always listed first. Never-mentioned entities have null and sort last. mention_rate carries the other half of the story — how often the entity appeared at all. The pre-v3 figure, which averaged an N+1 penalty for every non-mention into the same number and therefore re-encoded the mention rate as if it were a rank, is retained per entity as avg_position_penalized for comparison only.",
    "geo_score (geo-score-v4, ADR 0033): composite of presence (visibility_score), prominence (rank WHEN MENTIONED, derived from brand_position), standing (share of voice: brand mentions / brand + tracked competitor mentions), authority (citation_score) and technical (web_audit_snapshots.readiness_score — a deterministic, no-LLM measure of how readable the site is to AI engines), weighted .32/.20/.16/.12/.20. The four non-technical weights are the v3 values (.40/.25/.20/.15) scaled by 1-technical_weight, so their RELATIVE weights are unchanged and dropping `technical` renormalizes them back to exactly v3 — the addition is strictly additive, not a recalibration (that remains ADR 0031, still blocked on data). Any unavailable component (prominence without position data, standing with a zero share-of-voice denominator, authority without grounded rows, technical without a recent audit) is dropped and the remaining weights renormalized; composite confidence is capped at medium in that case, except for a missing technical component, which says nothing about the quality of the AI-answer measurement. The v1 standing (100 - competitor_gap_score) is kept as standing_v1 for comparison only.",
    `confidence (ADR 0015 rev. 2026-08-04 + GEO-SCORE-RELIABILITY-1): measured on CLEAN results (extracted, no extraction error). Low when clean coverage < ${Math.round(CLEAN_COVERAGE_FLOOR * 100)}% of the run, OR when total responses < ${MIN_RESPONSES_FOR_BAND} (below that, a single AI answer moves the mention rate by >=${Math.round(100 / MIN_RESPONSES_FOR_BAND)} points regardless of extraction quality); otherwise high with >=20 clean results (one LLM sample per prompt/engine is noisy at small sizes), medium from ${MIN_RESPONSES_FOR_BAND} total responses up.`
  ];

  const perPromptSummary = results.slice(0, 10).map((row) => ({
    id: row.id,
    prompt: row.prompt_text_snapshot.slice(0, 160),
    brand_mentioned: row.brand_mentioned,
    citation_found: row.citation_found,
    competitor_mentions: row.mentioned_competitors_count,
    citations_count: row.citations_count,
    sentiment: row.sentiment,
    extracted: Boolean(row.extracted_json && typeof row.extracted_json === "object")
  }));

  return {
    visibility_score: visibilityScore,
    citation_score: citationScore,
    competitor_gap_score: competitorGapScore,
    confidence,
    details_json: {
      scoring_version: SCORING_VERSION,
      total_results: totalResults,
      extracted_results_count: extractedResultsCount,
      extraction_error_count: extractionErrorCount,
      clean_results_count: cleanResultsCount,
      brand_mentioned_count: brandMentionedCount,
      own_domain_citation_count: ownDomainCitationCount,
      citation_found_count: citationFoundCount,
      citation_score_any_domain: citationScoreAnyDomain,
      citation_score_blended: citationScoreBlended,
      citation_score_data_available: citationScoreDataAvailable,
      grounded_results_count: groundedTotal,
      citation_by_provider: citationByProvider,
      total_citations_count: totalCitationsCount,
      total_competitor_mentions: totalCompetitorMentions,
      displaced_prompts_count: displacedPromptsCount,
      sentiment_distribution: sentimentDistribution,
      formulas_used: {
        visibility_score: "brand_mentioned_count / total_results * 100",
        citation_score:
          "own_domain_citation_count / grounded_results_count * 100, computed only over rows from grounded providers (docs/adr/0012) with a grounding citation whose domain matches the project's own domain (docs/adr/0013); 0 with citation_score_data_available=false when no grounded rows exist in this run or no project domain was provided. citation_score_any_domain (grounded rows, any citation regardless of domain — the pre-0013 formula) and citation_score_blended (all providers pooled, any domain) are retained in details_json for comparison only.",
        competitor_gap_score:
          "clamp(0,100, (displaced_prompts_count / total_results) * 100 ); displaced_prompts_count = prompts where mentioned_competitors_count > 0 AND brand_mentioned is false (docs/adr/0011)",
        brand_position:
          "avg_position_when_mentioned(entity) = mean(position over ONLY the prompts where that entity was mentioned), null when never mentioned (geo-score-v3, docs/adr/0026); " +
          "mention_rate(entity) = mention_count / prompt_count * 100, reported alongside so a rank is never read without knowing how often it was earned; " +
          "avg_position_penalized(entity) = mean(position if mentioned else N+1) with N = total tracked entities for that prompt — the pre-v3 figure, retained for comparison across the transition and read by nothing",
        geo_score:
          "geo_score = Σ(component_value * normalized_weight); base weights presence .40 / prominence .25 / standing .20 / authority .15; " +
          "standing = share of voice = brand_mentioned_count / (brand_mentioned_count + total_competitor_mentions) * 100 " +
          "(v1 formula 100 - competitor_gap_score kept as standing_v1 for comparison, ADR 0015); " +
          "prominence = (1 - (brand_avg_position_when_mentioned-1)/total_entities)*100, dropped unless the brand was mentioned in at least MIN_RESPONSES_FOR_BAND prompts (geo-score-v3); " +
          "absent components dropped and remaining weights renormalized."
      },
      assumptions,
      per_prompt_summary: perPromptSummary,
      ...(brandPosition ? { brand_position: brandPosition } : {}),
      ...(geoScore ? { geo_score: geoScore } : {})
    }
  };
}

/* ============================================================
   RECS-POTENTIAL-1 — real "potential score points" per recommendation
   (docs/adr/0016-recommendation-potential-points.md).

   Methodology (validated by geo-strategy, 2026-07-23): recompute the SAME
   composite via computeRunScoresFromResults over a counterfactual copy of
   the real per-prompt rows — never a percentage×weight shortcut, which
   ignores weight renormalization and misattributes which component a
   recommendation actually moves. Every number here is traceable to real
   scoring + real evidence_json.affected_prompt_ids; nothing is invented.
   ============================================================ */

/**
 * Which score component a recommendation type's counterfactual moves.
 * Types with no entry here are NOT quantifiable — no evidence-1:1 gap
 * exists to map them to a single component (see the ADR for the full
 * rationale per type), so they get a qualitative impact badge instead of a
 * point number, never a fabricated one.
 */
const RECOMMENDATION_POTENTIAL_KIND: Record<string, "presence" | "prominence" | "authority"> = {
  increase_brand_visibility: "presence",
  close_competitor_gap: "presence",
  increase_brand_prominence: "prominence",
  add_citation_block: "authority",
  // RECS-REDESIGN-1 split the single source-gap rule into one card per source
  // family (comparator / community / media). All four share the same
  // counterfactual: the brand's domain becomes a grounded citation on the
  // affected prompts, so they map to the same "authority" mutation the
  // original rule used — no new scoring logic, just the new type names.
  pursue_citation_sources: "authority",
  pursue_comparator_sources: "authority",
  pursue_community_sources: "authority",
  pursue_media_sources: "authority"
};

export function isQuantifiableRecommendationType(recommendationType: string): boolean {
  return recommendationType in RECOMMENDATION_POTENTIAL_KIND;
}

type CounterfactualMutation = {
  promptIds: ReadonlySet<string>;
  kind: "presence" | "prominence" | "authority";
};

/**
 * Deep-clones only the affected rows and applies the counterfactual
 * "best case" for each mutation kind — never mutates the input array/rows.
 * - presence: brand_mentioned -> true (also feeds standing/share-of-voice
 *   for free, since standing = brand_mentioned_count / (brand_mentioned_count
 *   + total_competitor_mentions) — no separate standing mutation needed).
 * - prominence: the brand's extracted_json entity becomes { mentioned:
 *   true, position: 1 } (best possible rank) for that prompt.
 * - authority: injects a synthetic own-domain grounding citation into
 *   extracted_json.citations, but ONLY on grounded-provider rows (ADR
 *   0012) — an ungrounded row can never produce a real citation, so the
 *   counterfactual must respect the same structural ceiling the real
 *   scoring does.
 */
function applyCounterfactualMutations(
  results: ScoreInputRow[],
  mutations: readonly CounterfactualMutation[],
  projectDomain: string
): ScoreInputRow[] {
  const domain = projectDomain ? normalizeDomain(projectDomain) : "";
  const kindsByRowId = new Map<string, Set<CounterfactualMutation["kind"]>>();
  for (const mutation of mutations) {
    for (const id of mutation.promptIds) {
      const kinds = kindsByRowId.get(id) ?? new Set<CounterfactualMutation["kind"]>();
      kinds.add(mutation.kind);
      kindsByRowId.set(id, kinds);
    }
  }

  return results.map((row) => {
    const kinds = kindsByRowId.get(row.id);
    if (!kinds) return row;
    let mutated = row;

    if (kinds.has("presence")) {
      mutated = { ...mutated, brand_mentioned: true };
    }

    if (kinds.has("prominence")) {
      const extracted = mutated.extracted_json;
      if (extracted && typeof extracted === "object" && "brand" in extracted) {
        mutated = {
          ...mutated,
          extracted_json: { ...(extracted as Record<string, unknown>), brand: { mentioned: true, position: 1 } }
        };
      }
    }

    if (kinds.has("authority") && domain && isGroundedRow(mutated)) {
      const alreadyOwn = hasOwnDomainCitation(mutated, domain);
      if (!alreadyOwn) {
        const base =
          mutated.extracted_json && typeof mutated.extracted_json === "object"
            ? (mutated.extracted_json as Record<string, unknown>)
            : {};
        const existingCitations = readCitations(mutated.extracted_json);
        mutated = {
          ...mutated,
          citation_found: true,
          extracted_json: {
            ...base,
            citations: [...existingCitations, { source: "grounding" as const, domain: projectDomain }]
          }
        };
      }
    }

    return mutated;
  });
}

function extractGeoScore(output: RunScoreOutput): number | null {
  const details = output.details_json as { geo_score?: { score?: number } };
  return typeof details.geo_score?.score === "number" ? details.geo_score.score : null;
}

export type PotentialPointsResult = {
  /** Optimistic ceiling, in geo_score points — never negative. */
  deltaPoints: number;
};

/**
 * Standalone "hasta +X pt" for ONE recommendation: recomputes the real
 * composite with only THIS recommendation's affected prompts resolved.
 * Returns null (render a qualitative badge instead, never a number) when:
 * the type isn't quantifiable, there are no affected prompts, this run has
 * no geo-score-v2 composite yet (pre-ADR-0015 run, no backfill), or the
 * run's confidence is "low" — a point estimate over a low-confidence sample
 * is false precision (RECS-POTENTIAL-1 confidence gate).
 */
export function computeRecommendationPotentialPoints(
  results: ScoreInputRow[],
  projectDomain: string,
  recommendationType: string,
  affectedPromptIds: readonly string[]
): PotentialPointsResult | null {
  const kind = RECOMMENDATION_POTENTIAL_KIND[recommendationType];
  if (!kind || affectedPromptIds.length === 0) return null;

  const real = computeRunScoresFromResults(results, projectDomain);
  if (real.confidence === "low") return null;
  const realScore = extractGeoScore(real);
  if (realScore === null) return null;

  const mutatedResults = applyCounterfactualMutations(
    results,
    [{ promptIds: new Set(affectedPromptIds), kind }],
    projectDomain
  );
  const counterfactualScore = extractGeoScore(computeRunScoresFromResults(mutatedResults, projectDomain));
  if (counterfactualScore === null) return null;

  return { deltaPoints: round2(Math.max(0, counterfactualScore - realScore)) };
}

/**
 * Joint "hasta +Y pt" ceiling across MULTIPLE recommendations at once — the
 * UNION of their affected-prompt mutations, rescored ONCE. This is what the
 * Oportunidades header total must use instead of summing standalone deltas:
 * two recommendations can share affected prompts (e.g. the same
 * brand-absent prompt drives both increase_brand_visibility and
 * close_competitor_gap), and summing would double-count that overlap,
 * overstating the real reachable ceiling. Operating on the union collapses
 * the overlap for free, so `joint.deltaPoints <= Σ(standalone deltas)`
 * always holds.
 */
export function computeJointPotentialPoints(
  results: ScoreInputRow[],
  projectDomain: string,
  recommendations: ReadonlyArray<{ recommendationType: string; affectedPromptIds: readonly string[] }>
): PotentialPointsResult | null {
  const mutations: CounterfactualMutation[] = [];
  for (const rec of recommendations) {
    const kind = RECOMMENDATION_POTENTIAL_KIND[rec.recommendationType];
    if (!kind || rec.affectedPromptIds.length === 0) continue;
    mutations.push({ promptIds: new Set(rec.affectedPromptIds), kind });
  }
  if (mutations.length === 0) return null;

  const real = computeRunScoresFromResults(results, projectDomain);
  if (real.confidence === "low") return null;
  const realScore = extractGeoScore(real);
  if (realScore === null) return null;

  const mutatedResults = applyCounterfactualMutations(results, mutations, projectDomain);
  const counterfactualScore = extractGeoScore(computeRunScoresFromResults(mutatedResults, projectDomain));
  if (counterfactualScore === null) return null;

  return { deltaPoints: round2(Math.max(0, counterfactualScore - realScore)) };
}

/**
 * The single "GEO Score" number shown on the Overview gauge, extracted from
 * a run_scores row so callers other than the project page (e.g. the
 * score-drop alert, ALERTS-1) don't re-derive it differently. Falls back to
 * the legacy visibility_score for runs scored before geo-score-v1 existed
 * (no backfill, per ADR 0008) — mirrors app/dashboard/projects/[projectId]/page.tsx.
 */
export function getEffectiveGeoScore(row: {
  visibility_score: number | null;
  details_json: unknown;
}): number {
  const details =
    row.details_json && typeof row.details_json === "object" ? (row.details_json as { geo_score?: { score?: number } }) : {};
  return details.geo_score?.score ?? row.visibility_score ?? 0;
}
