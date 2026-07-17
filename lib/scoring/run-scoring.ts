export const SCORING_VERSION = "phase9-geo-score-v2";

type ScoreInputRow = {
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
};

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
 */
const GROUNDED_PROVIDERS = new Set<string>(["gemini", "openai"]);

function isGroundedRow(row: ScoreInputRow): boolean {
  return !row.provider || GROUNDED_PROVIDERS.has(row.provider);
}

function normalizeDomain(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "");
}

function isSameOrSubdomain(domain: string, root: string): boolean {
  if (!domain || !root) return false;
  return domain === root || domain.endsWith(`.${root}`);
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
 * citation (docs/adr/0004) whose domain exactly matches, or is a subdomain
 * of, the project's own domain. Mirrors the own_citation_share domain-match
 * logic (docs/adr/0010) — see docs/adr/0013-own-domain-citation-score.md for
 * why citation_score now requires this instead of "any citation present".
 */
function hasOwnDomainCitation(row: ScoreInputRow, projectDomainNormalized: string): boolean {
  if (!projectDomainNormalized) return false;
  for (const citation of readCitations(row.extracted_json)) {
    if (citation.source !== "grounding") continue;
    const rawDomain = citation.domain?.trim();
    if (!rawDomain) continue;
    if (isSameOrSubdomain(normalizeDomain(rawDomain), projectDomainNormalized)) return true;
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
  avg_position: number;
  mention_count: number;
};

type BrandPositionDetails = {
  prompts_with_position_data: number;
  total_entities: number;
  ranking: BrandPositionRankingEntry[];
  brand_avg_position: number | null;
  confidence: "low" | "high";
};

/**
 * Computes the "Average Brand Position" metric (docs/adr/0005) from the
 * per-prompt extracted_json of a run's completed results.
 *
 * Per prompt: N = 1 (brand) + competitors.length tracked entities. Each
 * mentioned entity's effective position is its 1-based first-mention rank
 * (dense, no gaps, brand and competitors share one ranking); each
 * not-mentioned entity is penalized with position N+1.
 *
 * avg_position(entity) = mean(effective_position) across prompts with valid
 * extraction data. Returns null if no prompt has valid position data.
 */
function computeBrandPosition(results: ScoreInputRow[], totalResults: number): BrandPositionDetails | null {
  // entity name -> { sumPositions, mentionCount, promptCount, isBrand }
  const accumulators = new Map<string, { sum: number; mentionCount: number; promptCount: number; isBrand: boolean }>();
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
      const effectivePosition = entity.mentioned && entity.position !== null ? entity.position : penalizedPosition;

      const existing = accumulators.get(name) ?? { sum: 0, mentionCount: 0, promptCount: 0, isBrand };
      existing.sum += effectivePosition;
      existing.promptCount += 1;
      if (entity.mentioned) existing.mentionCount += 1;
      accumulators.set(name, existing);
    }
  }

  if (promptsWithPositionData === 0) return null;

  const ranking: BrandPositionRankingEntry[] = Array.from(accumulators.entries())
    .map(([name, { sum, mentionCount, promptCount, isBrand }]) => ({
      name,
      is_brand: isBrand,
      avg_position: round2(sum / promptCount),
      mention_count: mentionCount
    }))
    .sort((a, b) => a.avg_position - b.avg_position);

  const brandEntry = ranking.find((entry) => entry.is_brand);

  return {
    prompts_with_position_data: promptsWithPositionData,
    total_entities: maxTotalEntities,
    ranking,
    brand_avg_position: brandEntry?.avg_position ?? null,
    confidence: promptsWithPositionData < totalResults ? "low" : "high"
  };
}

