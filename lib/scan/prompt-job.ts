import "server-only";

import { generateGeminiVisibilityAnswer, GeminiConfigError } from "@/lib/llm/gemini";
import { generateClaudeVisibilityAnswer, ClaudeConfigError } from "@/lib/llm/claude";
import { generateOpenAIVisibilityAnswer, OpenAIConfigError } from "@/lib/llm/openai";
import type { GeminiVisibilityResponse } from "@/lib/llm/contracts";
import { delay } from "@/lib/llm/http";
import { createServiceClient } from "@/lib/supabase/service";
import type { LLMScanProvider } from "@/lib/scan/providers";
import { PROMPT_RETRY_DELAY_MS, PROMPT_RETRY_MAX_TOTAL_ATTEMPTS, PROMPT_VERSION } from "@/lib/scan/constants";
import { getSanitizedScanError } from "@/lib/scan/errors";
import { logJob } from "@/lib/scan/job-logging";
import type { JobRow } from "@/lib/scan/types";

/**
 * PRELAUNCH-HARDENING-1 Fase R6 — el trabajo de UN prompt, fuera del
 * ejecutor.
 *
 * `lib/scan/executor.ts` tenía 1.523 líneas y mezclaba dos niveles: la
 * campaña (reclamar lotes, presupuesto de invocación, finalizar, puntuar,
 * notificar) y **el trabajo de un solo prompt** (transiciones de estado del
 * job, una llamada por motor con sus rondas de reintento compartidas,
 * inserción de resultados, registro). Lo segundo es lo que se lee cuando se
 * depura por qué un prompt concreto falló, y estaba enterrado en medio de lo
 * primero.
 *
 * `.claude/rules/scan.md` aplica entera: esto es una mudanza, no un cambio de
 * lógica. En particular siguen intactos el reintento acotado por rondas, el
 * criterio de "un motor mal configurado no tumba a los demás", y que el job
 * tiene éxito si al menos un motor produce resultado.
 *
 * `delay` deja de estar duplicado: era idéntico al de `lib/llm/http.ts`,
 * carácter por carácter, y ahora ambos módulos usan ése.
 */

export type PromptJobOutcome =
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
export async function processPromptJob({
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
