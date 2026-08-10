import "server-only";

import { getPlanForUser } from "@/lib/billing";
import { resolveScanProvidersForPlan } from "@/lib/scan/providers";
import { createClient } from "@/lib/supabase/server";
import { ScanMissionRocket } from "@/components/scan-mission-rocket";
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

  /**
   * The engine count is a REAL number or it is absent — never a guess.
   *
   * The founder's first instinct here was that a "momento guau" justified an
   * approximate figure ("no me importa que no sean datos reales", 2026-08-10).
   * What settled it was not the rule but the arithmetic: the órbita beat, two
   * scenes later on this same screen, prints the true count straight from
   * `scan_prompt_results` rows. An invented total in the rail would be
   * contradicted by the product itself, in the same session, in front of the
   * user it was meant to impress.
   *
   * `getPlanForUser` is wrapped in React's `cache()`, so several sections
   * asking for it inside one request resolve a single query.
   */
  const plan = user ? await getPlanForUser(supabase, user.id) : null;
  const engines = plan ? resolveScanProvidersForPlan(plan).length : null;
  const promptsTotal = activeRun.total_prompts ?? null;

  // `total_prompts` counts lanzamientos, one per prompt (SAMPLING-1, ADR 0030),
  // and `scan_prompt_results` holds one row per engine per prompt (migration
  // 0009) — so this product is the real expected row count, not an estimate.
  // Null whenever either half is unknown: the rail then simply omits it.
  const expectedResponses = promptsTotal !== null && engines !== null ? promptsTotal * engines : null;

  return (
    <ScanMissionRocket
      projectId={projectId}
      initial={activeRun}
      domain={domain}
      promptsTotal={promptsTotal}
      engines={engines}
      expectedResponses={expectedResponses}
    />
  );
}
