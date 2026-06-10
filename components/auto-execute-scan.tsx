"use client";

import { useEffect, useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { autoExecutePendingScan } from "@/app/dashboard/projects/[projectId]/actions";

/**
 * Invisible trigger rendered on the Escaneos page when a run is `pending`
 * and sync execution is enabled. Fires the (heavy, ~30-60s) Gemini execution
 * in a follow-up request after the user has already landed on the page, then
 * refreshes so the real `ScanInProgress` state updates to the result.
 */
export function AutoExecuteScan({ projectId, runId }: { projectId: string; runId: string }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const firedRef = useRef(false);

  useEffect(() => {
    if (firedRef.current) return;
    firedRef.current = true;

    startTransition(async () => {
      await autoExecutePendingScan({ projectId, runId });
      router.refresh();
    });
  }, [projectId, runId, router]);

  return null;
}
