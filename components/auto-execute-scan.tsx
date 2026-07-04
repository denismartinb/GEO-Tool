"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { autoExecutePendingScan } from "@/app/dashboard/projects/[projectId]/actions";

// Hard cap on how many times the client re-drives the server action for one
// campaign. Each call processes up to ~40s of batches (AUTO_EXECUTE_TIME_BUDGET_MS),
// and the largest plan (Agency, 300 prompts = 30 batches of 10) needs well
// under this many windows — the cap only exists to guarantee the loop always
// terminates even if the server ever reported "running" indefinitely.
const MAX_DRIVE_ITERATIONS = 40;
const PACING_DELAY_MS = 2_000;

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Invisible foreground driver rendered on the Escaneos page while a scan run is
 * pending or running (SCAN-CHAIN-1). It calls `autoExecutePendingScan`
 * repeatedly — each call runs a window of batches server-side and reports
 * whether the campaign still has work left — until the run is terminal, so a
 * multi-batch campaign completes end-to-end from the user's own authenticated
 * session, without depending on the secret-gated `/api/scan/continue`
 * self-fetch (docs/adr/0014). Progress is shown by the separately-mounted
 * `ScanProgressPoller`; this component only drives execution and refreshes once
 * the loop finishes.
 */
export function AutoExecuteScan({ projectId, runId }: { projectId: string; runId: string }) {
  const router = useRouter();
  const firedRef = useRef(false);

  useEffect(() => {
    if (firedRef.current) return;
    firedRef.current = true;

    let aborted = false;

    (async () => {
      for (let i = 0; i < MAX_DRIVE_ITERATIONS && !aborted; i += 1) {
        let status: "idle" | "running" | "done";
        try {
          const result = await autoExecutePendingScan({ projectId, runId });
          status = result.status;
        } catch {
          // Transient failure (e.g. a redeploy mid-request): let the next
          // iteration retry after the pacing delay rather than giving up.
          status = "running";
        }

        if (aborted) return;
        if (status !== "running") break;

        await delay(PACING_DELAY_MS);
      }

      if (!aborted) router.refresh();
    })();

    return () => {
      aborted = true;
    };
  }, [projectId, runId, router]);

  return null;
}
