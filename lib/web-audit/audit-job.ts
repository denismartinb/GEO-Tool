/**
 * AUDIT-AFTER-SCAN-1 — retry policy for the post-scan web audit job.
 *
 * Pure, no I/O, no `server-only`: the schedule is the part worth testing, and
 * it should be testable without a database. The callers that actually touch
 * Supabase live in `audit-job-runner.ts`.
 *
 * Why a job row rather than a fire-and-forget call: the founder's requirement
 * is that a failure is understood and retried, not swallowed ("si falla, el
 * sistema de backend lo tiene que entender y lo tiene que reintentar"). The
 * `jobs` table already models exactly that — attempt_count, max_attempts,
 * next_attempt_at, last_error, and the 'retrying'/'failed' states — so this
 * reuses it instead of inventing a parallel mechanism (migration 0027 widens
 * `jobs_type_chk` to allow the type).
 */

export const WEB_AUDIT_JOB_TYPE = "web_audit" as const;

/**
 * After this long, a job still marked 'running' is considered abandoned and
 * reclaimable.
 *
 * Without this the queue has a permanent leak: an invocation killed by the
 * platform mid-batch never gets to write the row back, so the job stays
 * 'running' with a stale `locked_by` — and a claim that only looks at
 * 'pending'/'retrying' would never touch it again.
 *
 * 10 minutes is comfortably above the route's own maxDuration=60 (ADR-0003),
 * so a healthy in-flight job is never stolen from itself. Migration 0001
 * already ships `jobs_locked_idx on (locked_at) where status in
 * ('running','retrying')` — the schema anticipated exactly this sweep.
 *
 * Lives here rather than in `audit-job-runner.ts` (WEB-AUDIT-DRIVE-1) so the
 * web-audit page can ask "is this job due?" without importing the runner —
 * which would drag Gemini coverage, the technical audit and the email client
 * into a render path.
 */
export const WEB_AUDIT_STALE_LOCK_MS = 10 * 60_000;

/**
 * Six attempts, not the table's default of three. The failure modes here are
 * dominated by transient upstream trouble — a slow LLM call, a site that
 * times out once, a cold function — and the whole point of the phase is that
 * the audit still lands with nobody watching.
 *
 * Six is what makes the LAST backoff (10h) actually reachable: the schedule
 * below is consumed by the attempts BEFORE the final one, so N attempts use
 * N-1 backoffs. At five it would stop after 1+5+25+120 = ~2.5h, which is not
 * "most of a working day"; at six it spans ~12.5h, so a provider outage that
 * lasts a business day still resolves before the next daily scan produces a
 * fresh run to audit.
 */
export const WEB_AUDIT_MAX_ATTEMPTS = 6;

/**
 * Backoff in minutes, indexed by the attempt that just failed (1-based).
 * Deliberately steep and explicit rather than a formula: an operator reading
 * a stuck job should be able to tell, without arithmetic, when it will next
 * be tried. 1min → 5min → 25min → 2h → 10h.
 */
const BACKOFF_MINUTES = [1, 5, 25, 120, 600];

export type AuditJobOutcome =
  | { status: "completed" }
  | { status: "retrying"; nextAttemptAt: Date; attemptCount: number }
  | { status: "failed"; attemptCount: number; lastError: string };

/**
 * What the queue should do after one attempt finished.
 *
 * `now` is injected rather than read from the clock so the schedule is
 * testable — and so a caller can never accidentally compute two slightly
 * different "now"s while writing one row.
 */
export function nextAuditJobState(input: {
  /** attempt_count BEFORE this attempt (0 on the first run). */
  previousAttemptCount: number;
  maxAttempts: number;
  error: string | null;
  now: Date;
}): AuditJobOutcome {
  const attemptCount = input.previousAttemptCount + 1;
  if (!input.error) return { status: "completed" };

  if (attemptCount >= input.maxAttempts) {
    return { status: "failed", attemptCount, lastError: input.error };
  }

  // Index by the attempt that just failed; clamp so a max_attempts raised
  // beyond the table's length still schedules something sane rather than
  // producing an Invalid Date.
  const minutes = BACKOFF_MINUTES[Math.min(attemptCount - 1, BACKOFF_MINUTES.length - 1)];
  return {
    status: "retrying",
    attemptCount,
    nextAttemptAt: new Date(input.now.getTime() + minutes * 60_000)
  };
}

/**
 * Total wall-clock window the retry schedule covers, for documentation and
 * for the alert email ("se intentó durante N horas"). Sum of every backoff
 * actually used before giving up.
 */
export function retryWindowMinutes(maxAttempts: number): number {
  return BACKOFF_MINUTES.slice(0, Math.max(0, maxAttempts - 1)).reduce((sum, m) => sum + m, 0);
}
