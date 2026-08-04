"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/service";
import { addPromptsCore, addPromptsInputSchema, type AddPromptsResult } from "@/lib/projects/add-prompts";
import {
  rewriteRecommendationCore,
  rewriteRecommendationInputSchema,
  type RewriteRecommendationResult
} from "@/lib/recommendations/rewrite-recommendation";
import {
  dismissRecommendationCore,
  dismissRecommendationInputSchema,
  type DismissRecommendationResult
} from "@/lib/recommendations/dismiss-recommendation";
import {
  auditDomainCoverageCore,
  domainCoverageInputSchema,
  type DomainCoverageResult
} from "@/lib/recommendations/domain-coverage";
import {
  runTechnicalAuditCore,
  technicalAuditInputSchema,
  type TechnicalAuditResult
} from "@/lib/web-audit/technical-audit";
import {
  ENABLE_SYNC_SCAN_EXECUTION,
  executePendingScan,
  getActionErrorCode
} from "@/lib/scan/scan-runner";
import {
  createCompetitorCore,
  createCompetitorInputSchema,
  deactivateCompetitorCore,
  deactivateCompetitorInputSchema,
  updateCompetitorCore,
  updateCompetitorInputSchema,
  type CreateCompetitorResult,
  type DeactivateCompetitorResult,
  type UpdateCompetitorResult
} from "@/lib/competitors/manage-competitors";
import { suggestCompetitors } from "@/lib/llm/gemini";
import {
  getSuggestedCompetitorsCore,
  suggestedCompetitorsInputSchema,
  type SuggestedCompetitorsResult
} from "@/lib/competitors/suggest-competitors";

const promptCreateSchema = z.object({
  projectId: z.string().uuid(),
  promptText: z.string().min(10).max(3000),
  category: z.string().max(100).optional().or(z.literal(""))
});

const scanExecuteSchema = z.object({
  projectId: z.string().uuid(),
  runId: z.string().uuid()
});

const recurringScansSchema = z.object({
  projectId: z.string().uuid(),
  enabled: z.enum(["true", "false"])
});

export async function createPrompt(formData: FormData) {
  const payload = promptCreateSchema.parse({
    projectId: formData.get("projectId"),
    promptText: formData.get("promptText"),
    category: formData.get("category")
  });

  const { supabase } = await requireUser();
  await supabase.from("project_prompts").insert({
    project_id: payload.projectId,
    prompt_text: payload.promptText,
    category: payload.category || null
  });

  revalidatePath(`/dashboard/projects/${payload.projectId}`);
}

export async function updatePrompt(formData: FormData) {
  const projectId = String(formData.get("projectId") ?? "");
  const promptId = String(formData.get("promptId") ?? "");
  const promptText = String(formData.get("promptText") ?? "");
  const category = String(formData.get("category") ?? "");

  const { supabase } = await requireUser();
  await supabase
    .from("project_prompts")
    .update({ prompt_text: promptText, category: category || null })
    .eq("id", promptId)
    .eq("project_id", projectId);

  revalidatePath(`/dashboard/projects/${projectId}`);
}

export async function deactivatePrompt(formData: FormData) {
  const projectId = String(formData.get("projectId") ?? "");
  const promptId = String(formData.get("promptId") ?? "");

  const { supabase } = await requireUser();
  await supabase.from("project_prompts").update({ is_active: false }).eq("id", promptId).eq("project_id", projectId);

  revalidatePath(`/dashboard/projects/${projectId}`);
  revalidatePath(`/dashboard/projects/${projectId}/prompts`);
}

/**
 * Alta de competidor (COMP-REDESIGN-1). Called directly from the client via
 * `useTransition`, same pattern as `addPrompts` — no FormData, no redirect,
 * so the manage-competitor modal can show an inline error without a full
 * navigation. There was no existing UI wired to competitor management
 * before this, so this replaces the old FormData-based `createCompetitor`
 * outright rather than preserving it as a second contract.
 */
export async function createCompetitorAction(input: {
  projectId: string;
  name: string;
  domain: string;
}): Promise<CreateCompetitorResult> {
  const parsed = createCompetitorInputSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Datos no válidos." };
  }

  const { supabase, user } = await requireUser();
  const result = await createCompetitorCore({ ...parsed.data, supabase, user });

  if (result.success) {
    revalidatePath(`/dashboard/projects/${parsed.data.projectId}/competitors`);
    revalidatePath(`/dashboard/projects/${parsed.data.projectId}`);
  }

  return result;
}

