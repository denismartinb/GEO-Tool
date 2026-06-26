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

export type AffectedPromptDetail = {
  id: string;
  prompt: string;
  competitors: string[];
  domains: string[];
  snippet: string | null;
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
  dedupeKey: string;
};

const comparativeKeywords = [
  "best", "top", "vs", "compare", "comparison", "alternative", "alternatives",
  "herramientas", "mejores", "comparar", "alternativas"
];
const informationalKeywords = ["how", "what", "why", "when", "where", "cómo", "qué", "por qué", "cuándo", "dónde"];

export type RecommendationCategory = "content" | "technical" | "authority";

const categoryByType: Record<string, RecommendationCategory> = {
  improve_citation_readiness: "authority",
  strengthen_brand_entity_clarity: "technical"
};

export function categoryForType(type: string): RecommendationCategory {
  return categoryByType[type] ?? "content";
}

type ExtractedShape = {
  brand?: { evidence?: string[] };
  competitors?: Array<{ name?: string; mentioned?: boolean; evidence?: string[] }>;
  citations?: Array<{ domain?: string | null; source?: string | null }>;
};

function getExtracted(result: PromptResultInput): ExtractedShape | null {
  if (!result.extracted_json || typeof result.extracted_json !== "object") return null;
  return result.extracted_json as ExtractedShape;
}

function confWeight(conf: "low" | "medium" | "high") {
  return conf === "high" ? 3 : conf === "medium" ? 2 : 1;
}

/**
 * Evidence scoped to a single prompt: which competitors were actually
 * mentioned in THIS response and which domains were actually grounded-cited
 * in THIS response (inline-only citations are excluded — see
 * docs/adr/0004-gemini-search-grounding.md anti-fake invariant).
 *
 * brandSnippet and competitorSnippet are kept separate (not pre-merged with a
 * fallback) so callers can choose which one actually supports their rule's
 * claim — a rule about the brand's own absence must not silently substitute a
 * competitor's quote just because the brand has no evidence text.
 */
function promptEvidence(result: PromptResultInput): {
  competitors: string[];
  domains: string[];
  brandSnippet: string | null;
  competitorSnippet: string | null;
} {
  const extracted = getExtracted(result);
  const competitors = (extracted?.competitors ?? [])
    .filter((c) => c.mentioned && c.name)
    .map((c) => c.name as string);
  const domains = Array.from(
    new Set(
      (extracted?.citations ?? [])
        .filter((c) => c.source === "grounding" && c.domain)
        .map((c) => c.domain as string)
    )
  );
  return {
    competitors,
    domains,
    brandSnippet: extracted?.brand?.evidence?.[0] ?? null,
    competitorSnippet: extracted?.competitors?.find((c) => c.evidence?.length)?.evidence?.[0] ?? null
  };
}

function toAffectedPromptDetails(prompts: PromptResultInput[]): AffectedPromptDetail[] {
  return prompts.slice(0, 8).map((p) => {
    const ev = promptEvidence(p);
    return {
      id: p.id,
      prompt: p.prompt_text_snapshot,
      competitors: ev.competitors,
      domains: ev.domains,
      snippet: ev.brandSnippet ?? ev.competitorSnippet
    };
  });
}

/**
 * Aggregates evidence across only the prompts affected by a given rule — each
 * recommendation gets its own evidence, instead of every rule sharing the
 * same run-wide competitor/domain lists.
 *
 * `snippetSource` controls which quotes actually back the claim: "brand"
 * (the default) only ever quotes the brand's own evidence — a rule about the
 * brand's own gap must never be "supported" by a competitor's quote instead.
 * "competitor" is for rules whose entire point IS the competitor's presence
 * (close_competitor_gap, add_comparison_content), where a competitor's quote
 * is the actual evidence.
 */
function aggregateEvidence(prompts: PromptResultInput[], snippetSource: "brand" | "competitor" = "brand") {
  const competitors = new Set<string>();
  const domains = new Set<string>();
  const snippets: string[] = [];
  for (const p of prompts) {
    const ev = promptEvidence(p);
    ev.competitors.forEach((c) => competitors.add(c));
    ev.domains.forEach((d) => domains.add(d));
    const snippet = snippetSource === "competitor" ? ev.brandSnippet ?? ev.competitorSnippet : ev.brandSnippet;
    if (snippet) snippets.push(snippet);
  }
  return {
    mentionedCompetitors: Array.from(competitors).slice(0, 8),
    citationDomains: Array.from(domains).slice(0, 8),
    snippets: snippets.slice(0, 8)
  };
}

