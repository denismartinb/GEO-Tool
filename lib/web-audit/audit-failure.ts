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
 *
 * TRANSIENT — the same request can succeed later:
 *   - `no_scan`            no completed run yet (a race right after a scan)
 *   - `rate_limited`       today's budget is spent; tomorrow's is not
 *   - `generic`            anything unexpected, including upstream failures
 */
export type AuditFailureReason =
  | "project_not_found"
  | "project_archived"
  | "plan_required"
  | "no_scan"
  | "no_prompts"
  | "rate_limited"
  | "generic";

const TERMINAL: ReadonlySet<AuditFailureReason> = new Set<AuditFailureReason>([
  "project_not_found",
  "project_archived",
  "plan_required",
  "no_prompts"
]);

/** True when no amount of retrying could change the outcome. */
export function isTerminalAuditFailure(reason: AuditFailureReason): boolean {
  return TERMINAL.has(reason);
}
