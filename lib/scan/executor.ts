import "server-only";

import { after } from "next/server";
import { resolvePlan } from "@/lib/billing";
import { generateGeminiVisibilityAnswer, GeminiConfigError } from "@/lib/llm/gemini";
import type { GeminiVisibilityResponse } from "@/lib/llm/contracts";
import { generateClaudeVisibilityAnswer, ClaudeConfigError } from "@/lib/llm/claude";
import { generateOpenAIVisibilityAnswer, OpenAIConfigError } from "@/lib/llm/openai";
import { generateRecommendationsForRun } from "@/lib/recommendations/recommendation-engine";
import {
  computeRecommendationTransition,
  type PreviousRecommendationRow
} from "@/lib/recommendations/recommendation-history";
import { computeEngineCoverage } from "@/lib/scan/engine-coverage";
import { resolveScanProvidersForPlan, type LLMScanProvider } from "@/lib/scan/providers";
import {
  resolveTechnicalComponent,
  TECHNICAL_SNAPSHOT_LOOKUP_LIMIT
} from "@/lib/scoring/geo-score-technical";
import { computeRunScoresFromResults, SCORING_VERSION } from "@/lib/scoring/run-scoring";
import { checkAndSendScoreDropAlert } from "@/lib/scan/score-alert";
import { checkAndSendScanHealthAlert } from "@/lib/scan/scan-health-alert";
import { createServiceClient } from "@/lib/supabase/service";
import {
  EXTRACTION_VERSION,
  FINALIZE_LOCK_LEASE_MS,
  MAX_REAL_SCAN_PROMPTS,
  PROMPT_LOCK_LEASE_MS,
  PROMPT_RETRY_DELAY_MS,
  PROMPT_RETRY_MAX_TOTAL_ATTEMPTS,
  PROMPT_VERSION,
  SCAN_INVOCATION_WORK_BUDGET_MS
} from "@/lib/scan/constants";
import { computeStaggerDelaysMs } from "@/lib/scan/pacing";
import { triggerScanContinuation } from "@/lib/scan/continuation";
import { ProjectActionError, type AuthenticatedContext, type JobRow } from "@/lib/scan/types";
import { getSanitizedScanError } from "@/lib/scan/errors";
import { logJob } from "@/lib/scan/job-logging";
import { countUnprocessedExtractionRows, runStructuredExtractionForRun } from "@/lib/scan/extraction";
import { emitNotification } from "@/lib/notifications/emit";
import { getSiteUrl } from "@/lib/site-url";
import { enqueueWebAuditJob } from "@/lib/web-audit/audit-job-runner";
import { isAutoWebAuditEnabled, triggerWebAuditRun } from "@/lib/web-audit/audit-dispatch";
import { gapPendingKey, gapResolvedKey, scanCompletedKey, scanFailedKey } from "@/lib/notifications/dedupe-keys";

// gap_resolved's sampleTitles (NOTIF-SERVER-1a) needs each previous-run
// recommendation's title, which PreviousRecommendationRow (RECS-3) doesn't
// carry — extended locally rather than widening that shared type for one
// caller.
type PreviousRecommendationRowWithTitle = PreviousRecommendationRow & { title: string };

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Provider resolution moved to lib/scan/providers.ts (SAMPLING-1) so
// run-creation.ts can size the sampling from the same engine count this
// module executes with, without importing the executor's whole dependency
// graph. Re-exported here so existing call sites keep working unchanged.
export { getLLMScanProviders, type LLMScanProvider } from "@/lib/scan/providers";

type PromptJobOutcome =
  | { kind: "success" }
  | { kind: "failed" }
  | { kind: "config_error"; error: Error };

type ProviderAttemptResult =
  | { provider: LLMScanProvider; kind: "success"; llmResult: GeminiVisibilityResponse; latency: number }
  | { provider: LLMScanProvider; kind: "config_error"; error: Error }
  | { provider: LLMScanProvider; kind: "retryable_error"; error: unknown };

async function callProvider(
  provider: LLMScanProvider,
  input: { prompt: string; country: string; language: string }
): Promise<GeminiVisibilityResponse> {
  if (provider === "claude") return generateClaudeVisibilityAnswer(input);
  if (provider === "openai") return generateOpenAIVisibilityAnswer(input);
  return generateGeminiVisibilityAnswer(input);
}

