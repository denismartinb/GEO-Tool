/**
 * Confianza de una recomendación, derivada de su evidencia.
 *
 * Una tarjeta mezclaba tres preguntas distintas bajo la palabra «Confianza»,
 * y las tres salían de la misma etiqueta heredada del escaneo:
 *
 *  1. ¿Es real el hallazgo? — la certeza del DIAGNÓSTICO. Depende del tamaño y
 *     la limpieza de la muestra del run (`evidence_json.run_confidence`). Una
 *     marca ausente de 6 respuestas es un hecho observado, con muestra alta.
 *  2. ¿Funcionará esta acción? — la CONFIANZA de la recomendación. Es esta
 *     función. «Publica una página con la pregunta en el titular» es una
 *     hipótesis de contenido: ninguna respuesta del escaneo demuestra que
 *     cambie lo que dice la IA, así que no puede heredar el «Alta» del run.
 *  3. ¿Cuánto movería? — el IMPACTO estimado (techo contrafactual, ADR 0017),
 *     que no es ninguna de las dos anteriores.
 *
 * La confianza de la acción nunca supera a la certeza del diagnóstico (con una
 * muestra pobre ninguna acción es fiable), y además tiene un TECHO que fija la
 * evidencia que sostiene la causa:
 *
 *  - `direct`: la propia respuesta enseña la causa (un competidor nombrado por
 *    delante, un fragmento negativo, un dato desactualizado citado). Sin techo.
 *  - `contextual`: se observan fuentes u otras marcas, pero nada une eso con el
 *    efecto de la acción. Techo «media».
 *  - `none`: sólo hay ausencia (la marca no sale) o un argumento de formato.
 *    Techo «baja».
 *
 * Es puro y sin I/O: lo usa el motor al generar y `page.tsx` al leer filas
 * guardadas antes de esta fase, para que ambas den la misma respuesta.
 */

export type Confidence = "low" | "medium" | "high";

export type EvidenceCeiling = "direct" | "contextual" | "none";

/** `observation`: la tarjeta describe lo visto. `content_hypothesis`: propone un cambio cuyo efecto no está demostrado. */
export type EvidenceKind = "observation" | "content_hypothesis";

const ORDER: Confidence[] = ["low", "medium", "high"];

export function minConfidence(a: Confidence, b: Confidence): Confidence {
  return ORDER[Math.min(ORDER.indexOf(a), ORDER.indexOf(b))];
}

/**
 * Techo base por tipo de recomendación: lo máximo que su regla puede sostener
 * cuando la evidencia de la tarjeta es la mejor posible. Un tipo sin entrada se
 * trata como `contextual` — sin clasificar no se afirma nada, misma dirección
 * de fallo que `deliverableForType`.
 */
const BASE_CEILING: Record<string, EvidenceCeiling> = {
  // El hallazgo y su causa son lo mismo: el competidor aparece en la respuesta.
  close_competitor_gap: "direct",
  increase_brand_prominence: "direct",
  add_comparison_content: "direct",
  address_negative_narrative: "direct",
  update_stale_content: "direct",
  track_emerging_competitor: "direct",
  // Se observan fuentes y marcas, pero que entrar en ellas cambie la respuesta
  // depende de un tercero y no está medido.
  pursue_citation_sources: "contextual",
  pursue_comparator_sources: "contextual",
  pursue_community_sources: "contextual",
  pursue_media_sources: "contextual",
  add_citation_block: "contextual",
  amplify_positive_pattern: "contextual",
  increase_brand_visibility: "contextual",
  // Sólo ausencia o formato: nada de la respuesta apunta a la causa.
  create_faq_section: "none",
  strengthen_brand_entity_clarity: "none"
};

/** Tipos cuya propuesta es una hipótesis de contenido, no la lectura de un hecho. */
const HYPOTHESIS_TYPES = new Set([
  "increase_brand_visibility",
  "create_faq_section",
  "strengthen_brand_entity_clarity",
  "add_citation_block"
]);

export function evidenceKindForType(type: string): EvidenceKind {
  return HYPOTHESIS_TYPES.has(type) ? "content_hypothesis" : "observation";
}

type EvidenceLike = {
  evidence_snippets?: unknown;
  mentioned_competitors?: unknown;
  citation_domains?: unknown;
  other_brands?: unknown;
  citation_pages?: unknown;
  stale_signals?: unknown;
};

