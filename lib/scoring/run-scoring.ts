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
};

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

  const assumptions = [
    "visibility_score = % prompts with brand_mentioned",
    "citation_score = % prompts with citation_found",
    "competitor_gap_score higher = worse competitor pressure/risk",
    extractionCoverage < 1
      ? "Some prompts have partial extraction coverage. Confidence forced to low."
      : "Extraction coverage is complete."
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
          "clamp(0,100, (total_competitor_mentions/total_results)*50 + (100 - visibility_score*0.6)*0.4 )"
      },
      assumptions,
      per_prompt_summary: perPromptSummary
    }
  };
}