// Processes a single scan_prompt job end-to-end (status transitions, one LLM
// call per active engine with shared retry rounds, scan_prompt_results insert
// per successful engine, job logging). Run concurrently for all prompt jobs
// in a run (SCAN-ROBUST-2) so total LLM latency for a 6-prompt run stays
// within the Hobby plan's maxDuration=60s budget
// (docs/adr/0003-sync-scan-execution-and-maxduration.md); engines for the same
// prompt also run concurrently with each other rather than sequentially, so
// adding a second engine does not add to that budget. The job succeeds if at
// least one engine produces a result. A GeminiConfigError/ClaudeConfigError
// is only fatal for the whole run if every active engine for this prompt is
// config-errored — one misconfigured engine must never take down another
// engine that is working fine.
async function processPromptJob({
  service,
  projectId,
  runId,
  job,
  project,
  competitors,
  providers
}: {
  service: ReturnType<typeof createServiceClient>;
  projectId: string;
  runId: string;
  job: JobRow;
  project: { brand: string; brand_aliases?: string[] | null; country: string; language: string };
  competitors: { name: string; domain: string }[];
  providers: LLMScanProvider[];
}): Promise<PromptJobOutcome> {
  const baseAttemptCount = job.attempt_count;

  await service
    .from("jobs")
    .update({
      status: "running",
      locked_at: new Date().toISOString(),
      locked_by: "gemini-executor",
      attempt_count: baseAttemptCount + 1,
      last_error: null
    })
    .eq("id", job.id)
    .eq("project_id", projectId)
    .eq("run_id", runId);

  const promptId = String(job.payload_json.prompt_id ?? "");
  const promptText = String(job.payload_json.prompt_text ?? "").trim();
  // SAMPLING-1: which repetition of this prompt this job is. Absent on jobs
  // created before ADR 0030 (and on any single-sample run), which is exactly
  // sample 0 — the same value migration 0028 backfills by default. Coerced
  // defensively: a non-numeric payload must not silently become NaN and blow
  // up the insert's NOT NULL constraint mid-scan.
  const rawSampleIndex = Number(job.payload_json.sample_index ?? 0);
  const sampleIndex = Number.isFinite(rawSampleIndex) && rawSampleIndex >= 0 ? Math.floor(rawSampleIndex) : 0;

  if (!promptId || !promptText) {
    await logJob(service, {
      jobId: job.id,
      projectId,
      runId,
      level: "error",
      message: "Missing prompt payload for scan_prompt job."
    });

    await service
      .from("jobs")
      .update({
        status: "failed",
        locked_at: null,
        locked_by: null,
        last_error: "Missing prompt payload."
      })
      .eq("id", job.id)
      .eq("project_id", projectId)
      .eq("run_id", runId);

    return { kind: "failed" };
  }

  // Scoped to THIS sample: the idempotency guard is "has this unit of work
  // already produced a row", and after ADR 0030 the unit of work is
  // (run, prompt, engine, sample). Without the sample_index filter every
  // repetition after the first would see sample 0's rows, conclude there was
  // nothing left to do, and complete without making a single call — the run
  // would report 60 successful jobs and hold 20 responses.
  const { data: existingResults } = await service
    .from("scan_prompt_results")
    .select("provider")
    .eq("run_id", runId)
    .eq("project_id", projectId)
    .eq("prompt_id", promptId)
    .eq("sample_index", sampleIndex);

  const existingProviders = new Set((existingResults ?? []).map((row) => row.provider as string));
  const pendingProviders = providers.filter((provider) => !existingProviders.has(provider));

  if (pendingProviders.length === 0) {
    await logJob(service, {
      jobId: job.id,
      projectId,
      runId,
      level: "warn",
      message: "Skipping prompt job because a result already exists for every active engine.",
      context: { prompt_id: promptId, sample_index: sampleIndex, providers }
    });
    await service
      .from("jobs")
      .update({
        status: "completed",
        locked_at: null,
        locked_by: null
      })
      .eq("id", job.id)
      .eq("project_id", projectId)
      .eq("run_id", runId);

    return { kind: "success" };
  }

  // Per-prompt retry (SCAN-ROBUST-1): total attempt rounds for this prompt are
  // bounded by both `job.max_attempts` (jobs table, default 3) and
  // PROMPT_RETRY_MAX_TOTAL_ATTEMPTS (2 — one retry), whichever is lower. Every
  // engine that hasn't yet succeeded or hit a config error is retried
  // together in the same round, so `job.attempt_count` reflects retry rounds
  // for the prompt as a whole, not a per-engine call count. `attempt_count`
  // already reflects round 1 from the update above; subsequent rounds bump it
  // again before retrying.
  const totalAttempts = Math.max(1, Math.min(job.max_attempts, PROMPT_RETRY_MAX_TOTAL_ATTEMPTS));

  const remaining = new Set(pendingProviders);
  const succeededProviders: LLMScanProvider[] = [];
  const configErroredProviders = new Set<LLMScanProvider>();
  let firstConfigError: Error | null = null;

  for (let attempt = 1; attempt <= totalAttempts && remaining.size > 0; attempt += 1) {
    if (attempt > 1) {
      await delay(PROMPT_RETRY_DELAY_MS);
      await service
        .from("jobs")
        .update({
          status: "running",
          locked_at: new Date().toISOString(),
          locked_by: "gemini-executor",
          attempt_count: baseAttemptCount + attempt,
          last_error: null
        })
        .eq("id", job.id)
        .eq("project_id", projectId)
        .eq("run_id", runId);
    }

    const attemptProviders = Array.from(remaining);
    const settled = await Promise.allSettled(
      attemptProviders.map(async (provider): Promise<ProviderAttemptResult> => {
        try {
          const llmStart = Date.now();
          const llmResult = await callProvider(provider, {
            prompt: promptText,
            country: project.country,
            language: project.language
          });
          return { provider, kind: "success", llmResult, latency: Date.now() - llmStart };
        } catch (error) {
          if (error instanceof GeminiConfigError || error instanceof ClaudeConfigError || error instanceof OpenAIConfigError) {
            return { provider, kind: "config_error", error };
          }
          return { provider, kind: "retryable_error", error };
        }
      })
    );

    for (const outcome of settled) {
      // callProvider's try/catch above converts every failure into a
      // resolved ProviderAttemptResult, so Promise.allSettled here never
      // produces a "rejected" entry.
      if (outcome.status !== "fulfilled") continue;
      const result = outcome.value;

      if (result.kind === "config_error") {
        remaining.delete(result.provider);
        configErroredProviders.add(result.provider);
        firstConfigError = firstConfigError ?? result.error;

        await logJob(service, {
          jobId: job.id,
          projectId,
          runId,
          level: "error",
          message: "LLM prompt execution failed (config error).",
          context: { prompt_id: promptId, provider: result.provider, error: result.error.message }
        });
        continue;
      }

      if (result.kind === "retryable_error") {
        const isLastAttempt = attempt === totalAttempts;
        await logJob(service, {
          jobId: job.id,
          projectId,
          runId,
          level: isLastAttempt ? "error" : "warn",
          message: isLastAttempt ? "LLM prompt execution failed." : "LLM prompt execution failed, retrying.",
          context: {
            prompt_id: promptId,
            provider: result.provider,
            attempt,
            total_attempts: totalAttempts,
            error: result.error instanceof Error ? result.error.message : String(result.error)
          }
        });
        continue;
      }

      // result.kind === "success"
      remaining.delete(result.provider);

      const responseLower = result.llmResult.text.toLowerCase();
      const brandMentioned = responseLower.includes(project.brand.toLowerCase());
      const mentionedCompetitorsCount = competitors.reduce(
        (acc, competitor) => (responseLower.includes(competitor.name.toLowerCase()) ? acc + 1 : acc),
        0
      );

      // Real citation extraction (grounding chunks + structured extraction)
      // happens later in runStructuredExtractionForRun. citation_found /
      // citations_count / extracted_json start unset here and are filled in
      // by that step — see docs/adr/0004-gemini-search-grounding.md.
      const { error: resultError } = await service.from("scan_prompt_results").insert({
        run_id: runId,
        project_id: projectId,
        prompt_id: promptId,
        prompt_text_snapshot: promptText,
        sample_index: sampleIndex,
        brand_snapshot: project.brand,
        // Frozen alongside brand/competitors so this row stays interpretable
        // after the project's alias list changes (migration 0025).
        brand_aliases_snapshot: project.brand_aliases ?? [],
        competitors_snapshot: competitors.map((c) => ({ name: c.name, domain: c.domain })),
        country_snapshot: project.country,
        language_snapshot: project.language,
        provider: result.provider,
        model: result.llmResult.model,
        status: "completed",
        raw_response_text: result.llmResult.text,
        raw_response_json: {
          text: result.llmResult.text,
          total_tokens: result.llmResult.totalTokens,
          grounding_chunks: result.llmResult.groundingChunks ?? [],
          prompt_version: PROMPT_VERSION
        },
        tokens_in: result.llmResult.tokensIn,
        tokens_out: result.llmResult.tokensOut,
        cost_usd: null,
        llm_latency_ms: result.latency,
        brand_mentioned: brandMentioned,
        citation_found: false,
        mentioned_competitors_count: mentionedCompetitorsCount,
        citations_count: 0,
        sentiment: "unknown" as const,
        extraction_version: "phase4-basic-v1",
        extracted_json: null
      });

      if (resultError) {
        await logJob(service, {
          jobId: job.id,
          projectId,
          runId,
          level: "error",
          message: "Failed to insert prompt result.",
          context: { prompt_id: promptId, provider: result.provider, reason: resultError.message }
        });
        continue;
      }

      succeededProviders.push(result.provider);
      await logJob(service, {
        jobId: job.id,
        projectId,
        runId,
        level: "info",
        message: "Prompt job completed for engine.",
        context: { prompt_id: promptId, provider: result.provider, brand_mentioned: brandMentioned }
      });
    }
  }

  if (succeededProviders.length > 0) {
    await service
      .from("jobs")
      .update({
        status: "completed",
        locked_at: null,
        locked_by: null
      })
      .eq("id", job.id)
      .eq("project_id", projectId)
      .eq("run_id", runId);

    return { kind: "success" };
  }

  // No engine produced a result for this prompt. If every active engine was
  // config-errored, this is a fatal, run-level misconfiguration (same
  // semantics as the original single-provider behavior). A *partial* config
  // error — one engine misconfigured, another merely failed/timed out —
  // falls through to the generic "failed" branch instead, so a working
  // engine is never taken down by an unrelated engine's bad config.
  if (firstConfigError && configErroredProviders.size === pendingProviders.length) {
    return { kind: "config_error", error: firstConfigError };
  }

  const errorSummary = getSanitizedScanError(null);

  await service
    .from("jobs")
    .update({
      status: "failed",
      locked_at: null,
      locked_by: null,
      last_error: errorSummary
    })
    .eq("id", job.id)
    .eq("project_id", projectId)
    .eq("run_id", runId);

  return { kind: "failed" };
}