/**
 * COMPETITOR-SUGGESTIONS-1: competidores sugeridos a partir del negocio real
 * (perfil cacheado + búsqueda grounded), no de lo que salga en los prompts.
 *
 * Called from a client component on mount so the page itself never blocks on
 * a multi-second grounded lookup; the block renders immediately with a
 * skeleton and fills in when this resolves. Cached after the first call, so
 * only a `refresh: true` ("Buscar más") pays that cost again.
 */
export async function getSuggestedCompetitorsAction(input: {
  projectId: string;
  refresh?: boolean;
}): Promise<SuggestedCompetitorsResult> {
  const parsed = suggestedCompetitorsInputSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Datos no válidos." };
  }

  const { supabase, user } = await requireUser();

  return getSuggestedCompetitorsCore({
    projectId: parsed.data.projectId,
    refresh: parsed.data.refresh ?? false,
    supabase,
    user,
    suggest: suggestCompetitors
  });
}

/** Edición de competidor (COMP-REDESIGN-1). Same call pattern as `createCompetitorAction`. */
export async function updateCompetitorAction(input: {
  projectId: string;
  competitorId: string;
  name: string;
  domain: string;
}): Promise<UpdateCompetitorResult> {
  const parsed = updateCompetitorInputSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Datos no válidos." };
  }

  const { supabase, user } = await requireUser();
  const result = await updateCompetitorCore({ ...parsed.data, supabase, user });

  if (result.success) {
    revalidatePath(`/dashboard/projects/${parsed.data.projectId}/competitors`);
    revalidatePath(`/dashboard/projects/${parsed.data.projectId}`);
  }

  return result;
}

/**
 * Baja de competidor (COMP-REDESIGN-1). Soft delete only (`is_active =
 * false`) — hard delete of a tracked competitor is not part of this scope
 * and stays off the list of things this action can do.
 */
export async function deactivateCompetitorAction(input: {
  projectId: string;
  competitorId: string;
}): Promise<DeactivateCompetitorResult> {
  const parsed = deactivateCompetitorInputSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Datos no válidos." };
  }

  const { supabase, user } = await requireUser();
  const result = await deactivateCompetitorCore({ ...parsed.data, supabase, user });

  if (result.success) {
    revalidatePath(`/dashboard/projects/${parsed.data.projectId}/competitors`);
    revalidatePath(`/dashboard/projects/${parsed.data.projectId}`);
  }

  return result;
}

export async function executeScan(formData: FormData) {
  const parsed = scanExecuteSchema.safeParse({
    projectId: formData.get("projectId"),
    runId: formData.get("runId")
  });

  if (!parsed.success) {
    redirect("/dashboard/projects?error=invalid_run_or_project_id");
  }

  const { projectId, runId } = parsed.data;
  const { supabase } = await requireUser();

  if (!ENABLE_SYNC_SCAN_EXECUTION) {
    redirect(`/dashboard/projects/${projectId}?error=scan_unavailable`);
  }

  try {
    await executePendingScan({ projectId, runId, supabase });
  } catch (error) {
    redirect(`/dashboard/projects/${projectId}?error=${encodeURIComponent(getActionErrorCode(error))}`);
  }

  revalidatePath(`/dashboard/projects/${projectId}`);
  revalidatePath(`/dashboard/projects/${projectId}/runs/${runId}`);
  redirect(`/dashboard/projects/${projectId}?success=scan_completed`);
}

/**
 * Enables/disables the daily automatic scan for a project. Opt-in only:
 * enabling requires at least one completed scan run, so the recurring cadence
 * always starts from a known-good baseline (geo-strategy guardrail).
 */
export async function setRecurringScans(formData: FormData) {
  const parsed = recurringScansSchema.safeParse({
    projectId: formData.get("projectId"),
    enabled: formData.get("enabled")
  });

  if (!parsed.success) {
    redirect("/dashboard/projects?error=invalid_project_id");
  }

  const { projectId } = parsed.data;
  const enabled = parsed.data.enabled === "true";
  const { supabase, user } = await requireUser();

  if (enabled) {
    const { data: completedRun, error: completedRunError } = await supabase
      .from("scan_runs")
      .select("id")
      .eq("project_id", projectId)
      .eq("status", "completed")
      .limit(1)
      .maybeSingle();

    if (completedRunError) {
      redirect(`/dashboard/projects/${projectId}/runs?error=unexpected_error`);
    }

    if (!completedRun) {
      redirect(`/dashboard/projects/${projectId}/runs?error=recurring_requires_completed_scan`);
    }
  }

  const { data, error } = await supabase
    .from("projects")
    .update({ recurring_scans_enabled: enabled })
    .eq("id", projectId)
    .eq("owner_user_id", user.id)
    .eq("is_archived", false)
    .select("id")
    .maybeSingle();

  if (error || !data) {
    redirect(`/dashboard/projects/${projectId}/runs?error=recurring_update_failed`);
  }

  revalidatePath(`/dashboard/projects/${projectId}`);
  revalidatePath(`/dashboard/projects/${projectId}/runs`);
  redirect(`/dashboard/projects/${projectId}/runs?success=${enabled ? "recurring_enabled" : "recurring_disabled"}`);
}

