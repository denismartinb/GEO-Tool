import { NOT_COVERED_NOTE, COULD_NOT_VERIFY_NOTE, type DomainCoverageTopic } from "@/lib/recommendations/domain-coverage";

/**
 * RECS-COVERAGE-OVERLAY-1 (extended in AUDIT-RECS-JOIN-1 Fase B): read-time
 * enrichment of already-persisted recommendation cards with already-persisted
 * domain-coverage data, joined by `promptId`. This is deliberately NOT a
 * recommendation-engine input: recommendations are generated the instant a
 * scan run completes (lib/scan/executor.ts), while coverage is generated
 * later, only if the user manually triggers it — so at rule-evaluation time
 * coverage for that scan can never exist yet. Regenerating recommendations to
 * consume it would mean touching RECS-3's dedup/history machinery, which is
 * explicitly out of scope here. This module has no side effects and performs
 * no I/O; all data comes in as plain arguments.
 *
 * Join path: a supported recommendation doesn't carry project_prompts.id
 * directly — its evidence is anchored to a scan_prompt_results row (see
 * recommendation-engine.ts's `dedupeKey: <type>:${result.id}` /
 * evidence_json's affected_prompt_details[0].id, identical for every
 * per-prompt rule). The caller resolves that scan_prompt_results.id ->
 * project_prompts.id mapping (a simple, already-project-scoped query) and
 * passes it in as `resultIdToPromptId`.
 *
 * Fase B added `increase_brand_visibility` alongside `add_citation_block`.
 * Both anchor by the same promptId, so the join is unchanged — what differs
 * is what the overlay MEANS: `add_citation_block` fires when the brand IS
 * mentioned but not cited (evidence_json.snippetSource: "brand"), while
 * `increase_brand_visibility` fires when the brand is NOT mentioned at all.
 * A page found on the client's own domain therefore explains a different
 * gap in each case ("it's not being cited as a source" vs. "it's not
 * showing up in the answer at all"), so the copy is per-type — see
 * `overlayCopy` below. Deliberately NOT extended to every per-prompt type:
 * `create_faq_section`/`strengthen_brand_entity_clarity` are run-wide, not
 * anchored to one prompt, so there is no single topic to join against.
 */

/**
 * `home_only` (AUDIT-TRUTH-1, GS-03, log §276): the only own page Google
 * returned for the topic is the site's home. A home rarely answers one
 * specific question, so it does not certify coverage: the card keeps the
 * "create" advice and says that only the home was found, instead of telling
 * the user "no crees una página nueva" and linking the home.
 */
export type CoverageOverlayState = "confirmed_surfacing_gap" | "possible_content_gap" | "home_only" | "none";

export type CoverageOverlayEntry = {
  state: CoverageOverlayState;
  /** The one verified own-domain page for this topic, if any (state === "confirmed_surfacing_gap"). */
  verifiedPage: { url: string; title: string } | null;
  /**
   * Confidence bumped one level from the recommendation's own confidence,
   * only for a confirmed surfacing gap (the assumption became verified
   * evidence). Null when the state doesn't warrant a change.
   */
  confidenceOverride: "low" | "medium" | "high" | null;
};

/**
 * Recommendation types this overlay can enrich. A type not in this set gets
 * no entry, ever — same fail-closed default as `deliverableForType`'s
 * fallback: an unclassified case makes no claim rather than a wrong one.
 */
export const COVERAGE_OVERLAY_TYPES: ReadonlySet<string> = new Set([
  "add_citation_block",
  "increase_brand_visibility"
]);

/** True for "https://acme.es", "https://acme.es/" and "https://www.acme.es/?x=1". */
export function isSiteRoot(url: string): boolean {
  try {
    const path = new URL(url).pathname.replace(/\/+$/, "");
    return path === "" || /^\/index\.[a-z]+$/i.test(path);
  } catch {
    return false;
  }
}