/**
 * Recomputes `scan_runs.successful_prompts`/`failed_prompts` from the actual
 * `jobs` rows (SCAN-CHAIN-1) rather than threading a delta count through
 * across batches. This is deliberately a full recount, not an increment: a
 * campaign can be advanced by more than one invocation in rare races (a
 * duplicate continuation fetch), so counting from the source of truth is
 * safe under concurrency in a way a `current + delta` read-modify-write is
 * not. Also serves as the "campaign made progress" write that bumps
 * `scan_runs.updated_at` (via the existing trigger), which is what
 * `reconcileStuckScanRuns` now keys its staleness check on.
 */
async function refreshRunProgressCounters({
  service,
  projectId,
  runId
}: {
  service: ReturnType<typeof createServiceClient>;
  projectId: string;
  runId: string;
}): Promise<{ successCount: number; failedCount: number }> {
  const [{ count: successCount }, { count: failedCount }] = await Promise.all([
    service
      .from("jobs")
      .select("id", { count: "exact", head: true })
      .eq("project_id", projectId)
      .eq("run_id", runId)
      .eq("job_type", "scan_prompt")
      .eq("status", "completed"),
    service
      .from("jobs")
      .select("id", { count: "exact", head: true })
      .eq("project_id", projectId)
      .eq("run_id", runId)
      .eq("job_type", "scan_prompt")
      .eq("status", "failed")
  ]);

  await service
    .from("scan_runs")
    .update({ successful_prompts: successCount ?? 0, failed_prompts: failedCount ?? 0 })
    .eq("id", runId)
    .eq("project_id", projectId);

  return { successCount: successCount ?? 0, failedCount: failedCount ?? 0 };
}

/**
 * Re-exported from its own leaf module (see `lib/site-url.ts` for why): the
 * post-scan audit dispatcher needs it and this file imports the dispatcher,
 * so defining it here would close an import cycle.
 */
export { getSiteUrl };

