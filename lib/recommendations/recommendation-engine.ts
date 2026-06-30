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
  raw_response_text?: string | null;
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
  add_citation_block: "authority",
  pursue_citation_sources: "authority",
  address_negative_narrative: "content",
  update_stale_content: "content",
  strengthen_brand_entity_clarity: "technical"
};

export function categoryForType(type: string): RecommendationCategory {
  return categoryByType[type] ?? "content";
}

type ExtractedShape = {
  brand?: { evidence?: string[] };
  competitors?: Array<{ name?: string; mentioned?: boolean; evidence?: string[] }>;
  citations?: Array<{ domain?: string | null; source?: string | null }>;
  sentiment_drivers?: string[];
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
 * is the actual evidence. "none" is for rules about citation/grounding
 * rarity (improve_citation_readiness): a brand-mention quote proves the
 * brand was *mentioned* in the answer, not that its *domain* was cited as a
 * source, so showing it as "evidence" for a citation-rarity claim is a
 * category mismatch regardless of whose name is in the quote — there is no
 * valid text snippet that proves an absence of citation.
 */
function aggregateEvidence(prompts: PromptResultInput[], snippetSource: "brand" | "competitor" | "none" = "brand") {
  const competitors = new Set<string>();
  const domains = new Set<string>();
  const snippets: string[] = [];
  for (const p of prompts) {
    const ev = promptEvidence(p);
    ev.competitors.forEach((c) => competitors.add(c));
    ev.domains.forEach((d) => domains.add(d));
    if (snippetSource === "none") continue;
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
  snippetSource?: "brand" | "competitor" | "none";
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

function shortPrompt(text: string): string {
  const trimmed = text.trim();
  return trimmed.length > 70 ? `${trimmed.slice(0, 67)}…` : trimmed;
}

/**
 * Per-prompt gap cards (Fase B2): instead of one broad card bundling every
 * brand-missing or uncited prompt — which mixes unrelated topics into a single
 * recommendation whose generated solution can only address one of them — emit
 * one focused card per affected prompt, so each card (and its later AI action
 * plan) stays about a single, coherent query.
 *
 * Two non-overlapping gaps are produced here; "brand absent while a competitor
 * is present" is deliberately left to the competitor-dominance / comparison
 * rules below, to avoid two cards for the same prompt:
 *  - visibility ("increase_brand_visibility"): brand absent AND no competitor
 *    named in that prompt — a pure presence gap.
 *  - citation ("add_citation_block", catalog gap "mention without citation"):
 *    brand IS mentioned but its domain was not grounded-cited.
 *
 * Each gap keeps the run-score gate the old aggregate rules used, so this only
 * changes the shape of the output (N specific cards vs 1 bundled), not when the
 * gap is considered open.
 */
function perPromptGapCards(opts: {
  promptResults: PromptResultInput[];
  runScore: RunScoreInput;
  scoreDetails: Record<string, unknown>;
}): CandidateRec[] {
  const { promptResults, runScore, scoreDetails } = opts;
  const visibilityOpen = runScore.visibility_score < 60;
  const citationOpen = runScore.citation_score < 50;
  const cards: CandidateRec[] = [];

  for (const result of promptResults) {
    const ev = promptEvidence(result);
    const hasCompetitor = ev.competitors.length > 0;
    const label = shortPrompt(result.prompt_text_snapshot);

    if (!result.brand_mentioned && !hasCompetitor && visibilityOpen) {
      cards.push({
        title: `Consigue aparecer en "${label}"`,
        description:
          "Tu marca no aparece en la respuesta de IA a esta consulta y ningún competidor concreto la domina todavía. Refuerza el contenido y las señales de marca específicas para esta búsqueda.",
        rule_id: "rule_visibility_001",
        recommendation_type: "increase_brand_visibility",
        dedupeKey: `increase_brand_visibility:${result.id}`,
        impact: "medium",
        effort: "medium",
        confidence: runScore.confidence,
        source_type: "rule",
        affectedCount: 1,
        severityScore: 48 + confWeight(runScore.confidence) * 4,
        evidence_json: buildEvidenceJson({
          ruleId: "rule_visibility_001",
          scoreDetails,
          runScore,
          affected: [result],
          assumptions: ["La marca debería aparecer en la respuesta a esta consulta objetivo."],
          whyThisMatters: "No aparecer en esta consulta reduce tu visibilidad ante una intención de búsqueda concreta.",
          snippetSource: "brand"
        })
      });
    } else if (result.brand_mentioned && !result.citation_found && citationOpen) {
      cards.push({
        title: `Te mencionan pero no citan tu dominio en "${label}"`,
        description:
          "La IA menciona tu marca en esta consulta pero no cita tu dominio como fuente. Añade un bloque factual y citable que la IA pueda referenciar directamente.",
        rule_id: "rule_citations_001",
        recommendation_type: "add_citation_block",
        dedupeKey: `add_citation_block:${result.id}`,
        impact: "medium",
        effort: "low",
        confidence: runScore.confidence,
        source_type: "rule",
        affectedCount: 1,
        severityScore: 44 + confWeight(runScore.confidence) * 4,
        evidence_json: buildEvidenceJson({
          ruleId: "rule_citations_001",
          scoreDetails,
          runScore,
          affected: [result],
          assumptions: ["Una mención sin cita indica contenido que la IA conoce pero no referencia como fuente."],
          whyThisMatters: "Que te mencionen sin citar tu dominio limita tu autoridad como fuente en esta consulta.",
          snippetSource: "none"
        })
      });
    }
  }

  return cards;
}

type CitationSource = {
  domain: string;
  prompts: PromptResultInput[];
};

function normalizeDomainValue(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "");
}

/**
 * Gap 8 (digital PR / source gap): third-party domains that Gemini GROUNDS its
 * answers on in prompts where the brand's own domain is NOT among the cited
 * sources. These are the publications to pursue so the model starts citing the
 * brand too. Only grounded citations count (promptEvidence already filters to
 * source="grounding"), the brand's own domain is excluded, and a source must
 * recur in >=2 brand-absent prompts to qualify — avoiding one-off citations.
 * Built entirely from data already captured (no crawler, no new extraction).
 */
function computeCitationSourceGap(promptResults: PromptResultInput[], brandDomain: string): CitationSource[] {
  const normalizedBrand = normalizeDomainValue(brandDomain);
  const bySource = new Map<string, CitationSource>();

  for (const result of promptResults) {
    const ev = promptEvidence(result);
    const normalizedDomains = ev.domains.map(normalizeDomainValue);
    if (normalizedBrand && normalizedDomains.includes(normalizedBrand)) continue; // brand already cited here

    const seenInThisPrompt = new Set<string>();
    for (const domain of ev.domains) {
      const key = normalizeDomainValue(domain);
      if (!key || key === normalizedBrand || seenInThisPrompt.has(key)) continue;
      seenInThisPrompt.add(key);
      const entry = bySource.get(key) ?? { domain, prompts: [] };
      entry.prompts.push(result);
      bySource.set(key, entry);
    }
  }

  return Array.from(bySource.values())
    .filter((entry) => entry.prompts.length >= 2)
    .sort((a, b) => b.prompts.length - a.prompts.length)
    .slice(0, 6);
}

/**
 * Gap 9 (negative narrative, Fase D1): collects all prompts where the AI
 * expresses negative or mixed sentiment about the brand. Fires on ≥1 such
 * prompt — no secondary driver-extraction needed. The Gemini rewrite asset
 * uses the brand evidence quotes from those prompts to identify the theme and
 * draft a counter-narrative, so we don't need to extract a specific topic
 * string here.
 */
function computeNegativeNarrative(promptResults: PromptResultInput[]): PromptResultInput[] {
  return promptResults.filter(
    (r) => r.sentiment === "negative" || r.sentiment === "mixed"
  );
}

// Phrases in the AI response that explicitly signal stale or outdated content
// about the brand. Conservative list — only unambiguous staleness statements.
const STALE_PHRASES = [
  "ya no está disponible",
  "ya no se ofrece",
  "ya no opera",
  "ya no existe",
  "ha dejado de",
  "fue discontinuado",
  "fue descontinuado",
  "no longer available",
  "no longer offered",
  "no longer operates",
  "was discontinued",
  "has been discontinued",
  "is no longer",
  "información puede no estar actualizada",
  "información desactualizada",
  "verify the latest",
  "verificar la información más reciente"
];

// Years old enough to indicate the AI is citing significantly stale data
// (3+ years before current year). Anchored to a constant so tests are stable.
const STALE_YEAR_CUTOFF = new Date().getFullYear() - 3;
const STALE_YEAR_RE = new RegExp(
  `\\b(19\\d{2}|20[0-${Math.floor(STALE_YEAR_CUTOFF / 10) % 10}]\\d|${Math.floor(STALE_YEAR_CUTOFF / 10) * 10}[0-${STALE_YEAR_CUTOFF % 10}])\\b`
);

/**
 * Gap 10 (freshness/recency, Fase D2): detects prompts where the AI response
 * explicitly signals that the brand's information may be stale — either via
 * staleness phrases ("ya no está disponible", "was discontinued") or by citing
 * a year ≥3 years before the current year in context with the brand. Only
 * fires for prompts where the brand is actually mentioned, so we're talking
 * about stale brand info, not general background context. Uses raw_response_text
 * directly with regex — no secondary LLM extraction needed.
 */
function computeFreshnessGap(promptResults: PromptResultInput[]): PromptResultInput[] {
  return promptResults.filter((r) => {
    if (!r.brand_mentioned) return false;
    const text = (r.raw_response_text ?? "").toLowerCase();
    if (!text) return false;
    if (STALE_PHRASES.some((phrase) => text.includes(phrase.toLowerCase()))) return true;
    if (STALE_YEAR_RE.test(text)) return true;
    return false;
  });
}

export function generateRecommendationsForRun(input: GenerateInput): RecommendationRow[] {
  const { runScore, promptResults } = input;
  if (!promptResults.length) return [];

  const brandMissing = promptResults.filter((p) => !p.brand_mentioned);
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

  // Per-prompt visibility ("increase_brand_visibility") and citation
  // ("add_citation_block") gaps — one focused card per affected query instead
  // of one bundled card mixing unrelated topics (Fase B2).
  candidates.push(...perPromptGapCards({ promptResults, runScore, scoreDetails }));

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

  // Gap 8 (digital PR): the third-party sources Gemini already cites where the
  // brand is absent — the publications worth pursuing so the model cites you too.
  const citationSources = computeCitationSourceGap(promptResults, input.project.domain);
  if (citationSources.length > 0) {
    const affectedIds = new Set<string>();
    for (const source of citationSources) {
      for (const p of source.prompts) affectedIds.add(p.id);
    }
    const affected = promptResults.filter((p) => affectedIds.has(p.id));
    const sourceDomains = citationSources.map((source) => source.domain);
    const impact: "high" | "medium" = affected.length >= 4 ? "high" : "medium";
    candidates.push({
      title: "Consigue que las fuentes que cita la IA también te citen a ti",
      description: `La IA se apoya en fuentes de terceros (${sourceDomains.slice(0, 3).join(", ")}${sourceDomains.length > 3 ? "…" : ""}) en consultas donde tu dominio no aparece. Trabaja esas fuentes (relaciones públicas digitales) para que te incluyan y empieces a ser citado.`,
      rule_id: "rule_source_gap_001",
      recommendation_type: "pursue_citation_sources",
      dedupeKey: "pursue_citation_sources",
      impact,
      effort: "high",
      confidence: runScore.confidence,
      source_type: "rule",
      affectedCount: affected.length,
      severityScore: affected.length * 12 + confWeight(runScore.confidence) * 3,
      evidence_json: buildEvidenceJson({
        ruleId: "rule_source_gap_001",
        scoreDetails,
        runScore,
        affected,
        assumptions: [
          "Las fuentes que la IA cita de forma recurrente sin incluir tu marca son objetivos de relaciones públicas digitales."
        ],
        whyThisMatters:
          "Entrar en las fuentes que los motores de IA ya citan aumenta directamente tu probabilidad de ser referenciado.",
        extra: { source_domains: sourceDomains },
        snippetSource: "none"
      })
    });
  }

  // Gap 9 (negative narrative): one card summarising all prompts where the AI
  // expresses negative or mixed sentiment about the brand. The Gemini rewrite
  // asset extracts the specific theme from the evidence quotes.
  const negativePrompts = computeNegativeNarrative(promptResults);
  if (negativePrompts.length >= 1) {
    const impact: "high" | "medium" = negativePrompts.length >= 3 ? "high" : "medium";
    candidates.push({
      title: `Contrarresta la percepción negativa de tu marca en las respuestas de IA`,
      description: `Las respuestas de IA expresan sentimiento negativo o mixto sobre tu marca en ${negativePrompts.length} ${negativePrompts.length === 1 ? "consulta" : "consultas"}. Publica contenido con datos y casos reales que corrijan esa narrativa.`,
      rule_id: "rule_negative_narrative_001",
      recommendation_type: "address_negative_narrative",
      dedupeKey: "address_negative_narrative",
      impact,
      effort: "medium",
      confidence: runScore.confidence,
      source_type: "rule",
      affectedCount: negativePrompts.length,
      severityScore: negativePrompts.length * 15 + confWeight(runScore.confidence) * 3,
      evidence_json: buildEvidenceJson({
        ruleId: "rule_negative_narrative_001",
        scoreDetails,
        runScore,
        affected: negativePrompts,
        assumptions: [`La IA expresa sentimiento negativo o mixto sobre la marca en ${negativePrompts.length} respuestas.`],
        whyThisMatters:
          "Una percepción negativa recurrente en las respuestas de IA erosiona la credibilidad de la marca en la fase de decisión.",
        snippetSource: "brand"
      })
    });
  }

  // Gap 10 (freshness/recency, Fase D2): one card when the AI signals stale or
  // outdated information about the brand — either via explicit staleness phrases
  // or by citing a year ≥3 years old. Fires only when the brand is mentioned
  // (stale brand info, not general background context).
  const stalePrompts = computeFreshnessGap(promptResults);
  if (stalePrompts.length >= 1) {
    const impact: "high" | "medium" = stalePrompts.length >= 3 ? "high" : "medium";
    candidates.push({
      title: `Actualiza la información de tu marca que la IA cita como desactualizada`,
      description: `La IA señala información desactualizada sobre tu marca en ${stalePrompts.length} ${stalePrompts.length === 1 ? "consulta" : "consultas"}. Publica contenido actualizado con datos actuales para que los modelos reflejen la situación real.`,
      rule_id: "rule_freshness_001",
      recommendation_type: "update_stale_content",
      dedupeKey: "update_stale_content",
      impact,
      effort: "low",
      confidence: runScore.confidence,
      source_type: "rule",
      affectedCount: stalePrompts.length,
      severityScore: stalePrompts.length * 14 + confWeight(runScore.confidence) * 3,
      evidence_json: buildEvidenceJson({
        ruleId: "rule_freshness_001",
        scoreDetails,
        runScore,
        affected: stalePrompts,
        assumptions: [`La IA cita información desactualizada sobre la marca en ${stalePrompts.length} respuestas.`],
        whyThisMatters:
          "La información desactualizada en las respuestas de IA genera desconfianza y puede costar conversiones cuando el usuario contrasta los datos.",
        snippetSource: "brand"
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
