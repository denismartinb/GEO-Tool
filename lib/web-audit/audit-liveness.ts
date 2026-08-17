/**
 * WEB-AUDIT-DRIVE-1 — is this audit actually moving, and is anything due?
 *
 * Pure, and in its own module, because both questions are claims to the user
 * about work that either is happening or is not. The screen got them wrong in
 * the same way twice on 2026-08-07: it read a `generated_solutions` row with
 * `status='running'` and rendered "Auditando…" from it, with no notion of when
 * that row last moved. A campaign whose driver had stopped 13 minutes earlier
 * looked identical to one mid-batch.
 *
 * Nothing here queries. The caller loads the two inputs in bounded queries and
 * these decide, so the rules are fixable without touching a page component.
 */

/**
 * How long a coverage campaign may go without persisting a batch before the UI
 * stops claiming it is running.
 *
 * A batch is bounded by the worker's own invocation budget (42s) and a
 * continuation is dispatched within seconds of one finishing, so a healthy
 * campaign moves every minute or so. Five minutes is comfortably past any
 * legitimate gap while still being far short of the ten-hour tail of the retry
 * backoff — a window in which "Auditando…" would be a flat lie.
 *
 * Deliberately NOT the same constant as the worker's STALE_LOCK_MS (10 min).
 * That one decides when it is safe to steal a job from another invocation, and
 * being wrong there means double-spending Gemini calls. This one decides what
 * a label says, and being wrong here means the screen misleads. They answer
 * different questions and should be free to move independently.
 */
export const AUDIT_CAMPAIGN_STALE_MS = 5 * 60_000;

export type AuditPillState =
  /** A campaign persisted a batch recently: really running, say so. */
  | "auditing"
  /**
   * Queued or parked: the work is real and will resume, but nothing is moving
   * right now. Saying "Auditando…" here promises motion that is not happening,
   * which is exactly how a stalled audit read as a healthy one.
   */
  | "pending"
  /** Nothing queued and nothing running. */
  | "idle";

/** `jobs.status` values that mean the audit is waiting rather than working. */
const WAITING_JOB_STATUSES = new Set(["retrying", "pending"]);

export function deriveAuditPillState({
  campaignUpdatedAt,
  jobStatus,
  now = new Date()
}: {
  /** `generated_solutions.updated_at` for a campaign whose status is 'running'. */
  campaignUpdatedAt?: string | null;
  /** `jobs.status` of the `web_audit` job for the latest run, when one exists. */
  jobStatus?: string | null;
  now?: Date;
}): AuditPillState {
  // A job waiting out its backoff is the more important fact about this audit
  // than a campaign row that happens to still say 'running'. The backoff runs
  // 1m → 5m → 25m → 2h → 10h: a job on its fourth attempt is untouched for two
  // hours, and the Escaneos table already learned (AUDIT-IN-RUNS-1) that
  // calling that "En curso" reads as a bug in the screen rather than trouble
  // in the audit.
  if (jobStatus === "retrying") return "pending";

  if (campaignUpdatedAt) {
    const movedAt = Date.parse(campaignUpdatedAt);
    // An unparseable timestamp must not silently become "moving": treat it the
    // same as one that has gone quiet.
    if (Number.isFinite(movedAt) && now.getTime() - movedAt < AUDIT_CAMPAIGN_STALE_MS) {
      return "auditing";
    }
    return "pending";
  }

  if (jobStatus && WAITING_JOB_STATUSES.has(jobStatus)) return "pending";
  // 'running' with no campaign row yet: a worker has claimed the job and is
  // about to write the campaign's first batch.
  if (jobStatus === "running") return "auditing";

  return "idle";
}

/**
 * Whether a `web_audit` job has work owed to it right now, so opening the
 * screen can wake the worker instead of waiting for the daily cron.
 *
 * The three cases are the same ones `claimDueWebAuditJobs` claims, restated
 * as a predicate: due (`pending`/`retrying` past `next_attempt_at`) and
 * abandoned (`running` under an expired lock). Kept in sync with that function
 * by intent, not by import — it is a claim query and this is a read-only
 * predicate over one row the page already has.
 */
export function isWebAuditJobDue({
  status,
  nextAttemptAt,
  lockedAt,
  staleLockMs,
  now = new Date()
}: {
  status: string;
  nextAttemptAt?: string | null;
  lockedAt?: string | null;
  /** Mirrors the worker's STALE_LOCK_MS; injected so the two cannot drift silently in tests. */
  staleLockMs: number;
  now?: Date;
}): boolean {
  const nowMs = now.getTime();

  if (status === "pending" || status === "retrying") {
    // No `next_attempt_at` means "as soon as possible" — the column is only
    // set by the backoff path.
    if (!nextAttemptAt) return true;
    const dueAt = Date.parse(nextAttemptAt);
    return Number.isFinite(dueAt) ? dueAt <= nowMs : true;
  }

  if (status === "running") {
    // No lock on a 'running' row is already an inconsistency; treat it as
    // abandoned rather than as permanently in-flight, which is the failure
    // mode that leaves an audit stuck forever.
    if (!lockedAt) return true;
    const lockedAtMs = Date.parse(lockedAt);
    return Number.isFinite(lockedAtMs) ? nowMs - lockedAtMs > staleLockMs : true;
  }

  return false;
}
