import "server-only";

import { extractGeminiStructuredData, generateGeminiVisibilityAnswer } from "@/lib/llm/gemini";
import { generateRecommendationsForRun } from "@/lib/recommendations/recommendation-engine";
import { computeRunScoresFromResults, SCORING_VERSION } from "@/lib/scoring/run-scoring";
import { createServiceClient } from "@/lib/supabase/service";
import type { requireUser } from "@/lib/auth";

export const MAX_REAL_SCAN_PROMPTS = 10;
const MAX_EXTRACTION_RESULTS = 10;
const EXTRACTION_VERSION = "gemini-extraction-v1";
export const ENABLE_SYNC_SCAN_EXECUTION = process.env.ENABLE_SYNC_SCAN_EXECUTION === "true";

export type ProjectActionErrorCode =
  | "active_run_exists"
  | "project_archived"
  | "project_not_found"
  | "prompts_required"
  | "scan_failed"
  | "scan_unavailable"
  | "too_many_prompts"
  | "unauthorized"
  | "unexpected_error";

export class ProjectActionError extends Error {
  constructor(public readonly code: ProjectActionErrorCode) {
    super(code);
    this.name = "ProjectActionError";
  }
}

export function getActionErrorCode(error: unknown): ProjectActionErrorCode {
  if (error instanceof ProjectActionError) return error.code;
  return "unexpected_error";
}

export function getSanitizedScanError(error: unknown) {
  if (error instanceof ProjectActionError) {
    switch (error.code) {
      case "project_not_found":
        return "No se ha encontrado el proyecto o el escaneo solicitado.";
      case "project_archived":
        return "El proyecto está archivado y no puede ejecutarse.";
      case "too_many_prompts":
        return "El escaneo pendiente supera el límite de prompts permitido.";
      default:
        return "No se pudo completar la ejecución del escaneo.";
    }
  }

  return "No se pudo completar la ejecución del escaneo.";
}

export type AuthenticatedContext = Awaited<ReturnType<typeof requireUser>>;

type JobRow = {
  id: string;
  job_type: "scan_start" | "scan_prompt" | "scan_finalize";
  status: "pending" | "running" | "retrying" | "completed" | "failed" | "cancelled";
  attempt_count: number;
  max_attempts: number;
  payload_json: Record<string, unknown>;
};

type ScanPromptResultRow = {
  id: string;
  raw_response_text: string | null;
  prompt_text_snapshot: string;
  brand_snapshot: string;
  competitors_snapshot: Array<{ name?: string }> | null;
  provider: string;
  status: string;
  extraction_version: string;
};

async function logJob(
  service: ReturnType<typeof createServiceClient>,
  row: {
    jobId: string;
    projectId: string;
    runId: string;
    level: "debug" | "info" | "warn" | "error";
    message: string;
    context?: Record<string, unknown>;
  }
) {
  await service.from("job_logs").insert({
    job_id: row.jobId,
    project_id: row.projectId,
    run_id: row.runId,
    level: row.level,
    message: row.message,
    context_json: row.context ?? {}
  });
}

async function runStructuredExtractionForRun(input: {
  service: ReturnType<typeof createServiceClient>;
  projectId: string;
  runId: string;
}) {
  const { data: rows, error } = await input.service
    .from("scan_prompt_results")
    .select(
      "id, raw_response_text, prompt_text_snapshot, brand_snapshot, competitors_snapshot, provider, status, extraction_version"
    )
    .eq("project_id", input.projectId)
    .eq("run_id", input.runId)
    .eq("status", "completed")
    .eq("provider", "gemini")
    .not("raw_response_text", "is", null);

  if (error || !rows?.length) return;

  const eligibleRows = (rows as unknown as ScanPromptResultRow[]).filter(
    (row) => row.extraction_version !== EXTRACTION_VERSION && row.raw_response_text
  );
  const rowsToProcess = eligibleRows.slice(0, MAX_EXTRACTION_RESULTS);

  for (const row of rowsToProcess) {
    const rawResponseText = row.raw_response_text;
    if (!rawResponseText) continue;

    try {
      const competitors = Array.isArray(row.competitors_snapshot)
        ? row.competitors_snapshot
            .map((item) => (item?.name ? String(item.name) : ""))
            .filter((name) => name.length > 0)
        : [];

      const extracted = await extractGeminiStructuredData({
        brand: row.brand_snapshot,
        competitors,
        rawResponseText,
        promptText: row.prompt_text_snapshot
      });

      const mentionedCompetitorsCount = extracted.data.competitors.filter((c) => c.mentioned).length;
      const citationsCount = extracted.data.citations.length;

      await input.service
        .from("scan_prompt_results")
        .update({
          brand_mentioned: extracted.data.brand.mentioned,
          citation_found: citationsCount > 0,
          mentioned_competitors_count: mentionedCompetitorsCount,
          citations_count: citationsCount,
          sentiment: extracted.data.sentiment,
          extracted_json: extracted.data,
          extraction_version: EXTRACTION_VERSION,
          extraction_error: null
        })
        .eq("id", row.id)
        .eq("project_id", input.projectId)
        .eq("run_id", input.runId);
    } catch (extractError) {
      await input.service
        .from("scan_prompt_results")
        .update({
          extraction_error: extractError instanceof Error ? extractError.message : "Extraction failed."
        })
        .eq("id", row.id)
        .eq("project_id", input.projectId)
        .eq("run_id", input.runId);
    }
  }
}

