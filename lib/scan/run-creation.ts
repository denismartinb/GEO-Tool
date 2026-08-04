import "server-only";

import { resolvePlan } from "@/lib/billing";
import { resolveScanProvidersForPlan } from "@/lib/scan/providers";
import { reconcileStuckScanRuns } from "@/lib/scan/reconciliation";
import { computeSampleCount } from "@/lib/scan/sampling";
import { ProjectActionError, type AuthenticatedContext } from "@/lib/scan/types";
import { createServiceClient } from "@/lib/supabase/service";

type CopyForwardResultRow = {
  prompt_id: string;
  prompt_text_snapshot: string;
  sample_index: number;
  brand_snapshot: string;
  brand_aliases_snapshot: string[] | null;
  competitors_snapshot: unknown;
  country_snapshot: string;
  language_snapshot: string;
  provider: string;
  model: string;
  status: string;
  raw_response_text: string | null;
  raw_response_json: unknown;
  tokens_in: number | null;
  tokens_out: number | null;
  cost_usd: number | null;
  llm_latency_ms: number | null;
  brand_mentioned: boolean;
  citation_found: boolean;
  mentioned_competitors_count: number;
  citations_count: number;
  sentiment: string;
  extraction_version: string;
  extracted_json: unknown;
  extraction_error: string | null;
};

/**
 * For a "partial rescan" (`onlyPromptIds` on `createPendingScanRunCore`), every
 * active prompt NOT being rescanned still needs a row under the new run_id so
 * the new run remains a full per-prompt snapshot — every other screen
 * (Overview, Competitors, Citations, Recommendations, cron) reads only the
 * single latest *completed* run (docs/scan-lifecycle.md). Rather than
 * re-running the LLM for prompts the caller explicitly did not ask to
 * rescan, copy forward each prompt's most recent result per provider from
 * the project's latest completed run.
 *
 * Skips silently (no row copied) for a `carryForwardPromptIds` entry that has
 * no row in that source run — e.g. a prompt created after the last completed
 * scan that has never been scanned. It simply stays absent from this run's
 * snapshot too, same as it already is from the latest completed one.
 */
async function copyForwardLatestResults({
  service,
  projectId,
  newRunId,
  carryForwardPromptIds
}: {
  service: ReturnType<typeof createServiceClient>;
  projectId: string;
  newRunId: string;
  carryForwardPromptIds: string[];
}): Promise<void> {
  if (!carryForwardPromptIds.length) return;

  const { data: latestCompletedRun } = await service
    .from("scan_runs")
    .select("id")
    .eq("project_id", projectId)
    .eq("status", "completed")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // No prior completed run to copy from (e.g. first scan ever): nothing to
  // carry forward. The caller's onlyPromptIds is effectively moot in this
  // case since there is no existing snapshot to preserve.
  if (!latestCompletedRun) return;

  const { data: sourceRows } = await service
    .from("scan_prompt_results")
    .select(
      "prompt_id, prompt_text_snapshot, sample_index, brand_snapshot, brand_aliases_snapshot, competitors_snapshot, country_snapshot, language_snapshot, provider, model, status, raw_response_text, raw_response_json, tokens_in, tokens_out, cost_usd, llm_latency_ms, brand_mentioned, citation_found, mentioned_competitors_count, citations_count, sentiment, extraction_version, extracted_json, extraction_error"
    )
    .eq("project_id", projectId)
    .eq("run_id", latestCompletedRun.id)
    .in("prompt_id", carryForwardPromptIds);

  const rows = (sourceRows ?? []) as unknown as CopyForwardResultRow[];
  if (!rows.length) return;

  await service.from("scan_prompt_results").insert(
    rows.map((row) => ({
      run_id: newRunId,
      project_id: projectId,
      prompt_id: row.prompt_id,
      prompt_text_snapshot: row.prompt_text_snapshot,
      // Carried, not reset. A partial rescan copies forward every sample of
      // every prompt it is not rescanning; collapsing them to the default 0
      // would violate the (run_id, prompt_id, provider, sample_index)
      // uniqueness of migration 0028 the moment a prompt had more than one
      // sample, failing the whole insert.
      sample_index: row.sample_index,
      brand_snapshot: row.brand_snapshot,
      brand_aliases_snapshot: row.brand_aliases_snapshot ?? [],
      competitors_snapshot: row.competitors_snapshot,
      country_snapshot: row.country_snapshot,
      language_snapshot: row.language_snapshot,
      provider: row.provider,
      model: row.model,
      status: row.status,
      raw_response_text: row.raw_response_text,
      raw_response_json: row.raw_response_json,
      tokens_in: row.tokens_in,
      tokens_out: row.tokens_out,
      cost_usd: row.cost_usd,
      llm_latency_ms: row.llm_latency_ms,
      brand_mentioned: row.brand_mentioned,
      citation_found: row.citation_found,
      mentioned_competitors_count: row.mentioned_competitors_count,
      citations_count: row.citations_count,
      sentiment: row.sentiment,
      extraction_version: row.extraction_version,
      extracted_json: row.extracted_json,
      extraction_error: row.extraction_error
    }))
  );
}

