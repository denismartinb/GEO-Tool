export const SCORING_VERSION = "phase6-extraction-scoring-v1";

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
};

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

export function computeRunScoresFromResults(results: ScoreInputRow[]): RunScoreOutput {
  const totalResults = results.length;
  const safeTotal = Math.max(totalResults, 1);

  const extractedResultsCount = results.filter((row) => row.extracted_json && typeof row.extracted_json === "object").length;
  const extractionErrorCount = results.filter((row) => row.extraction_error).length;
  const extractionCoverage = extractedResultsCount / safeTotal;

  const brandMentionedCount = results.filter((row) => row.brand_mentioned).length;
  const citationFoundCount = results.filter((row) => row.citation_found).length;
  const totalCitationsCount = results.reduce((acc, row) => acc + Math.max(0, row.citations_count ?? 0), 0);
  const totalCompetitorMentions = results.reduce((acc, row) => acc + Math.max(0, row.mentioned_competitors_count ?? 0), 0);

  const visibilityScore = round2((brandMentionedCount / safeTotal) * 100);
  const citationScore = round2((citationFoundCount / safeTotal) * 100);

  // Higher score means larger competitor pressure/risk versus brand visibility.
  const competitorPresencePerPrompt = (totalCompetitorMentions / safeTotal) * 50;
  const brandProtection = visibilityScore * 0.6;
  const competitorGapScore = round2(Math.max(0, Math.min(100, competitorPresencePerPrompt + (100 - brandProtection) * 0.4)));

  let confidence: "low" | "medium" | "high" = "low";
  if (extractedResultsCount < totalResults || extractionErrorCount > 0) {
    confidence = "low";
  } else if (totalResults >= 5 && extractionCoverage >= 0.8) {
    confidence = "high";
  } else if (totalResults >= 2) {
    confidence = "medium";
  }

  const sentimentDistribution = results.reduce<Record<string, number>>((acc, row) => {
    acc[row.sentiment] = (acc[row.sentiment] ?? 0) + 1;
    return acc;
  }, {});

  const brandPosition = computeBrandPosition(results, totalResults);

  const assumptions = [
    "visibility_score = % prompts with brand_mentioned",
    "citation_score = % prompts with citation_found",
    "competitor_gap_score higher = worse competitor pressure/risk",
    extractionCoverage < 1
      ? "Some prompts have partial extraction coverage. Confidence forced to low."
      : "Extraction coverage is complete.",
    "brand_position: position = 1-based rank of an entity's first mention per prompt (dense ranking, brand and competitors share one ranking). Not-mentioned entities are penalized with position N+1 (N = total tracked entities for that prompt). avg_position = mean(effective_position) across prompts with valid extraction; lower is better."
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
      citation_found_count: citationFoundCount,
      total_citations_count: totalCitationsCount,
      total_competitor_mentions: totalCompetitorMentions,
      sentiment_distribution: sentimentDistribution,
      formulas_used: {
        visibility_score: "brand_mentioned_count / total_results * 100",
        citation_score: "citation_found_count / total_results * 100",
        competitor_gap_score:
          "clamp(0,100, (total_competitor_mentions/total_results)*50 + (100 - visibility_score*0.6)*0.4 )",
        brand_position:
          "avg_position(entity) = mean(position if mentioned else N+1, over prompts with valid extraction); N = total tracked entities for that prompt"
      },
      assumptions,
      per_prompt_summary: perPromptSummary,
      ...(brandPosition ? { brand_position: brandPosition } : {})
    }
  };
}