export type AutoExecuteScanStatus = "idle" | "running" | "done";

// How long this server action keeps processing batches before returning to let
// the client re-drive. Kept safely under the page's maxDuration=60s budget
// (docs/adr/0003) so the function is never killed mid-batch: a batch of
// MAX_REAL_SCAN_PROMPTS takes up to ~20s, so stopping at ~40s leaves margin for
// one more batch to finish. A campaign that fits in one or two batches (e.g. a
// 20-prompt scan) therefore completes in a single call.
const AUTO_EXECUTE_TIME_BUDGET_MS = 40_000;

/**
 * Executes a pending scan run that was created without sync execution
 * (e.g. right after onboarding). Called from a client component on the
 * Escaneos page so the user lands there immediately and the heavy Gemini
 * work happens in this follow-up request while they watch the real
 * "scan in progress" UI. Does not redirect — the caller refreshes the page.
 *
 * SCAN-CHAIN-1 foreground driver: rather than processing a single batch and
 * relying on the secret-gated `/api/scan/continue` self-fetch (which a preview
 * deploy or a browser with an active session can't necessarily reach — see
 * docs/adr/0014), this loops `executePendingScan` (with `scheduleContinuation:
 * false`) directly, batch after batch, until the run is terminal or this
 * request's time budget is nearly spent. It returns the run's resulting status
 * so the client (`AutoExecuteScan`) can call again for the next window when a
 * large campaign needs more than one request to finish. This path goes through
 * the authenticated user session, so it works regardless of the continuation
 * secret or Vercel deployment protection.
 */
export async function autoExecutePendingScan(input: {
  projectId: string;
  runId: string;
}): Promise<{ status: AutoExecuteScanStatus }> {
  const parsed = scanExecuteSchema.safeParse(input);
  if (!parsed.success || !ENABLE_SYNC_SCAN_EXECUTION) {
    return { status: "idle" };
  }

  const { projectId, runId } = parsed.data;
  const { supabase } = await requireUser();

  const startedAt = Date.now();
  let status: AutoExecuteScanStatus = "running";

  // Drive as many batches as fit in this request's budget. `executePendingScan`
  // claims one batch of still-pending prompt jobs per call (atomically, so a
  // duplicate/racing driver is a safe no-op) and finalizes the run once none
  // remain.
  do {
    const iterationStart = Date.now();

    try {
      await executePendingScan({ projectId, runId, supabase, scheduleContinuation: false });
    } catch {
      // executePendingScan persists any real failure state on the run itself;
      // stop looping and report whatever the run's status now is.
      break;
    }

    const { data: run } = await supabase
      .from("scan_runs")
      .select("status")
      .eq("id", runId)
      .eq("project_id", projectId)
      .maybeSingle();

    if (!run || run.status === "completed" || run.status === "failed" || run.status === "cancelled") {
      status = "done";
      break;
    }

    // A real batch always spends seconds on concurrent Gemini calls; an
    // iteration that returns near-instantly means this call claimed no jobs
    // (another driver holds the remaining batch — rare in the foreground path).
    // Break rather than spin so the client re-drives after its own pacing
    // delay instead of hammering the DB inside the time budget.
    if (Date.now() - iterationStart < 1_000) {
      break;
    }
  } while (Date.now() - startedAt < AUTO_EXECUTE_TIME_BUDGET_MS);

  revalidatePath(`/dashboard/projects/${projectId}`);
  revalidatePath(`/dashboard/projects/${projectId}/runs`);
  revalidatePath(`/dashboard/projects/${projectId}/runs/${runId}`);

  return { status };
}

/**
 * "Añadir prompts" (ADD-PROMPTS-BACKEND-1/UI-1): generates/categorizes new
 * prompts with Gemini (auto/keywords/manual — see lib/projects/add-prompts.ts)
 * and launches a scan restricted to just the new prompts. Called directly
 * from the client modal via `useTransition` (not a `<form action>`), so the
 * input is a typed object rather than `FormData` — still re-validated here
 * with zod since this is a real server-action endpoint reachable with an
 * arbitrary payload.
 */