function bumpConfidence(confidence: "low" | "medium" | "high"): "low" | "medium" | "high" {
  if (confidence === "low") return "medium";
  if (confidence === "medium") return "high";
  return "high";
}

/**
 * Computes a coverage overlay for each `add_citation_block` recommendation
 * that has a matching coverage topic for the CURRENT scan. Recommendations of
 * any other type, or without a match, get no entry in the returned map — the
 * caller should treat a missing key as "render unchanged" (invariant 3 of the
 * approved design: missing/partial coverage never breaks or changes existing
 * behavior).
 *
 * Only a topic explicitly confirmed as not-covered (its note is the fixed
 * NOT_COVERED_NOTE) is reframed as a possible content gap; a topic that could
 * not be verified (transient Gemini failure/budget cutoff, COULD_NOT_VERIFY_NOTE)
 * carries no signal either way and is deliberately left out of the map.
 */
export function computeCoverageOverlay(params: {
  recommendations: Array<{
    id: string;
    recommendationType: string;
    resultId: string | null;
    confidence: "low" | "medium" | "high";
  }>;
  resultIdToPromptId: Map<string, string>;
  coverageTopics: DomainCoverageTopic[];
}): Map<string, CoverageOverlayEntry> {
  const overlay = new Map<string, CoverageOverlayEntry>();
  if (params.coverageTopics.length === 0) return overlay;

  const topicByPromptId = new Map(params.coverageTopics.map((t) => [t.promptId, t]));

  for (const rec of params.recommendations) {
    if (!COVERAGE_OVERLAY_TYPES.has(rec.recommendationType)) continue;
    if (!rec.resultId) continue;

    const promptId = params.resultIdToPromptId.get(rec.resultId);
    if (!promptId) continue;

    const topic = topicByPromptId.get(promptId);
    if (!topic) continue;

    if (topic.found && topic.pages.length > 0 && topic.pages.every((p) => isSiteRoot(p.url))) {
      overlay.set(rec.id, { state: "home_only", verifiedPage: topic.pages[0], confidenceOverride: null });
    } else if (topic.found) {
      overlay.set(rec.id, {
        state: "confirmed_surfacing_gap",
        verifiedPage: topic.pages[0] ?? null,
        confidenceOverride: bumpConfidence(rec.confidence)
      });
    } else if (topic.note === NOT_COVERED_NOTE) {
      overlay.set(rec.id, { state: "possible_content_gap", verifiedPage: null, confidenceOverride: null });
    } else if (topic.note === COULD_NOT_VERIFY_NOTE) {
      // Inconclusive — no signal either way, no overlay entry.
      continue;
    }
  }

  return overlay;
}


/**
 * Plain-language explanation shown on the card once an overlay state is
 * known. `add_citation_block`'s original copy is preserved verbatim (its
 * card fires on "mentioned but not cited", so "the AI isn't citing it as a
 * source" is exactly true). `increase_brand_visibility`'s card fires on "not
 * mentioned at all", so the same sentence would be false — the copy for it
 * talks about not showing up in the answer, and its `whatToDo` for the
 * not-found case reuses `rule_visibility_001`'s own first_step verbatim
 * (recommendation-engine.ts) rather than inventing new advice.
 *
 * Only called for types in `COVERAGE_OVERLAY_TYPES`, so the fallback branch
 * is unreachable in practice — kept anyway so a future type added to the set
 * without updating this function degrades to a generic, still-true
 * sentence instead of throwing.
 */
export type OverlayCopy = {
  whatWeFound: string;
  whatToDo: string;
  /**
   * Replaces the card's own `first_step` (GS-03, log §276). The engine writes
   * that step before coverage exists, so for `increase_brand_visibility` it
   * always says "Publica una página". Once coverage found a page, the card,
   * its detail and the report must all say the same thing: improve that
   * page. Every consumer reads the step from here when an overlay exists.
   */
  firstStep: string;
};