export function computeRunScoresFromResults(results: ScoreInputRow[], projectDomain: string): RunScoreOutput {
  const totalResults = results.length;
  const projectDomainNormalized = projectDomain ? normalizeDomain(projectDomain) : "";
  const safeTotal = Math.max(totalResults, 1);

  const extractedResultsCount = results.filter((row) => row.extracted_json && typeof row.extracted_json === "object").length;
  const extractionErrorCount = results.filter((row) => row.extraction_error).length;
  const extractionCoverage = extractedResultsCount / safeTotal;

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

  // "high" requires >=20 fully-extracted results (was >=5): with one LLM
  // sample per prompt/engine, 5 results give each answer a 20-point swing on
  // presence — calling that sample "high confidence" overstated its
  // statistical reliability (docs/geo-methodology-audit-2026-07.md, finding
  // 5 / ADR 0015). 2..19 clean results are "medium".
  let confidence: "low" | "medium" | "high" = "low";
  if (extractedResultsCount < totalResults || extractionErrorCount > 0) {
    confidence = "low";
  } else if (totalResults >= 20 && extractionCoverage >= 0.8) {
    confidence = "high";
  } else if (totalResults >= 2) {
    confidence = "medium";
  }

  const sentimentDistribution = results.reduce<Record<string, number>>((acc, row) => {
    acc[row.sentiment] = (acc[row.sentiment] ?? 0) + 1;
    return acc;
  }, {});

  const brandPosition = computeBrandPosition(results, totalResults);

  // --- GEO Score composite (ADR 0008, revised by ADR 0015) ---
  const COMPOSITE_VERSION = "geo-score-v2";

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
  const standingScore: number | null =
    sovDenominator > 0 ? round2((brandMentionedCount / sovDenominator) * 100) : null;

  let prominenceScore: number | null = null;
  if (brandPosition && brandPosition.brand_avg_position !== null && brandPosition.total_entities > 0) {
    const p = brandPosition.brand_avg_position; // 1..N+1, lower better
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
            ? { value: null, weight: 0, reason: "brand_position absent (pre-grounded-position-v1 run)" }
            : { value: round2(prominenceScore), weight: round2(0.25 / geoScoreWeightSum) },
        standing:
          standingScore === null
            ? {
                value: null,
                weight: 0,
                reason: "no brand or tracked-competitor mentions in this run (share-of-voice denominator is 0, ADR 0015)"
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
        "prominence = (1 - (brand_avg_position-1)/total_entities)*100; " +
        "absent components dropped and remaining weights renormalized."
    };
  }

  const assumptions = [
    "visibility_score = % prompts with brand_mentioned",
    "citation_score = % of GROUNDED-provider prompts citing the brand's OWN domain (docs/adr/0013), not just any source. Ungrounded providers (e.g. Claude, no web search grounding) are excluded, same as docs/adr/0012, but still count toward visibility_score/standing. citation_score_any_domain (any grounding citation, regardless of domain — the pre-0013 formula) and citation_score_blended (all providers pooled, any domain) are kept in details_json for comparison only.",
    "competitor_gap_score (Competitive Pressure, docs/adr/0011) higher = worse: % of prompts where a competitor was mentioned but the brand was not (brand displacement), not raw competitor mention volume",
    extractionCoverage < 1
      ? "Some prompts have partial extraction coverage. Confidence forced to low."
      : "Extraction coverage is complete.",
    "brand_position: position = 1-based rank of an entity's first mention per prompt (dense ranking, brand and competitors share one ranking). Not-mentioned entities are penalized with position N+1 (N = total tracked entities for that prompt). avg_position = mean(effective_position) across prompts with valid extraction; lower is better.",
    "geo_score (geo-score-v2, ADR 0015): composite of presence (visibility_score), prominence (derived from brand_position), standing (share of voice: brand mentions / brand + tracked competitor mentions) and authority (citation_score), weighted .40/.25/.20/.15. Any unavailable component (prominence without position data, standing with a zero share-of-voice denominator, authority without grounded rows) is dropped and the remaining weights renormalized; composite confidence is capped at medium in that case. The v1 standing (100 - competitor_gap_score) is kept as standing_v1 for comparison only.",
    "confidence: high requires >=20 fully-extracted results (one LLM sample per prompt/engine is noisy at small sizes); 2-19 clean results are medium (ADR 0015)."
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
          "avg_position(entity) = mean(position if mentioned else N+1, over prompts with valid extraction); N = total tracked entities for that prompt",
        geo_score:
          "geo_score = Σ(component_value * normalized_weight); base weights presence .40 / prominence .25 / standing .20 / authority .15; " +
          "standing = share of voice = brand_mentioned_count / (brand_mentioned_count + total_competitor_mentions) * 100 " +
          "(v1 formula 100 - competitor_gap_score kept as standing_v1 for comparison, ADR 0015); " +
          "prominence = (1 - (brand_avg_position-1)/total_entities)*100; " +
          "absent components dropped and remaining weights renormalized."
      },
      assumptions,
      per_prompt_summary: perPromptSummary,
      ...(brandPosition ? { brand_position: brandPosition } : {}),
      ...(geoScore ? { geo_score: geoScore } : {})
    }
  };
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