function buildEvidenceJson(opts: {
  ruleId: string;
  scoreDetails: Record<string, unknown>;
  runScore: RunScoreInput;
  affected: PromptResultInput[];
  assumptions: string[];
  whyThisMatters: string;
  extra?: Record<string, unknown>;
  snippetSource?: "brand" | "competitor";
}): Record<string, unknown> {
  const agg = aggregateEvidence(opts.affected, opts.snippetSource);
  return {
    rule_id: opts.ruleId,
    scoring_version: opts.scoreDetails.scoring_version ?? "unknown",
    visibility_score: opts.runScore.visibility_score,
    citation_score: opts.runScore.citation_score,
    competitor_gap_score: opts.runScore.competitor_gap_score,
    run_confidence: opts.runScore.confidence,
    affected_prompt_ids: opts.affected.map((p) => p.id),
    affected_prompts: opts.affected.map((p) => p.prompt_text_snapshot).slice(0, 8),
    affected_prompt_details: toAffectedPromptDetails(opts.affected),
    mentioned_competitors: agg.mentionedCompetitors,
    citation_domains: agg.citationDomains,
    evidence_snippets: agg.snippets,
    assumptions: opts.assumptions,
    why_this_matters: opts.whyThisMatters,
    ...opts.extra
  };
}

type CompetitorDominance = {
  competitor: string;
  prompts: PromptResultInput[];
};

/**
 * Groups prompts where a tracked competitor is mentioned and the brand is
 * not, by competitor name. Only named project competitors are matched (no
 * guessing), and a competitor must dominate at least 2 prompts to qualify —
 * this is what lets a recommendation name a specific competitor instead of
 * "the competition" in general.
 */
function computeCompetitorDominance(promptResults: PromptResultInput[], namedCompetitors: string[]): CompetitorDominance[] {
  const normalizedNamed = new Set(namedCompetitors.map((c) => c.trim().toLowerCase()).filter(Boolean));
  const byCompetitor = new Map<string, CompetitorDominance>();

  for (const result of promptResults) {
    if (result.brand_mentioned) continue;
    const extracted = getExtracted(result);
    if (!extracted?.competitors?.length) continue;
    for (const comp of extracted.competitors) {
      if (!comp.mentioned || !comp.name) continue;
      const key = comp.name.trim().toLowerCase();
      if (normalizedNamed.size > 0 && !normalizedNamed.has(key)) continue;
      const entry = byCompetitor.get(key) ?? { competitor: comp.name, prompts: [] };
      entry.prompts.push(result);
      byCompetitor.set(key, entry);
    }
  }

  return Array.from(byCompetitor.values())
    .filter((entry) => entry.prompts.length >= 2)
    .sort((a, b) => b.prompts.length - a.prompts.length)
    .slice(0, 3);
}

