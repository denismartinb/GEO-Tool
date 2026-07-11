import "server-only";

import type { createServiceClient } from "@/lib/supabase/service";
import { getEffectiveGeoScore } from "@/lib/scoring/run-scoring";
import { sendScoreDropAlertEmail } from "@/lib/email/transactional";

/**
 * A run-over-run GEO Score drop of this many points (0-100 scale) or more
 * triggers an alert email. Picked as a first-pass, deliberately conservative
 * threshold (real single-digit noise between runs is common; this is meant
 * to catch a real, visible regression, not every fluctuation) — subject to
 * tuning once there's real usage data (ALERTS-1 Fase 6a Task Intake).
 */
const SCORE_DROP_ALERT_THRESHOLD = 10;

/**
 * Fires right after a scan run's score is persisted (lib/scan/executor.ts).
 * Fail-soft by design, same as recommendation generation in the same
 * function: a broken alert must never sink an otherwise-successful scan.
 * Compares this run's GEO Score against the immediately preceding run for
 * the same project; sends nothing on a project's first-ever scored run
 * (no prior score to compare against).
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
    const { data: previousRow } = await service
      .from("run_scores")
      .select("visibility_score, details_json")
      .eq("project_id", projectId)
      .neq("run_id", runId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!previousRow) return;

    const previousScore = getEffectiveGeoScore(previousRow);
    const currentScore = getEffectiveGeoScore(currentRow);
    const drop = previousScore - currentScore;

    if (drop < SCORE_DROP_ALERT_THRESHOLD) return;

    const { data: profile } = await service
      .from("profiles")
      .select("email, notify_score_drop_alert")
      .eq("id", ownerUserId)
      .maybeSingle();

    if (!profile?.email || profile.notify_score_drop_alert === false) return;

    await sendScoreDropAlertEmail(profile.email, projectDomain, previousScore, currentScore);
  } catch (error) {
    console.error("[geo:alerts] failed to check/send score-drop alert", {
      projectId,
      runId,
      message: error instanceof Error ? error.message : String(error)
    });
  }
}
