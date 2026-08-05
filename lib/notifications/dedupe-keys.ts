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

/**
 * WEB-AUDIT-ALERTS-1 — one key per (audit snapshot, kind), so an audit can
 * emit at most one notice of each kind however many times its invocation is
 * retried.
 *
 * Audit-scoped rather than "forever" like gapPendingKey, and that is safe
 * from noise for a different reason: every regression here is detected as a
 * TRANSITION between two audits (lib/web-audit/regressions.ts), so a
 * condition that persists produces exactly one notice — the day it appeared —
 * and silence afterwards. A "forever" key would instead mean a domain that
 * loses llms.txt, restores it, and loses it again is only ever told once.
 *
 * `auditId` is NOT the same identifier for every kind, and that difference is
 * load-bearing: the technical kinds pass the `web_audit_snapshots` row id,
 * while the two coverage kinds pass the SCAN id their coverage map belongs
 * to. A technical audit re-run 24h later against the same scan produces a new
 * snapshot but reads the very same, unregenerated coverage map — keyed by
 * snapshot, that identical comparison would notify a second time.
 */
export function auditRegressionKey(
  kind: "coverage_dropped" | "surfacing_dropped" | "llms_txt_lost" | "sitemap_lost" | "page_unreachable",
  auditId: string
): string {
  return `${kind}:${auditId}`;
}