export function generateRecommendationsForRun(input: GenerateInput): RecommendationRow[] {
  const { runScore, promptResults } = input;
  if (!promptResults.length) return [];

  const brandMissing = promptResults.filter((p) => !p.brand_mentioned);
  const noCitation = promptResults.filter((p) => !p.citation_found);
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
      dedupeKey: "increase_brand_visibility",
      impact,
      effort: "medium",
      confidence: runScore.confidence,
      source_type: "rule",
      affectedCount: brandMissing.length,
      severityScore: (100 - runScore.visibility_score) + confWeight(runScore.confidence) * 5,
      evidence_json: buildEvidenceJson({
        ruleId: "rule_visibility_001",
        scoreDetails,
        runScore,
        affected: brandMissing,
        assumptions: ["La marca debería estar presente en la mayoría de los prompts objetivo."],
        whyThisMatters: "Una presencia de marca baja reduce su visibilidad en las respuestas generadas por IA."
      })
    });
  }

  if (runScore.citation_score < 50) {
    const impact: "high" | "medium" = runScore.citation_score < 20 ? "high" : "medium";
    candidates.push({
      title: "Haz que tu contenido sea más citable",
      description: "Las respuestas de IA rara vez citan tu marca o tu dominio. Añade datos verificables, referencias estructuradas y secciones más fáciles de citar como fuente.",
      rule_id: "rule_citations_001",
      recommendation_type: "improve_citation_readiness",
      dedupeKey: "improve_citation_readiness",
      impact,
      effort: "medium",
      confidence: runScore.confidence,
      source_type: "rule",
      affectedCount: noCitation.length,
      severityScore: (100 - runScore.citation_score) + confWeight(runScore.confidence) * 4,
      evidence_json: buildEvidenceJson({
        ruleId: "rule_citations_001",
        scoreDetails,
        runScore,
        affected: noCitation,
        assumptions: ["La presencia de citas indica que el contenido es apto como fuente para los motores de IA."],
        whyThisMatters: "Una presencia de citas baja limita tu autoridad y la frecuencia con la que se te referencia."
      })
    });
  }

  const dominantCompetitors = computeCompetitorDominance(promptResults, input.competitors);
  if (dominantCompetitors.length > 0) {
    for (const entry of dominantCompetitors) {
      const impact: "high" | "medium" = entry.prompts.length >= 3 ? "high" : "medium";
      const effort: "high" | "medium" = entry.prompts.length >= 4 ? "high" : "medium";
      candidates.push({
        title: `Recupera terreno frente a ${entry.competitor} en ${entry.prompts.length} prompts clave`,
        description: `${entry.competitor} aparece en respuestas de IA donde tu marca está ausente. Refuerza tu posicionamiento comparativo y tu contenido específico frente a este competidor.`,
        rule_id: "rule_competitor_gap_001",
        recommendation_type: "close_competitor_gap",
        dedupeKey: `close_competitor_gap:${entry.competitor.trim().toLowerCase()}`,
        impact,
        effort,
        confidence: runScore.confidence,
        source_type: "rule",
        affectedCount: entry.prompts.length,
        severityScore: entry.prompts.length * 20 + confWeight(runScore.confidence) * 3,
        evidence_json: buildEvidenceJson({
          ruleId: "rule_competitor_gap_001",
          scoreDetails,
          runScore,
          affected: entry.prompts,
          assumptions: [`${entry.competitor} aparece de forma recurrente en prompts donde tu marca no se menciona.`],
          whyThisMatters: `Las respuestas de IA dominadas por ${entry.competitor} pueden desviar la decisión de compra fuera de tu marca.`,
          extra: { dominant_competitor: entry.competitor },
          snippetSource: "competitor"
        })
      });
    }
  } else if (runScore.competitor_gap_score >= 50 && totalCompetitorMentions > 0) {
    const impact: "high" | "medium" = runScore.competitor_gap_score >= 70 ? "high" : "medium";
    const effort: "high" | "medium" = competitorNoBrand.length >= 3 ? "high" : "medium";
    candidates.push({
      title: "Reduce la brecha frente a los competidores que mencionan los motores de IA",
      description: "Los competidores aparecen en las respuestas de IA mientras que tu marca está ausente en prompts clave. Refuerza tus diferenciadores y tu posicionamiento comparativo.",
      rule_id: "rule_competitor_gap_001",
      recommendation_type: "close_competitor_gap",
      dedupeKey: "close_competitor_gap",
      impact,
      effort,
      confidence: runScore.confidence,
      source_type: "rule",
      affectedCount: competitorNoBrand.length,
      severityScore: runScore.competitor_gap_score + confWeight(runScore.confidence) * 3,
      evidence_json: buildEvidenceJson({
        ruleId: "rule_competitor_gap_001",
        scoreDetails,
        runScore,
        affected: competitorNoBrand,
        assumptions: ["Un mayor número de menciones de competidores con la marca ausente indica un riesgo de visibilidad competitiva."],
        whyThisMatters: "Las respuestas de IA dominadas por la competencia pueden desviar la decisión de compra fuera de tu marca.",
        snippetSource: "competitor"
      })
    });
  }

  if (comparativePrompts.length >= 2) {
    candidates.push({
      title: "Añade contenido comparativo para los prompts competitivos",
      description: "Varios prompts comparativos o comerciales mencionan a competidores mientras que tu marca no aparece. Publica páginas de comparativa específicas.",
      rule_id: "rule_comparison_content_001",
      recommendation_type: "add_comparison_content",
      dedupeKey: "add_comparison_content",
      impact: comparativePrompts.length >= 3 ? "high" : "medium",
      effort: "medium",
      confidence: runScore.confidence,
      source_type: "rule",
      affectedCount: comparativePrompts.length,
      severityScore: comparativePrompts.length * 18 + confWeight(runScore.confidence) * 3,
      evidence_json: buildEvidenceJson({
        ruleId: "rule_comparison_content_001",
        scoreDetails,
        runScore,
        affected: comparativePrompts,
        assumptions: ["Los prompts con intención comparativa suelen premiar el contenido explícito de comparación entre competidores y tu marca."],
        whyThisMatters: "Las páginas centradas en comparativas ayudan a recuperar visibilidad en los prompts de la fase de decisión.",
        snippetSource: "competitor"
      })
    });
  }

  if (runScore.visibility_score < 60 && runScore.citation_score < 50 && informationalPrompts.length > 0) {
    candidates.push({
      title: "Crea contenido informativo y FAQ listo para responder",
      description: "Los prompts informativos rinden por debajo de lo esperado en visibilidad y citas. Añade bloques de FAQ o de respuesta concisos y alineados con esas preguntas.",
      rule_id: "rule_faq_001",
      recommendation_type: "create_faq_section",
      dedupeKey: "create_faq_section",
      impact: "medium",
      effort: informationalPrompts.length >= 4 ? "medium" : "low",
      confidence: runScore.confidence,
      source_type: "rule",
      affectedCount: informationalPrompts.length,
      severityScore: informationalPrompts.length * 12 + (100 - runScore.visibility_score) * 0.2,
      evidence_json: buildEvidenceJson({
        ruleId: "rule_faq_001",
        scoreDetails,
        runScore,
        affected: informationalPrompts,
        assumptions: ["Los prompts en forma de pregunta se benefician de estructuras concisas y fáciles de responder."],
        whyThisMatters: "El contenido listo para responder aumenta su captación por la IA ante la demanda informativa."
      })
    });
  }

  if (candidates.length < 3 && runScore.visibility_score < 50 && totalCompetitorMentions === 0) {
    candidates.push({
      title: "Refuerza la claridad de tu marca como entidad y sus señales de categoría",
      description: "Las menciones de marca son bajas y las señales de los competidores también son débiles. Aclara las asociaciones entre tu marca y su categoría, y los descriptores principales de la entidad.",
      rule_id: "rule_entity_clarity_001",
      recommendation_type: "strengthen_brand_entity_clarity",
      dedupeKey: "strengthen_brand_entity_clarity",
      impact: "medium",
      effort: "low",
      confidence: "low",
      source_type: "rule",
      affectedCount: brandMissing.length,
      severityScore: 35,
      evidence_json: buildEvidenceJson({
        ruleId: "rule_entity_clarity_001",
        scoreDetails,
        runScore,
        affected: brandMissing,
        assumptions: ["Señales bajas tanto de marca como de competidores pueden indicar una vinculación débil con la entidad o la categoría."],
        whyThisMatters: "La claridad de la entidad ayuda a los modelos a asociar tu marca con las intenciones temáticas relevantes."
      })
    });
  }

  const byKey = new Map<string, CandidateRec>();
  for (const rec of candidates) {
    const existing = byKey.get(rec.dedupeKey);
    if (!existing || rec.severityScore > existing.severityScore) byKey.set(rec.dedupeKey, rec);
  }

  const impactWeight = (impact: "low" | "medium" | "high") => (impact === "high" ? 3 : impact === "medium" ? 2 : 1);
  const deduped = Array.from(byKey.values())
    .sort((a, b) => {
      const aScore = a.severityScore + impactWeight(a.impact) * 10 + confWeight(a.confidence) * 5 + a.affectedCount;
      const bScore = b.severityScore + impactWeight(b.impact) * 10 + confWeight(b.confidence) * 5 + b.affectedCount;
      return bScore - aScore;
    })
    .slice(0, 10);

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
