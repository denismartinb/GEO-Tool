type ProjectInput = {
  brand: string;
  domain: string;
  country: string;
  language: string;
};

type RunScoreInput = {
  visibility_score: number;
  citation_score: number;
  competitor_gap_score: number;
  confidence: "low" | "medium" | "high";
  details_json: Record<string, unknown>;
};

type PromptResultInput = {
  id: string;
  prompt_text_snapshot: string;
  brand_mentioned: boolean;
  citation_found: boolean;
  mentioned_competitors_count: number;
  citations_count: number;
  sentiment: "positive" | "neutral" | "negative" | "mixed" | "unknown";
  extracted_json: unknown;
};

type RecommendationRow = {
  priority_rank: number;
  title: string;
  description: string;
  rule_id: string;
  recommendation_type: string;
  impact: "low" | "medium" | "high";
  effort: "low" | "medium" | "high";
  confidence: "low" | "medium" | "high";
  source_type: "rule";
  evidence_json: Record<string, unknown>;
};

type GenerateInput = {
  project: ProjectInput;
  competitors: string[];
  runScore: RunScoreInput;
  promptResults: PromptResultInput[];
};

type CandidateRec = Omit<RecommendationRow, "priority_rank"> & {
  severityScore: number;
  affectedCount: number;
};

const comparativeKeywords = [
  "best", "top", "vs", "compare", "comparison", "alternative", "alternatives",
  "herramientas", "mejores", "comparar", "alternativas"
];
const informationalKeywords = ["how", "what", "why", "when", "where", "cómo", "qué", "por qué", "cuándo", "dónde"];

function getExtracted(result: PromptResultInput) {
  if (!result.extracted_json || typeof result.extracted_json !== "object") return null;
  return result.extracted_json as {
    brand?: { evidence?: string[] };
    competitors?: Array<{ name?: string; mentioned?: boolean; evidence?: string[] }>;
    citations?: Array<{ domain?: string | null }>;
  };
}

function confWeight(conf: "low" | "medium" | "high") {
  return conf === "high" ? 3 : conf === "medium" ? 2 : 1;
}

function buildEvidenceBase(input: GenerateInput) {
  const citationDomains = new Set<string>();
  const mentionedCompetitors = new Set<string>();
  const snippets: string[] = [];

  for (const result of input.promptResults) {
    const extracted = getExtracted(result);
    if (extracted?.brand?.evidence?.length) snippets.push(...extracted.brand.evidence.slice(0, 2));
    if (extracted?.citations?.length) {
      for (const c of extracted.citations) if (c.domain) citationDomains.add(c.domain);
    }
    if (extracted?.competitors?.length) {
      for (const c of extracted.competitors) if (c.mentioned && c.name) mentionedCompetitors.add(c.name);
    }
  }

  return {
    citationDomains: Array.from(citationDomains).slice(0, 8),
    mentionedCompetitors: Array.from(mentionedCompetitors).slice(0, 8),
    snippets: snippets.slice(0, 8)
  };
}

