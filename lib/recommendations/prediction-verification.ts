import "server-only";

import { normalizeDomain } from "@/lib/domains/brand-domain";
import {
  getRecommendationPotentialKind,
  hasOwnDomainCitation,
  isGroundedRow,
  readExtractedJson
} from "@/lib/scoring/run-scoring";

/**
 * RECS-LOOP-1 Fase A — closes the loop docs/adr/0017 §5 promised and never
 * built: "a falsifiable prediction... the next scan verifies it".
 *
 * Deliberately NOT a score delta. geo-strategy and data-guardian independently
 * rejected that path (see the ADR this phase adds, extending 0017 §5): a
 * between-run composite/component delta is (a) usually refused by
 * resolveDelta/compareRuns (lib/scoring/score-reliability.ts) since two
 * consecutive runs rarely share composite_version/inputs_used/engine set, and
 * (b) unattributable even when it isn't — it moves with every prompt and
 * every other card that resolved in the same window, not just this one's.
 *
 * What this module checks instead is narrower and factual: did the SPECIFIC
 * mutation the potential-points estimate assumed (lib/scoring/run-scoring.ts,
 * getRecommendationPotentialKind) actually occur, on the SAME prompts this
 * card cited, in one specific later run? That is an observation over n rows,
 * not an inference over a population — no confidence band is computed or
 * needed, and a single verified prompt is a valid, complete answer to "did it
 * happen".
 *
 * That later run is `anchorRunId` — for a `resolved` row (Fase A) it's
 * `resolved_in_run_id`, the run the system itself detected as confirming the
 * gap gone; for a `dismissed` row (Fase B, lib/recommendations/dismissal-
 * recurrence.ts) it's the first completed run after the dismissal, since a
 * manual dismissal has no equivalent system-detected confirming event. Same
 * mechanism either way — this module never needs to know which case it is.
 */

export type VerificationRow = {
  provider?: string | null;
  brand_mentioned: boolean;
  citation_found: boolean;
  extracted_json: unknown;
};

export type PredictionVerdict = {
  kind: "presence" | "prominence" | "authority";
  fulfilledCount: number;
  totalCount: number;
};

export type RecommendationVerification = { status: "verified"; verdict: PredictionVerdict } | { status: "no_verdict" };

/**
 * One prompt this recommendation cited as evidence, as persisted in
 * evidence_json.affected_prompt_details (recommendation-engine.ts). `resultId`
 * is scan_prompt_results.id from the run the card was last active in — NOT
 * stable across runs (RECS-DEDUPE-1) — so the caller must translate it to
 * project_prompts.id via a query scoped to that run before calling this
 * function; see oldResultIdToPromptId below. `competitors` is only ever
 * populated for `prominence`-kind cards (the named rival(s) that outranked
 * the brand when the card was generated) and is ignored for the other kinds.
 */
export type AffectedPromptContext = {
  resultId: string;
  competitors: readonly string[];
};

export type RecommendationToVerify = {
  id: string;
  recommendationType: string;
  /** The later run to check against — see the module doc for what this is
   *  per caller (Fase A's `resolved_in_run_id` vs Fase B's computed anchor). */
  anchorRunId: string | null;
  affectedPrompts: readonly AffectedPromptContext[];
};

function isRowFulfilled(
  kind: "presence" | "prominence" | "authority",
  row: VerificationRow,
  namedCompetitors: readonly string[],
  projectDomainNormalized: string
): boolean {
  if (kind === "presence") {
    return row.brand_mentioned;
  }

  if (kind === "prominence") {
    if (!row.brand_mentioned) return false;
    const extracted = readExtractedJson(row.extracted_json);
    if (!extracted || extracted.brand.position === null) return false;

    const namedLower = new Set(namedCompetitors.map((c) => c.trim().toLowerCase()).filter(Boolean));
    // No specific rival on record for this prompt (shouldn't happen for a
    // prominence-kind card, but fail toward "the mention alone is the win"
    // rather than toward a false negative on missing evidence).
    if (namedLower.size === 0) return true;

    for (const competitor of extracted.competitors) {
      if (!namedLower.has(competitor.name.trim().toLowerCase())) continue;
      if (competitor.mentioned && competitor.position !== null && competitor.position < extracted.brand.position) {
        return false; // still ranked behind this specific, named rival
      }
    }
    return true;
  }

  // authority
  if (!isGroundedRow(row)) return false;
  return hasOwnDomainCitation(row, projectDomainNormalized);
}

/**
 * Pure — no DB access. `oldResultIdToPromptId` and `newRunRowsByRunAndPrompt`
 * are pre-fetched by the caller (app/dashboard/projects/[projectId]/
 * recommendations/page.tsx), scoped to project_id + explicit run_id(s), same
 * shape as the existing coverage-overlay.ts precedent — this module never
 * queries Supabase itself.
 */
export function verifyRecommendationPredictions(opts: {
  recommendations: readonly RecommendationToVerify[];
  oldResultIdToPromptId: ReadonlyMap<string, string>;
  /** Keyed `${run_id}:${prompt_id}` — one entry per engine that answered that prompt in that run. */
  newRunRowsByRunAndPrompt: ReadonlyMap<string, readonly VerificationRow[]>;
  projectDomain: string;
}): Map<string, RecommendationVerification> {
  const domain = opts.projectDomain ? normalizeDomain(opts.projectDomain) : "";
  const out = new Map<string, RecommendationVerification>();

  for (const rec of opts.recommendations) {
    const kind = getRecommendationPotentialKind(rec.recommendationType);
    if (!kind || !rec.anchorRunId || rec.affectedPrompts.length === 0) {
      out.set(rec.id, { status: "no_verdict" });
      continue;
    }

    let fulfilledCount = 0;
    let totalCount = 0;

    for (const affected of rec.affectedPrompts) {
      const promptId = opts.oldResultIdToPromptId.get(affected.resultId);
      if (!promptId) continue; // prompt deleted since, or untranslatable — fail closed, skip

      const rows = opts.newRunRowsByRunAndPrompt.get(`${rec.anchorRunId}:${promptId}`);
      if (!rows || rows.length === 0) continue; // no matching row in the anchor run — skip

      for (const row of rows) {
        totalCount += 1;
        if (isRowFulfilled(kind, row, affected.competitors, domain)) fulfilledCount += 1;
      }
    }

    out.set(rec.id, totalCount > 0 ? { status: "verified", verdict: { kind, fulfilledCount, totalCount } } : { status: "no_verdict" });
  }

  return out;
}
