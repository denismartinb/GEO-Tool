"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/service";
import { addPromptsCore, addPromptsInputSchema, type AddPromptsResult } from "@/lib/projects/add-prompts";
import {
  AUDIT_HALF_COLUMN,
  checkRecurringScansPrecondition,
  isMissingColumnError
} from "@/lib/projects/automation-toggles";
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
  restoreRecommendationCore,
  restoreRecommendationInputSchema,
  type RestoreRecommendationResult
} from "@/lib/recommendations/restore-recommendation";
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
import { canStartAnotherScanInvocation } from "@/lib/scan/drive-budget";
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
import {
  addBrandAliasCore,
  addBrandAliasInputSchema,
  removeBrandAliasCore,
  removeBrandAliasInputSchema,
  type ManageBrandAliasesResult
} from "@/lib/brand-aliases/manage-brand-aliases";

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

/**
 * Alias de marca (Fase −1c, docs/geo-score-variability-2026-08.md §3): add/
 * remove UI for `projects.brand_aliases`. That column already exists
 * (migration 0025) and already decides — via `verifyMention`, ADR 0021/0025
 * — whether an AI answer counts as a mention of the brand, but until this
 * phase the only way to inspect or change it was a direct SQL query (ADR
 * 0025 "Correction (2026-08-03)": the accepted risk of a bad alias moving
 * the score with no owner-visible way to fix it was explicitly unmitigated).
 * Same call pattern as `createCompetitorAction` — typed input + `useTransition`,
 * no FormData, no redirect, inline error in the modal.
 */
export async function addBrandAliasAction(input: {
  projectId: string;
  alias: string;
}): Promise<ManageBrandAliasesResult> {
  const parsed = addBrandAliasInputSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Datos no válidos." };
  }

  const { supabase, user } = await requireUser();
  const result = await addBrandAliasCore({ ...parsed.data, supabase, user });

  if (result.success) {
    revalidatePath(`/dashboard/projects/${parsed.data.projectId}/competitors`);
    revalidatePath(`/dashboard/projects/${parsed.data.projectId}`);
  }

  return result;
}

/** Symmetric to addBrandAliasAction. Removal is always allowed, even below MIN_ALIAS_LENGTH — those bounds only gate what can be ADDED. */
export async function removeBrandAliasAction(input: {
  projectId: string;
  alias: string;
}): Promise<ManageBrandAliasesResult> {
  const parsed = removeBrandAliasInputSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues[0]?.message ?? "Datos no válidos." };
  }

  const { supabase, user } = await requireUser();
  const result = await removeBrandAliasCore({ ...parsed.data, supabase, user });

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
    const check = await checkRecurringScansPrecondition(supabase, projectId);
    if (!check.ok) redirect(`/dashboard/projects/${projectId}/debug?error=${check.reason}`);
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
    redirect(`/dashboard/projects/${projectId}/debug?error=recurring_update_failed`);
  }

  revalidatePath(`/dashboard/projects/${projectId}`);
  revalidatePath(`/dashboard/projects/${projectId}/debug`);
  redirect(`/dashboard/projects/${projectId}/debug?success=${enabled ? "recurring_enabled" : "recurring_disabled"}`);
}

/**
 * WEB-AUDIT-AUTO-SPLIT-1 — the per-project automatic-audit switches, one per
 * half. Supersedes `setAutoWebAudit` (DOMAINS-REDESIGN-1), which wrote the
 * single `auto_web_audit_enabled` column that migration 0031 retired: it was
 * removed rather than left in place, because a control still writing a column
 * nothing reads is worse than no control.
 *
 * Still a mirror image of `setRecurringScans` above, deliberately: the switches
 * live side by side on /debug and a user reading them should not have to learn
 * three behaviours.
 *
 * One asymmetry, and it is not an oversight: this has no "requires a completed
 * scan" precondition. Recurring scans need one because a recurring scan repeats
 * a known-good baseline; the audit has no such dependency — it simply does not
 * run until there is a completed scan to audit, and enabling it early is
 * harmless.
 *
 * Writing `false` here does not cancel work already queued, but it does stop
 * that half from running: `runWebAuditJob` re-reads both switches when it picks
 * a job up (migration 0031), so a job queued while the half was on and executed
 * after it was turned off skips that half. What it cannot stop is a half
 * already mid-flight in a live invocation.
 */
const auditHalfSchema = recurringScansSchema.extend({
  half: z.enum(["technical", "coverage"])
});

