import "server-only";

import type { createServiceClient } from "@/lib/supabase/service";
import { getEffectiveGeoScore } from "@/lib/scoring/run-scoring";
import { sendScoreDropAlertEmail } from "@/lib/email/transactional";

/**
 * A GEO Score drop of this many points (0-100 scale) or more below the
 * pre-drop baseline triggers an alert email, once the drop has persisted
 * across two consecutive runs (see below). Picked as a first-pass,
 * deliberately conservative threshold — subject to tuning once there's real
 * usage data (ALERTS-1 Fase 6a Task Intake).
 */
const SCORE_DROP_ALERT_THRESHOLD = 10;

/**
 * The composite version a run was scored under, or "pre-composite" for rows
 * scored before geo_score existed (which getEffectiveGeoScore reads as
 * visibility_score). Runs scored under different composite versions measure
 * different things — v1 standing was 100 - competitive pressure, v2 is real
 * share of voice (ADR 0015) — so a score step across the boundary is a
 * methodology change, not a visibility regression, and must never alert.
 */
function getCompositeVersion(row: { details_json: unknown }): string {
  const details =
    row.details_json && typeof row.details_json === "object"
      ? (row.details_json as { geo_score?: { composite_version?: string } })
      : {};
  return details.geo_score?.composite_version ?? "pre-composite";
}

/**
 * Fires right after a scan run's score is persisted (lib/scan/executor.ts).
 * Fail-soft by design, same as recommendation generation in the same
 * function: a broken alert must never sink an otherwise-successful scan.
 *
 * GEO-SCORE-V2 E2 (audit finding 5, ADR 0015): with one LLM sample per
 * prompt/engine, a single run-over-run dip is often noise — on a 10-prompt
 * plan one flipped answer moves the score 10 points. The alert therefore
 * requires the drop to be SUSTAINED: both the current run and the run before
 * it must sit >= threshold below the pre-drop baseline (the run before
 * that). This trades one run of alert latency for not training users to
 * ignore the email. Consequences: a project needs >= 3 scored runs before
 * any alert can fire, and all three runs must share the same
 * composite_version (no spurious alert on the v1 -> v2 methodology step).
 */
export async function checkAndSendScoreDropAlert({
  service,
  projectId,
  runId,
  ownerUserId,
  projectDomain,
  currentRow
}: {
  service: ReturnType<typeof createServiceClient>;
  projectId: string;
  runId: string;
  ownerUserId: string;
  projectDomain: string;
  currentRow: { visibility_score: number | null; details_json: unknown };
}): Promise<void> {
  try {
    const { data: previousRows } = await service
      .from("run_scores")
      .select("visibility_score, details_json")
      .eq("project_id", projectId)
      .neq("run_id", runId)
      .order("created_at", { ascending: false })
      .limit(2);

    // Persistence needs a pre-drop baseline plus the first dropped run —
    // with fewer than 2 prior scored runs there is no sustained drop to see.
    if (!previousRows || previousRows.length < 2) return;

    const [previous, baseline] = previousRows;

    const currentVersion = getCompositeVersion(currentRow);
    if (getCompositeVersion(previous) !== currentVersion || getCompositeVersion(baseline) !== currentVersion) {
      return;
    }

    const baselineScore = getEffectiveGeoScore(baseline);
    const previousScore = getEffectiveGeoScore(previous);
    const currentScore = getEffectiveGeoScore(currentRow);

    const sustainedDrop =
      baselineScore - previousScore >= SCORE_DROP_ALERT_THRESHOLD &&
      baselineScore - currentScore >= SCORE_DROP_ALERT_THRESHOLD;
    if (!sustainedDrop) return;

    const { data: profile } = await service
      .from("profiles")
      .select("email, notify_score_drop_alert")
      .eq("id", ownerUserId)
      .maybeSingle();

    if (!profile?.email || profile.notify_score_drop_alert === false) return;

    // The email reports the pre-drop baseline -> current, the comparison the
    // user actually cares about ("you were at 70, you've been at 55 for two
    // scans"), not the intermediate run.
    await sendScoreDropAlertEmail(profile.email, projectDomain, baselineScore, currentScore);
  } catch (error) {
    console.error("[geo:alerts] failed to check/send score-drop alert", {
      projectId,
      runId,
      message: error instanceof Error ? error.message : String(error)
    });
  }
}