export function overlayCopy(recommendationType: string, state: CoverageOverlayState): OverlayCopy | null {
  if (state === "confirmed_surfacing_gap") {
    if (recommendationType === "increase_brand_visibility") {
      return {
        whatWeFound:
          "Buscamos en Google dentro de tu dominio y encontramos contenido tuyo sobre esta consulta. El problema no es que te falte contenido, sino que esa página no está apareciendo en la respuesta de la IA.",
        whatToDo:
          "no crees una página nueva. Refuerza la que ya tienes: responde la pregunta en las dos primeras frases, con el titular en forma de pregunta, para que sea más fácil de extraer.",
        firstStep:
          "Refuerza tu página sobre este tema: responde la pregunta en las dos primeras frases, con el titular en forma de pregunta."
      };
    }
    if (recommendationType === "add_citation_block") {
      return {
        whatWeFound:
          "Buscamos en Google dentro de tu dominio y encontramos contenido tuyo sobre esta consulta. El problema no es que te falte contenido, sino que la IA no lo está citando como fuente.",
        whatToDo:
          "no crees una página nueva. Refuerza la que ya tienes para que sea fácil de citar — añade un bloque con datos concretos (cifras, fechas, hechos verificables) que la IA pueda referenciar.",
        firstStep: "Añade a tu página sobre este tema un dato concreto con fecha y fuente (precio, cifra, plazo)."
      };
    }
    return {
      whatWeFound: "Buscamos en Google dentro de tu dominio y encontramos contenido tuyo sobre esta consulta.",
      whatToDo: "revisa esa página y refuérzala en vez de crear una nueva.",
      firstStep: "Revisa tu página sobre este tema y refuérzala en vez de crear una nueva."
    };
  }

  if (state === "possible_content_gap") {
    if (recommendationType === "increase_brand_visibility") {
      return {
        whatWeFound:
          "Buscamos en Google dentro de tu dominio y no apareció ninguna página tuya sobre esta consulta.",
        whatToDo: "publica una página que responda esta pregunta en las dos primeras frases, con el titular en forma de pregunta.",
        firstStep:
          "Publica una página que responda esta pregunta en las dos primeras frases, con el titular en forma de pregunta."
      };
    }
    if (recommendationType === "add_citation_block") {
      return {
        whatWeFound:
          "Buscamos en Google dentro de tu dominio y no apareció ninguna página tuya sobre esta consulta. Puede que el problema no sea de citación, sino que todavía no has publicado contenido sobre esto.",
        whatToDo:
          "antes de intentar que te citen, plantéate crear una página que responda a esta consulta. Si crees que ya la tienes, puede que Google aún no la haya indexado — revísalo.",
        firstStep:
          "Publica una página que responda esta consulta e incluye en ella un dato concreto con fecha y fuente (precio, cifra, plazo)."
      };
    }
    return {
      whatWeFound: "Buscamos en Google dentro de tu dominio y no apareció ninguna página tuya sobre esta consulta.",
      whatToDo: "plantéate crear una página que responda a esta consulta.",
      firstStep: "Publica una página que responda a esta consulta."
    };
  }

  if (state === "home_only") {
    return {
      whatWeFound:
        "Buscamos en Google dentro de tu dominio y sólo apareció tu portada. Una portada rara vez responde a una pregunta concreta, así que no la damos por cubierta.",
      whatToDo:
        "publica una página propia que responda esta pregunta en las dos primeras frases, con el titular en forma de pregunta. Si ya tienes una, revisa que Google la tenga indexada.",
      firstStep:
        recommendationType === "add_citation_block"
          ? "Publica una página que responda esta consulta e incluye en ella un dato concreto con fecha y fuente (precio, cifra, plazo)."
          : "Publica una página que responda esta pregunta en las dos primeras frases, con el titular en forma de pregunta."
    };
  }

  return null;
}
