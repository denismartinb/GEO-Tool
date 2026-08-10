/**
 * Shared failure classification for the two audit cores — coverage
 * (`lib/recommendations/domain-coverage.ts`) and technical health
 * (`lib/web-audit/technical-audit.ts`).
 *
 * Both return Spanish, user-facing copy in `error`. That copy is the right
 * thing to render and the wrong thing to branch on: it is written for humans,
 * it changes freely, and matching on it would silently break the moment
 * someone improves a sentence. AUDIT-AFTER-SCAN-1's backend runner has to
 * make a real decision from a failure — retry it, or give up — so it needs a
 * stable machine-readable code alongside the prose.
 *
 * Deliberately NOT rendered anywhere: `error` stays the single source of
 * user-facing wording.
 */

/**
 * Why an audit could not run.
 *
 * TERMINAL — retrying is guaranteed to fail identically, so the post-scan job
 * runner cancels the job rather than burning its retry budget and ending in a
 * false alarm to the operator:
 *   - `project_not_found`  the project was deleted, or is not the owner's
 *   - `project_archived`   archived projects are intentionally inert
 *   - `plan_required`      a commercial boundary, not a transient error
 *   - `no_prompts`         nothing to audit until the user adds prompts
 *   - `audit_disabled`     both halves switched off for this project
 *
 * TRANSIENT — the same request can succeed later:
 *   - `no_scan`            no completed run yet (a race right after a scan)
 *   - `rate_limited`       today's budget is spent; tomorrow's is not
 *   - `generic`            anything unexpected, including upstream failures
 *
 * `audit_disabled` is the one reason no core ever returns: it is decided by
 * the job runner from the project's switches (WEB-AUDIT-AUTO-SPLIT-1,
 * migration 0031), not by a core failing. It lives here anyway because this
 * type answers "why could this audit not run", and the runner needs a stable
 * code to write into `jobs.last_error` like every other outcome. Terminal for
 * the obvious reason: retrying cannot flip a switch.
 */
export type AuditFailureReason =
  | "project_not_found"
  | "project_archived"
  | "plan_required"
  | "no_scan"
  | "no_prompts"
  | "audit_disabled"
  | "rate_limited"
  | "generic";

const TERMINAL: ReadonlySet<AuditFailureReason> = new Set<AuditFailureReason>([
  "project_not_found",
  "project_archived",
  "plan_required",
  "no_prompts",
  "audit_disabled"
]);

/** True when no amount of retrying could change the outcome. */
export function isTerminalAuditFailure(reason: AuditFailureReason): boolean {
  return TERMINAL.has(reason);
}