function count(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
}

/**
 * Evidencia observable en la propia tarjeta. Degrada el techo base: un tipo
 * `direct` sin ningún fragmento ni competidor nombrado deja de serlo (no hay
 * nada que enseñar), y uno `contextual` sin fuentes ni marcas observadas cae a
 * `none`.
 */
export function evidenceCeilingFor(type: string, evidence: EvidenceLike | null | undefined): EvidenceCeiling {
  const base = BASE_CEILING[type] ?? "contextual";
  const ev = evidence ?? {};
  const hasQuote = count(ev.evidence_snippets) > 0 || count(ev.stale_signals) > 0;
  const hasNamedCompetitor = count(ev.mentioned_competitors) > 0;
  const hasContext = count(ev.citation_domains) > 0 || count(ev.other_brands) > 0 || count(ev.citation_pages) > 0;

  if (base === "direct") {
    if (hasQuote || hasNamedCompetitor) return "direct";
    return hasContext ? "contextual" : "none";
  }
  if (base === "contextual") {
    return hasQuote || hasContext || hasNamedCompetitor ? "contextual" : "none";
  }
  return "none";
}

const CEILING_CONFIDENCE: Record<EvidenceCeiling, Confidence> = {
  direct: "high",
  contextual: "medium",
  none: "low"
};

export type DerivedConfidence = {
  confidence: Confidence;
  /** Frase corta, en castellano, para mostrar junto a la confianza. */
  reason: string;
};

const REASONS: Record<EvidenceCeiling, string> = {
  direct: "La propia respuesta muestra la causa.",
  contextual:
    "Se ven fuentes u otras marcas en las respuestas, pero ninguna prueba que esta acción cambie lo que dice la IA.",
  none: "Sólo se observa que tu marca no aparece: es una hipótesis de contenido sin fragmento que la respalde."
};

export function deriveRecommendationConfidence(opts: {
  /** Certeza del diagnóstico: la confianza de muestra del run. */
  diagnosisCertainty: Confidence;
  type: string;
  evidence: EvidenceLike | null | undefined;
}): DerivedConfidence {
  const ceiling = evidenceCeilingFor(opts.type, opts.evidence);
  const confidence = minConfidence(opts.diagnosisCertainty, CEILING_CONFIDENCE[ceiling]);
  // La razón explica el techo; si lo que limita es la muestra del run, lo dice.
  const limitedBySample = ORDER.indexOf(opts.diagnosisCertainty) < ORDER.indexOf(CEILING_CONFIDENCE[ceiling]);
  return {
    confidence,
    reason: limitedBySample ? "La muestra del escaneo es pequeña para fiarse de esta acción." : REASONS[ceiling]
  };
}

export function isConfidence(value: unknown): value is Confidence {
  return value === "low" || value === "medium" || value === "high";
}

type StoredRecommendation = {
  confidence: string;
  recommendation_type: string;
  evidence_json?: (EvidenceLike & { run_confidence?: unknown; confidence_reason?: unknown; evidence_kind?: unknown }) | null;
};

/**
 * Rows written before this derivation carry the run's confidence as their own
 * (`confidence` = `run_confidence`), which is exactly the defect. This
 * re-derives it on read, from the evidence the row already stores, so an
 * old card and a new card of the same kind never disagree on screen.
 *
 * A row that already has `confidence_reason` was written by the new engine and
 * is returned untouched — the derivation is idempotent, but there is no reason
 * to re-run it, and the stored value is what the engine decided.
 */
export function calibrateStoredRecommendation<T extends StoredRecommendation>(rec: T): T {
  const ev = rec.evidence_json ?? {};
  if (typeof ev.confidence_reason === "string") return rec;
  const diagnosisCertainty: Confidence = isConfidence(ev.run_confidence)
    ? ev.run_confidence
    : isConfidence(rec.confidence)
      ? rec.confidence
      : "low";
  const derived = deriveRecommendationConfidence({
    diagnosisCertainty,
    type: rec.recommendation_type,
    evidence: ev
  });
  return {
    ...rec,
    confidence: derived.confidence,
    evidence_json: {
      ...ev,
      run_confidence: diagnosisCertainty,
      evidence_kind: evidenceKindForType(rec.recommendation_type),
      confidence_reason: derived.reason
    }
  };
}
