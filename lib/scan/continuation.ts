import "server-only";

import { getSiteUrl } from "@/lib/site-url";

/**
 * Fires the next batch of a multi-batch campaign (SCAN-CHAIN-1) in its own
 * fresh invocation, by POSTing to the internal `/api/scan/continue` endpoint.
 *
 * Lives in its own leaf module — same reasoning as `lib/site-url.ts` — because
 * two very different callers need it and neither should have to import the
 * other: `lib/scan/executor.ts` (hand off the next batch) and
 * `lib/scan/reconciliation.ts` (start the run its auto-retry just created).
 * `reconciliation.ts` is already reachable *from* `run-creation.ts`, so a
 * static import back into the executor would have to be worked around with yet
 * another dynamic import.
 *
 * Errors are swallowed (logged only): a lost dispatch degrades the campaign to
 * "advances only while a driver is looking at it", which is exactly the state
 * `reconcileStuckScanRuns`' timeout + auto-retry already covers. It must never
 * be able to sink the caller.
 */
export async function triggerScanContinuation({
  projectId,
  runId
}: {
  projectId: string;
  runId: string;
}): Promise<void> {
  const secret = process.env.SCAN_CONTINUE_SECRET;
  if (!secret) {
    console.error("[scan-runner] cannot self-chain scan batch: SCAN_CONTINUE_SECRET is not configured", {
      projectId,
      runId
    });
    return;
  }

  try {
    const response = await fetch(`${getSiteUrl()}/api/scan/continue`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret}` },
      body: JSON.stringify({ projectId, runId })
    });

    // `fetch` only rejects on a transport failure: a 401 from Vercel's
    // deployment protection, a 404 from a stale `getSiteUrl()`, a 500 — all
    // resolve, and without this check every one of them reads exactly like a
    // dispatch that worked. That is the difference between "the safety net is
    // running" and "the safety net is silently unreachable", which is the only
    // question worth asking when a campaign stops advancing. Logged, never
    // thrown: the caller still must not be sunk by a lost hand-off.
    if (!response.ok) {
      console.error("[scan-runner] scan continuation was rejected", {
        projectId,
        runId,
        status: response.status,
        url: `${getSiteUrl()}/api/scan/continue`
      });
    }
  } catch (error) {
    console.error("[scan-runner] failed to dispatch scan continuation", {
      projectId,
      runId,
      message: error instanceof Error ? error.message : String(error)
    });
  }
}

/**
 * `triggerScanContinuation` scheduled via `after()`, for callers that are on a
 * user-visible path and must not wait for a batch to run: the dispatch happens
 * after the response is sent.
 *
 * `after` is imported dynamically and the whole thing is wrapped, because this
 * is called from `reconcileStuckScanRuns`, which runs in contexts that are not
 * always a request (a Vitest suite, a future worker). `after()` outside a
 * request context throws, and a scan-lifecycle correction must not fail
 * because its optional hand-off had nowhere to schedule itself.
 */
export async function scheduleScanContinuation({
  projectId,
  runId
}: {
  projectId: string;
  runId: string;
}): Promise<void> {
  try {
    const { after } = await import("next/server");
    after(() => triggerScanContinuation({ projectId, runId }));
  } catch (error) {
    console.error("[scan-runner] could not schedule a scan continuation", {
      projectId,
      runId,
      message: error instanceof Error ? error.message : String(error)
    });
  }
}
