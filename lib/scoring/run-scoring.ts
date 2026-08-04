import { isBrandDomain, normalizeDomain } from "@/lib/domains/brand-domain";
import { EXTRACTION_VERSION } from "@/lib/scan/constants";
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

function isGroundedRow(row: ScoreInputRow): boolean {
  return !row.provider || GROUNDED_PROVIDERS.has(row.provider);
}

/**
 * True when a row produced usable evidence — a successful extraction with no
 * recorded error.
 *
 * This is the gate that keeps a technical failure from reading as a finding
 * about the brand. A row whose extraction failed has `brand_mentioned = false`
 * and `citation_found = false` because nothing was ever read from it, not
 * because the AI declined to name the brand. Counting it scores an outage as
 * an absence (geo-score-v4, docs/adr/0027).
 *
 * Both signals are required, not either: a row can carry an `extraction_error`
 * alongside a partial `extracted_json`, and half-read evidence is not evidence.
 */
function isScorableRow(row: ScoreInputRow): boolean {
  return Boolean(row.extracted_json && typeof row.extracted_json === "object") && !row.extraction_error;
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

export function computeRunScoresFromResults(results: ScoreInputRow[], projectDomain: string): RunScoreOutput {
  const totalResults = results.length;
  const projectDomainNormalized = projectDomain ? normalizeDomain(projectDomain) : "";
  const safeTotal = Math.max(totalResults, 1);
  const untrustedCompetitorSet = hasUntrustedCompetitorSet(results);

  const extractedResultsCount = results.filter((row) => row.extracted_json && typeof row.extracted_json === "object").length;
  const extractionErrorCount = results.filter((row) => row.extraction_error).length;
  const extractionCoverage = extractedResultsCount / safeTotal;

  /* ---- scorable rows (geo-score-v4, docs/adr/0027) ----------------------
   * A row whose extraction failed carries NO evidence about the brand — not
   * that it was absent, not that it was present. Leaving it in a denominator
   * silently converts a technical failure into a negative finding: the row
   * has `brand_mentioned = false` and `citation_found = false` because
   * nothing was ever read, and both then count against the score.
   *
   * Founder, 2026-08-03: *"no tiene sentido que un fallo técnico penalice la
   * nota de posicionamiento"*, and asked for every calculation feeding the
   * GEO Score to be swept for the same defect.
   *
   * `prominence` already worked this way — `computeBrandPosition` skips rows
   * without valid extraction — so this makes the other components consistent
   * with the one that was already right, rather than inventing a rule.
   *
   * The failures stay visible: `total_results` still counts them and
   * `unscorable_results_count` names them, so a run that lost half its
   * sample reads as a smaller sample, never as a worse brand.
   */
  const scoredResults = results.filter(isScorableRow);
  const scoredTotal = scoredResults.length;
  const safeScoredTotal = Math.max(scoredTotal, 1);
  const unscorableResultsCount = totalResults - scoredTotal;

  const brandMentionedCount = scoredResults.filter((row) => row.brand_mentioned).length;
  const totalCitationsCount = scoredResults.reduce((acc, row) => acc + Math.max(0, row.citations_count ?? 0), 0);
  const totalCompetitorMentions = scoredResults.reduce(
    (acc, row) => acc + Math.max(0, row.mentioned_competitors_count ?? 0),
    0
  );

  // Null, not 0, when nothing could be read: a run that produced no usable
  // evidence has no mention rate, and publishing 0% would be the same
  // fabrication ADR 0024 removed from the delta.
  const visibilityScoreValue: number | null =
    scoredTotal > 0 ? round2((brandMentionedCount / scoredTotal) * 100) : null;
  // The persisted column is non-null; the composite uses the nullable value
  // above so an unreadable run drops presence instead of scoring it zero.
  const visibilityScore = visibilityScoreValue ?? 0;

  // --- Own-domain citation_score (docs/adr/0013) ---
  // citation_score (and the authority component of geo_score) requires a
  // grounding citation whose domain actually matches the project's own
  // domain — "any source cited, regardless of whose" inflates the metric to
  // 100% as soon as the AI cites anything at all, even a competitor or an
  // unrelated third party (see docs/adr/0013 for the real Ikea case that
  // surfaced this). Domain-matching mirrors own_citation_share (docs/adr/0010).
  // Only rows from grounded providers (docs/adr/0012) are eligible, since an
  // ungrounded provider can never have a real grounding citation.
  // Scorable AND grounded: an unreadable row from a grounded provider still
  // proves nothing about whether the AI cited the brand's own domain.
  const groundedResults = scoredResults.filter(isGroundedRow);
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
  // null, not 0, for the same reason citation_score is dropped: with no
  // grounded scorable rows there is nothing to compute a rate over, and the
  // citations page renders this figure directly. Nulled here rather than
  // patched per-reader (geo-score-v4, docs/adr/0027).
  const citationScoreAnyDomain: number | null =
    groundedTotal > 0 ? round2((citationFoundCount / groundedTotal) * 100) : null;

  const citationFoundCountBlended = scoredResults.filter((row) => row.citation_found).length;
  const citationScoreBlended = round2((citationFoundCountBlended / safeScoredTotal) * 100);

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
  // Same denominator rule, in the other direction: an unreadable row is not a
  // prompt where the brand held its ground either. Left in, it would quietly
  // UNDERSTATE competitive pressure.
  const displacedPromptsCount = scoredResults.filter(
    (row) => !row.brand_mentioned && Math.max(0, row.mentioned_competitors_count ?? 0) > 0
  ).length;
  // Nullable for the same reason visibility_score is: with nothing readable,
  // `safeScoredTotal` clamps to 1 and this persists a 0 — which the Overview
  // then renders as "Presión competitiva: 0% · Baja", a green, reassuring claim
  // about a scan that read nothing. QA caught this one round after the same
  // defect was fixed for presence; it is not part of geoScoreComponents, so
  // none of the composite's dropping machinery covered it.
  const competitorGapScoreValue: number | null =
    scoredTotal > 0 ? round2(clamp(0, 100, (displacedPromptsCount / scoredTotal) * 100)) : null;
  const competitorGapScore = competitorGapScoreValue ?? 0;

  // "high" requires >=20 fully-extracted results (was >=5): with one LLM
  // sample per prompt/engine, 5 results give each answer a 20-point swing on
  // presence — calling that sample "high confidence" overstated its
  // statistical reliability (docs/geo-methodology-audit-2026-07.md, finding
  // 5 / ADR 0015).
  //
  // "medium" now requires >=MIN_RESPONSES_FOR_BAND (10) rather than >=2
  // (GEO-SCORE-RELIABILITY-1). Two clean results were never a "medium
  // confidence" sample in any statistical sense: below 10 responses a single
  // AI answer moves the mention rate by >=10 points, and ~0.71x of that
  // reaches the composite. This also gates `computeRecommendationPotential
  // Points` below, which already refuses to publish a point estimate over a
  // "low" confidence run — so tiny runs stop showing "hasta +X pt" ceilings
  // they cannot support, which is the intended consequence, not a side
  // effect.
  let confidence: "low" | "medium" | "high" = "low";
  if (extractedResultsCount < totalResults || extractionErrorCount > 0) {
    confidence = "low";
  } else if (totalResults >= 20 && extractionCoverage >= 0.8) {
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

  // --- GEO Score composite (ADR 0008, revised by ADR 0015) ---
  const COMPOSITE_VERSION = "geo-score-v4";

  // Dropped (not zeroed) when no row could be read — the remaining weights
  // renormalize through the same mechanism prominence/standing/authority use.
  const presenceScore: number | null = visibilityScoreValue; // 0..100, higher better
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
  // Comparison-only figure (ADR 0015), read by nothing; the ?? 0 above is
  // harmless here because standing itself is dropped on an unreadable run.
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

  const geoScoreComponents = [
    { key: "presence", value: presenceScore, weight: 0.4 },
    { key: "prominence", value: prominenceScore, weight: 0.25 },
    { key: "standing", value: standingScore, weight: 0.2 },
    { key: "authority", value: authorityScore, weight: 0.15 }
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
    const compositeConfidence =
      (droppedProminence || droppedAuthority || droppedStanding) && confidence === "high" ? "medium" : confidence;

    geoScore = {
      score: round2(score),
      composite_version: COMPOSITE_VERSION,
      confidence: compositeConfidence,
      inputs_used: availableGeoScoreComponents.map((c) => c.key),
      // v1 standing (100 - competitor_gap_score), retained for comparison
      // only across the v1 -> v2 transition (ADR 0015) — not part of the score.
      standing_v1: round2(standingV1),
      components: {
        presence: { value: presenceScore, weight: round2(0.4 / geoScoreWeightSum) },
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
            : { value: round2(prominenceScore), weight: round2(0.25 / geoScoreWeightSum) },
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
            : { value: round2(standingScore), weight: round2(0.2 / geoScoreWeightSum) },
        authority:
          authorityScore === null
            ? {
                value: null,
                weight: 0,
                reason:
                  "no grounded (citation-capable) provider rows in this run, or no project domain to match citations against (docs/adr/0012, docs/adr/0013)"
              }
            : { value: authorityScore, weight: round2(0.15 / geoScoreWeightSum) }
      },
      formula:
        "geo_score = Σ(component_value * normalized_weight); base weights presence .40 / prominence .25 / standing .20 / authority .15; " +
        "standing = share of voice = brand_mentioned_count / (brand_mentioned_count + total_competitor_mentions) * 100 " +
        "(v1 formula 100 - competitor_gap_score kept as standing_v1 for comparison, ADR 0015); " +
        "prominence = (1 - (brand_avg_position_when_mentioned-1)/total_entities)*100, dropped unless the brand was mentioned in at least MIN_RESPONSES_FOR_BAND prompts (geo-score-v3); " +
        "absent components dropped and remaining weights renormalized."
    };
  }

  const assumptions = [
    "visibility_score = % of SCORABLE prompts with brand_mentioned. A prompt whose extraction failed carries no evidence either way, so it is excluded from every denominator rather than counted as a non-mention — a technical failure must not read as an absence of the brand (geo-score-v4, docs/adr/0027). prominence already worked this way; v4 makes presence, authority and competitive pressure consistent with it.",
    "citation_score = % of GROUNDED-provider prompts citing the brand's OWN domain (docs/adr/0013), not just any source. Ungrounded providers (e.g. Claude, no web search grounding) are excluded, same as docs/adr/0012, but still count toward visibility_score/standing. citation_score_any_domain (any grounding citation, regardless of domain — the pre-0013 formula) and citation_score_blended (all providers pooled, any domain) are kept in details_json for comparison only.",
    "competitor_gap_score (Competitive Pressure, docs/adr/0011) higher = worse: % of prompts where a competitor was mentioned but the brand was not (brand displacement), not raw competitor mention volume",
    extractionCoverage < 1
      ? "Some prompts have partial extraction coverage. Confidence forced to low."
      : "Extraction coverage is complete.",
    "brand_position (geo-score-v3): position = 1-based rank of an entity's first mention per prompt (dense ranking, brand and competitors share one ranking). avg_position_when_mentioned = mean rank over ONLY the prompts where that entity was mentioned; lower is better and 1.0 means always listed first. Never-mentioned entities have null and sort last. mention_rate carries the other half of the story — how often the entity appeared at all. The pre-v3 figure, which averaged an N+1 penalty for every non-mention into the same number and therefore re-encoded the mention rate as if it were a rank, is retained per entity as avg_position_penalized for comparison only.",
    "geo_score (geo-score-v4, ADR 0027): composite of presence (visibility_score), prominence (rank WHEN MENTIONED, derived from brand_position), standing (share of voice: brand mentions / brand + tracked competitor mentions) and authority (citation_score), weighted .40/.25/.20/.15. Any unavailable component (presence when no row could be read, prominence without position data, standing with a zero share-of-voice denominator, authority without grounded scorable rows) is dropped and the remaining weights renormalized; composite confidence is capped at medium in that case. The v1 standing (100 - competitor_gap_score) is kept as standing_v1 for comparison only.",
    `confidence: high requires >=20 fully-extracted results (one LLM sample per prompt/engine is noisy at small sizes); ${MIN_RESPONSES_FOR_BAND}-19 clean results are medium; below ${MIN_RESPONSES_FOR_BAND} responses a single AI answer moves the mention rate by >=${Math.round(100 / MIN_RESPONSES_FOR_BAND)} points, so the run is low confidence regardless of extraction quality (ADR 0015 + GEO-SCORE-RELIABILITY-1).`
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
      // The sample every score below is actually computed over. When it is
      // smaller than total_results the run lost rows to extraction failures;
      // that is a smaller sample, never a worse brand (geo-score-v4).
      scored_results_count: scoredTotal,
      unscorable_results_count: unscorableResultsCount,
      extracted_results_count: extractedResultsCount,
      extraction_error_count: extractionErrorCount,
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
        visibility_score:
          "brand_mentioned_count / scored_results_count * 100 (geo-score-v4, docs/adr/0027) — rows whose extraction failed are excluded from the denominator rather than counted as non-mentions; null (presence dropped from the composite) when no row could be read at all",
        citation_score:
          "own_domain_citation_count / grounded_results_count * 100, computed only over SCORABLE rows from grounded providers (an unreadable row proves nothing about citation either, geo-score-v4) (docs/adr/0012) with a grounding citation whose domain matches the project's own domain (docs/adr/0013); 0 with citation_score_data_available=false when no grounded rows exist in this run or no project domain was provided. citation_score_any_domain (grounded rows, any citation regardless of domain — the pre-0013 formula) and citation_score_blended (all providers pooled, any domain) are retained in details_json for comparison only.",
        competitor_gap_score:
          "clamp(0,100, (displaced_prompts_count / scored_results_count) * 100 ); displaced_prompts_count = prompts where mentioned_competitors_count > 0 AND brand_mentioned is false (docs/adr/0011). Unreadable rows are excluded here too — left in they would UNDERSTATE pressure, the same defect in the other direction (geo-score-v4)",
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
  pursue_citation_sources: "authority"
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
}): number | null {
  const details =
    row.details_json && typeof row.details_json === "object"
      ? (row.details_json as { geo_score?: { score?: number }; scored_results_count?: unknown })
      : {};

  if (typeof details.geo_score?.score === "number") return details.geo_score.score;

  /* No composite. Two very different reasons, and they must not share a
   * fallback:
   *
   *  - Scored before geo-score-v1 existed (ADR 0008, no backfill). The legacy
   *    visibility_score IS that run's real number — the case this fallback was
   *    written for.
   *  - Every row was unscorable, so no component could be computed at all
   *    (geo-score-v4, docs/adr/0027). The persisted visibility_score is 0 there
   *    only because the column is non-null, NOT because the brand scored zero.
   *    Returning it renders a fabricated 0 for a run that read nothing — the
   *    exact fabrication this ADR exists to remove, arriving through the back
   *    door. Caught by QA on PR #313 before it shipped.
   *
   * `scored_results_count` only exists from v4 onward, so its presence is also
   * what distinguishes the two.
   */
  if (typeof details.scored_results_count === "number" && details.scored_results_count === 0) return null;

  return row.visibility_score ?? null;
}
