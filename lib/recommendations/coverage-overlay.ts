import { NOT_COVERED_NOTE, COULD_NOT_VERIFY_NOTE, type DomainCoverageTopic } from "@/lib/recommendations/domain-coverage";

/**
 * RECS-COVERAGE-OVERLAY-1: read-time enrichment of already-persisted
 * `add_citation_block` recommendation cards with already-persisted domain-
 * coverage data, joined by `promptId`. This is deliberately NOT a
 * recommendation-engine input: recommendations are generated the instant a
 * scan run completes (lib/scan/executor.ts), while coverage is generated
 * later, only if the user manually triggers it — so at rule-evaluation time
 * coverage for that scan can never exist yet. Regenerating recommendations to
 * consume it would mean touching RECS-3's dedup/history machinery, which is
 * explicitly out of scope here. This module has no side effects and performs
 * no I/O; all data comes in as plain arguments.
 *
 * Join path: `add_citation_block` recommendations don't carry
 * project_prompts.id directly — their evidence is anchored to a
 * scan_prompt_results row (see recommendation-engine.ts's
 * `dedupeKey: add_citation_block:${result.id}` / evidence_json's
 * affected_prompt_details[0].id). The caller resolves that
 * scan_prompt_results.id -> project_prompts.id mapping (a simple, already-
 * project-scoped query) and passes it in as `resultIdToPromptId`.
 */

export type CoverageOverlayState = "confirmed_surfacing_gap" | "possible_content_gap" | "none";

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

const ADD_CITATION_BLOCK_TYPE = "add_citation_block";

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
    if (rec.recommendationType !== ADD_CITATION_BLOCK_TYPE) continue;
    if (!rec.resultId) continue;

    const promptId = params.resultIdToPromptId.get(rec.resultId);
    if (!promptId) continue;

    const topic = topicByPromptId.get(promptId);
    if (!topic) continue;

    if (topic.found) {
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