export async function setAutoAuditHalf(formData: FormData) {
  const parsed = auditHalfSchema.safeParse({
    projectId: formData.get("projectId"),
    enabled: formData.get("enabled"),
    half: formData.get("half")
  });

  if (!parsed.success) {
    redirect("/dashboard/projects?error=invalid_project_id");
  }

  const { projectId, half } = parsed.data;
  const enabled = parsed.data.enabled === "true";
  const { supabase, user } = await requireUser();

  const { data, error } = await supabase
    .from("projects")
    .update({ [AUDIT_HALF_COLUMN[half]]: enabled })
    .eq("id", projectId)
    .eq("owner_user_id", user.id)
    .eq("is_archived", false)
    .select("id")
    .maybeSingle();

  if (error || !data) {
    // Decir "vuelve a intentarlo" ante una migración pendiente es mandar al
    // operador a repetir algo que no puede funcionar (reportado por el
    // fundador el 2026-08-05, desde su móvil) — de ahí el mensaje distinto.
    redirect(
      `/dashboard/projects/${projectId}/debug?error=${
        isMissingColumnError(error) ? "auto_audit_migration_pending" : "auto_audit_update_failed"
      }`
    );
  }

  revalidatePath(`/dashboard/projects/${projectId}/debug`);
  revalidatePath(`/dashboard/projects/${projectId}/web-audit`);
  redirect(`/dashboard/projects/${projectId}/debug?success=audit_${half}_${enabled ? "enabled" : "disabled"}`);
}

/**
 * SAMPLING-DEBUG-TOGGLE-1 — per-project override for the response floor
 * (SAMPLING-1, `lib/scan/sampling.ts`). Same shape as `setRecurringScans` and
 * `setAutoAuditHalf` above, and the same reason: one control, validated the
 * same way, redirecting to the same screen.
 *
 * No "requires a completed scan" precondition, same as the audit switches:
 * sampling has nothing to depend on, it just sizes the next run.
 *
 * Writing `false` here does not touch a run already in progress — the next
 * one created reads the column fresh (`run-creation.ts`), same re-read-at-use
 * pattern as the audit halves.
 */
export async function setSamplingEnabled(formData: FormData) {
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

  const { data, error } = await supabase
    .from("projects")
    .update({ sampling_enabled: enabled })
    .eq("id", projectId)
    .eq("owner_user_id", user.id)
    .eq("is_archived", false)
    .select("id")
    .maybeSingle();

  if (error || !data) {
    // Same two PostgREST codes as `setAutoAuditHalf`, same reason: "vuelve a
    // intentarlo" would send the operator to retry something that cannot
    // succeed without the migration being applied first.
    const missingColumn = error?.code === "42703" || error?.code === "PGRST204";
    redirect(
      `/dashboard/projects/${projectId}/debug?error=${
        missingColumn ? "sampling_migration_pending" : "sampling_update_failed"
      }`
    );
  }

  revalidatePath(`/dashboard/projects/${projectId}/debug`);
  redirect(`/dashboard/projects/${projectId}/debug?success=sampling_${enabled ? "enabled" : "disabled"}`);
}

/**
 * ENGINE-DEBUG-TOGGLE-1 — per-project, per-engine switch (Gemini/Claude/
 * OpenAI) so a test scan can be restricted to a subset of engines. Same
 * validated-form shape as the switches above.
 *
 * One asymmetry from every other switch on this page, and it is the whole
 * point of this guard: this is the only one of the four debug switches whose
 * "off" position can make a scan produce nothing. Recurring scans and the two
 * audit halves can all be off simultaneously and the product just does less
 * work; zero engines enabled makes `createPendingScanRunCore` and
 * `executePendingScan` reject outright (`no_engines_enabled`,
 * `lib/scan/run-creation.ts`) rather than create or run an empty scan. This
 * action is the primary guard that keeps that state from ever being reached
 * by the UI: it reads the other two flags before writing, and refuses to turn
 * off the last engine still on.
 */
const engineToggleSchema = recurringScansSchema.extend({
  engine: z.enum(["gemini", "claude", "openai"])
});

const ENGINE_TOGGLE_COLUMN = {
  gemini: "engine_gemini_enabled",
  claude: "engine_claude_enabled",
  openai: "engine_openai_enabled"
} as const;

