import { AUTO_EXECUTE_SAFE_CEILING_MS, SCAN_INVOCATION_WORST_CASE_MS } from "@/lib/scan/constants";

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