export function generateRecommendationsForRun(input: GenerateInput): RecommendationRow[] {
  const { runScore, promptResults } = input;
  if (!promptResults.length) return [];

  const base = buildEvidenceBase(input);
  const totalResults = promptResults.length;
  const brandMissing = promptResults.filter((p) => !p.brand_mentioned);
  const noCitation = promptResults.filter((p) => !p.citation_found);
  const competitorPressure = promptResults.filter((p) => p.mentioned_competitors_count > 0);
  const competitorNoBrand = promptResults.filter((p) => p.mentioned_competitors_count > 0 && !p.brand_mentioned);
  const comparativePrompts = competitorNoBrand.filter((p) =>
    comparativeKeywords.some((k) => p.prompt_text_snapshot.toLowerCase().includes(k))
  );
  const informationalPrompts = promptResults.filter((p) =>
    informationalKeywords.some((k) => p.prompt_text_snapshot.toLowerCase().includes(k))
  );

  const scoreDetails = runScore.details_json ?? {};
  const totalCompetitorMentions = Number(scoreDetails.total_competitor_mentions ?? 0);
  const candidates: CandidateRec[] = [];

  if (runScore.visibility_score < 60) {
    const impact: "high" | "medium" = runScore.visibility_score < 30 ? "high" : "medium";
    candidates.push({
      title: "Improve brand visibility across high-intent prompts",
      description: "Your brand is missing in a significant share of AI answers. Strengthen explicit brand/context coverage on core pages.",
      rule_id: "rule_visibility_001",
      recommendation_type: "increase_brand_visibility",
      impact,
      effort: "medium",
      confidence: runScore.confidence,
      source_type: "rule",
      affectedCount: brandMissing.length,
      severityScore: (100 - runScore.visibility_score) + confWeight(runScore.confidence) * 5,
      evidence_json: {
        rule_id: "rule_visibility_001",
        scoring_version: scoreDetails.scoring_version ?? "unknown",
        visibility_score: runScore.visibility_score,
        citation_score: runScore.citation_score,
        competitor_gap_score: runScore.competitor_gap_score,
        run_confidence: runScore.confidence,
        affected_prompt_ids: brandMissing.map((p) => p.id),
        affected_prompts: brandMissing.map((p) => p.prompt_text_snapshot).slice(0, 8),
        mentioned_competitors: base.mentionedCompetitors,
        citation_domains: base.citationDomains,
        evidence_snippets: base.snippets,
        assumptions: ["Brand visibility should be present on most target prompts."],
        why_this_matters: "Low brand presence reduces discoverability in AI-generated answers."
      }
    });
  }

  if (runScore.citation_score < 50) {
    const impact: "high" | "medium" = runScore.citation_score < 20 ? "high" : "medium";
    candidates.push({
      title: "Make your content more citation-ready",
      description: "AI answers rarely cite your brand/domain context. Add verifiable facts, structured references and clearer sourceable sections.",
      rule_id: "rule_citations_001",
      recommendation_type: "improve_citation_readiness",
      impact,
      effort: "medium",
      confidence: runScore.confidence,
      source_type: "rule",
      affectedCount: noCitation.length,
      severityScore: (100 - runScore.citation_score) + confWeight(runScore.confidence) * 4,
      evidence_json: {
        rule_id: "rule_citations_001",
        scoring_version: scoreDetails.scoring_version ?? "unknown",
        visibility_score: runScore.visibility_score,
        citation_score: runScore.citation_score,
        competitor_gap_score: runScore.competitor_gap_score,
        run_confidence: runScore.confidence,
        affected_prompt_ids: noCitation.map((p) => p.id),
        affected_prompts: noCitation.map((p) => p.prompt_text_snapshot).slice(0, 8),
        mentioned_competitors: base.mentionedCompetitors,
        citation_domains: base.citationDomains,
        evidence_snippets: base.snippets,
        assumptions: ["Citation presence indicates source-readiness for AI engines."],
        why_this_matters: "Low citation presence limits authority and reference frequency."
      }
    });
  }

  if (runScore.competitor_gap_score >= 50 && totalCompetitorMentions > 0) {
    const impact: "high" | "medium" = runScore.competitor_gap_score >= 70 ? "high" : "medium";
    const effort: "high" | "medium" = competitorNoBrand.length >= 3 ? "high" : "medium";
    candidates.push({
      title: "Close the gap against competitors mentioned by AI engines",
      description: "Competitors appear in AI answers while your brand is absent in key prompts. Strengthen differentiators and comparison positioning.",
      rule_id: "rule_competitor_gap_001",
      recommendation_type: "close_competitor_gap",
      impact,
      effort,
      confidence: runScore.confidence,
      source_type: "rule",
      affectedCount: competitorNoBrand.length,
      severityScore: runScore.competitor_gap_score + confWeight(runScore.confidence) * 3,
      evidence_json: {
        rule_id: "rule_competitor_gap_001",
        scoring_version: scoreDetails.scoring_version ?? "unknown",
        visibility_score: runScore.visibility_score,
        citation_score: runScore.citation_score,
        competitor_gap_score: runScore.competitor_gap_score,
        run_confidence: runScore.confidence,
        affected_prompt_ids: competitorNoBrand.map((p) => p.id),
        affected_prompts: competitorNoBrand.map((p) => p.prompt_text_snapshot).slice(0, 8),
        mentioned_competitors: base.mentionedCompetitors,
        citation_domains: base.citationDomains,
        evidence_snippets: base.snippets,
        assumptions: ["Higher competitor mentions with absent brand indicates competitive visibility risk."],
        why_this_matters: "Competitor-dominant AI answers can shift buyer consideration away from your brand."
      }
    });
  }

  if (comparativePrompts.length >= 2) {
    candidates.push({
      title: "Add comparison content for competitive prompts",
      description: "Several comparative/commercial prompts mention competitors while your brand is missing. Publish targeted comparison pages.",
      rule_id: "rule_comparison_content_001",
      recommendation_type: "add_comparison_content",
      impact: comparativePrompts.length >= 3 ? "high" : "medium",
      effort: "medium",
      confidence: runScore.confidence,
      source_type: "rule",
      affectedCount: comparativePrompts.length,
      severityScore: comparativePrompts.length * 18 + confWeight(runScore.confidence) * 3,
      evidence_json: {
        rule_id: "rule_comparison_content_001",
        scoring_version: scoreDetails.scoring_version ?? "unknown",
        visibility_score: runScore.visibility_score,
        citation_score: runScore.citation_score,
        competitor_gap_score: runScore.competitor_gap_score,
        run_confidence: runScore.confidence,
        affected_prompt_ids: comparativePrompts.map((p) => p.id),
        affected_prompts: comparativePrompts.map((p) => p.prompt_text_snapshot).slice(0, 8),
        mentioned_competitors: base.mentionedCompetitors,
        citation_domains: base.citationDomains,
        evidence_snippets: base.snippets,
        assumptions: ["Comparative prompt intent often rewards explicit competitor-vs-brand coverage."],
        why_this_matters: "Comparison-focused pages help recover visibility on decision-stage prompts."
      }
    });
  }

  if (runScore.visibility_score < 60 && runScore.citation_score < 50 && informationalPrompts.length > 0) {
    candidates.push({
      title: "Create FAQ and answer-ready informational content",
      description: "Informational prompts are underperforming in visibility and citations. Add concise FAQ/answer blocks aligned to those questions.",
      rule_id: "rule_faq_001",
      recommendation_type: "create_faq_section",
      impact: "medium",
      effort: informationalPrompts.length >= 4 ? "medium" : "low",
      confidence: runScore.confidence,
      source_type: "rule",
      affectedCount: informationalPrompts.length,
      severityScore: informationalPrompts.length * 12 + (100 - runScore.visibility_score) * 0.2,
      evidence_json: {
        rule_id: "rule_faq_001",
        scoring_version: scoreDetails.scoring_version ?? "unknown",
        visibility_score: runScore.visibility_score,
        citation_score: runScore.citation_score,
        competitor_gap_score: runScore.competitor_gap_score,
        run_confidence: runScore.confidence,
        affected_prompt_ids: informationalPrompts.map((p) => p.id),
        affected_prompts: informationalPrompts.map((p) => p.prompt_text_snapshot).slice(0, 8),
        mentioned_competitors: base.mentionedCompetitors,
        citation_domains: base.citationDomains,
        evidence_snippets: base.snippets,
        assumptions: ["Question-like prompts benefit from concise answer-ready structures."],
        why_this_matters: "Answer-ready content increases AI pickup for informational demand."
      }
    });
  }

  if (candidates.length < 3 && runScore.visibility_score < 50 && totalCompetitorMentions === 0) {
    candidates.push({
      title: "Strengthen brand entity clarity and category signals",
      description: "Brand mentions are low while competitor signals are also weak. Clarify brand-category associations and core entity descriptors.",
      rule_id: "rule_entity_clarity_001",
      recommendation_type: "strengthen_brand_entity_clarity",
      impact: "medium",
      effort: "low",
      confidence: "low",
      source_type: "rule",
      affectedCount: brandMissing.length,
      severityScore: 35,
      evidence_json: {
        rule_id: "rule_entity_clarity_001",
        scoring_version: scoreDetails.scoring_version ?? "unknown",
        visibility_score: runScore.visibility_score,
        citation_score: runScore.citation_score,
        competitor_gap_score: runScore.competitor_gap_score,
        run_confidence: runScore.confidence,
        affected_prompt_ids: brandMissing.map((p) => p.id),
        affected_prompts: brandMissing.map((p) => p.prompt_text_snapshot).slice(0, 8),
        mentioned_competitors: base.mentionedCompetitors,
        citation_domains: base.citationDomains,
        evidence_snippets: base.snippets,
        assumptions: ["Low brand + low competitor signals can indicate weak entity/category grounding."],
        why_this_matters: "Entity clarity helps models map your brand to relevant topical intents."
      }
    });
  }

  const byType = new Map<string, CandidateRec>();
  for (const rec of candidates) {
    const existing = byType.get(rec.recommendation_type);
    if (!existing || rec.severityScore > existing.severityScore) byType.set(rec.recommendation_type, rec);
  }

  const impactWeight = (impact: "low" | "medium" | "high") => (impact === "high" ? 3 : impact === "medium" ? 2 : 1);
  const deduped = Array.from(byType.values())
    .sort((a, b) => {
      const aScore = a.severityScore + impactWeight(a.impact) * 10 + confWeight(a.confidence) * 5 + a.affectedCount;
      const bScore = b.severityScore + impactWeight(b.impact) * 10 + confWeight(b.confidence) * 5 + b.affectedCount;
      return bScore - aScore;
    })
    .slice(0, 5);

  return deduped.map((rec, index) => ({
    priority_rank: index + 1,
    title: rec.title,
    description: rec.description,
    rule_id: rec.rule_id,
    recommendation_type: rec.recommendation_type,
    impact: rec.impact,
    effort: rec.effort,
    confidence: rec.confidence,
    source_type: "rule",
    evidence_json: rec.evidence_json
  }));
}
