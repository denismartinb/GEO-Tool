import "server-only";

import { isOpsAlertConfigured, sendFirstScanOpsAlertEmail } from "@/lib/email/transactional";
import { isInternalTestAccountEmail } from "@/lib/projects/internal-test-accounts";
import type { createServiceClient } from "@/lib/supabase/service";

/**
 * OPS-FIRST-SCAN-1 (log §441). Tells the operator the first time a project
 * creates a scan run: that is when a domain starts costing engine calls, and
 * the signup alert does not always know the domain (Google signups, or a
 * person who arrives without typing one).
 *
 * "First" means this run is the only `scan_runs` row of the project. A
 * reconciliation retry of a failed first run already finds two rows and stays
 * quiet, and the Resend idempotency key (`ops-first-scan/<project>`) covers a
 * duplicated delivery of the same creation. A project deleted and created
 * again is a new project, so it alerts again: it costs again.
 *
 * Never throws and does nothing without a configured alert channel, before
 * any query: an operator email must never turn a real scan into a failed one.
 */
export async function sendFirstScanOpsAlert(input: {
  service: ReturnType<typeof createServiceClient>;
  projectId: string;
  runId: string;
  domain: string | null;
  ownerUserId: string;
  planId: string;
  triggerSource: "user" | "cron";
  prompts: number;
  samples: number;
  engines: string[];
}): Promise<void> {
  if (!isOpsAlertConfigured()) return;

  try {
    const { data: runs, error } = await input.service
      .from("scan_runs")
      .select("id")
      .eq("project_id", input.projectId)
      .limit(2);
    if (error || !runs || runs.length !== 1) return;

    let ownerEmail: string | null = null;
    try {
      const { data } = await input.service.auth.admin.getUserById(input.ownerUserId);
      ownerEmail = data?.user?.email ?? null;
    } catch {
      ownerEmail = null;
    }

    await sendFirstScanOpsAlertEmail(
      {
        domain: input.domain || "(sin dominio)",
        projectId: input.projectId,
        runId: input.runId,
        ownerEmail,
        ownerUserId: input.ownerUserId,
        planId: input.planId,
        triggerSource: input.triggerSource,
        prompts: input.prompts,
        samples: input.samples,
        engines: input.engines,
        internalAccount: isInternalTestAccountEmail(ownerEmail),
        createdAt: new Date()
      },
      { idempotencyKey: `ops-first-scan/${input.projectId}` }
    );
  } catch (error) {
    console.error("[geo:scan] first-scan ops alert failed", {
      projectId: input.projectId,
      runId: input.runId,
      message: error instanceof Error ? error.message : String(error)
    });
  }
}