export async function executePendingScan({
  projectId,
  runId,
  supabase
}: {
  projectId: string;
  runId: string;
  supabase: AuthenticatedContext["supabase"];
}) {
  // One absolute deadline for everything this invocation does. Generation
  // spends from it first; whatever remains is what extraction gets, across
  // both the batch pass and the finalize sweep. See
  // SCAN_INVOCATION_WORK_BUDGET_MS — a per-pass budget is what pushed the
  // final batch's invocation past Vercel's 60s ceiling in production.
  const workDeadlineAt = Date.now() + SCAN_INVOCATION_WORK_BUDGET_MS;

  const { data: run, error: runError } = await supabase
    .from("scan_runs")
    .select("id, project_id, status, total_prompts, sample_count")
    .eq("id", runId)
    .eq("project_id", projectId)
    .single();

  if (runError || !run) {
    throw new ProjectActionError("project_not_found");
  }

  // A late/duplicate invocation (e.g. a retried continuation dispatch)
  // landing on an already-terminal run has nothing to do — some other
  // invocation already finished or aborted this campaign. Not an error.
  if (run.status === "completed" || run.status === "failed" || run.status === "cancelled") {
    return;
  }

  if (run.status !== "pending" && run.status !== "running") {
    throw new ProjectActionError("scan_failed");
  }

  const isFirstBatch = run.status === "pending";
  const service = createServiceClient();

  const { data: project } = await supabase
    .from("projects")
    .select("id, domain, brand, brand_aliases, country, language, owner_user_id")
    .eq("id", projectId)
    .single();

  if (!project) {
    throw new ProjectActionError("project_not_found");
  }

  const [{ data: competitors }, { data: jobsRaw, error: jobsError }] = await Promise.all([
    supabase
      .from("project_competitors")
      .select("name, domain")
      .eq("project_id", projectId)
      .eq("is_active", true)
      .order("created_at", { ascending: true }),
    service
      .from("jobs")
      .select("id, job_type, status, attempt_count, max_attempts, payload_json, created_at, locked_at")
      .eq("project_id", projectId)
      .eq("run_id", runId)
      .order("created_at", { ascending: true })
  ]);

  if (jobsError || !jobsRaw?.length) {
    const noJobsErrorSummary = "No se han encontrado jobs para el escaneo.";
    await service
      .from("scan_runs")
      .update({
        status: "failed",
        error_summary: noJobsErrorSummary,
        finished_at: new Date().toISOString()
      })
      .eq("id", runId)
      .eq("project_id", projectId);

    await emitNotification(service, {
      ownerUserId: project.owner_user_id as string,
      projectId,
      type: "scan_failed",
      severity: "critical",
      dedupeKey: scanFailedKey(runId),
      payload: { runId, errorSummary: noJobsErrorSummary }
    });

    throw new ProjectActionError("scan_failed");
  }

  const jobs = jobsRaw as unknown as (JobRow & { created_at: string })[];
  const startJob = jobs.find((job) => job.job_type === "scan_start");
  const finalizeJob = jobs.find((job) => job.job_type === "scan_finalize");
  const nowIso = new Date().toISOString();
  const promptLeaseExpiredBefore = new Date(Date.now() - PROMPT_LOCK_LEASE_MS).toISOString();

  const promptJobs = jobs.filter((job) => job.job_type === "scan_prompt");

  // A `running` prompt job whose lock is older than the lease belongs to an
  // invocation that is gone (SCAN-DRIVE-1). Nothing else recovers it —
  // `reconcileStuckScanRuns` only ever touches `scan_runs` — so before this,
  // one killed batch left its jobs `running` forever, the campaign could never
  // observe "every prompt job terminal", and finalize was unreachable. Same
  // lease the finalize job has had since docs/adr/0029; it was simply never
  // extended to the batches, which are the part that actually spends tens of
  // seconds on provider calls.
  const staleRunningJobs = promptJobs.filter(
    (job) => job.status === "running" && Boolean(job.locked_at) && String(job.locked_at) < promptLeaseExpiredBefore
  );

  // A job that has already spent its attempts must not be reclaimed forever:
  // it is failed instead, which takes it out of the unfinished set and lets
  // the campaign reach finalize with a truthful count. Without this split, a
  // job that reliably kills its invocation would be re-claimed on every pass.
  const reclaimableJobs = staleRunningJobs.filter((job) => job.attempt_count < job.max_attempts);
  const exhaustedStaleJobs = staleRunningJobs.filter((job) => job.attempt_count >= job.max_attempts);

  // Oldest work first — a reclaimed job is older than anything still pending,
  // and it is what blocks the campaign from finalizing. Anything beyond
  // MAX_REAL_SCAN_PROMPTS waits for the next self-chained invocation.
  const batchCandidates = [
    ...reclaimableJobs,
    ...promptJobs.filter((job) => job.status === "pending")
  ].slice(0, MAX_REAL_SCAN_PROMPTS);

  if (isFirstBatch) {
    const { data: runningRun, error: runStartError } = await service
      .from("scan_runs")
      .update({ status: "running", started_at: nowIso, error_summary: null })
      .eq("id", runId)
      .eq("project_id", projectId)
      .eq("status", "pending")
      .select("id")
      .maybeSingle();

    if (runStartError || !runningRun) {
      throw new ProjectActionError("scan_failed");
    }
  }

  // Plan-capped engine set (PRICING-TRUTH-1 PR b) — see
  // resolveScanProvidersForPlan. Shared with createPendingScanRunCore so the
  // engine count the sampling was sized from is the same one executed here.
  const { data: ownerProfile } = await service
    .from("profiles")
    .select("current_plan")
    .eq("id", project.owner_user_id as string)
    .maybeSingle();
  const plan = resolvePlan(ownerProfile?.current_plan as string | undefined);

  /**
   * `engine_{gemini,claude,openai}_enabled` (ENGINE-DEBUG-TOGGLE-1, migration
   * 0033), re-read HERE rather than carried in `run` from creation time — same
   * "re-read at execution, don't freeze at enqueue" rule WEB-AUDIT-AUTO-SPLIT-1
   * established for its audit-half switches: a batch executed later than
   * creation must see whatever the founder's switches say NOW, not what they
   * said when the run was created. Isolated query for the same reason as
   * `run-creation.ts`'s: the select above (`project`) is on the execution
   * critical path, and a column PostgREST doesn't know about must not fail it.
   */
  const { data: engineFlagsRow } = await service
    .from("projects")
    .select("engine_gemini_enabled, engine_claude_enabled, engine_openai_enabled")
    .eq("id", projectId)
    .maybeSingle();

  const enabledEngines: LLMScanProvider[] | undefined = engineFlagsRow
    ? (
        [
          engineFlagsRow.engine_gemini_enabled !== false ? "gemini" : null,
          engineFlagsRow.engine_claude_enabled !== false ? "claude" : null,
          engineFlagsRow.engine_openai_enabled !== false ? "openai" : null
        ].filter(Boolean) as LLMScanProvider[]
      )
    : undefined;

  const providers = resolveScanProvidersForPlan(plan, enabledEngines);

  try {
    // Same fake-scan guard as `createPendingScanRunCore` — see its comment.
    // Reachable here only if every engine was switched off strictly between
    // this run's creation and this batch executing. Thrown INSIDE this `try`,
    // not before it, so the `catch` below marks the run `failed` with a real
    // `error_summary` instead of leaving it `pending`/`running` for
    // `reconcileStuckScanRuns` to notice only once its timeout elapses.
    if (providers.length === 0) {
      throw new ProjectActionError("no_engines_enabled");
    }

    if (isFirstBatch && startJob) {
      await service
        .from("jobs")
        .update({
          status: "running",
          locked_at: new Date().toISOString(),
          locked_by: "gemini-executor",
          attempt_count: startJob.attempt_count + 1,
          last_error: null
        })
        .eq("id", startJob.id)
        .eq("project_id", projectId)
        .eq("run_id", runId);

      await logJob(service, {
        jobId: startJob.id,
        projectId,
        runId,
        level: "info",
        message: "LLM scan started.",
        // sample_count logged alongside the engine set (SAMPLING-1) so
        // "why did this run make 3x the calls" is answerable from job_logs
        // alone, without recomputing the sampling decision after the fact.
        context: { providers, sample_count: run.sample_count ?? 1 }
      });

      await service
        .from("jobs")
        .update({
          status: "completed",
          locked_at: null,
          locked_by: null
        })
        .eq("id", startJob.id)
        .eq("project_id", projectId)
        .eq("run_id", runId);
    }

    // A stale-locked job that has no attempts left is failed rather than
    // reclaimed, so it stops blocking the campaign's path to finalize. The
    // error is a constant this codebase authored (never a provider string),
    // per .claude/rules/scan.md.
    if (exhaustedStaleJobs.length > 0) {
      const staleJobErrorSummary = getSanitizedScanError(null);

      await service
        .from("jobs")
        .update({ status: "failed", locked_at: null, locked_by: null, last_error: staleJobErrorSummary })
        .eq("project_id", projectId)
        .eq("run_id", runId)
        .eq("status", "running")
        .lt("locked_at", promptLeaseExpiredBefore)
        .in(
          "id",
          exhaustedStaleJobs.map((job) => job.id)
        );

      for (const job of exhaustedStaleJobs) {
        await logJob(service, {
          jobId: job.id,
          projectId,
          runId,
          level: "error",
          message: "Prompt job failed: lock lease expired with no attempts left.",
          context: { attempt_count: job.attempt_count, max_attempts: job.max_attempts }
        });
      }
    }

    // Atomically claim this batch's candidates (SCAN-CHAIN-1): a duplicate
    // continuation dispatch (network retry, an `after()` re-fire) racing
    // against this invocation can only ever "win" jobs that are still
    // `pending` at the moment of the update — whichever invocation's UPDATE
    // commits first for a given row is the only one that processes it.
    //
    // Two claims, not one, because a candidate is either still `pending` or a
    // `running` job whose lease expired (SCAN-DRIVE-1). Both are the same
    // atomic conditional UPDATE — the reclaim additionally requires the lock
    // to be older than the lease, so whichever invocation commits first moves
    // `locked_at` and every racing one stops matching. Splitting them keeps
    // each predicate exact: a claim that matched `running` unconditionally
    // would steal work from a live invocation.
    const claimPatch = { status: "running", locked_at: nowIso, locked_by: "gemini-executor" };
    const claimedColumns = "id, job_type, status, attempt_count, max_attempts, payload_json, created_at, locked_at";
    const claimedJobs: (JobRow & { created_at: string })[] = [];

    const pendingCandidateIds = batchCandidates.filter((job) => job.status === "pending").map((job) => job.id);
    const reclaimCandidateIds = batchCandidates.filter((job) => job.status === "running").map((job) => job.id);

    if (pendingCandidateIds.length > 0) {
      const { data: claimedRows, error: claimError } = await service
        .from("jobs")
        .update(claimPatch)
        .eq("project_id", projectId)
        .eq("run_id", runId)
        .eq("status", "pending")
        .in("id", pendingCandidateIds)
        .select(claimedColumns);

      if (claimError) {
        throw new ProjectActionError("scan_failed");
      }

      claimedJobs.push(...((claimedRows ?? []) as unknown as (JobRow & { created_at: string })[]));
    }

    if (reclaimCandidateIds.length > 0) {
      const { data: reclaimedRows, error: reclaimError } = await service
        .from("jobs")
        .update(claimPatch)
        .eq("project_id", projectId)
        .eq("run_id", runId)
        .eq("status", "running")
        .lt("locked_at", promptLeaseExpiredBefore)
        .in("id", reclaimCandidateIds)
        .select(claimedColumns);

      if (reclaimError) {
        throw new ProjectActionError("scan_failed");
      }

      const reclaimed = (reclaimedRows ?? []) as unknown as (JobRow & { created_at: string })[];

      for (const job of reclaimed) {
        await logJob(service, {
          jobId: job.id,
          projectId,
          runId,
          level: "warn",
          message: "Reclaimed a prompt job whose lock lease expired.",
          context: { attempt_count: job.attempt_count, max_attempts: job.max_attempts, providers }
        });
      }

      claimedJobs.push(...reclaimed);
    }

    if (claimedJobs.length > 0) {
      // Run this batch's prompt jobs concurrently (SCAN-ROBUST-2) so the LLM
      // calls overlap instead of summing — keeping each batch within the
      // Hobby plan's hard maxDuration=60s budget
      // (docs/adr/0003-sync-scan-execution-and-maxduration.md). A campaign
      // larger than MAX_REAL_SCAN_PROMPTS spans multiple such batches,
      // chained below (docs/adr/0014-batched-self-chaining-scan-execution.md).
      // LLM-RESILIENCE-1: spread the starts. Every job below fires one call
      // per engine, so dispatching the whole batch on the same tick puts up to
      // MAX_REAL_SCAN_PROMPTS simultaneous requests on each provider from a
      // standing start — the burst shape that `EXTRACTION_CONCURRENCY` already
      // exists to avoid one stage later. Bounded and budget-aware; see
      // computeStaggerDelaysMs.
      const staggerDelays = computeStaggerDelaysMs({
        count: claimedJobs.length,
        remainingBudgetMs: workDeadlineAt - Date.now()
      });

      const promptJobResults = await Promise.allSettled(
        claimedJobs.map(async (job, index) => {
          const wait = staggerDelays[index] ?? 0;
          if (wait > 0) await delay(wait);
          return processPromptJob({
            service,
            projectId,
            runId,
            job,
            project,
            competitors: (competitors ?? []).map((c) => ({ name: c.name, domain: c.domain })),
            providers
          });
        })
      );

      let configError: Error | null = null;

      for (const settled of promptJobResults) {
        if (settled.status === "rejected") continue;
        if (settled.value.kind === "config_error") {
          configError = settled.value.error;
        }
      }

      if (configError) {
        throw configError;
      }

      await refreshRunProgressCounters({ service, projectId, runId });

      // EXTRACTION-RELIABILITY-1: extract this batch's rows in the same
      // invocation that generated them, instead of leaving every row in the
      // campaign to a single pass at finalize. That pass was capped at 20
      // rows and silently dropped the rest; spreading the work across the
      // batches that produce it is what makes an uncapped extraction fit the
      // ~60s budget at all (docs/adr/0029). Anything this pass cannot reach
      // stays eligible for the next batch or for the finalize sweep below.
      await runStructuredExtractionForRun({ service, projectId, runId, deadlineAt: workDeadlineAt });

      // Second progress write, after the pass rather than only before it, so
      // every invocation bumps `scan_runs.updated_at` on its way out. Without
      // it, a long extraction pass is indistinguishable from a stalled
      // campaign to `reconcileStuckScanRuns`, which keys staleness on
      // `updated_at` — a run doing real work must never look stuck.
      await refreshRunProgressCounters({ service, projectId, runId });
    }

    // Not just `pending`: a job another concurrent invocation is actively
    // processing is `running`, not yet `completed`/`failed`. Treating that as
    // "nothing left" would let this invocation finalize the campaign (run
    // scoring/recommendations) while results for that job are still being
    // written elsewhere — checking both statuses is what makes finalize wait
    // for every job to reach a terminal state, not just for the pending queue
    // to empty out.
    const { count: unfinishedCount } = await service
      .from("jobs")
      .select("id", { count: "exact", head: true })
      .eq("project_id", projectId)
      .eq("run_id", runId)
      .eq("job_type", "scan_prompt")
      .in("status", ["pending", "running"]);

    if ((unfinishedCount ?? 0) > 0) {
      // Work remains, and this invocation made real progress
      // (claimedJobs.length > 0), so it owns handing off to the next batch
      // without making whoever called executePendingScan (the manual scan
      // action, the cron sweep, a prior continuation) wait for it. If this
      // invocation claimed nothing — every candidate was already claimed by
      // another in-flight invocation — the unfinished work belongs to that
      // other invocation; scheduling a second continuation here would just
      // be redundant.
      //
      // The hand-off is now unconditional (SCAN-DRIVE-1). It used to be
      // suppressed for the foreground driver, on the reasoning that the
      // driver loops the batches itself and a preview deploy may not be able
      // to reach the secret-gated endpoint anyway (docs/adr/0014). What that
      // missed is that the foreground driver lives in the user's *browser*:
      // when a phone locks the screen or the tab is backgrounded, iOS Safari
      // suspends its JavaScript, the loop stops asking for batches, and the
      // campaign has no other driver anywhere. That is the 2026-08-07
      // genscore.es failure — two runs, 31 prompts, 50 real answers
      // generated and thrown away, with every unfinished job left `pending`
      // and nothing in the system able to claim it (docs/adr/0037).
      //
      // A duplicate dispatch racing the foreground loop is safe by
      // construction, not by luck: batches are claimed with an atomic
      // conditional UPDATE, so whichever invocation commits first is the only
      // one that processes a given job. The cost of an unreachable
      // continuation on a preview deploy is a logged error; the cost of not
      // scheduling one is a scan that only advances while a screen is awake.
      if (claimedJobs.length > 0) {
        after(() => triggerScanContinuation({ projectId, runId }));
      }
      return;
    }

    // Every scan_prompt job for this campaign is terminal (completed or
    // failed): this is the final batch. Atomically
    // claim the scan_finalize job as the single-owner gate for the
    // extraction/scoring/recommendations tail below, so a racing duplicate
    // invocation that also observes zero pending prompt jobs cannot run it
    // twice.
    if (!finalizeJob) {
      throw new ProjectActionError("scan_failed");
    }

    const finalizeClaim = {
      status: "running",
      locked_at: nowIso,
      locked_by: "gemini-executor",
      attempt_count: finalizeJob.attempt_count + 1,
      last_error: null
    };

    const { data: claimedFinalize, error: claimFinalizeError } = await service
      .from("jobs")
      .update(finalizeClaim)
      .eq("id", finalizeJob.id)
      .eq("project_id", projectId)
      .eq("run_id", runId)
      .eq("status", "pending")
      .select("id")
      .maybeSingle();

    if (claimFinalizeError) {
      throw new ProjectActionError("scan_failed");
    }

    let ownsFinalize = Boolean(claimedFinalize);

    if (!ownsFinalize) {
      // Not pending. Either another invocation is genuinely working on it, or
      // it is a corpse: an invocation that claimed finalize and was killed
      // (Vercel `maxDuration`) before it could complete or release the job.
      // Nothing else recovers that — `reconcileStuckScanRuns` only ever
      // touches `scan_runs`, never `jobs` — so before this lease, one killed
      // invocation stranded the campaign for good: every later invocation
      // failed the pending-claim, returned here doing nothing, and
      // `updated_at` stopped moving until the run was failed as stuck. That
      // is the 2026-08-04 IKEA failure (run 9608d861), and it cost a full
      // re-scan of 26 prompts × 3 engines to recover from.
      //
      // Taking over a lock older than the lease is still exclusive: whichever
      // invocation's UPDATE commits first moves `locked_at`, so every racing
      // one stops matching the predicate — same atomic claim the prompt
      // batches use.
      const leaseExpiredBefore = new Date(Date.now() - FINALIZE_LOCK_LEASE_MS).toISOString();

      const { data: reclaimedFinalize } = await service
        .from("jobs")
        .update(finalizeClaim)
        .eq("id", finalizeJob.id)
        .eq("project_id", projectId)
        .eq("run_id", runId)
        .eq("status", "running")
        .lt("locked_at", leaseExpiredBefore)
        .select("id")
        .maybeSingle();

      if (!reclaimedFinalize) {
        // Genuinely held by a live invocation (or already completed).
        return;
      }

      await logJob(service, {
        jobId: finalizeJob.id,
        projectId,
        runId,
        level: "warn",
        message: "Reclaimed a finalize job whose lock lease expired.",
        context: { providers }
      });

      ownsFinalize = true;
    }

    const { count: totalSuccessCount } = await service
      .from("jobs")
      .select("id", { count: "exact", head: true })
      .eq("project_id", projectId)
      .eq("run_id", runId)
      .eq("job_type", "scan_prompt")
      .eq("status", "completed");

    if ((totalSuccessCount ?? 0) === 0) {
      // Distinct from the generic "scan_failed": zero successful prompts
      // across the whole campaign is a recoverable, run-level outcome (every
      // individual prompt failed, but there is no reason to believe a retry
      // would fail identically — e.g. a transient Gemini outage). See
      // docs/scan-lifecycle.md. GeminiConfigError (missing API key, invalid
      // model) is NOT this code — it remains terminal.
      throw new ProjectActionError("scan_failed_no_results");
    }

    // Final sweep: picks up rows whose batch pass ran out of budget, plus
    // any row belonging to a batch driven by an invocation that died before
    // its own pass finished.
    await runStructuredExtractionForRun({
      service,
      projectId,
      runId,
      deadlineAt: workDeadlineAt
    });

    // EXTRACTION-RELIABILITY-1 invariant: a run may not be marked `completed`
    // while it still holds answers nothing has tried to extract. Scoring runs
    // on `extracted_json`, so completing here would publish a score computed
    // from a fraction of the run's own data and call it done — which is
    // exactly the failure this phase exists to remove.
    //
    // Rather than fail (which would throw away good data) or complete
    // anyway (which would hide the gap), the finalize job is released back to
    // `pending` so a fresh invocation — with a fresh budget — can finish the
    // work. Progress is strictly monotonic: every pass either extracts a row
    // or records a categorized error on it, and both take that row out of the
    // unprocessed set, so this can only repeat a bounded number of times. If
    // it somehow stalls entirely, the run stops bumping `updated_at` and
    // `reconcileStuckScanRuns` applies its usual timeout + auto-retry.
    const unprocessedCount = await countUnprocessedExtractionRows({ service, projectId, runId });

    if (unprocessedCount > 0) {
      await logJob(service, {
        jobId: finalizeJob.id,
        projectId,
        runId,
        level: "warn",
        message: "Extraction incomplete; deferring finalize to another invocation.",
        context: { unprocessed: unprocessedCount, providers }
      });

      await service
        .from("jobs")
        .update({ status: "pending", locked_at: null, locked_by: null })
        .eq("id", finalizeJob.id)
        .eq("project_id", projectId)
        .eq("run_id", runId);

      // Bumps scan_runs.updated_at via the DB trigger, so the deferred run
      // does not look stalled to the reconciliation pass while it is in fact
      // still advancing.
      await refreshRunProgressCounters({ service, projectId, runId });

      after(() => triggerScanContinuation({ projectId, runId }));
      return;
    }

    const { data: promptResults } = await service
      .from("scan_prompt_results")
      .select(
        "id, prompt_id, prompt_text_snapshot, brand_mentioned, citation_found, mentioned_competitors_count, citations_count, sentiment, extracted_json, extraction_error, status, brand_snapshot, provider, raw_response_text, extraction_version"
      )
      .eq("project_id", projectId)
      .eq("run_id", runId);

    const completedPromptResults = (promptResults ?? []).filter((row) => row.status === "completed");

    // GEO-SCORE-V4 Fase B (docs/adr/0033): record whether this run actually
    // measured every engine the plan promises. A prompt job succeeds when at
    // least one engine returns, so a provider outage removes rows from the
    // sample without failing anything — worth ~13 GEO points in the
    // reproduction in docs/geo-score-variability-2026-08.md §1. The score is
    // still computed over exactly the rows that exist; this only records the
    // fact so the surfaces can stop presenting a partial run as a full one.
    const engineCoverage = computeEngineCoverage({
      expectedProviders: providers,
      observedProviders: completedPromptResults.map((row) => row.provider)
    });

    // GEO-SCORE-V4 (docs/adr/0033): the technical component. The audit for
    // THIS run has not run yet at this point (it is enqueued after the run
    // completes, docs/adr/0027), so this normally resolves to the project's
    // most recent earlier snapshot and is re-resolved exactly when this run's
    // own audit lands (rescoreRunWithTechnicalSnapshot).
    const { data: auditSnapshots } = await service
      .from("web_audit_snapshots")
      .select("id, scan_id, readiness_score, created_at")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(TECHNICAL_SNAPSHOT_LOOKUP_LIMIT);

    const technicalResolution = resolveTechnicalComponent({
      runId,
      runFinishedAt: new Date(),
      snapshots: auditSnapshots ?? []
    });

    const scores = computeRunScoresFromResults(
      completedPromptResults.map((row) => ({
        id: row.id,
        prompt_text_snapshot: row.prompt_text_snapshot,
        brand_mentioned: row.brand_mentioned,
        citation_found: row.citation_found,
        mentioned_competitors_count: row.mentioned_competitors_count,
        citations_count: row.citations_count,
        sentiment: row.sentiment,
        extracted_json: row.extracted_json,
        extraction_error: row.extraction_error,
        brand_snapshot: row.brand_snapshot,
        provider: row.provider,
        extraction_version: row.extraction_version
      })),
      project.domain,
      {
        technical: technicalResolution.component,
        technicalReason: technicalResolution.reason,
        engineCoverage
      }
    );

    await service.from("run_scores").upsert(
      {
        run_id: runId,
        project_id: projectId,
        scoring_version: SCORING_VERSION,
        visibility_score: scores.visibility_score,
        citation_score: scores.citation_score,
        competitor_gap_score: scores.competitor_gap_score,
        confidence: scores.confidence,
        details_json: scores.details_json
      },
      { onConflict: "run_id" }
    );

    // Fail-soft, same reasoning as recommendation generation below: an alert
    // email must never sink an otherwise-successful scan (ALERTS-1 Fase 6a).
    await checkAndSendScoreDropAlert({
      service,
      projectId,
      runId,
      ownerUserId: project.owner_user_id as string,
      projectDomain: project.domain as string,
      currentRow: { visibility_score: scores.visibility_score, details_json: scores.details_json }
    });

    // Hoisted out of the try block below so the scan_completed notification
    // (emitted later, once the run is actually marked completed) can still
    // report a best-effort payload even if recommendation generation throws —
    // these stay at their fail-soft defaults (0 / null) in that case, rather
    // than the notification not firing at all.
    let newRecommendationsCount = 0;
    let resolvedGapsCount = 0;
    let previousVisibilityScore: number | null = null;

    // Fail-soft: derived recommendations must never sink an otherwise-successful
    // scan. The real scan work (answers + scores) is already persisted above; if
    // recommendation generation or persistence throws, log it and still complete
    // the run (the prior run's recommendations stay until the next successful run).
    try {
      // Real topic category per prompt (project_prompts.category), joined by
      // prompt_id, so the engine can classify comparative/informational intent
      // from the product's own taxonomy instead of guessing from keywords
      // (Fase RECS-2A). Best-effort: a failed/empty fetch just leaves every
      // row's category undefined, falling back to the old keyword heuristic.
      const { data: promptCategoryRows } = await service
        .from("project_prompts")
        .select("id, category")
        .eq("project_id", projectId);
      const categoryByPromptId = new Map(
        (promptCategoryRows ?? []).map((row) => [row.id as string, row.category as string | null])
      );

      const recommendationRows = generateRecommendationsForRun({
        project: {
          brand: project.brand,
          domain: project.domain,
          country: project.country,
          language: project.language
        },
        competitors: (competitors ?? []).map((c) => c.name),
        runScore: {
          visibility_score: scores.visibility_score,
          citation_score: scores.citation_score,
          competitor_gap_score: scores.competitor_gap_score,
          confidence: scores.confidence,
          details_json: scores.details_json
        },
        promptResults: completedPromptResults.map((row) => ({
          id: row.id,
          // RECS-DEDUPE-1: the prompt's own stable id (project_prompts.id),
          // separate from `id` above (this run's scan_prompt_results row) —
          // lets the engine's per-prompt gap dedupeKey survive across runs.
          promptId: row.prompt_id,
          prompt_text_snapshot: row.prompt_text_snapshot,
          brand_mentioned: row.brand_mentioned,
          citation_found: row.citation_found,
          mentioned_competitors_count: row.mentioned_competitors_count,
          citations_count: row.citations_count,
          sentiment: row.sentiment,
          extracted_json: row.extracted_json,
          raw_response_text: row.raw_response_text,
          category: row.prompt_id ? categoryByPromptId.get(row.prompt_id) ?? null : null
        }))
      });
      newRecommendationsCount = recommendationRows.length;

      // RECS-3 ("memory" between scans): identify the immediately preceding
      // COMPLETED run of this project via scan_runs (not by filtering
      // recommendations.status='active' — that status gets consumed by this
      // very block below, so a retry of this finalize step would see nothing
      // left "active" and silently recompute a different, wrong result). Read
      // that fixed prior run's rows by their own run_id, regardless of
      // status, so the diff below is deterministic across retries. See
      // supabase/migrations/0010_recommendations_history.sql.
      const { data: previousRunRow } = await service
        .from("scan_runs")
        .select("id")
        .eq("project_id", projectId)
        .eq("status", "completed")
        .neq("id", runId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      let previousRows: PreviousRecommendationRowWithTitle[] = [];
      if (previousRunRow?.id) {
        // scan_completed's visibilityDelta (NOTIF-SERVER-1a): reuses the
        // previous-completed-run lookup above rather than re-querying for
        // it, only adding this one small follow-up read of that run's own
        // score.
        const { data: previousScoreRow } = await service
          .from("run_scores")
          .select("visibility_score")
          .eq("run_id", previousRunRow.id as string)
          .maybeSingle();
        previousVisibilityScore = previousScoreRow ? Number(previousScoreRow.visibility_score) : null;

        const { data: previousRowsRaw } = await service
          .from("recommendations")
          .select("dedupe_key, status, consecutive_runs_open, title")
          .eq("project_id", projectId)
          .eq("run_id", previousRunRow.id as string);
        previousRows = (previousRowsRaw ?? []) as PreviousRecommendationRowWithTitle[];
      }

      const { resolvedDedupeKeys, consecutiveRunsByDedupeKey } = computeRecommendationTransition({
        previousRows,
        currentDedupeKeys: recommendationRows.map((rec) => rec.dedupe_key)
      });

      // Gaps that were open last run and did not recur this run are a real
      // win — mark them 'resolved' (not 'superseded') so the Recommendations
      // page can surface them as a recent win, scoped by resolved_in_run_id
      // (their own run_id stays whatever run they were last open in).
      if (resolvedDedupeKeys.length > 0) {
        const { error: resolveError } = await service
          .from("recommendations")
          .update({ status: "resolved", resolved_in_run_id: runId })
          .eq("project_id", projectId)
          .eq("status", "active")
          .neq("run_id", runId)
          .in("dedupe_key", resolvedDedupeKeys);

        if (resolveError) {
          console.error("[scan-runner] failed to mark resolved recommendations", {
            projectId,
            runId,
            message: resolveError.message
          });
        } else {
          resolvedGapsCount = resolvedDedupeKeys.length;
          // One aggregated notification for every gap closed this run, not
          // one per gap (docs/specs/notifications/notifications-v1.md 4.3) —
          // three brechas cerradas a la vez is one good-news notification,
          // not three.
          const titleByDedupeKey = new Map(previousRows.map((row) => [row.dedupe_key, row.title]));
          const sampleTitles = resolvedDedupeKeys
            .map((key) => titleByDedupeKey.get(key))
            .filter((title): title is string => Boolean(title))
            .slice(0, 3);

          await emitNotification(service, {
            ownerUserId: project.owner_user_id as string,
            projectId,
            type: "gap_resolved",
            severity: "success",
            dedupeKey: gapResolvedKey(runId),
            payload: { runId, count: resolvedGapsCount, sampleTitles }
          });
        }
      }

      // Close out any still-"active" recommendations from prior runs of this
      // project so the sidebar badge (which counts active recommendations
      // project-wide) stays in sync with the latest run's recommendations
      // page (which scopes to run_id). History is preserved via status change,
      // not deletion. Fail soft: a failure here must not prevent the current
      // run's recommendations from being persisted or the run from completing.
      const { error: supersedeError } = await service
        .from("recommendations")
        .update({ status: "superseded" })
        .eq("project_id", projectId)
        .eq("status", "active")
        .neq("run_id", runId);

      if (supersedeError) {
        console.error("[scan-runner] failed to supersede prior recommendations", {
          projectId,
          runId,
          message: supersedeError.message
        });
      }

      await service.from("recommendations").delete().eq("project_id", projectId).eq("run_id", runId);
      if (recommendationRows.length) {
        await service.from("recommendations").insert(
          recommendationRows.map((rec) => ({
            run_id: runId,
            project_id: projectId,
            status: "active",
            priority_rank: rec.priority_rank,
            title: rec.title,
            description: rec.description,
            rule_id: rec.rule_id,
            recommendation_type: rec.recommendation_type,
            impact: rec.impact,
            effort: rec.effort,
            confidence: rec.confidence,
            source_type: "rule",
            evidence_json: rec.evidence_json,
            dedupe_key: rec.dedupe_key,
            consecutive_runs_open: consecutiveRunsByDedupeKey.get(rec.dedupe_key) ?? 1
          }))
        );
      }

      // gap_pending: fire exactly on the run where a gap CROSSES 3
      // consecutive open runs (not >=3) — the intent is explicit in code,
      // not left resting only on the dedupe unique index. At most one per
      // scan: several gaps crossing at once is real, but three nudges in one
      // notification list is noise, so only the highest-impact one is worth
      // surfacing (tie-broken by priority_rank ascending, i.e. the engine's
      // own severity ordering).
      const GAP_PENDING_THRESHOLD = 3;
      const IMPACT_WEIGHT: Record<"low" | "medium" | "high", number> = { low: 1, medium: 2, high: 3 };
      const crossingThreshold = recommendationRows
        .filter((rec) => (consecutiveRunsByDedupeKey.get(rec.dedupe_key) ?? 1) === GAP_PENDING_THRESHOLD)
        .sort((a, b) => IMPACT_WEIGHT[b.impact] - IMPACT_WEIGHT[a.impact] || a.priority_rank - b.priority_rank);

      if (crossingThreshold.length > 0) {
        const pendingRec = crossingThreshold[0];
        await emitNotification(service, {
          ownerUserId: project.owner_user_id as string,
          projectId,
          type: "gap_pending",
          severity: "warning",
          dedupeKey: gapPendingKey(projectId, pendingRec.dedupe_key),
          payload: {
            recommendationTitle: pendingRec.title,
            consecutiveRuns: GAP_PENDING_THRESHOLD,
            impact: pendingRec.impact
          }
        });
      }
    } catch (recommendationError) {
      // The scan itself succeeded; only the derived recommendations failed.
      // Log and continue so the run still completes instead of surfacing as
      // "No se pudo lanzar el escaneo".
      console.error("[scan-runner] recommendation generation/persistence failed; completing run without it", {
        projectId,
        runId,
        message: recommendationError instanceof Error ? recommendationError.message : "unknown"
      });
    }

    // finalizeJob was already claimed (status -> running) above, before the
    // no-results check — this just logs and marks it completed.
    await logJob(service, {
      jobId: finalizeJob.id,
      projectId,
      runId,
      level: "info",
      message: "Finalizing LLM scan run.",
      context: { providers }
    });

    await service
      .from("jobs")
      .update({
        status: "completed",
        locked_at: null,
        locked_by: null
      })
      .eq("id", finalizeJob.id)
      .eq("project_id", projectId)
      .eq("run_id", runId);

    const { failedCount: totalFailedCount } = await refreshRunProgressCounters({ service, projectId, runId });

    await service
      .from("scan_runs")
      .update({
        status: "completed",
        successful_prompts: totalSuccessCount ?? 0,
        failed_prompts: totalFailedCount,
        finished_at: new Date().toISOString(),
        extraction_version: EXTRACTION_VERSION,
        scoring_version: SCORING_VERSION
      })
      .eq("id", runId)
      .eq("project_id", projectId);

    // EXTRACTION-RELIABILITY-1 Fase B: a run can reach `completed` and still
    // have lost a whole engine's data — that is precisely how OpenAI's 429s
    // stayed invisible for four days. Checked here, after the run's own
    // status update is durable, so the alert describes a state that really
    // landed. Fail-soft inside, like every other post-scan side effect.
    await checkAndSendScanHealthAlert({
      service,
      projectId,
      runId,
      projectDomain: project.domain as string,
      expectedEngines: providers,
      finalizeJobId: finalizeJob.id
    });

    // Emitted only after the run's own status update above is durable — a
    // notification must never describe a state that hasn't actually landed.
    await emitNotification(service, {
      ownerUserId: project.owner_user_id as string,
      projectId,
      type: "scan_completed",
      severity: "success",
      dedupeKey: scanCompletedKey(runId),
      payload: {
        runId,
        promptsProcessed: totalSuccessCount ?? 0,
        providers,
        visibilityScore: scores.visibility_score,
        visibilityDelta:
          previousVisibilityScore !== null ? scores.visibility_score - previousVisibilityScore : null,
        newRecommendations: newRecommendationsCount,
        resolvedGaps: resolvedGapsCount
      }
    });

    // AUDIT-AFTER-SCAN-1: the web audit is no longer something a human has to
    // remember to click. Queued here, after the run is durably 'completed',
    // because the audit reads the run's persisted results — queueing earlier
    // would race the very data it audits.
    //
    // Wrapped in its own try/catch for the same reason as the recommendation
    // block above: the scan itself succeeded. A queueing failure must never
    // surface to the user as a failed scan.
    if (isAutoWebAuditEnabled()) {
      try {
        const enqueued = await enqueueWebAuditJob({ service, projectId, runId });
        // Only dispatch when this call actually created the job. On
        // "already_queued" something else already owns the work, and firing
        // again would just race it.
        if (enqueued === "enqueued") {
          after(() => triggerWebAuditRun());
        }
      } catch (auditError) {
        console.error("[scan-runner] failed to queue the post-scan web audit; the run itself completed", {
          projectId,
          runId,
          message: auditError instanceof Error ? auditError.message : "unknown"
        });
      }
    }
  } catch (error) {
    const errorSummary = getSanitizedScanError(error);

    // Surface the real (secret-free) failure reason in Vercel function logs.
    // error.message for our provider errors (ClaudeConfigError, Gemini/Claude
    // API error strings) never contains the API key itself, only var names —
    // see lib/llm/claude.ts and lib/llm/gemini.ts error constructors.
    console.error("[scan-runner] scan run failed", {
      projectId,
      runId,
      providers,
      errorName: error instanceof Error ? error.name : typeof error,
      errorMessage: error instanceof Error ? error.message : String(error)
    });

    // Any prompt job still "running" here was either mid-flight when a
    // config_error aborted the run, or never started (shouldn't happen with
    // Promise.allSettled, but defensive). Bulk-fail them; processPromptJob
    // already logged the GeminiConfigError for the job that triggered this.
    await service
      .from("jobs")
      .update({
        status: "failed",
        locked_at: null,
        locked_by: null,
        last_error: errorSummary
      })
      .eq("project_id", projectId)
      .eq("run_id", runId)
      .eq("status", "running");

    const { successCount, failedCount } = await refreshRunProgressCounters({ service, projectId, runId });

    await service
      .from("scan_runs")
      .update({
        status: "failed",
        error_summary: errorSummary,
        successful_prompts: successCount,
        failed_prompts: failedCount,
        finished_at: new Date().toISOString()
      })
      .eq("id", runId)
      .eq("project_id", projectId);

    await emitNotification(service, {
      ownerUserId: project.owner_user_id as string,
      projectId,
      type: "scan_failed",
      severity: "critical",
      dedupeKey: scanFailedKey(runId),
      payload: { runId, errorSummary }
    });

    throw new ProjectActionError("scan_failed");
  }
}
