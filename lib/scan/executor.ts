import "server-only";

import { after } from "next/server";
import { resolvePlan } from "@/lib/billing";
import { generateGeminiVisibilityAnswer, GeminiConfigError, type GeminiVisibilityResponse } from "@/lib/llm/gemini";
import { generateClaudeVisibilityAnswer, ClaudeConfigError } from "@/lib/llm/claude";
import { generateRecommendationsForRun } from "@/lib/recommendations/recommendation-engine";
import {
  computeRecommendationTransition,
  type PreviousRecommendationRow
} from "@/lib/recommendations/recommendation-history";
import { computeRunScoresFromResults, SCORING_VERSION } from "@/lib/scoring/run-scoring";
import { checkAndSendScoreDropAlert } from "@/lib/scan/score-alert";
import { createServiceClient } from "@/lib/supabase/service";
import {
  EXTRACTION_VERSION,
  MAX_REAL_SCAN_PROMPTS,
  PROMPT_RETRY_DELAY_MS,
  PROMPT_RETRY_MAX_TOTAL_ATTEMPTS,
  PROMPT_VERSION
} from "@/lib/scan/constants";
import { ProjectActionError, type AuthenticatedContext, type JobRow } from "@/lib/scan/types";
import { getSanitizedScanError } from "@/lib/scan/errors";
import { logJob } from "@/lib/scan/job-logging";
import { runStructuredExtractionForRun } from "@/lib/scan/extraction";

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export type LLMScanProvider = "gemini" | "claude";
const VALID_LLM_SCAN_PROVIDERS: LLMScanProvider[] = ["gemini", "claude"];

function parseProviderList(raw: string): LLMScanProvider[] {
  const parsed = raw
    .split(",")
    .map((p) => p.trim().toLowerCase())
    .filter((p): p is LLMScanProvider => VALID_LLM_SCAN_PROVIDERS.includes(p as LLMScanProvider));
  return Array.from(new Set(parsed));
}

/**
 * Engines run concurrently for every prompt in a scan: each prompt gets one
 * scan_prompt_results row per active engine (migration 0009), and KPIs/cards
 * are computed from the combined sample of all engines' rows (no per-engine
 * weighting). LLM_SCAN_PROVIDERS is a comma-separated list (e.g.
 * "gemini,claude"); falls back to the legacy single-value LLM_SCAN_PROVIDER,
 * and defaults to Gemini-only if neither is set, so deployments that never
 * configured either var keep their existing single-engine behavior.
 */
