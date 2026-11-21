import "server-only";

import { getPlanForUser } from "@/lib/billing";
import { resolveScanProvidersForPlan } from "@/lib/scan/providers";
import { createClient } from "@/lib/supabase/server";
import { FirstScanMission } from "@/components/ins/mission/first-scan-mission";
import type { ActiveScanRun } from "@/components/scan-in-progress";

type LiveRun = ActiveScanRun & { id: string };

/**
 * SCAN-STATES-2 — the first-scan mission, on every section that has nothing
 * else to show.
 *
 * Founder decision, 2026-08-10: during a project's very first scan the full
 * screen takes over Visión general, Prompts, Competidores, Recomendaciones and
 * Páginas citadas. The objection worth recording, because it was raised and
 * then answered by the code: Prompts and Competidores DO hold real content at
 * that moment (`createProject` inserts `project_prompts` and
 * `project_competitors` before the scan starts). It turned out not to matter —
 * every one of those pages *already* replaced its whole body with
 * `ScanInProgress` under exactly this condition, so this swaps one takeover
 * for a better one rather than hiding anything that used to be readable.
 *
 * This wrapper exists so the rail's numbers are resolved in ONE place. Each
 * section page passes only what it already has.
 */
export async function FirstScanTakeover({
  projectId,
  activeRun,
  domain
}: {
  projectId: string;
  activeRun: LiveRun;
  domain: string;
}) {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  // The engine set is the plan's real one or it is absent, never a guess; the
  // counters and per-engine rows read rows the run holds (log §355).
  // `getPlanForUser` is wrapped in `cache()`, so six sections share one query.
  const plan = user ? await getPlanForUser(supabase, user.id) : null;

  const engineProviders = plan ? resolveScanProvidersForPlan(plan) : null;

  return (
    <FirstScanMission
      projectId={projectId}
      initial={activeRun}
      domain={domain}
      providers={engineProviders ?? []}
    />
  );
}
