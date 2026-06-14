import "server-only";

import { generateGeminiVisibilityAnswer, GeminiConfigError } from "@/lib/llm/gemini";
import { generateRecommendationsForRun } from "@/lib/recommendations/recommendation-engine";
import { computeRunScoresFromResults, SCORING_VERSION } from "@/lib/scoring/run-scoring";
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

type PromptJobOutcome =
  | { kind: "success" }
  | { kind: "failed" }
  | { kind: "config_error"; error: GeminiConfigError };

// Processes a single scan_prompt job end-to-end (status transitions, Gemini
// call with retry, scan_prompt_results insert, job logging). Run concurrently
// for all prompt jobs in a run (SCAN-ROBUST-2) so the total Gemini latency for
// a 6-prompt run stays within the Hobby plaintext maxDuration=60s budget
// (docs/adr/0003-sync-scan-execution-and-maxduration.md). A GeminiConfigError
// (missing API key / invalid model) is reported back via `config_error`
// instead of being thrown directly, so the caller can abort the whole run
// after all concurrent jobs have settled.
async function processPromptJob({
  service,
  projectId,
  runId,
  job,
  project,
  competitors
}: {
  service: ReturnType<typeof createServiceClient>;
  projectId: string;
  runId: string;
  job: JobRow;
  project: { brand: string; country: string; language: string };
  competitors: { name: string; domain: string }[];
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

  const { data: existingResult } = await service
    .from("scan_prompt_results")
    .select("id")
    .eq("run_id", runId)
    .eq("project_id", projectId)
    .eq("prompt_id", promptId)
    .maybeSingle();

  if (existingResult) {
    await logJob(service, {
      jobId: job.id,
      projectId,
      runId,
      level: "warn",
      message: "Skipping prompt job because result already exists.",
      context: { prompt_id: promptId }
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

  let llmResult: Awaited<ReturnType<typeof generateGeminiVisibilityAnswer>> | null = null;
  let latency = 0;
  let lastError: unknown = null;

  // Per-prompt retry (SCAN-ROBUST-1): total attempts for this prompt are
  // bounded by both `job.max_attempts` (jobs table, default 3) and
  // PROMPT_RETRY_MAX_TOTAL_ATTEMPTS (2 — one retry), whichever is lower.
  // `attempt_count` already reflects attempt 1 from the update above;
  // subsequent iterations bump it again before retrying.
  const totalAttempts = Math.max(1, Math.min(job.max_attempts, PROMPT_RETRY_MAX_TOTAL_ATTEMPTS));

  for (let attempt = 1; attempt <= totalAttempts; attempt += 1) {
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

    try {
      const llmStart = Date.now();
      llmResult = await generateGeminiVisibilityAnswer({
        prompt: promptText,
        country: project.country,
        language: project.language
      });
      latency = Date.now() - llmStart;
      lastError = null;
      break;
    } catch (error) {
      if (error instanceof GeminiConfigError) {
        // Job is left in "running" status: the caller aborts the whole run
        // on a config_error and the outer catch bulk-fails any job still
        // "running" for this run, matching the pre-concurrency behavior.
        await logJob(service, {
          jobId: job.id,
          projectId,
          runId,
          level: "error",
          message: "Gemini prompt execution failed.",
          context: { prompt_id: promptId, error: error.message }
        });

        return { kind: "config_error", error };
      }

      lastError = error;

      await logJob(service, {
        jobId: job.id,
        projectId,
        runId,
        level: attempt < totalAttempts ? "warn" : "error",
        message:
          attempt < totalAttempts
            ? "Gemini prompt execution failed, retrying."
            : "Gemini prompt execution failed.",
        context: {
          prompt_id: promptId,
          attempt,
          total_attempts: totalAttempts,
          error: error instanceof Error ? error.message : String(error)
        }
      });
    }
  }

  if (lastError || !llmResult) {
    const errorSummary = getSanitizedScanError(lastError);

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

  const responseLower = llmResult.text.toLowerCase();
  const brandMentioned = responseLower.includes(project.brand.toLowerCase());
  const mentionedCompetitorsCount = competitors.reduce(
    (acc, competitor) => (responseLower.includes(competitor.name.toLowerCase()) ? acc + 1 : acc),
    0
  );
  const sentiment: "positive" | "neutral" | "negative" | "mixed" | "unknown" = "unknown";

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
    provider: "gemini",
    model: llmResult.model,
    status: "completed",
    raw_response_text: llmResult.text,
    raw_response_json: {
      text: llmResult.text,
      total_tokens: llmResult.totalTokens,
      grounding_chunks: llmResult.groundingChunks ?? [],
      prompt_version: PROMPT_VERSION
    },
    tokens_in: llmResult.tokensIn,
    tokens_out: llmResult.tokensOut,
    cost_usd: null,
    llm_latency_ms: latency,
    brand_mentioned: brandMentioned,
    citation_found: false,
    mentioned_competitors_count: mentionedCompetitorsCount,
    citations_count: 0,
    sentiment,
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
      context: { reason: resultError.message }
    });

    await service
      .from("jobs")
      .update({
        status: "failed",
        locked_at: null,
        locked_by: null,
        last_error: "Failed to insert prompt result."
      })
      .eq("id", job.id)
      .eq("project_id", projectId)
      .eq("run_id", runId);

    return { kind: "failed" };
  }

  await logJob(service, {
    jobId: job.id,
    projectId,
    runId,
    level: "info",
    message: "Prompt job completed with Gemini response.",
    context: { prompt_id: promptId, brand_mentioned: brandMentioned }
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

export async function executePendingScan({
  projectId,
  runId,
  supabase
}: {
  projectId: string;
  runId: string;
  supabase: AuthenticatedContext["supabase"];
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

  if (run.status !== "pending") {
    throw new ProjectActionError("scan_failed");
  }

  const service = createServiceClient();

  const { data: project } = await supabase
    .from("projects")
    .select("id, domain, brand, country, language")
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
  const promptJobs = jobs.filter((job) => job.job_type === "scan_prompt");
  const finalizeJob = jobs.find((job) => job.job_type === "scan_finalize");

  if (promptJobs.length > MAX_REAL_SCAN_PROMPTS) {
    throw new ProjectActionError("too_many_prompts");
  }

  const nowIso = new Date().toISOString();
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

  let promptSuccess = 0;
  let promptFailed = 0;

  try {
    if (startJob) {
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
        message: "Gemini scan started."
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

    // Run all prompt jobs concurrently (SCAN-ROBUST-2) so the 6 Gemini calls
    // overlap instead of summing — keeping the run within the Hobby plan's
    // hard maxDuration=60s budget (docs/adr/0003-sync-scan-execution-and-maxduration.md).
    const promptJobResults = await Promise.allSettled(
      promptJobs.map((job) =>
        processPromptJob({
          service,
          projectId,
          runId,
          job,
          project,
          competitors: (competitors ?? []).map((c) => ({ name: c.name, domain: c.domain }))
        })
      )
    );

    let configError: GeminiConfigError | null = null;

    for (const settled of promptJobResults) {
      if (settled.status === "rejected") {
        promptFailed += 1;
        continue;
      }

      switch (settled.value.kind) {
        case "success":
          promptSuccess += 1;
          break;
        case "failed":
          promptFailed += 1;
          break;
        case "config_error":
          configError = settled.value.error;
          break;
      }
    }

    if (configError) {
      throw configError;
    }

    if (promptSuccess === 0) {
      // Distinct from the generic "scan_failed": zero successful prompts is a
      // recoverable, run-level outcome (every individual prompt failed, but
      // there is no reason to believe a retry would fail identically — e.g.
      // a transient Gemini outage affecting all 6 calls). reconcileStuckScanRuns
      // treats this error_summary as eligible for the same bounded auto-retry
      // as a timeout (SCAN-ROBUST-1). GeminiConfigError (missing API key,
      // invalid model) is NOT this code — it remains terminal.
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
        "id, prompt_text_snapshot, brand_mentioned, citation_found, mentioned_competitors_count, citations_count, sentiment, extracted_json, extraction_error, status, brand_snapshot"
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
        brand_snapshot: row.brand_snapshot
      }))
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
        extracted_json: row.extracted_json
      }))
    });

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
          evidence_json: rec.evidence_json
        }))
      );
    }

    if (finalizeJob) {
      await service
        .from("jobs")
        .update({
          status: "running",
          locked_at: new Date().toISOString(),
          locked_by: "gemini-executor",
          attempt_count: finalizeJob.attempt_count + 1,
          last_error: null
        })
        .eq("id", finalizeJob.id)
        .eq("project_id", projectId)
        .eq("run_id", runId);

      await logJob(service, {
        jobId: finalizeJob.id,
        projectId,
        runId,
        level: "info",
        message: "Finalizing Gemini run."
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
    }

    await service
      .from("scan_runs")
      .update({
        status: "completed",
        successful_prompts: promptSuccess,
        failed_prompts: promptFailed,
        finished_at: new Date().toISOString(),
        extraction_version: EXTRACTION_VERSION,
        scoring_version: SCORING_VERSION
      })
      .eq("id", runId)
      .eq("project_id", projectId);
  } catch (error) {
    const errorSummary = getSanitizedScanError(error);

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

    const { count: failedPromptCount } = await service
      .from("jobs")
      .select("id", { count: "exact", head: true })
      .eq("project_id", projectId)
      .eq("run_id", runId)
      .eq("job_type", "scan_prompt")
      .eq("status", "failed");

    await service
      .from("scan_runs")
      .update({
        status: "failed",
        error_summary: errorSummary,
        successful_prompts: promptSuccess,
        failed_prompts: failedPromptCount ?? promptFailed,
        finished_at: new Date().toISOString()
      })
      .eq("id", runId)
      .eq("project_id", projectId);

    throw new ProjectActionError("scan_failed");
  }
}
