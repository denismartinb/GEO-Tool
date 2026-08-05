/**
 * AUDIT-IN-RUNS-1 — what the Escaneos table says about each run's audit.
 *
 * Pure: the caller loads the three inputs from Supabase in bounded queries and
 * this decides. Kept out of the page so the rules below are testable, because
 * every one of them is a claim to the user about work that either happened or
 * did not, and getting one wrong shows a number that is not true.
 *
 * The 1:1 relationship this column relies on is new. Before AUDIT-AFTER-SCAN-1
 * an audit was a manual, occasional act with no dependable link to any one
 * scan; since it runs automatically after every scan, "this run's audit" is a
 * real thing to display.
 */

/**
 * The audit has two independent halves that are persisted separately and can
 * genuinely land apart: the coverage campaign (batched, chained) and the
 * technical snapshot (one pass, its own budget). A run parked between them is
 * normal, not a bug — see the technical-audit reserve in audit-job-runner.ts.
 */
export type RunAuditStatus =
  /** Both halves persisted for this run. */
  | { kind: "audited"; readinessScore: number | null }
  /** One half only. Never rendered as complete — that would be a false claim. */
  | { kind: "partial"; readinessScore: number | null }
  /** A job for this run is queued or mid-flight. */
  | { kind: "in_progress" }
  /**
   * The job has failed at least once and is waiting out its backoff.
   *
   * Deliberately NOT folded into `in_progress`, even though both eventually
   * resolve on their own. The backoff is `[1, 5, 25, 120, 600]` minutes, so a
   * job on its fifth attempt sits untouched for ten hours: "En curso" there
   * promises motion that will not come for most of a day, and reads as a bug
   * in the table rather than as trouble in the audit. Observed exactly that
   * way on 2026-08-05 — rows frozen on "En curso" for four and a half hours.
   */
  | { kind: "retrying" }
  /**
   * Nothing, and nothing pending. Covers three different pasts that all look
   * identical to the user and all mean "there is nothing to show here": runs
   * that predate the automatic audit, projects below the Pro gate (their job
   * is cancelled before spending anything), and audits that exhausted their
   * retries. The last one is deliberately not surfaced: the customer cannot
   * act on a backend failure, and the operator already gets an email.
   */
  | { kind: "none" };

/** Queued or mid-flight: will move on its own, and soon. */
const ACTIVE_JOB_STATUSES = new Set(["pending", "running"]);

export function deriveRunAuditStatus({
  runId,
  coverageScanIds,
  readinessByScanId,
  jobStatusByRunId
}: {
  runId: string;
  /** Scan ids that have a persisted coverage map. */
  coverageScanIds: Set<string>;
  /** Scan id → technical readiness score (null is a real audited value). */
  readinessByScanId: Map<string, number | null>;
  /** run_id → `jobs.status` for the web_audit job, when one exists. */
  jobStatusByRunId: Map<string, string>;
}): RunAuditStatus {
  const jobStatus = jobStatusByRunId.get(runId);

  // An active job wins over whatever is persisted so far. A run whose coverage
  // has landed but whose technical half is still queued is *working*, not
  // partial — "Parcial" is for work that has stopped.
  if (jobStatus && ACTIVE_JOB_STATUSES.has(jobStatus)) {
    return { kind: "in_progress" };
  }

  // Before the persisted halves, for the same reason as above: a job that has
  // already failed is the more important thing to say about this run, and
  // half-landed data does not make it "Parcial and fine".
  if (jobStatus === "retrying") {
    return { kind: "retrying" };
  }

  const hasCoverage = coverageScanIds.has(runId);
  const hasTechnical = readinessByScanId.has(runId);
  const readinessScore = hasTechnical ? (readinessByScanId.get(runId) ?? null) : null;

  if (hasCoverage && hasTechnical) return { kind: "audited", readinessScore };
  if (hasCoverage || hasTechnical) return { kind: "partial", readinessScore };
  return { kind: "none" };
}
