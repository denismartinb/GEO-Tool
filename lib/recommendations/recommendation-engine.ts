import { classifySourceType, type SourceType } from "@/lib/citations/source-type";

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
  /**
   * project_prompts.id (RECS-DEDUPE-1) — stable across scan runs, unlike
   * `id` above (scan_prompt_results.id, a fresh row per run). Used to build
   * a per-prompt gap's dedupeKey so the SAME open gap is recognized as
   * still-open across runs instead of looking "resolved" every time purely
   * because its underlying result row got a new id. Null only when the
   * prompt was later deleted from project_prompts (on delete set null) —
   * see lib/scan/executor.ts.
   */
  promptId?: string | null;
  prompt_text_snapshot: string;
  brand_mentioned: boolean;
  citation_found: boolean;
  mentioned_competitors_count: number;
  citations_count: number;
  sentiment: "positive" | "neutral" | "negative" | "mixed" | "unknown";
  extracted_json: unknown;
  raw_response_text?: string | null;
  /**
   * The prompt's real topic category (project_prompts.category, joined by
   * prompt_id — see lib/scan/executor.ts), one of PROMPT_CATEGORIES
   * (lib/projects/prompt-categories.ts) or null. Null for prompts created
   * before category assignment existed, or custom prompts without one — those
   * fall back to keyword matching (see isComparativePrompt/isInformationalPrompt).
   */
  category?: string | null;
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
  /**
   * Stable identity key for this specific gap (e.g.
   * "increase_brand_visibility:<prompt_id>", "close_competitor_gap:<competitor>"),
   * already computed internally for in-run dedup (CandidateRec.dedupeKey) but
   * now also returned so the caller (lib/scan/executor.ts) can persist it and
   * recognize "same gap as last run" across runs — see RECS-3 /
   * supabase/migrations/0010_recommendations_history.sql.
   */
  dedupe_key: string;
};

type GenerateInput = {
  project: ProjectInput;
  competitors: string[];
  runScore: RunScoreInput;
  promptResults: PromptResultInput[];
};

type CandidateRec = Omit<RecommendationRow, "priority_rank" | "dedupe_key"> & {
  severityScore: number;
  affectedCount: number;
  dedupeKey: string;
};

const comparativeKeywords = [
  "best", "top", "vs", "compare", "comparison", "alternative", "alternatives",
  "herramientas", "mejores", "comparar", "alternativas"
];
const informationalKeywords = ["how", "what", "why", "when", "where", "cómo", "qué", "por qué", "cuándo", "dónde"];

// Real product taxonomy (lib/projects/prompt-categories.ts) mapped to the
// comparative/informational intents the recommendation rules care about.
const COMPARATIVE_CATEGORIES = new Set(["Comparación", "Alternativas"]);
const INFORMATIONAL_CATEGORIES = new Set(["Cómo hacer / guía"]);

/**
 * Comparative-intent check (debilidad 1 fix). Prefers the prompt's real,
 * user-assigned category over guessing from keywords — a comparative prompt
 * phrased without any of the English/Spanish comparative keywords (e.g.
 * "¿Merece la pena Conforama frente a otras tiendas?") was previously
 * invisible to the comparison-content rule. Keyword matching is kept as the
 * fallback only for prompts with no category (legacy snapshots, custom
 * prompts added without one).
 */
function isComparativePrompt(p: PromptResultInput): boolean {
  if (p.category) return COMPARATIVE_CATEGORIES.has(p.category);
  const text = p.prompt_text_snapshot.toLowerCase();
  return comparativeKeywords.some((k) => text.includes(k));
}

function isInformationalPrompt(p: PromptResultInput): boolean {
  if (p.category) return INFORMATIONAL_CATEGORIES.has(p.category);
  const text = p.prompt_text_snapshot.toLowerCase();
  return informationalKeywords.some((k) => text.includes(k));
}

export type RecommendationCategory = "content" | "technical" | "authority";

const categoryByType: Record<string, RecommendationCategory> = {
  improve_citation_readiness: "authority",
  add_citation_block: "authority",
  pursue_citation_sources: "authority",
  pursue_comparator_sources: "authority",
  pursue_community_sources: "authority",
  pursue_media_sources: "authority",
  address_negative_narrative: "content",
  update_stale_content: "content",
  strengthen_brand_entity_clarity: "technical",
  increase_brand_prominence: "content",
  amplify_positive_pattern: "content",
  track_emerging_competitor: "technical"
};

export function categoryForType(type: string): RecommendationCategory {
  return categoryByType[type] ?? "content";
}

// Spanish label for the "tipo" badge on a recommendation card. `recommendation_type`
// is an internal snake_case identifier (also used for dedupeKey/rule wiring), never
// meant to reach the UI verbatim — every value emitted by this engine must have an
// entry here so the badge never leaks a raw English identifier into an otherwise
// fully-localized Spanish UI (see recommendations-client.tsx).
const labelByType: Record<string, string> = {
  add_citation_block: "Añadir bloque de cita",
  add_comparison_content: "Añadir contenido comparativo",
  address_negative_narrative: "Corregir narrativa negativa",
  amplify_positive_pattern: "Amplificar patrón positivo",
  close_competitor_gap: "Cerrar brecha con competidores",
  create_faq_section: "Crear sección de FAQ",
  increase_brand_prominence: "Aumentar prominencia de marca",
  increase_brand_visibility: "Aumentar visibilidad de marca",
  pursue_citation_sources: "Entrar en fuentes citadas",
  pursue_comparator_sources: "Entrar en comparadores",
  pursue_community_sources: "Entrar en comunidades",
  pursue_media_sources: "Conseguir cobertura en medios",
  strengthen_brand_entity_clarity: "Reforzar claridad de marca",
  track_emerging_competitor: "Seguir competidor emergente",
  update_stale_content: "Actualizar contenido desactualizado"
};