export async function setEngineEnabled(formData: FormData) {
  const parsed = engineToggleSchema.safeParse({
    projectId: formData.get("projectId"),
    enabled: formData.get("enabled"),
    engine: formData.get("engine")
  });

  if (!parsed.success) {
    redirect("/dashboard/projects?error=invalid_project_id");
  }

  const { projectId, engine } = parsed.data;
  const enabled = parsed.data.enabled === "true";
  const { supabase, user } = await requireUser();

  if (!enabled) {
    const { data: currentFlags, error: readError } = await supabase
      .from("projects")
      .select("engine_gemini_enabled, engine_claude_enabled, engine_openai_enabled")
      .eq("id", projectId)
      .eq("owner_user_id", user.id)
      .maybeSingle();

    if (readError) {
      const missingColumn = readError.code === "42703" || readError.code === "PGRST204";
      redirect(
        `/dashboard/projects/${projectId}/debug?error=${
          missingColumn ? "engine_toggle_migration_pending" : "engine_toggle_update_failed"
        }`
      );
    }

    // Fail-open reading (undefined -> `!== false` -> counted as enabled),
    // same as every read of these columns elsewhere: a project this action
    // cannot even see yet (columns not migrated) must not be told it is
    // trying to turn off "the last engine" when it might not be.
    const otherEnginesStillOn = (["gemini", "claude", "openai"] as const)
      .filter((id) => id !== engine)
      .some((id) => currentFlags?.[ENGINE_TOGGLE_COLUMN[id]] !== false);

    if (!otherEnginesStillOn) {
      redirect(`/dashboard/projects/${projectId}/debug?error=engine_toggle_requires_one_active`);
    }
  }

  const { data, error } = await supabase
    .from("projects")
    .update({ [ENGINE_TOGGLE_COLUMN[engine]]: enabled })
    .eq("id", projectId)
    .eq("owner_user_id", user.id)
    .eq("is_archived", false)
    .select("id")
    .maybeSingle();

  if (error || !data) {
    const missingColumn = error?.code === "42703" || error?.code === "PGRST204";
    redirect(
      `/dashboard/projects/${projectId}/debug?error=${
        missingColumn ? "engine_toggle_migration_pending" : "engine_toggle_update_failed"
      }`
    );
  }

  revalidatePath(`/dashboard/projects/${projectId}/debug`);
  redirect(`/dashboard/projects/${projectId}/debug?success=engine_${engine}_${enabled ? "enabled" : "disabled"}`);
}

export type AutoExecuteScanStatus = "idle" | "running" | "done";

/**
 * Executes a pending scan run that was created without sync execution
 * (e.g. right after onboarding). Called from a client component on the
 * Escaneos page so the user lands there immediately and the heavy Gemini
 * work happens in this follow-up request while they watch the real
 * "scan in progress" UI. Does not redirect — the caller refreshes the page.
 *
 * SCAN-CHAIN-1 foreground driver: rather than processing a single batch and
 * relying only on the secret-gated `/api/scan/continue` self-fetch (which a
 * preview deploy or a browser with an active session can't necessarily reach —
 * see docs/adr/0014), this loops `executePendingScan` directly, batch after
 * batch, until the run is terminal or there is no longer room in this request
 * for another batch's worst case. It returns the run's resulting status so the
 * client (`AutoExecuteScan`) can call again for the next window when a large
 * campaign needs more than one request to finish. This path goes through the
 * authenticated user session, so it works regardless of the continuation secret
 * or Vercel deployment protection.
 *
 * It is no longer the *only* driver, and must not be treated as one
 * (SCAN-DRIVE-1, docs/adr/0037): it runs in the user's browser, so a locked
 * phone or a backgrounded tab stops it mid-campaign. `executePendingScan` now
 * always schedules a background continuation as well, and the atomic per-batch
 * claim is what makes the two drivers safe to run at once.
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
  //
  // The budget is checked BEFORE each iteration, against that iteration's
  // worst case — `canStartAnotherScanInvocation`. Checking it afterwards (the
  // `do { ... } while (elapsed < budget)` this replaces) let an iteration start
  // at 39s and run for another 45, pushing the action well past its 60s
  // `maxDuration` and getting it killed mid-batch. See
  // SCAN_INVOCATION_WORST_CASE_MS.
  while (canStartAnotherScanInvocation({ elapsedMs: Date.now() - startedAt })) {
    const iterationStart = Date.now();

    try {
      await executePendingScan({ projectId, runId, supabase });
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
  }

  revalidatePath(`/dashboard/projects/${projectId}`);
  revalidatePath(`/dashboard/projects/${projectId}/debug`);
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
    revalidatePath(`/dashboard/projects/${parsed.data.projectId}/debug`);
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
 * "Deshacer" on "Marcar como hecho" (ACTIONS-OBSERVABLE-1 slice 4a,
 * docs/external-audit-2026-08.md, Fase 4). Called from the same ephemeral
 * "Deshacer" affordance that replaces the previous silent-disappearance
 * behavior of dismissRecommendationAction — see restoreRecommendationCore's
 * doc comment for why this is NOT anchored to a run id. No `revalidatePath`
 * on success: the caller already reflects "active" locally without waiting
 * for a refetch, same as it already showed "dismissed" locally before this.
 */
export async function restoreRecommendationAction(input: {
  projectId: string;
  recommendationId: string;
}): Promise<RestoreRecommendationResult> {
  const parsed = restoreRecommendationInputSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: "Datos de solicitud no válidos." };
  }

  const { supabase, user } = await requireUser();
  const service = createServiceClient();
  return restoreRecommendationCore({ ...parsed.data, supabase, service, user });
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
