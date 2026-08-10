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
  const [plan, { count: promptCount }] = await Promise.all([
    user ? getPlanForUser(supabase, user.id) : Promise.resolve(null),
    supabase
      .from("project_prompts")
      .select("id", { count: "exact", head: true })
      .eq("project_id", projectId)
      .eq("is_active", true)
  ]);

  const engines = plan ? resolveScanProvidersForPlan(plan).length : null;

  /**
   * `total_prompts` counts LANZAMIENTOS, not prompts, and the difference is
   * not pedantry — it is the bug the founder caught on 2026-08-10.
   *
   * A 12-prompt project on 3 engines yields 36 responses, under SAMPLING-1's
   * floor of `MIN_RESPONSES_PER_RUN` (50), so the run repeats the whole prompt
   * set twice (ADR 0030). `total_prompts` then reads 24. Labelling that "24
   * prompts" is incomprehensible to someone who typed 12 on the previous
   * screen — his words: "si son doce, son doce".
   *
   * So the rail reports the three real quantities separately and lets the
   * arithmetic be visible: 12 prompts x 2 pasadas x 3 motores = 72 respuestas.
   * Every one of those is read, never assumed; any that cannot be resolved
   * drops its own segment rather than being filled in.
   */
  const launches = activeRun.total_prompts ?? null;
  const prompts = promptCount ?? null;
  const samples = prompts !== null && prompts > 0 && launches !== null ? Math.round(launches / prompts) : null;
  const expectedResponses = launches !== null && engines !== null ? launches * engines : null;

  return (
    <ScanMissionRocket
      projectId={projectId}
      initial={activeRun}
      domain={domain}
      prompts={prompts}
      samples={samples}
      engines={engines}
      expectedResponses={expectedResponses}
    />
  );
}