/**
 * Falls back to the old raw "snake_case -> spaced" rendering for any
 * unmapped type (e.g. a future rule added without updating labelByType) —
 * degrades to the previous (imperfect but harmless) behavior rather than
 * throwing or showing an empty badge.
 */
export function labelForType(type: string): string {
  return labelByType[type] ?? type.replaceAll("_", " ");
}

type ExtractedShape = {
  brand?: { evidence?: string[]; position?: number | null };
  competitors?: Array<{ name?: string; mentioned?: boolean; evidence?: string[]; position?: number | null }>;
  citations?: Array<{ domain?: string | null; source?: string | null; title?: string | null; url?: string | null }>;
  sentiment_drivers?: string[];
  /** RECS-4A / N6 — real brand names the AI mentions that aren't tracked. */
  other_brands_mentioned?: string[];
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
  /**
   * RECS-REDESIGN-1 — the single, time-boxed first move for this gap ("Añade
   * una tabla de precios al principio de la página. 30 min."). Every rule must
   * supply one: the research behind this redesign (Semrush 2026 guides, the
   * Otterly teardown) is unanimous that a diagnosis without a bounded first
   * action is what makes a recommendations list unusable — the user reads
   * twenty true statements and still doesn't know what to do this afternoon.
   * Rendered as the only always-visible instruction on a collapsed card, so it
   * has to stand on its own without the surrounding evidence.
   */
  firstStep: string;
  extra?: Record<string, unknown>;
  snippetSource?: "brand" | "competitor" | "none";
}): Record<string, unknown> {
  const agg = aggregateEvidence(opts.affected, opts.snippetSource);
  return {
    rule_id: opts.ruleId,
    first_step: opts.firstStep,
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

/**
 * Gap: emerging competitors (RECS-4A / N6). Aggregates other_brands_mentioned
 * (already extracted by the structured-extraction Gemini call, previously
 * unused by the engine) to find a brand NOT currently tracked as a
 * competitor that the AI surfaces on its own, recurringly. Independent of
 * brand_mentioned/competitor status on those prompts — this isn't a
 * presence/absence gap, it's "the AI already treats this brand as relevant
 * in your space and you aren't watching it".
 */
function computeEmergingCompetitors(
  promptResults: PromptResultInput[],
  trackedCompetitors: string[],
  projectBrand: string
): CompetitorDominance[] {
  const trackedNormalized = new Set(trackedCompetitors.map((c) => c.trim().toLowerCase()).filter(Boolean));
  const brandNormalized = projectBrand.trim().toLowerCase();
  const byName = new Map<string, CompetitorDominance>();

  for (const result of promptResults) {
    const extracted = getExtracted(result);
    const seenInThisPrompt = new Set<string>();
    for (const raw of extracted?.other_brands_mentioned ?? []) {
      const name = raw.trim();
      if (!name) continue;
      const key = name.toLowerCase();
      if (key === brandNormalized || trackedNormalized.has(key) || seenInThisPrompt.has(key)) continue;
      seenInThisPrompt.add(key);
      const entry = byName.get(key) ?? { competitor: name, prompts: [] };
      entry.prompts.push(result);
      byName.set(key, entry);
    }
  }

  return Array.from(byName.values())
    .filter((entry) => entry.prompts.length >= 2)
    .sort((a, b) => b.prompts.length - a.prompts.length)
    .slice(0, 3);
}

/**
 * Gap: prominence (RECS-2B / N1). Distinct from close_competitor_gap (brand
 * ABSENT while a competitor appears): this is for prompts where the brand IS
 * mentioned but a specific named competitor consistently ranks ahead of it —
 * a lower 1-based first-mention position, per
 * docs/adr/0005-average-brand-position.md. Being present but always second
 * is a different problem than not appearing at all, and needs a different
 * fix (become the primary answer, not just any mention). Mutually exclusive
 * with the visibility/citation per-prompt cards (both require
 * brand_mentioned=true here vs. false there), so no prompt can double up
 * into both a presence gap and a prominence gap.
 */
function computeProminenceGap(promptResults: PromptResultInput[], namedCompetitors: string[]): CompetitorDominance[] {
  const normalizedNamed = new Set(namedCompetitors.map((c) => c.trim().toLowerCase()).filter(Boolean));
  const byCompetitor = new Map<string, CompetitorDominance>();

  for (const result of promptResults) {
    if (!result.brand_mentioned) continue;
    const extracted = getExtracted(result);
    const brandPosition = extracted?.brand?.position;
    if (typeof brandPosition !== "number") continue;

    for (const comp of extracted?.competitors ?? []) {
      if (!comp.mentioned || !comp.name || typeof comp.position !== "number") continue;
      if (comp.position >= brandPosition) continue; // must rank strictly ahead of the brand
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

/**
 * "Amplify what works" (RECS-2B / N4): prompts where the brand is mentioned,
 * grounded-cited, and NOT carrying a negative/mixed narrative — a working
 * content/positioning pattern worth replicating. Deliberately includes
 * "neutral" sentiment, not just "positive": most factual AI answers land as
 * neutral even when they cite the brand cleanly, so requiring an explicit
 * positive judgment made this gate almost never fire in practice (confirmed
 * against real scan data) — being mentioned+cited without any negative frame
 * is already the "working" outcome worth replicating. Excludes
 * negative/mixed (that's gap 9's job) and "unknown" (failed/missing
 * sentiment extraction is not a validated signal either way). Callers must
 * additionally gate this on the run actually having an open gap elsewhere
 * (see generateRecommendationsForRun) — "replicate this pattern" is only
 * useful advice when there's somewhere left to apply it; on an
 * already-perfect run it would just be noise.
 */
function computeWinningPattern(promptResults: PromptResultInput[]): PromptResultInput[] {
  return promptResults.filter(
    (r) => r.brand_mentioned && r.citation_found && (r.sentiment === "positive" || r.sentiment === "neutral")
  );
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
 * No run-wide score gate: a per-prompt gap is real regardless of how well the
 * overall run scored — a strong brand (visibility_score 85) still has the
 * exact prompts where it's absent, and those are the most actionable
 * recommendations it can get. Gating on the aggregate score used to hide them
 * entirely once the brand did well enough, which is backwards. Volume is
 * still bounded by dedup (one candidate per dedupeKey); there is no count
 * cap on the final list (RECS-CAP-REMOVE).
 */
function perPromptGapCards(opts: {
  promptResults: PromptResultInput[];
  runScore: RunScoreInput;
  scoreDetails: Record<string, unknown>;
}): CandidateRec[] {
  const { promptResults, runScore, scoreDetails } = opts;
  const cards: CandidateRec[] = [];

  for (const result of promptResults) {
    const ev = promptEvidence(result);
    const hasCompetitor = ev.competitors.length > 0;
    const label = shortPrompt(result.prompt_text_snapshot);
    // RECS-DEDUPE-1: identify the gap by the PROMPT, not by this run's result
    // row — result.id is a fresh scan_prompt_results.id every run, so keying
    // on it made every per-prompt gap look "resolved" on the very next scan
    // regardless of whether anything actually changed. Falls back to
    // result.id only when promptId is null (the prompt was later deleted
    // from project_prompts) — dedupe stability degrades for that one row,
    // which no longer matters since it won't be scanned again either.
    const stableId = result.promptId ?? result.id;

    if (!result.brand_mentioned && !hasCompetitor) {
      cards.push({
        title: `Aparece en "${label}"`,
        description:
          "Ni tú ni ningún competidor aparecéis en esta respuesta. Es una consulta libre: se la lleva quien publique primero la mejor respuesta.",
        rule_id: "rule_visibility_001",
        recommendation_type: "increase_brand_visibility",
        dedupeKey: `increase_brand_visibility:${stableId}`,
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
          whyThisMatters:
            "Nadie ocupa todavía esta consulta. Entrar ahora es más barato que disputarla cuando un competidor ya se haya asentado.",
          firstStep:
            "Publica una página que responda esta pregunta en las dos primeras frases, con el titular en forma de pregunta.",
          snippetSource: "brand"
        })
      });
    } else if (result.brand_mentioned && !result.citation_found) {
      cards.push({
        title: `Consigue que te citen en "${label}"`,
        description:
          "La IA te nombra en esta respuesta, pero se apoya en otras webs como fuente. Para citarte necesita un dato tuyo que pueda verificar.",
        rule_id: "rule_citations_001",
        recommendation_type: "add_citation_block",
        dedupeKey: `add_citation_block:${stableId}`,
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
          whyThisMatters:
            "Que te nombren sin citarte deja la autoridad en otra web. La cita es lo que convierte la mención en tráfico y en confianza.",
          firstStep:
            "Añade a la página que responde esta consulta un dato concreto con fecha y fuente (precio, cifra, plazo).",
          snippetSource: "none"
        })
      });
    }
  }

  return cards;
}

type CitationExamplePage = { title: string; url: string };

type CitationSource = {
  domain: string;
  prompts: PromptResultInput[];
  examplePage: CitationExamplePage | null;
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
 * Grounded citations for one prompt, including the page title/url (not just
 * the domain) — RECS-2B / N2. Lets the digital-PR gap name the specific
 * article the AI already cites ("this exact page") instead of only the
 * domain, both fields already persisted on extracted_json.citations
 * (lib/scan/extraction.ts's buildGroundedCitations), no new extraction.
 */
function promptCitationPages(result: PromptResultInput): Array<{ domain: string; title: string | null; url: string | null }> {
  const extracted = getExtracted(result);
  return (extracted?.citations ?? [])
    .filter((c) => c.source === "grounding" && c.domain)
    .map((c) => ({ domain: c.domain as string, title: c.title ?? null, url: c.url ?? null }));
}

/**
 * Gap 8 (digital PR / source gap): third-party domains that Gemini GROUNDS its
 * answers on in prompts where the brand's own domain is NOT among the cited
 * sources. These are the publications to pursue so the model starts citing the
 * brand too. Only grounded citations count (promptEvidence already filters to
 * source="grounding"), the brand's own domain is excluded, and a source must
 * recur in >=2 brand-absent prompts to qualify — avoiding one-off citations.
 * Built entirely from data already captured (no crawler, no new extraction).
 * Each source also carries one example page (title + url, first one seen with
 * both fields present) so the asset can target a specific article, not just a
 * bare domain name.
 */
function computeCitationSourceGap(promptResults: PromptResultInput[], brandDomain: string): CitationSource[] {
  const normalizedBrand = normalizeDomainValue(brandDomain);
  const bySource = new Map<string, CitationSource>();

  for (const result of promptResults) {
    const ev = promptEvidence(result);
    const normalizedDomains = ev.domains.map(normalizeDomainValue);
    if (normalizedBrand && normalizedDomains.includes(normalizedBrand)) continue; // brand already cited here

    const seenInThisPrompt = new Set<string>();
    for (const page of promptCitationPages(result)) {
      const key = normalizeDomainValue(page.domain);
      if (!key || key === normalizedBrand || seenInThisPrompt.has(key)) continue;
      seenInThisPrompt.add(key);
      const entry = bySource.get(key) ?? { domain: page.domain, prompts: [], examplePage: null };
      entry.prompts.push(result);
      if (!entry.examplePage && page.title && page.url) {
        entry.examplePage = { title: page.title, url: page.url };
      }
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
 * expresses negative or mixed sentiment about the brand.
 */
function computeNegativeNarrative(promptResults: PromptResultInput[]): PromptResultInput[] {
  return promptResults.filter(
    (r) => r.sentiment === "negative" || r.sentiment === "mixed"
  );
}

/**
 * Aggregates the recurring sentiment_drivers (short noun-phrase themes, e.g.
 * "atención al cliente") across the given prompts' extracted_json, ranked by
 * frequency (Fase RECS-2A / debilidad 3). Lets the negative-narrative card
 * name the actual theme instead of a generic "percepción negativa" — the data
 * was already captured by extraction but previously unused by the engine.
 */
function topSentimentDrivers(promptResults: PromptResultInput[], limit = 3): string[] {
  const counts = new Map<string, number>();
  for (const result of promptResults) {
    const extracted = getExtracted(result);
    for (const raw of extracted?.sentiment_drivers ?? []) {
      const driver = raw.trim();
      if (!driver) continue;
      counts.set(driver, (counts.get(driver) ?? 0) + 1);
    }
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([driver]) => driver)
    .slice(0, limit);
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
// (3+ years before current year).
const STALE_YEAR_CUTOFF = new Date().getFullYear() - 3;
// Simple 4-digit year pattern; the actual cutoff check uses parseInt so the
// regex stays readable and correct (the previous character-class approach
// produced 20[0-2]\d which matched years up to 2029, causing false positives).
const YEAR_RE = /\b(19\d{2}|20\d{2})\b/;

// Phrases that assert the vintage/currency of the information itself, as
// opposed to narrating the brand's history. An old year only counts as a
// staleness signal when it immediately follows one of these markers:
// "según datos de 2019" means the AI is working from 2019 data, while
// "fundada en 1975" is a correct historical fact. The previous bare-year
// heuristic flagged both, permanently mis-flagging any brand with history
// (docs/geo-methodology-audit-2026-07.md, finding 2 / phase C).
const RECENCY_MARKERS = [
  "a fecha de",
  "as of",
  "datos de",
  "data from",
  "según datos",
  "actualizado en",
  "actualizada en",
  "actualizado a",
  "actualizada a",
  "última actualización",
  "last updated",
  "updated in",
  "mi información llega hasta",
  "conocimiento hasta",
  "knowledge cutoff"
];

// How far after a recency marker a year may appear and still be attributed to
// it ("según datos de finales de 2019" still matches; a year several clauses
// later does not).
const RECENCY_MARKER_WINDOW = 24;

/**
 * Finds the first old year (≤ cutoff) that immediately follows a recency
 * marker, returning its position in the raw text so callers can extract the
 * surrounding context. Returns null when every old year in the text is just
 * historical narration with no marker attributing it to the info's vintage.
 */
function findStaleYearSignal(raw: string, cutoff: number): { index: number; length: number } | null {
  const lower = raw.toLowerCase();
  for (const marker of RECENCY_MARKERS) {
    let from = 0;
    for (;;) {
      const idx = lower.indexOf(marker, from);
      if (idx === -1) break;
      const windowStart = idx + marker.length;
      const window = raw.slice(windowStart, windowStart + RECENCY_MARKER_WINDOW);
      const m = window.match(YEAR_RE);
      if (m && m.index !== undefined && parseInt(m[0], 10) <= cutoff) {
        return { index: windowStart + m.index, length: m[0].length };
      }
      from = windowStart;
    }
  }
  return null;
}

/**
 * Extracts ~150 chars of context around the first stale signal found in the
 * raw response text. Used to populate stale_signals evidence so the UI can
 * show WHY each prompt was flagged rather than showing unrelated brand quotes.
 */
function extractStaleContext(raw: string, cutoff: number): string | null {
  const lower = raw.toLowerCase();
  for (const phrase of STALE_PHRASES) {
    const idx = lower.indexOf(phrase.toLowerCase());
    if (idx !== -1) {
      const start = Math.max(0, idx - 60);
      const end = Math.min(raw.length, idx + phrase.length + 100);
      return `…${raw.slice(start, end).trim()}…`;
    }
  }
  const yearSignal = findStaleYearSignal(raw, cutoff);
  if (yearSignal) {
    const start = Math.max(0, yearSignal.index - 60);
    const end = Math.min(raw.length, yearSignal.index + yearSignal.length + 100);
    return `…${raw.slice(start, end).trim()}…`;
  }
  return null;
}

/**
 * Gap 10 (freshness/recency, Fase D2): detects prompts where the AI response
 * explicitly signals that the brand's information may be stale — either via
 * staleness phrases ("ya no está disponible", "was discontinued") or via an
 * old year (≥3 years back) attributed to the info's vintage by a recency
 * marker ("según datos de 2019", "as of 2019"). A bare old year with no
 * marker is treated as historical narration ("fundada en 1975"), never as a
 * staleness signal (audit finding 2 / phase C). Only fires for prompts where
 * the brand is actually mentioned. Uses raw_response_text directly — no
 * secondary LLM extraction needed.
 */
function computeFreshnessGap(promptResults: PromptResultInput[]): PromptResultInput[] {
  return promptResults.filter((r) => {
    if (!r.brand_mentioned) return false;
    const raw = r.raw_response_text ?? "";
    if (!raw) return false;
    const lower = raw.toLowerCase();
    if (STALE_PHRASES.some((phrase) => lower.includes(phrase.toLowerCase()))) return true;
    return findStaleYearSignal(raw, STALE_YEAR_CUTOFF) !== null;
  });
}

export function generateRecommendationsForRun(input: GenerateInput): RecommendationRow[] {
  const { runScore, promptResults } = input;
  if (!promptResults.length) return [];

  const brandMissing = promptResults.filter((p) => !p.brand_mentioned);
  const competitorNoBrand = promptResults.filter((p) => p.mentioned_competitors_count > 0 && !p.brand_mentioned);
  const comparativePrompts = competitorNoBrand.filter(isComparativePrompt);
  const informationalPrompts = promptResults.filter(isInformationalPrompt);

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
        title: `Disputa a ${entry.competitor} ${entry.prompts.length} consultas donde no apareces`,
        description: `${entry.competitor} sale en ${entry.prompts.length} respuestas y tú no. Publica contenido que responda esas consultas mejor y que compare con honestidad.`,
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
          whyThisMatters: `Cuando la IA responde con ${entry.competitor} y no contigo, la decisión se toma sin que llegues a estar en la lista.`,
          firstStep: `Abre una de estas respuestas y mira qué páginas cita para ${entry.competitor}: ahí está el listón que tienes que superar.`,
          extra: { dominant_competitor: entry.competitor },
          snippetSource: "competitor"
        })
      });
    }
  } else if (runScore.competitor_gap_score >= 50 && totalCompetitorMentions > 0) {
    const impact: "high" | "medium" = runScore.competitor_gap_score >= 70 ? "high" : "medium";
    const effort: "high" | "medium" = competitorNoBrand.length >= 3 ? "high" : "medium";
    candidates.push({
      title: "Recorta la distancia con tus competidores",
      description: "Tus competidores aparecen en respuestas donde tú no. Refuerza el contenido de las consultas donde más se repite esa ausencia.",
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
        whyThisMatters: "Cuando la IA responde con tus competidores y no contigo, la decisión se toma sin que llegues a estar en la lista.",
        firstStep: "Elige la consulta con más peso comercial de la lista y publica una página que la responda de forma directa.",
        snippetSource: "competitor"
      })
    });
  }

  // RECS-2B / N1 (prominence gap): the brand IS mentioned, but a specific
  // named competitor consistently ranks ahead of it. Independent of the
  // close_competitor_gap block above — that one only fires when the brand is
  // ABSENT, this one only when it's present but overshadowed — so a prompt
  // can never generate both cards.
  const prominenceGaps = computeProminenceGap(promptResults, input.competitors);
  for (const entry of prominenceGaps) {
    const impact: "high" | "medium" = entry.prompts.length >= 3 ? "high" : "medium";
    candidates.push({
      title: `Adelanta a ${entry.competitor}: sales después en ${entry.prompts.length} respuestas`,
      description: `Ya te mencionan, pero la IA nombra antes a ${entry.competitor}. Aparecer primero pesa mucho más que aparecer.`,
      rule_id: "rule_prominence_001",
      recommendation_type: "increase_brand_prominence",
      dedupeKey: `increase_brand_prominence:${entry.competitor.trim().toLowerCase()}`,
      impact,
      effort: "medium",
      confidence: runScore.confidence,
      source_type: "rule",
      affectedCount: entry.prompts.length,
      severityScore: entry.prompts.length * 16 + confWeight(runScore.confidence) * 3,
      evidence_json: buildEvidenceJson({
        ruleId: "rule_prominence_001",
        scoreDetails,
        runScore,
        affected: entry.prompts,
        assumptions: [
          `${entry.competitor} aparece con mayor prominencia que tu marca en ${entry.prompts.length} respuestas donde ambos se mencionan.`
        ],
        whyThisMatters: `Quien lee la respuesta se queda con el primer nombre. Estar detrás de ${entry.competitor} te deja fuera de la decisión aunque aparezcas.`,
        firstStep: `Compara tu página con la de ${entry.competitor} en estas consultas: qué responde antes, con qué datos y en qué formato.`,
        extra: { dominant_competitor: entry.competitor },
        snippetSource: "brand"
      })
    });
  }

  // RECS-4A / N6 (emerging competitors): a real brand the AI surfaces
  // recurringly that isn't in the project's tracked competitor list.
  // Informational/setup suggestion, not a content gap — kept at low
  // severity so it never crowds out an actual gap-fix card.
  const emergingCompetitors = computeEmergingCompetitors(promptResults, input.competitors, input.project.brand);
  for (const entry of emergingCompetitors) {
    candidates.push({
      title: `Añade a ${entry.competitor} como competidor`,
      description: `La IA la nombra en ${entry.prompts.length} respuestas de tu categoría y no la estás siguiendo. Añádela y sabrás cuánto terreno te quita.`,
      rule_id: "rule_emerging_competitor_001",
      recommendation_type: "track_emerging_competitor",
      dedupeKey: `track_emerging_competitor:${entry.competitor.trim().toLowerCase()}`,
      impact: "low",
      effort: "low",
      confidence: runScore.confidence,
      source_type: "rule",
      affectedCount: entry.prompts.length,
      severityScore: entry.prompts.length * 8 + confWeight(runScore.confidence) * 2,
      evidence_json: buildEvidenceJson({
        ruleId: "rule_emerging_competitor_001",
        scoreDetails,
        runScore,
        affected: entry.prompts,
        assumptions: [
          `${entry.competitor} aparece mencionada por la IA en ${entry.prompts.length} respuestas sin estar trackeada como competidor.`
        ],
        whyThisMatters: `Si la IA ya la trata como alternativa a ti, te interesa medirla: hoy no aparece en ninguna de tus comparativas de competencia.`,
        firstStep: `Añade ${entry.competitor} en la pestaña Competidores. El próximo escaneo ya la medirá.`,
        extra: { emerging_competitor: entry.competitor },
        snippetSource: "none"
      })
    });
  }

  if (comparativePrompts.length >= 2) {
    candidates.push({
      title: `Publica una comparativa: ${comparativePrompts.length} consultas la piden`,
      description: "Son consultas de comparación donde salen tus competidores y tú no. La IA cita comparativas que incluyen a la competencia con honestidad.",
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
        whyThisMatters: "Quien compara está a punto de decidir. Si la IA no encuentra tu comparativa, usa la de otro.",
        firstStep: "Monta una tabla comparativa con criterios claros e incluye a tus competidores. Sin tabla, la IA no puede extraerla.",
        snippetSource: "competitor"
      })
    });
  }

  if (runScore.visibility_score < 60 && runScore.citation_score < 50 && informationalPrompts.length > 0) {
    candidates.push({
      title: "Añade un bloque de preguntas y respuestas",
      description: "Tus consultas informativas rinden por debajo. Un bloque de preguntas con respuestas de dos frases es lo que la IA extrae mejor.",
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
        whyThisMatters: "La IA construye sus respuestas con fragmentos. Cuanto más limpio sea el fragmento, más fácil es que use el tuyo.",
        firstStep: "Coge las tres preguntas de la lista y respóndelas en tu web, cada una en dos frases, bajo un titular con la pregunta literal."
      })
    });
  }

  if (candidates.length < 3 && runScore.visibility_score < 50 && totalCompetitorMentions === 0) {
    candidates.push({
      title: "Explica mejor a qué se dedica tu marca",
      description: "La IA apenas te nombra, y tampoco a tus competidores: probablemente no tiene claro en qué categoría situarte.",
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
        whyThisMatters: "Si la IA no sabe en qué categoría estás, no te propone como opción aunque tu web esté bien hecha.",
        firstStep: "Revisa tu página de inicio: en la primera frase debe decir qué haces, para quién y en qué mercado."
      })
    });
  }

  // Gap 8 (source gap): the third-party sources the AI already grounds on in
  // prompts where the brand's domain is absent — the pages worth getting into
  // so the model starts citing the brand too.
  //
  // RECS-REDESIGN-1 splits this by SOURCE FAMILY (comparator / community /
  // media) instead of emitting one "pursue_citation_sources" card lumping all
  // of them together. The old single card was true but unusable: getting listed
  // on a price comparator, answering a Reddit thread and pitching a newspaper
  // are three different jobs, for three different people, on three different
  // timelines — merged into one card they collapse into vague "haz PR digital".
  // Each family now gets its own card, its own first step and its own effort
  // rating, using the classifier that already backs the Páginas citadas screen
  // (lib/citations/source-type.ts) — no new data, no crawler.
  const citationSources = computeCitationSourceGap(promptResults, input.project.domain);
  if (citationSources.length > 0) {
    const byFamily = new Map<SourceType, CitationSource[]>();
    for (const source of citationSources) {
      const family = classifySourceType(source.domain);
      const bucket = byFamily.get(family) ?? [];
      bucket.push(source);
      byFamily.set(family, bucket);
    }

    // "encyclopedia" (Wikipedia and friends) is deliberately NOT actionable
    // here: you cannot pitch yourself onto Wikipedia, and telling a user to try
    // is advice that gets their edit reverted. Those sources stay out of the
    // recommendation set entirely rather than becoming a card we know is bad
    // advice.
    const FAMILY_COPY: Partial<
      Record<
        SourceType,
        {
          type: string;
          ruleId: string;
          title: (n: number) => string;
          description: (domains: string[]) => string;
          why: string;
          firstStep: (top: CitationExamplePage & { domain: string } | null, domains: string[]) => string;
          effort: "low" | "medium" | "high";
        }
      >
    > = {
      comparator: {
        type: "pursue_comparator_sources",
        ruleId: "rule_source_gap_comparator_001",
        title: (n) => (n === 1 ? "Entra en el comparador que cita la IA" : `Entra en los ${n} comparadores que cita la IA`),
        description: (domains) =>
          `La IA se apoya en ${domains.slice(0, 3).join(", ")} para responder, y tu marca no está en esas fichas. Aparecer en un comparador te mete en todas las consultas que lo citan.`,
        why: "Los comparadores son la fuente más citada en consultas de decisión. Estar fuera de la tabla equivale a no existir en ellas.",
        firstStep: (top, domains) =>
          top
            ? `Escribe a ${top.domain} para que te incluyan en "${top.title}". Es la página concreta que la IA está citando.`
            : `Escribe a ${domains[0]} pidiendo que te incluyan en su comparativa, con tus datos verificables.`,
        effort: "medium"
      },
      community: {
        type: "pursue_community_sources",
        ruleId: "rule_source_gap_community_001",
        title: (n) => (n === 1 ? "Participa en la comunidad que cita la IA" : `Participa en las ${n} comunidades que cita la IA`),
        description: (domains) =>
          `La IA cita conversaciones de ${domains.slice(0, 3).join(", ")} donde tu marca no sale. Una respuesta útil y honesta ahí acaba en la respuesta de la IA.`,
        why: "Los foros pesan mucho en las respuestas de IA porque se leen como opinión real de usuarios, no como marketing.",
        firstStep: (top, domains) =>
          top
            ? `Entra en "${top.title}" (${top.domain}) y responde aportando datos concretos, sin tono comercial.`
            : `Busca el hilo más citado en ${domains[0]} y responde aportando datos concretos, sin tono comercial.`,
        effort: "low"
      },
      media: {
        type: "pursue_media_sources",
        ruleId: "rule_source_gap_media_001",
        title: (n) => (n === 1 ? "Consigue cobertura en el medio que cita la IA" : `Consigue cobertura en ${n} medios que cita la IA`),
        description: (domains) =>
          `La IA se apoya en ${domains.slice(0, 3).join(", ")} y ninguno te menciona. Una sola pieza en estos medios entra en varias respuestas a la vez.`,
        why: "Un medio citado por la IA reparte autoridad a todas las marcas que nombra. Hoy ese reparto se hace sin ti.",
        firstStep: (top, domains) =>
          top
            ? `Ofrece a ${top.domain} un dato propio o un caso real para una pieza como "${top.title}".`
            : `Ofrece a ${domains[0]} un dato propio o un caso real que puedan publicar.`,
        effort: "high"
      },
      unknown: {
        type: "pursue_citation_sources",
        ruleId: "rule_source_gap_001",
        title: (n) => (n === 1 ? "Consigue que la web que cita la IA te mencione" : `Consigue que ${n} webs que cita la IA te mencionen`),
        description: (domains) =>
          `La IA se apoya en ${domains.slice(0, 3).join(", ")} en consultas donde tu dominio no aparece. Trabaja esas webs para que empiecen a citarte.`,
        why: "Entrar en las webs que los motores ya citan es la vía más corta para que empiecen a citarte a ti.",
        firstStep: (top, domains) =>
          top
            ? `Revisa "${top.title}" (${top.domain}) y contacta con quien la publica ofreciendo información útil.`
            : `Revisa ${domains[0]} y contacta con quien la publica ofreciendo información útil.`,
        effort: "high"
      }
    };

    for (const [family, sources] of byFamily) {
      const copy = FAMILY_COPY[family];
      if (!copy) continue; // encyclopedia — intentionally not actionable

      const affectedIds = new Set<string>();
      for (const source of sources) {
        for (const p of source.prompts) affectedIds.add(p.id);
      }
      const affected = promptResults.filter((p) => affectedIds.has(p.id));
      const sourceDomains = sources.map((s) => s.domain);
      // RECS-2B / N2: example pages (title + url) for the sources that have
      // one, so the action can target a specific article, not a bare domain.
      const citationPages = sources
        .filter((s): s is CitationSource & { examplePage: CitationExamplePage } => s.examplePage !== null)
        .map((s) => ({ domain: s.domain, title: s.examplePage.title, url: s.examplePage.url }));
      const topPage = citationPages[0] ?? null;
      const impact: "high" | "medium" = affected.length >= 4 ? "high" : "medium";

      candidates.push({
        title: copy.title(sources.length),
        description: copy.description(sourceDomains),
        rule_id: copy.ruleId,
        recommendation_type: copy.type,
        dedupeKey: copy.type,
        impact,
        effort: copy.effort,
        confidence: runScore.confidence,
        source_type: "rule",
        affectedCount: affected.length,
        severityScore: affected.length * 12 + confWeight(runScore.confidence) * 3,
        evidence_json: buildEvidenceJson({
          ruleId: copy.ruleId,
          scoreDetails,
          runScore,
          affected,
          assumptions: [
            `${sourceDomains.slice(0, 3).join(", ")} aparecen citadas de forma recurrente en consultas donde tu dominio no se cita.`
          ],
          whyThisMatters: copy.why,
          firstStep: copy.firstStep(topPage, sourceDomains),
          extra: { source_domains: sourceDomains, citation_pages: citationPages, source_family: family },
          snippetSource: "none"
        })
      });
    }
  }

  // Gap 9 (negative narrative): one card summarising all prompts where the AI
  // expresses negative or mixed sentiment about the brand. Names the actual
  // recurring theme(s) from sentiment_drivers when available (debilidad 3
  // fix) instead of a fully generic "percepción negativa" — the driver
  // extraction already ran and was previously unused by the engine.
  const negativePrompts = computeNegativeNarrative(promptResults);
  if (negativePrompts.length >= 1) {
    const impact: "high" | "medium" = negativePrompts.length >= 3 ? "high" : "medium";
    const drivers = topSentimentDrivers(negativePrompts);
    const themeSuffix = drivers.length > 0 ? ` sobre ${drivers.join(", ")}` : "";
    candidates.push({
      title:
        drivers.length > 0
          ? `Responde a lo que la IA dice sobre ${drivers[0]}`
          : `Responde a la imagen negativa que da la IA de ti`,
      description:
        drivers.length > 0
          ? `La IA habla de tu marca en tono negativo o dudoso en ${negativePrompts.length} ${negativePrompts.length === 1 ? "respuesta" : "respuestas"}, y vuelve siempre a lo mismo:${themeSuffix.replace(" sobre", "")}.`
          : `La IA habla de tu marca en tono negativo o dudoso en ${negativePrompts.length} ${negativePrompts.length === 1 ? "respuesta" : "respuestas"}.`,
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
        assumptions: [
          drivers.length > 0
            ? `La IA expresa sentimiento negativo o mixto sobre la marca en ${negativePrompts.length} respuestas, recurrentemente en torno a: ${drivers.join(", ")}.`
            : `La IA expresa sentimiento negativo o mixto sobre la marca en ${negativePrompts.length} respuestas.`
        ],
        whyThisMatters:
          "La IA repite lo que encuentra escrito. Si nadie ha publicado tu versión con datos, la única que existe es la del descontento.",
        firstStep:
          drivers.length > 0
            ? `Publica una página que explique tu posición sobre ${drivers[0]} con datos concretos y verificables.`
            : "Publica una página que responda con datos concretos a la objeción que aparece en estas respuestas.",
        snippetSource: "brand",
        extra: { sentiment_drivers: drivers }
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
    // Collect the actual stale signals (phrase/year context from raw text) so
    // the UI can show WHY each prompt was flagged instead of unrelated brand quotes.
    const staleSignals = stalePrompts
      .map((p) => extractStaleContext(p.raw_response_text ?? "", STALE_YEAR_CUTOFF))
      .filter((s): s is string => s !== null)
      .slice(0, 4);
    candidates.push({
      title: "Actualiza los datos que la IA da por viejos",
      description: `La IA cuenta cosas desactualizadas sobre tu marca en ${stalePrompts.length} ${stalePrompts.length === 1 ? "respuesta" : "respuestas"}. Publica la versión actual con fecha visible.`,
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
          "Un dato viejo en la respuesta hace dudar de todo lo demás, y la IA prefiere citar páginas con fecha reciente.",
        firstStep:
          "Actualiza la página donde vive ese dato y deja visible la fecha de actualización. Es de lo más rápido que puedes hacer.",
        snippetSource: "brand",
        extra: { stale_signals: staleSignals }
      })
    });
  }

  // RECS-2B / N4 ("amplify what works"): only worth surfacing when there's
  // still an open gap elsewhere to apply the pattern to — on an
  // already-perfect run "replicate this" has nothing left to replicate
  // toward. severityScore is deliberately low so this never crowds out a
  // real gap-fix card, only fills the backlog when there's room.
  const winningPrompts = computeWinningPattern(promptResults);
  const hasOpenGap = brandMissing.length > 0 || promptResults.some((p) => p.brand_mentioned && !p.citation_found);
  if (winningPrompts.length >= 2 && hasOpenGap) {
    candidates.push({
      title: `Repite lo que ya te funciona en ${winningPrompts.length} consultas`,
      description: `En estas consultas la IA te menciona y te cita. Mira qué tienen en común esas páginas y aplica la misma fórmula donde todavía no apareces.`,
      rule_id: "rule_amplify_positive_001",
      recommendation_type: "amplify_positive_pattern",
      dedupeKey: "amplify_positive_pattern",
      impact: "medium",
      effort: "low",
      confidence: runScore.confidence,
      source_type: "rule",
      affectedCount: winningPrompts.length,
      severityScore: winningPrompts.length * 6 + confWeight(runScore.confidence) * 2,
      evidence_json: buildEvidenceJson({
        ruleId: "rule_amplify_positive_001",
        scoreDetails,
        runScore,
        affected: winningPrompts,
        assumptions: [`La IA te menciona y cita, sin narrativa negativa, en ${winningPrompts.length} consultas.`],
        whyThisMatters:
          "Ya tienes la receta probada en tu propio dominio. Copiarla es más barato y más seguro que inventar un formato nuevo.",
        firstStep:
          "Abre las páginas que la IA cita en estas consultas y anota el patrón: formato, longitud y qué dato concreto usan.",
        snippetSource: "brand"
      })
    });
  }

  const byKey = new Map<string, CandidateRec>();
  for (const rec of candidates) {
    const existing = byKey.get(rec.dedupeKey);
    if (!existing || rec.severityScore > existing.severityScore) byKey.set(rec.dedupeKey, rec);
  }

  // No count cap (RECS-CAP-REMOVE, founder-approved 2026-07-04): recommendations
  // are this product's core value, so a real, deduplicated gap must never be
  // silently discarded just because more candidates existed this run than an
  // arbitrary number. The old .slice(0, 10) here was also a live "fake win" bug:
  // lib/scan/executor.ts derives currentDedupeKeys from exactly this array to
  // detect resolved gaps (RECS-3) — any real gap crowded out of a fixed-size cap
  // was indistinguishable from a genuinely-fixed one, and got marked 'resolved'
  // even though nothing was actually fixed. Sort order is kept (still drives
  // priority_rank for display); only the truncation is gone.
  const impactWeight = (impact: "low" | "medium" | "high") => (impact === "high" ? 3 : impact === "medium" ? 2 : 1);
  const deduped = Array.from(byKey.values()).sort((a, b) => {
    const aScore = a.severityScore + impactWeight(a.impact) * 10 + confWeight(a.confidence) * 5 + a.affectedCount;
    const bScore = b.severityScore + impactWeight(b.impact) * 10 + confWeight(b.confidence) * 5 + b.affectedCount;
    return bScore - aScore;
  });

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
    evidence_json: rec.evidence_json,
    dedupe_key: rec.dedupeKey
  }));
}