export async function createPendingScanRun({
  projectId,
  supabase,
  user
}: {
  projectId: string;
  supabase: AuthenticatedContext["supabase"];
  user: AuthenticatedContext["user"];
}) {
  const { data: project, error: projectError } = await supabase
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

  const { data: activeRun, error: activeRunError } = await supabase
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

  const { data: activePrompts, error: promptError } = await supabase
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

  const service = createServiceClient();
  const promptCount = activePrompts.length;

  const { data: run, error: runError } = await service
    .from("scan_runs")
    .insert({
      project_id: projectId,
      triggered_by_user_id: user.id,
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

  let currentRunningPromptJob: JobRow | null = null;
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

    for (let i = 0; i < promptJobs.length; i += 1) {
      const job = promptJobs[i];

      await service
        .from("jobs")
        .update({
          status: "running",
          locked_at: new Date().toISOString(),
          locked_by: "gemini-executor",
          attempt_count: job.attempt_count + 1,
          last_error: null
        })
        .eq("id", job.id)
        .eq("project_id", projectId)
        .eq("run_id", runId);
      currentRunningPromptJob = job;

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

        promptFailed += 1;
        currentRunningPromptJob = null;
        continue;
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
        promptSuccess += 1;
        currentRunningPromptJob = null;
        continue;
      }

      const llmStart = Date.now();
      const llmResult = await generateGeminiVisibilityAnswer({
        prompt: promptText,
        brand: project.brand,
        competitors: (competitors ?? []).map((c) => c.name),
        country: project.country,
        language: project.language
      });
      const latency = Date.now() - llmStart;
      const responseLower = llmResult.text.toLowerCase();
      const brandMentioned = responseLower.includes(project.brand.toLowerCase());
      const mentionedCompetitorsCount = (competitors ?? []).reduce(
        (acc, competitor) => (responseLower.includes(competitor.name.toLowerCase()) ? acc + 1 : acc),
        0
      );
      const citationRegex = /(https?:\/\/[^\s)]+|www\.[^\s)]+)/gi;
      const citations = llmResult.text.match(citationRegex) ?? [];
      const citationFound = citations.length > 0;
      const citationsCount = citations.length;
      const sentiment: "positive" | "neutral" | "negative" | "mixed" | "unknown" = "unknown";

      const extractedJson = {
        phase: "phase4-basic",
        notes: "Basic extraction placeholders from raw Gemini response.",
        citations
      };

      const { error: resultError } = await service.from("scan_prompt_results").insert({
        run_id: runId,
        project_id: projectId,
        prompt_id: promptId,
        prompt_text_snapshot: promptText,
        brand_snapshot: project.brand,
        competitors_snapshot: (competitors ?? []).map((c) => ({ name: c.name, domain: c.domain })),
        country_snapshot: project.country,
        language_snapshot: project.language,
        provider: "gemini",
        model: llmResult.model,
        status: "completed",
        raw_response_text: llmResult.text,
        raw_response_json: {
          text: llmResult.text,
          total_tokens: llmResult.totalTokens
        },
        tokens_in: llmResult.tokensIn,
        tokens_out: llmResult.tokensOut,
        cost_usd: null,
        llm_latency_ms: latency,
        brand_mentioned: brandMentioned,
        citation_found: citationFound,
        mentioned_competitors_count: mentionedCompetitorsCount,
        citations_count: citationsCount,
        sentiment,
        extraction_version: "phase4-basic-v1",
        extracted_json: extractedJson
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

        promptFailed += 1;
        currentRunningPromptJob = null;
        continue;
      }

      await logJob(service, {
        jobId: job.id,
        projectId,
        runId,
        level: "info",
        message: "Prompt job completed with Gemini response.",
        context: { prompt_id: promptId, brand_mentioned: brandMentioned, citation_found: citationFound }
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

      promptSuccess += 1;
      currentRunningPromptJob = null;
    }

    await runStructuredExtractionForRun({
      service,
      projectId,
      runId
    });

    const { data: promptResults } = await service
      .from("scan_prompt_results")
      .select(
        "id, prompt_text_snapshot, brand_mentioned, citation_found, mentioned_competitors_count, citations_count, sentiment, extracted_json, extraction_error, status"
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
        extraction_error: row.extraction_error
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

    if (currentRunningPromptJob) {
      await service
        .from("jobs")
        .update({
          status: "failed",
          locked_at: null,
          locked_by: null,
          last_error: errorSummary
        })
        .eq("id", currentRunningPromptJob.id)
        .eq("project_id", projectId)
        .eq("run_id", runId);

      await logJob(service, {
        jobId: currentRunningPromptJob.id,
        projectId,
        runId,
        level: "error",
        message: "Gemini prompt execution failed.",
        context: { error: errorSummary }
      });
    }

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

/**
 * Create a pending run and, when sync execution is enabled, run it to completion
 * in-request. Used by both the manual "launch scan" action and the automatic
 * scan triggered right after a new domain is created.
 * Returns the run id and whether it was executed synchronously.
 */
export async function launchScan({
  projectId,
  supabase,
  user
}: {
  projectId: string;
  supabase: AuthenticatedContext["supabase"];
  user: AuthenticatedContext["user"];
}): Promise<{ runId: string; executed: boolean }> {
  const runId = await createPendingScanRun({ projectId, supabase, user });

  if (ENABLE_SYNC_SCAN_EXECUTION) {
    await executePendingScan({ projectId, runId, supabase });
    return { runId, executed: true };
  }

  return { runId, executed: false };
}
