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
      title: "Mejora la visibilidad de tu marca en los prompts de alta intención",
      description: "Tu marca no aparece en una parte significativa de las respuestas de IA. Refuerza la presencia explícita de marca y contexto en tus páginas principales.",
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
        assumptions: ["La marca debería estar presente en la mayoría de los prompts objetivo."],
        why_this_matters: "Una presencia de marca baja reduce su descubribilidad en las respuestas generadas por IA."
      }
    });
  }

  if (runScore.citation_score < 50) {
    const impact: "high" | "medium" = runScore.citation_score < 20 ? "high" : "medium";
    candidates.push({
      title: "Haz que tu contenido sea más citable",
      description: "Las respuestas de IA rara vez citan tu marca o tu dominio. Añade datos verificables, referencias estructuradas y secciones más fáciles de citar como fuente.",
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
        assumptions: ["La presencia de citas indica que el contenido es apto como fuente para los motores de IA."],
        why_this_matters: "Una presencia de citas baja limita tu autoridad y la frecuencia con la que se te referencia."
      }
    });
  }

  if (runScore.competitor_gap_score >= 50 && totalCompetitorMentions > 0) {
    const impact: "high" | "medium" = runScore.competitor_gap_score >= 70 ? "high" : "medium";
    const effort: "high" | "medium" = competitorNoBrand.length >= 3 ? "high" : "medium";
    candidates.push({
      title: "Reduce la brecha frente a los competidores que mencionan los motores de IA",
      description: "Los competidores aparecen en las respuestas de IA mientras que tu marca está ausente en prompts clave. Refuerza tus diferenciadores y tu posicionamiento comparativo.",
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
        assumptions: ["Un mayor número de menciones de competidores con la marca ausente indica un riesgo de visibilidad competitiva."],
        why_this_matters: "Las respuestas de IA dominadas por la competencia pueden desviar la decisión de compra fuera de tu marca."
      }
    });
  }

  if (comparativePrompts.length >= 2) {
    candidates.push({
      title: "Añade contenido comparativo para los prompts competitivos",
      description: "Varios prompts comparativos o comerciales mencionan a competidores mientras que tu marca no aparece. Publica páginas de comparativa específicas.",
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
        assumptions: ["Los prompts con intención comparativa suelen premiar el contenido explícito de comparación entre competidores y tu marca."],
        why_this_matters: "Las páginas centradas en comparativas ayudan a recuperar visibilidad en los prompts de la fase de decisión."
      }
    });
  }

  if (runScore.visibility_score < 60 && runScore.citation_score < 50 && informationalPrompts.length > 0) {
    candidates.push({
      title: "Crea contenido informativo y FAQ listo para responder",
      description: "Los prompts informativos rinden por debajo de lo esperado en visibilidad y citas. Añade bloques de FAQ o de respuesta concisos y alineados con esas preguntas.",
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
        assumptions: ["Los prompts en forma de pregunta se benefician de estructuras concisas y fáciles de responder."],
        why_this_matters: "El contenido listo para responder aumenta su captación por la IA ante la demanda informativa."
      }
    });
  }

  if (candidates.length < 3 && runScore.visibility_score < 50 && totalCompetitorMentions === 0) {
    candidates.push({
      title: "Refuerza la claridad de tu marca como entidad y sus señales de categoría",
      description: "Las menciones de marca son bajas y las señales de los competidores también son débiles. Aclara las asociaciones entre tu marca y su categoría, y los descriptores principales de la entidad.",
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
        assumptions: ["Señales bajas tanto de marca como de competidores pueden indicar una vinculación débil con la entidad o la categoría."],
        why_this_matters: "La claridad de la entidad ayuda a los modelos a asociar tu marca con las intenciones temáticas relevantes."
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