/**
 * Shared core of the scan-run creation flow. `readClient` performs the
 * ownership/eligibility reads (the RLS-scoped client in the user path, the
 * service client in the cron path), while `service` performs the system
 * writes. Exported so `reconciliation.ts`'s auto-retry can create a fresh
 * run via a dynamic import (see the cycle note there); it is intentionally
 * NOT re-exported from the `scan-runner` barrel — only the higher-level
 * `createPendingScanRun` / `createPendingScanRunForCron` wrappers are public.
 *
 * `onlyPromptIds` (ADD-PROMPTS-BACKEND-1): when provided, only these active
 * prompt ids get a real `scan_prompt` job (i.e. an actual LLM call) in this
 * run. Every other active prompt is carried forward into the new run via
 * `copyForwardLatestResults` instead of being rescanned, so the run still
 * satisfies the "full snapshot per completed run" invariant relied on by
 * every other screen. Omitted (the default), this scans every active prompt
 * exactly as before — existing callers (cron, the manual "launch scan"
 * button) are unaffected.
 */
export async function createPendingScanRunCore({
  projectId,
  readClient,
  service,
  triggeredByUserId,
  triggerSource,
  onlyPromptIds
}: {
  projectId: string;
  readClient: AuthenticatedContext["supabase"];
  service: ReturnType<typeof createServiceClient>;
  triggeredByUserId: string | null;
  triggerSource: "user" | "cron";
  onlyPromptIds?: string[];
}): Promise<string> {
  const { data: project, error: projectError } = await readClient
    .from("projects")
    // `domain` is read only for the sampling exemption (SAMPLING-1): the
    // agentic pilot's reserved write-project must keep costing ~1 LLM call
    // per scan (see lib/scan/sampling.ts).
    .select("id, domain, is_archived, owner_user_id")
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

  // Read via the service client (not readClient) so this resolves correctly
  // for every caller — the cron path and reconciliation's auto-retry path
  // have no authenticated user/RLS-scoped session to read `profiles` through.
  const { data: profileRow } = await service
    .from("profiles")
    .select("current_plan")
    .eq("id", project.owner_user_id as string)
    .maybeSingle();
  const plan = resolvePlan(profileRow?.current_plan as string | undefined);
  const campaignCap = plan.caps.prompts;

  // PRICING-TRUTH-1 (PR b): Free is "1 escaneo puntual" (see /pricing) — a
  // free-plan project gets exactly one real, *completed* scan, ever. Gated
  // on a prior COMPLETED run rather than "any run exists" so this never
  // fights SCAN-ROBUST-1's auto-retry: a timed-out/failed first attempt
  // doesn't count, and reconcileStuckScanRuns' internal retry (also routed
  // through this function, trigger_source='cron') is free to create the
  // replacement run that gives the user their one real result. Once a
  // completed run exists, this also transitively blocks the recurring-cron
  // path (which independently already requires a completed scan to enable,
  // and is filtered out for free-plan owners in cron.ts) and a repeat
  // manual click, matching "sin tendencia ni monitorización" in the Free
  // plan's own marketing copy.
  if (plan.id === "free") {
    const { data: priorCompletedRun, error: priorRunError } = await service
      .from("scan_runs")
      .select("id")
      .eq("project_id", projectId)
      .eq("status", "completed")
      .limit(1)
      .maybeSingle();

    if (priorRunError) {
      throw new ProjectActionError("unexpected_error");
    }

    if (priorCompletedRun) {
      throw new ProjectActionError("free_plan_scan_limit_reached");
    }
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

  const onlyIdSet = onlyPromptIds?.length ? new Set(onlyPromptIds) : null;

  // When onlyIdSet is set, restrict the candidate pool to those ids (still in
  // is_active, created_at-ascending order) before applying the same cap below
  // — every other active prompt is carried forward, not scanned, by
  // copyForwardLatestResults further down.
  const eligibleForJobs = onlyIdSet
    ? activePrompts.filter((prompt) => onlyIdSet.has(prompt.id))
    : activePrompts;

  if (onlyIdSet && !eligibleForJobs.length) {
    throw new ProjectActionError("prompts_required");
  }

  // Cap the prompts scheduled for this campaign at the owner's plan cap
  // rather than at MAX_REAL_SCAN_PROMPTS (SCAN-CHAIN-1): every active prompt
  // up to what the plan promises gets a real `scan_prompt` job here, and
  // `executePendingScan` processes them across as many batches of
  // MAX_REAL_SCAN_PROMPTS as it takes, self-chaining between batches. A
  // project with more active prompts than its current plan allows (e.g.
  // after a downgrade) still gets a real scan of its oldest active prompts up
  // to the cap, instead of being permanently blocked from scanning.
  const scannedPrompts = eligibleForJobs.slice(0, campaignCap);
  const promptCount = scannedPrompts.length;

  // SAMPLING-1 (ADR 0030): how many times this run asks each prompt of each
  // engine, so a project with few prompts still reaches the response floor
  // the score needs. Resolved HERE, at job-creation time, because the unit of
  // work is one (prompt, sample) job: putting the repetition inside
  // processPromptJob instead would multiply the per-batch concurrency
  // (10 jobs x 3 engines x R calls at once) straight through the ~60s
  // maxDuration budget, whereas one job per sample keeps every batch at the
  // same 30 concurrent calls it makes today and simply uses more batches
  // (docs/adr/0014-batched-self-chaining-scan-execution.md).
  //
  // The engine count comes from the same resolver `executePendingScan` uses,
  // so the number the sampling was sized from cannot drift from the number
  // actually executed.
  const sampling = computeSampleCount({
    promptCount,
    engineCount: resolveScanProvidersForPlan(plan).length,
    planId: plan.id,
    domain: project.domain as string | null | undefined
  });

  // Counts scan_prompt JOBS, not distinct prompts — every progress bar
  // divides `successful_prompts + failed_prompts` (job counts, see
  // refreshRunProgressCounters) by this, so any other definition makes the
  // bar exceed 100%. The distinct-prompt count is recoverable as
  // total_prompts / sample_count (migration 0028).
  const totalJobs = promptCount * sampling.samples;

  const { data: run, error: runError } = await service
    .from("scan_runs")
    .insert({
      project_id: projectId,
      triggered_by_user_id: triggeredByUserId,
      trigger_source: triggerSource,
      status: "pending",
      total_prompts: totalJobs,
      sample_count: sampling.samples,
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
    // Sample-major order (every prompt at sample 0, then every prompt at
    // sample 1, ...) rather than prompt-major. All of these rows are inserted
    // by one statement and therefore share a created_at, so the batch order
    // in `executePendingScan` is not guaranteed to follow this — but where it
    // does, a run cut short by repeated failures degrades into "every prompt
    // measured once" instead of "a third of the prompts measured three
    // times", which is the more useful partial result. Nothing depends on it
    // for correctness.
    ...Array.from({ length: sampling.samples }, (_, sampleIndex) =>
      scannedPrompts.map((prompt) => ({
        project_id: projectId,
        run_id: run.id,
        job_type: "scan_prompt",
        status: "pending",
        payload_json: {
          run_id: run.id,
          project_id: projectId,
          prompt_id: prompt.id,
          prompt_text: prompt.prompt_text,
          sample_index: sampleIndex
        }
      }))
    ).flat(),
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

  if (onlyIdSet) {
    const scannedPromptIdSet = new Set(scannedPrompts.map((prompt) => prompt.id));
    const carryForwardPromptIds = activePrompts
      .filter((prompt) => !scannedPromptIdSet.has(prompt.id))
      .map((prompt) => prompt.id);

    await copyForwardLatestResults({
      service,
      projectId,
      newRunId: run.id,
      carryForwardPromptIds
    });
  }

  return run.id;
}

export async function createPendingScanRun({
  projectId,
  supabase,
  user,
  onlyPromptIds
}: {
  projectId: string;
  supabase: AuthenticatedContext["supabase"];
  user: AuthenticatedContext["user"];
  /** See `createPendingScanRunCore`'s `onlyPromptIds` (ADD-PROMPTS-BACKEND-1). */
  onlyPromptIds?: string[];
}): Promise<string> {
  return createPendingScanRunCore({
    projectId,
    readClient: supabase,
    service: createServiceClient(),
    triggeredByUserId: user.id,
    triggerSource: "user",
    onlyPromptIds
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
