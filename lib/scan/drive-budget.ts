import { AUTO_EXECUTE_SAFE_CEILING_MS, SCAN_INVOCATION_WORST_CASE_MS, SWEEP_SAFE_CEILING_MS } from "@/lib/scan/constants";

/**
 * Whether the foreground driver (`autoExecutePendingScan`) may start another
 * `executePendingScan` call, given how long the current server action has
 * already been running.
 *
 * The question is asked *before* an iteration, about that iteration's worst
 * case — not after one, about the past. See SCAN_INVOCATION_WORST_CASE_MS for
 * why the "after" form is a bug rather than a style preference.
 *
 * A pure function, in its own module, because this arithmetic is the whole
 * mechanism: it is the only thing standing between a batch and a function
 * Vercel kills mid-flight, and it is not otherwise reachable from a test (its
 * caller is a server action behind `requireUser`).
 */
export function canStartAnotherScanInvocation({ elapsedMs }: { elapsedMs: number }): boolean {
  return elapsedMs + SCAN_INVOCATION_WORST_CASE_MS <= AUTO_EXECUTE_SAFE_CEILING_MS;
}

/**
 * Whether the recurring-scan sweep (`runDailyCronScan`) may start another
 * batch of projects, given how long this invocation has already been running.
 *
 * Same question, same "before an iteration, about its worst case" form, and
 * deliberately the same module as `canStartAnotherScanInvocation`: this
 * arithmetic is the only thing standing between a batch and a function Vercel
 * kills mid-flight, and one module owning both drivers is what stops the fix
 * from landing on one of them and not the other — which is exactly what
 * happened between docs/adr/0037 and RECURRING-CADENCE-1.
 *
 * A batch runs BATCH_CONCURRENCY projects *in parallel*, so its worst case is
 * one `executePendingScan`, not one per project.
 */
export function canStartAnotherSweepBatch({ elapsedMs }: { elapsedMs: number }): boolean {
  return elapsedMs + SCAN_INVOCATION_WORST_CASE_MS <= SWEEP_SAFE_CEILING_MS;
}
