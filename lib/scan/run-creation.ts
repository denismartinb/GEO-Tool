import "server-only";

import { MAX_REAL_SCAN_PROMPTS } from "@/lib/scan/constants";
import { reconcileStuckScanRuns } from "@/lib/scan/reconciliation";
import { ProjectActionError, type AuthenticatedContext } from "@/lib/scan/types";
import { createServiceClient } from "@/lib/supabase/service";

/**
 * Shared core of the scan-run creation flow. `readClient` performs the
 * ownership/eligibility reads (the RLS-scoped client in the user path, the
 * service client in the cron path), while `service` performs the system
 * writes. Exported so `reconciliation.ts`'s auto-retry can create a fresh
 * run via a dynamic import (see the cycle note there); it is intentionally
 * NOT re-exported from the `scan-runner` barrel — only the higher-level
 * `createPendingScanRun` / `createPendingScanRunForCron` wrappers are public.
 */
export async function createPendingScanRunCore({
  projectId,
  readClient,
  service,
  triggeredByUserId,
  triggerSource
}: {
  projectId: string;
  readClient: AuthenticatedContext["supabase"];
  service: ReturnType<typeof createServiceClient>;
  triggeredByUserId: string | null;
  triggerSource: "user" | "cron";
}): Promise<string> {
  const { data: project, error: projectError } = await readClient
    .from("projects")
    .select("id, is_archived")
    .eq("id", projectId)
    .maybeSingle();

  if (projectError) {
    throw new ProjectActionError("unexpected_error");
  }

  if (!project) {
    throw new ProjectActionError("project_not_found");
  }

  if (project.is_archived) {
    throw new ProjectActionError("project_archived");
  }

  // Reconcile any stuck pending/running runs before checking for an active
  // run, so a previously-stuck scan does not permanently block a new one
  // (docs/scan-lifecycle.md, "Timeout detection" / invariant 3).
  await reconcileStuckScanRuns({ projectId, service });

  const { data: activeRun, error: activeRunError } = await readClient
    .from("scan_runs")
    .select("id")
    .eq("project_id", projectId)
    .in("status", ["pending", "running"])
    .limit(1)
    .maybeSingle();

  if (activeRunError) {
    throw new ProjectActionError("unexpected_error");
  }

  if (activeRun) {
    throw new ProjectActionError("active_run_exists");
  }

  const { data: activePrompts, error: promptError } = await readClient
    .from("project_prompts")
    .select("id, prompt_text")
    .eq("project_id", projectId)
    .eq("is_active", true)
    .order("created_at", { ascending: true });

  if (promptError) {
    throw new ProjectActionError("unexpected_error");
  }

  if (!activePrompts?.length) {
    throw new ProjectActionError("prompts_required");
  }

  if (activePrompts.length > MAX_REAL_SCAN_PROMPTS) {
    throw new ProjectActionError("too_many_prompts");
  }

  const promptCount = activePrompts.length;

  const { data: run, error: runError } = await service
    .from("scan_runs")
    .insert({
      project_id: projectId,
      triggered_by_user_id: triggeredByUserId,
      trigger_source: triggerSource,
      status: "pending",
      total_prompts: promptCount,
      successful_prompts: 0,
      failed_prompts: 0,
      extraction_version: "v1",
      scoring_version: "v1"
    })
    .select("id")
    .single();

  if (runError || !run) {
    throw new ProjectActionError("scan_failed");
  }

  const jobsPayload = [
    {
      project_id: projectId,
      run_id: run.id,
      job_type: "scan_start",
      status: "pending",
      payload_json: { run_id: run.id, project_id: projectId }
    },
    ...activePrompts.map((prompt) => ({
      project_id: projectId,
      run_id: run.id,
      job_type: "scan_prompt",
      status: "pending",
      payload_json: {
        run_id: run.id,
        project_id: projectId,
        prompt_id: prompt.id,
        prompt_text: prompt.prompt_text
      }
    })),
    {
      project_id: projectId,
      run_id: run.id,
      job_type: "scan_finalize",
      status: "pending",
      payload_json: { run_id: run.id, project_id: projectId }
    }
  ];

  const { error: jobsError } = await service.from("jobs").insert(jobsPayload);

  if (jobsError) {
    await service
      .from("scan_runs")
      .update({
        status: "failed",
        error_summary: "No se han podido crear los jobs del escaneo.",
        finished_at: new Date().toISOString()
      })
      .eq("id", run.id)
      .eq("project_id", projectId);

    throw new ProjectActionError("scan_failed");
  }

  return run.id;
}

export async function createPendingScanRun({
  projectId,
  supabase,
  user
}: {
  projectId: string;
  supabase: AuthenticatedContext["supabase"];
  user: AuthenticatedContext["user"];
}): Promise<string> {
  return createPendingScanRunCore({
    projectId,
    readClient: supabase,
    service: createServiceClient(),
    triggeredByUserId: user.id,
    triggerSource: "user"
  });
}

/**
 * Cron-triggered variant of createPendingScanRun: no authenticated user, all
 * reads and writes go through the service client, and the run is recorded
 * with trigger_source='cron' and triggered_by_user_id=null (see migration
 * 0008_recurring_scans.sql).
 */
export async function createPendingScanRunForCron({
  projectId,
  service
}: {
  projectId: string;
  service: ReturnType<typeof createServiceClient>;
}): Promise<string> {
  return createPendingScanRunCore({
    projectId,
    readClient: service,
    service,
    triggeredByUserId: null,
    triggerSource: "cron"
  });
}
