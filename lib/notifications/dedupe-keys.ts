/**
 * Canonical `notifications.dedupe_key` builders (docs/specs/notifications/
 * notifications-v1.md section 3.3), centralized so the emitters and their
 * tests can never diverge on the key shape. Combined with the unique index
 * on (owner_user_id, dedupe_key) (migration 0021), this is what makes
 * emission idempotent — the scan executor self-chains and retries
 * (SCAN-CHAIN-1), so the same emission call can run more than once.
 *
 * `gap_pending` and `emerging_competitor` are deliberately "forever" keys
 * (no run_id in them): they are nudge notifications, and repeating them on
 * every scan would turn them into exactly the noise this design exists to
 * avoid.
 */

export function scanCompletedKey(runId: string): string {
  return `scan_completed:${runId}`;
}

export function scanFailedKey(runId: string): string {
  return `scan_failed:${runId}`;
}

export function gapResolvedKey(runId: string): string {
  return `gap_resolved:${runId}`;
}

export function gapPendingKey(projectId: string, recommendationDedupeKey: string): string {
  return `gap_pending:${projectId}:${recommendationDedupeKey}`;
}

export function emergingCompetitorKey(projectId: string, competitor: string): string {
  return `emerging_competitor:${projectId}:${competitor.trim().toLowerCase()}`;
}

export function aiBotBlockedKey(snapshotId: string, agent: string): string {
  return `ai_bot_blocked:${snapshotId}:${agent}`;
}

export function auditCompletedKey(snapshotId: string): string {
  return `audit_completed:${snapshotId}`;
}

export function trialEndingKey(userId: string, trialEndsAt: string): string {
  return `trial_ending:${userId}:${trialEndsAt}`;
}