export async function addPrompts(input: {
  projectId: string;
  mode: "auto" | "keywords" | "manual";
  keywords?: string[];
  manualPrompts?: string[];
}): Promise<AddPromptsResult> {
  const parsed = addPromptsInputSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Datos de solicitud no válidos." };
  }

  const { supabase, user } = await requireUser();
  const result = await addPromptsCore({ ...parsed.data, supabase, user });

  if (result.success) {
    revalidatePath(`/dashboard/projects/${parsed.data.projectId}/prompts`);
    revalidatePath(`/dashboard/projects/${parsed.data.projectId}`);
    revalidatePath(`/dashboard/projects/${parsed.data.projectId}/runs`);
  }

  return result;
}

/**
 * "Mejorar redacción con IA": on-demand LLM rewrite of one rule-based
 * recommendation, strictly anchored to its own evidence_json and persisted as a
 * sanitized `generated_solutions` row (the recommendation row itself is never
 * mutated — see lib/recommendations/rewrite-recommendation.ts). The service
 * client is the trusted-server write path that table's RLS prescribes. Called
 * directly from the client via `useTransition`, same pattern as `addPrompts`.
 */
export async function rewriteRecommendationAction(input: {
  projectId: string;
  recommendationId: string;
}): Promise<RewriteRecommendationResult> {
  const parsed = rewriteRecommendationInputSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Datos de solicitud no válidos." };
  }

  const { supabase, user } = await requireUser();
  const service = createServiceClient();
  const result = await rewriteRecommendationCore({ ...parsed.data, supabase, service, user });

  if (result.success) {
    revalidatePath(`/dashboard/projects/${parsed.data.projectId}/recommendations`);
  }

  return result;
}

/**
 * "Marcar como hecho / descartar" (RECS-3): the user manually marks a
 * recommendation as dismissed. Called directly from the client via
 * `useTransition`, same pattern as `rewriteRecommendationAction`.
 */
export async function dismissRecommendationAction(input: {
  projectId: string;
  recommendationId: string;
}): Promise<DismissRecommendationResult> {
  const parsed = dismissRecommendationInputSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Datos de solicitud no válidos." };
  }

  const { supabase, user } = await requireUser();
  const service = createServiceClient();
  const result = await dismissRecommendationCore({ ...parsed.data, supabase, service, user });

  if (result.success) {
    revalidatePath(`/dashboard/projects/${parsed.data.projectId}/recommendations`);
  }

  return result;
}

/**
 * "Auditar cobertura del dominio" (DOMAIN-COVERAGE-1): standalone, Pro+-gated
 * feature on the Auditoría web page (WEB-AUDIT-1; previously on Escaneos).
 * Audits, per active prompt topic of the latest completed scan, whether the
 * brand's own domain verifiably publishes content on it (Google Search
 * grounding restricted to the domain). Called directly from the client via
 * `useTransition`, same pattern as `rewriteRecommendationAction`.
 * See lib/recommendations/domain-coverage.ts for the plan gate, verified-
 * citation filtering, time budget, and rate-limit invariants.
 */
export async function auditDomainCoverageAction(input: {
  projectId: string;
}): Promise<DomainCoverageResult> {
  const parsed = domainCoverageInputSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Datos de solicitud no válidos.", reason: "generic" };
  }

  const { supabase, user } = await requireUser();
  const service = createServiceClient();
  const result = await auditDomainCoverageCore({ ...parsed.data, supabase, service, user });

  if (result.success) {
    revalidatePath(`/dashboard/projects/${parsed.data.projectId}/web-audit`);
  }

  return result;
}

/**
 * "Auditar salud técnica GEO" (WEB-AUDIT-2): standalone, Pro+-gated technical
 * audit of up to MAX_AUDIT_PAGES own-domain pages (structured data,
 * answer-first format, metadata, freshness) plus AI-bot access
 * (robots.txt / llms.txt). Deterministic — no Gemini call, no LLM spend.
 * Called directly from the client via `useTransition`, same pattern as
 * `auditDomainCoverageAction`. See lib/web-audit/technical-audit.ts for the
 * plan gate, cache-before-rate-limit ordering, and candidate-selection
 * invariants.
 */
export async function runTechnicalAuditAction(input: {
  projectId: string;
}): Promise<TechnicalAuditResult> {
  const parsed = technicalAuditInputSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Datos de solicitud no válidos.", reason: "generic" };
  }

  const { supabase, user } = await requireUser();
  const service = createServiceClient();
  const result = await runTechnicalAuditCore({ ...parsed.data, supabase, service, user });

  if (result.success) {
    revalidatePath(`/dashboard/projects/${parsed.data.projectId}/web-audit`);
  }

  return result;
}