export function getLLMScanProviders(): LLMScanProvider[] {
  const multi = process.env.LLM_SCAN_PROVIDERS?.trim();
  if (multi) {
    const parsed = parseProviderList(multi);
    if (parsed.length) return parsed;
  }

  const legacy = process.env.LLM_SCAN_PROVIDER?.trim().toLowerCase();
  return legacy === "claude" ? ["claude"] : ["gemini"];
}

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
  return provider === "claude" ? generateClaudeVisibilityAnswer(input) : generateGeminiVisibilityAnswer(input);
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
  project: { brand: string; country: string; language: string };
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

  const { data: existingResults } = await service
    .from("scan_prompt_results")
    .select("provider")
    .eq("run_id", runId)
    .eq("project_id", projectId)
    .eq("prompt_id", promptId);

  const existingProviders = new Set((existingResults ?? []).map((row) => row.provider as string));
  const pendingProviders = providers.filter((provider) => !existingProviders.has(provider));

  if (pendingProviders.length === 0) {
    await logJob(service, {
      jobId: job.id,
      projectId,
      runId,
      level: "warn",
      message: "Skipping prompt job because a result already exists for every active engine.",
      context: { prompt_id: promptId, providers }
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
          if (error instanceof GeminiConfigError || error instanceof ClaudeConfigError) {
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
        brand_snapshot: project.brand,
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

function getSiteUrl(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000")
  );
}

/**
 * Fires the next batch of a multi-batch campaign (SCAN-CHAIN-1) without
 * making the caller wait for it: called from inside `after()`, so Next.js
 * keeps this invocation's function instance alive just long enough for the
 * POST to actually reach `/api/scan/continue`, but the *response* to
 * whoever called `executePendingScan` (the manual "Lanzar escaneo" action,
 * the cron sweep, ...) has already been sent — this does not add to their
 * wait time. `/api/scan/continue` itself resolves quickly relative to its
 * own 60s budget; awaiting its response here just means "the next batch was
 * accepted," not "the whole remaining campaign finished."
 *
 * Errors are swallowed (logged only): if this dispatch is lost, the campaign
 * simply stalls until `reconcileStuckScanRuns` notices no progress and
 * auto-retries, same safety net as any other execution failure.
 */
async function triggerScanContinuation({ projectId, runId }: { projectId: string; runId: string }): Promise<void> {
  const secret = process.env.SCAN_CONTINUE_SECRET;
  if (!secret) {
    console.error("[scan-runner] cannot self-chain scan batch: SCAN_CONTINUE_SECRET is not configured", {
      projectId,
      runId
    });
    return;
  }

  try {
    await fetch(`${getSiteUrl()}/api/scan/continue`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${secret}` },
      body: JSON.stringify({ projectId, runId })
    });
  } catch (error) {
    console.error("[scan-runner] failed to dispatch scan continuation", {
      projectId,
      runId,
      message: error instanceof Error ? error.message : String(error)
    });
  }
}

export async function executePendingScan({
  projectId,
  runId,
  supabase,
  scheduleContinuation = true
}: {
  projectId: string;
  runId: string;
  supabase: AuthenticatedContext["supabase"];
  /**
   * When a batch finishes with prompts still pending, whether to self-schedule
   * the next batch via `after()` + a fetch to `/api/scan/continue`
   * (docs/adr/0014). Default `true` keeps the background self-chain used by the
   * cron / browser-closed path. The foreground driver (`autoExecutePendingScan`)
   * passes `false`: it loops the batches itself within one request budget and
   * re-drives from the client, so it neither needs the secret-gated
   * continuation endpoint (which a preview deploy may not reach) nor wants a
   * duplicate dispatch racing its own loop.
   */
  scheduleContinuation?: boolean;
}) {
  const { data: run, error: runError } = await supabase
    .from("scan_runs")
    .select("id, project_id, status, total_prompts")
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
    .select("id, domain, brand, country, language, owner_user_id")
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
      .select("id, job_type, status, attempt_count, max_attempts, payload_json, created_at")
      .eq("project_id", projectId)
      .eq("run_id", runId)
      .order("created_at", { ascending: true })
  ]);

  if (jobsError || !jobsRaw?.length) {
    await service
      .from("scan_runs")
      .update({
        status: "failed",
        error_summary: "No se han encontrado jobs para el escaneo.",
        finished_at: new Date().toISOString()
      })
      .eq("id", runId)
      .eq("project_id", projectId);

    throw new ProjectActionError("scan_failed");
  }

  const jobs = jobsRaw as unknown as (JobRow & { created_at: string })[];
  const startJob = jobs.find((job) => job.job_type === "scan_start");
  const finalizeJob = jobs.find((job) => job.job_type === "scan_finalize");
  // Only the pending scan_prompt jobs, oldest first — the batch this
  // invocation is responsible for (SCAN-CHAIN-1). Jobs already
  // completed/failed by an earlier batch of this same campaign are left
  // alone; anything beyond MAX_REAL_SCAN_PROMPTS stays pending for the next
  // self-chained invocation.
  const batchCandidates = jobs
    .filter((job) => job.job_type === "scan_prompt" && job.status === "pending")
    .slice(0, MAX_REAL_SCAN_PROMPTS);

  const nowIso = new Date().toISOString();

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

  // PRICING-TRUTH-1 (PR b): the active engine set is otherwise a single
  // deployment-wide env var (LLM_SCAN_PROVIDERS) — cap it per the project
  // owner's plan (`caps.engines`) so a Free project never fans out to more
  // engines than its plan promises. A no-op today (every plan already caps
  // at <= the number of real engines configured), but becomes load-bearing
  // the moment a third engine is added (ENGINES-2) without needing to touch
  // this gate again. `.slice` preserves LLM_SCAN_PROVIDERS' configured order,
  // so whichever engine is listed first is the one every plan gets.
  const { data: ownerProfile } = await service
    .from("profiles")
    .select("current_plan")
    .eq("id", project.owner_user_id as string)
    .maybeSingle();
  const plan = resolvePlan(ownerProfile?.current_plan as string | undefined);
  const providers = getLLMScanProviders().slice(0, plan.caps.engines);

  try {
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
        context: { providers }
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

    // Atomically claim this batch's candidates (SCAN-CHAIN-1): a duplicate
    // continuation dispatch (network retry, an `after()` re-fire) racing
    // against this invocation can only ever "win" jobs that are still
    // `pending` at the moment of the update — whichever invocation's UPDATE
    // commits first for a given row is the only one that processes it.
    let claimedJobs: (JobRow & { created_at: string })[] = [];
    if (batchCandidates.length > 0) {
      const { data: claimedRows, error: claimError } = await service
        .from("jobs")
        .update({ status: "running", locked_at: nowIso, locked_by: "gemini-executor" })
        .eq("project_id", projectId)
        .eq("run_id", runId)
        .eq("status", "pending")
        .in(
          "id",
          batchCandidates.map((job) => job.id)
        )
        .select("id, job_type, status, attempt_count, max_attempts, payload_json, created_at");

      if (claimError) {
        throw new ProjectActionError("scan_failed");
      }

      claimedJobs = (claimedRows ?? []) as unknown as (JobRow & { created_at: string })[];
    }

    if (claimedJobs.length > 0) {
      // Run this batch's prompt jobs concurrently (SCAN-ROBUST-2) so the LLM
      // calls overlap instead of summing — keeping each batch within the
      // Hobby plan's hard maxDuration=60s budget
      // (docs/adr/0003-sync-scan-execution-and-maxduration.md). A campaign
      // larger than MAX_REAL_SCAN_PROMPTS spans multiple such batches,
      // chained below (docs/adr/0014-batched-self-chaining-scan-execution.md).
      const promptJobResults = await Promise.allSettled(
        claimedJobs.map((job) =>
          processPromptJob({
            service,
            projectId,
            runId,
            job,
            project,
            competitors: (competitors ?? []).map((c) => ({ name: c.name, domain: c.domain })),
            providers
          })
        )
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
      // Work remains. If this invocation just made real progress
      // (claimedJobs.length > 0), it owns handing off to the next batch
      // without making whoever called executePendingScan (the manual scan
      // action, the cron sweep, a prior continuation) wait for it. If this
      // invocation claimed nothing — every candidate was already claimed by
      // another in-flight invocation — the unfinished work belongs to that
      // other invocation; scheduling a second continuation here would just
      // be redundant.
      //
      // `scheduleContinuation === false` means the caller (the foreground
      // driver) is looping the batches itself, so it does not want a
      // self-fetch continuation — which it doesn't need and which a preview
      // deploy may not even be able to reach (docs/adr/0014).
      if (scheduleContinuation && claimedJobs.length > 0) {
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

    const { data: claimedFinalize, error: claimFinalizeError } = await service
      .from("jobs")
      .update({
        status: "running",
        locked_at: nowIso,
        locked_by: "gemini-executor",
        attempt_count: finalizeJob.attempt_count + 1,
        last_error: null
      })
      .eq("id", finalizeJob.id)
      .eq("project_id", projectId)
      .eq("run_id", runId)
      .eq("status", "pending")
      .select("id")
      .maybeSingle();

    if (claimFinalizeError) {
      throw new ProjectActionError("scan_failed");
    }

    if (!claimedFinalize) {
      // Another invocation already claimed (or already completed) finalize
      // for this campaign.
      return;
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

    await runStructuredExtractionForRun({
      service,
      projectId,
      runId
    });

    const { data: promptResults } = await service
      .from("scan_prompt_results")
      .select(
        "id, prompt_id, prompt_text_snapshot, brand_mentioned, citation_found, mentioned_competitors_count, citations_count, sentiment, extracted_json, extraction_error, status, brand_snapshot, provider, raw_response_text"
      )
      .eq("project_id", projectId)
      .eq("run_id", runId);

    const completedPromptResults = (promptResults ?? []).filter((row) => row.status === "completed");
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
        provider: row.provider
      })),
      project.domain
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

      let previousRows: PreviousRecommendationRow[] = [];
      if (previousRunRow?.id) {
        const { data: previousRowsRaw } = await service
          .from("recommendations")
          .select("dedupe_key, status, consecutive_runs_open")
          .eq("project_id", projectId)
          .eq("run_id", previousRunRow.id as string);
        previousRows = (previousRowsRaw ?? []) as PreviousRecommendationRow[];
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

    throw new ProjectActionError("scan_failed");
  }
}
