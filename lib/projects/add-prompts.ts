import "server-only";

import { z } from "zod";
import { getPlanForUser } from "@/lib/billing";
import { generateAddedPrompts, type AddPromptsMode, type GeneratedPromptCandidate } from "@/lib/llm/gemini";
import type { BusinessProfile } from "@/lib/llm/contracts";
import { resolveAndCacheBusinessProfile } from "@/lib/projects/business-profile";
import { feedbackErrorMessages } from "@/lib/projects/feedback-messages";
import { MAX_REAL_SCAN_PROMPTS } from "@/lib/scan/constants";
import { getActionErrorCode } from "@/lib/scan/errors";
import { launchScan } from "@/lib/scan/launch";
import type { AuthenticatedContext } from "@/lib/auth";

export type { AddPromptsMode };

// Spec: each generation mode invents 5 new prompts per call (auto/keywords).
const ADD_PROMPTS_GENERATION_LIMIT = 5;
const MIN_PROMPT_LENGTH = 10;
const MAX_PROMPT_LENGTH = 300;
const MAX_CATEGORY_LENGTH = 100;

export const addPromptsInputSchema = z.object({
  projectId: z.string().uuid(),
  mode: z.enum(["auto", "keywords", "manual"]),
  keywords: z.array(z.string().max(60)).max(10).optional(),
  manualPrompts: z.array(z.string().max(3000)).max(MAX_REAL_SCAN_PROMPTS).optional()
});

export type AddPromptsResult =
  | { success: true; addedCount: number; scanLaunched: boolean; scanWarning?: string }
  | { success: false; error: string };

const GENERIC_GENERATION_FAILURE =
  "No se han podido generar nuevos prompts en este momento. Inténtalo de nuevo en unos minutos.";

type ActivePromptRow = { prompt_text: string; category: string | null };

/**
 * Core business logic for the "Añadir prompts" feature (ADD-PROMPTS-BACKEND-1):
 * generates/categorizes new prompts with a single Gemini call (auto/keywords/
 * manual — see lib/llm/gemini.ts's generateAddedPrompts), persists them as
 * active project_prompts, then launches a scan restricted to just the newly
 * added prompts via `launchScan`'s `onlyPromptIds` — every other active
 * prompt is carried forward from the latest completed run, never re-scanned
 * (lib/scan/run-creation.ts).
 *
 * Separated from the thin `addPrompts` server action (app/dashboard/projects/
 * [projectId]/actions.ts) so it can be unit-tested with a fake Supabase
 * client, mirroring `lib/scan/run-creation.ts`'s `createPendingScanRunCore`
 * split.
 *
 * Returns `success: true` with `scanLaunched: false` (and a sanitized
 * `scanWarning`) rather than throwing when the prompts were saved but
 * `launchScan` itself could not create a run (e.g. another scan is already
 * active) — the prompts are real and persisted either way, so this is a
 * partial success, not a failure.
 */
export async function addPromptsCore({
  projectId,
  mode,
  keywords,
  manualPrompts,
  supabase,
  user
}: {
  projectId: string;
  mode: AddPromptsMode;
  keywords?: string[];
  manualPrompts?: string[];
  supabase: AuthenticatedContext["supabase"];
  user: AuthenticatedContext["user"];
}): Promise<AddPromptsResult> {
  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("id, brand, domain, country, language, is_archived, business_profile")
    .eq("id", projectId)
    .eq("owner_user_id", user.id)
    .maybeSingle();

  if (projectError || !project) {
    return { success: false, error: feedbackErrorMessages.project_not_found };
  }

  if (project.is_archived) {
    return { success: false, error: feedbackErrorMessages.project_archived };
  }

  const [plan, { count: activePromptCount, error: activePromptCountError }] = await Promise.all([
    getPlanForUser(supabase, user.id),
    supabase.from("project_prompts").select("id", { count: "exact", head: true }).eq("is_active", true)
  ]);

  if (!activePromptCountError && (activePromptCount ?? 0) >= plan.caps.prompts) {
    return { success: false, error: feedbackErrorMessages.prompt_limit_reached };
  }

  let normalizedManualPrompts: string[] = [];
  if (mode === "manual") {
    normalizedManualPrompts = (manualPrompts ?? [])
      .map((text) => text.trim())
      .filter((text) => text.length > 0);

    if (!normalizedManualPrompts.length) {
      return { success: false, error: "Introduce al menos un prompt." };
    }

    if (normalizedManualPrompts.length > MAX_REAL_SCAN_PROMPTS) {
      return {
        success: false,
        error: `Puedes añadir como máximo ${MAX_REAL_SCAN_PROMPTS} prompts a la vez.`
      };
    }

    const outOfRange = normalizedManualPrompts.some(
      (text) => text.length < MIN_PROMPT_LENGTH || text.length > MAX_PROMPT_LENGTH
    );
    if (outOfRange) {
      return {
        success: false,
        error: `Cada prompt debe tener entre ${MIN_PROMPT_LENGTH} y ${MAX_PROMPT_LENGTH} caracteres.`
      };
    }
  }

  let normalizedKeywords: string[] = [];
  if (mode === "keywords") {
    normalizedKeywords = (keywords ?? []).map((keyword) => keyword.trim()).filter((keyword) => keyword.length > 0);

    if (!normalizedKeywords.length) {
      return { success: false, error: "Introduce al menos una palabra clave." };
    }
  }

  const { data: activePromptRowsRaw } = await supabase
    .from("project_prompts")
    .select("prompt_text, category")
    .eq("project_id", projectId)
    .eq("is_active", true);

  const activePromptRows = (activePromptRowsRaw ?? []) as unknown as ActivePromptRow[];
  const existingPromptTexts = activePromptRows.map((row) => row.prompt_text);
  const existingCategories = [
    ...new Set(
      activePromptRows
        .map((row) => row.category?.trim() ?? "")
        .filter((category) => category.length > 0)
    )
  ];

  // COMPETITOR-GROUNDING-2 (docs/adr/0022): "manual" only categorizes the
  // user's own text (no new prompt text generated), so it has no use for a
  // business profile — skip resolving/caching one for that mode entirely.
  const profile =
    mode === "manual"
      ? undefined
      : ((await resolveAndCacheBusinessProfile({
          projectId,
          ownerUserId: user.id,
          domain: project.domain,
          country: project.country,
          language: project.language,
          existingProfile: project.business_profile,
          supabase,
          logLabel: "add-prompts"
        })) ?? undefined);

  // Any Gemini failure (timeout, rate limit, malformed response, missing API
  // key) must never surface as a raw, unhandled server-action exception —
  // .claude/rules/server-actions.md. Mirrors the try/catch already used
  // around the Gemini call in lib/recommendations/rewrite-recommendation.ts.
  let candidates: GeneratedPromptCandidate[];
  try {
    candidates = await generateAddedPrompts({
      mode,
      brand: project.brand,
      domain: project.domain,
      country: project.country,
      language: project.language,
      existingPromptTexts,
      existingCategories,
      keywords: mode === "keywords" ? normalizedKeywords : undefined,
      manualPrompts: mode === "manual" ? normalizedManualPrompts : undefined,
      limit: ADD_PROMPTS_GENERATION_LIMIT,
      profile
    });
  } catch (error) {
    // error.message here is always one of the fixed, pre-sanitized strings
    // thrown by generateGeminiJson/generateAddedPrompts (lib/llm/gemini.ts) —
    // e.g. "Gemini API request timed out.", "Gemini API quota or rate limit
    // reached." — never a raw provider payload or secret, so it is safe to
    // log for diagnosis.
    console.error("[add-prompts] generation failed", {
      project_id: projectId,
      mode,
      error_name: error instanceof Error ? error.name : "unknown",
      error_message: error instanceof Error ? error.message : "unknown"
    });
    return { success: false, error: GENERIC_GENERATION_FAILURE };
  }

  if (!candidates.length) {
    return { success: false, error: GENERIC_GENERATION_FAILURE };
  }

  const { data: insertedRows, error: insertError } = await supabase
    .from("project_prompts")
    .insert(
      candidates.map((candidate) => ({
        project_id: projectId,
        prompt_text: candidate.text,
        category: candidate.category.slice(0, MAX_CATEGORY_LENGTH),
        is_active: true
      }))
    )
    .select("id");

  if (insertError || !insertedRows?.length) {
    return { success: false, error: "No se han podido guardar los nuevos prompts." };
  }

  try {
    await launchScan({
      projectId,
      supabase,
      user,
      onlyPromptIds: insertedRows.map((row) => row.id as string)
    });

    return { success: true, addedCount: insertedRows.length, scanLaunched: true };
  } catch (error) {
    const code = getActionErrorCode(error);
    return {
      success: true,
      addedCount: insertedRows.length,
      scanLaunched: false,
      scanWarning: feedbackErrorMessages[code] ?? feedbackErrorMessages.unexpected_error
    };
  }
}

// ── Review before adding (PROMPTS-REVIEW-1) ──────────────────────────────
// "auto" and "keywords" used to insert whatever the LLM produced and scan it
// straight away. They now run in two steps: `generatePromptProposalsCore`
// only generates (nothing is written), the user keeps/edits/discards each
// proposal in the modal, and `addReviewedPromptsCore` saves exactly the ones
// they confirmed. Manual mode keeps going through `addPromptsCore`.

export const generatePromptProposalsInputSchema = z.object({
  projectId: z.string().uuid(),
  mode: z.enum(["auto", "keywords"]),
  keywords: z.array(z.string().max(60)).max(10).optional()
});

export type PromptProposal = { text: string; category: string };

export type GeneratePromptProposalsResult =
  | { success: true; proposals: PromptProposal[]; remainingSlots: number }
  | { success: false; error: string };

export const addReviewedPromptsInputSchema = z.object({
  projectId: z.string().uuid(),
  prompts: z
    .array(
      z.object({
        text: z.string().max(3000),
        category: z.string().max(MAX_CATEGORY_LENGTH)
      })
    )
    .min(1)
    .max(MAX_REAL_SCAN_PROMPTS)
});

function normalizePromptKey(text: string): string {
  return text.trim().replace(/\s+/g, " ").toLocaleLowerCase("es");
}

export async function generatePromptProposalsCore({
  projectId,
  mode,
  keywords,
  supabase,
  user
}: {
  projectId: string;
  mode: "auto" | "keywords";
  keywords?: string[];
  supabase: AuthenticatedContext["supabase"];
  user: AuthenticatedContext["user"];
}): Promise<GeneratePromptProposalsResult> {
  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("id, brand, domain, country, language, is_archived, business_profile")
    .eq("id", projectId)
    .eq("owner_user_id", user.id)
    .maybeSingle();

  if (projectError || !project) {
    return { success: false, error: feedbackErrorMessages.project_not_found };
  }
  if (project.is_archived) {
    return { success: false, error: feedbackErrorMessages.project_archived };
  }

  const [plan, { count: activePromptCount, error: activePromptCountError }] = await Promise.all([
    getPlanForUser(supabase, user.id),
    supabase.from("project_prompts").select("id", { count: "exact", head: true }).eq("is_active", true)
  ]);
  const remainingSlots = activePromptCountError
    ? ADD_PROMPTS_GENERATION_LIMIT
    : Math.max(0, plan.caps.prompts - (activePromptCount ?? 0));
  if (remainingSlots <= 0) {
    return { success: false, error: feedbackErrorMessages.prompt_limit_reached };
  }

  const normalizedKeywords =
    mode === "keywords"
      ? (keywords ?? []).map((keyword) => keyword.trim()).filter((keyword) => keyword.length > 0)
      : [];
  if (mode === "keywords" && !normalizedKeywords.length) {
    return { success: false, error: "Introduce al menos una palabra clave." };
  }

  const { data: activePromptRowsRaw } = await supabase
    .from("project_prompts")
    .select("prompt_text, category")
    .eq("project_id", projectId)
    .eq("is_active", true);
  const activePromptRows = (activePromptRowsRaw ?? []) as unknown as ActivePromptRow[];
  const existingPromptTexts = activePromptRows.map((row) => row.prompt_text);
  const existingCategories = [
    ...new Set(activePromptRows.map((row) => row.category?.trim() ?? "").filter((c) => c.length > 0))
  ];

  const profile =
    (await resolveAndCacheBusinessProfile({
      projectId,
      ownerUserId: user.id,
      domain: project.domain,
      country: project.country,
      language: project.language,
      existingProfile: project.business_profile,
      supabase,
      logLabel: "add-prompts"
    })) ?? undefined;

  let candidates: GeneratedPromptCandidate[];
  try {
    candidates = await generateAddedPrompts({
      mode,
      brand: project.brand,
      domain: project.domain,
      country: project.country,
      language: project.language,
      existingPromptTexts,
      existingCategories,
      keywords: mode === "keywords" ? normalizedKeywords : undefined,
      limit: ADD_PROMPTS_GENERATION_LIMIT,
      profile
    });
  } catch (error) {
    console.error("[add-prompts] proposal generation failed", {
      project_id: projectId,
      mode,
      error_name: error instanceof Error ? error.name : "unknown",
      error_message: error instanceof Error ? error.message : "unknown"
    });
    return { success: false, error: GENERIC_GENERATION_FAILURE };
  }

  const existingKeys = new Set(existingPromptTexts.map(normalizePromptKey));
  const seen = new Set<string>();
  const proposals: PromptProposal[] = [];
  for (const candidate of candidates) {
    const text = candidate.text.trim();
    const key = normalizePromptKey(text);
    if (text.length < MIN_PROMPT_LENGTH || text.length > MAX_PROMPT_LENGTH) continue;
    if (existingKeys.has(key) || seen.has(key)) continue;
    seen.add(key);
    proposals.push({ text, category: candidate.category.trim().slice(0, MAX_CATEGORY_LENGTH) });
  }

  if (!proposals.length) {
    return { success: false, error: GENERIC_GENERATION_FAILURE };
  }

  return { success: true, proposals, remainingSlots };
}

/**
 * Saves the proposals the user kept (possibly edited) and scans only them.
 * The text is the user's own from here on, so it gets the same checks as a
 * manual prompt; the category is the one the generator assigned. Unlike the
 * one-step path, the plan cap counts what is being added, not only what is
 * already there: the modal never lets the user tick more than fit, and this
 * re-checks it.
 */
export async function addReviewedPromptsCore({
  projectId,
  prompts,
  supabase,
  user
}: {
  projectId: string;
  prompts: PromptProposal[];
  supabase: AuthenticatedContext["supabase"];
  user: AuthenticatedContext["user"];
}): Promise<AddPromptsResult> {
  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("id, is_archived")
    .eq("id", projectId)
    .eq("owner_user_id", user.id)
    .maybeSingle();

  if (projectError || !project) {
    return { success: false, error: feedbackErrorMessages.project_not_found };
  }
  if (project.is_archived) {
    return { success: false, error: feedbackErrorMessages.project_archived };
  }

  const normalized = prompts.map((prompt) => ({
    text: prompt.text.trim().replace(/\s+/g, " "),
    category: prompt.category.trim().slice(0, MAX_CATEGORY_LENGTH)
  }));

  if (!normalized.length) {
    return { success: false, error: "Elige al menos un prompt." };
  }
  if (normalized.some((p) => p.text.length < MIN_PROMPT_LENGTH || p.text.length > MAX_PROMPT_LENGTH)) {
    return {
      success: false,
      error: `Cada prompt debe tener entre ${MIN_PROMPT_LENGTH} y ${MAX_PROMPT_LENGTH} caracteres.`
    };
  }

  const keys = normalized.map((p) => normalizePromptKey(p.text));
  if (new Set(keys).size !== keys.length) {
    return { success: false, error: "Hay dos prompts iguales. Edita o desmarca uno de ellos." };
  }

  const [plan, { count: activePromptCount, error: activePromptCountError }] = await Promise.all([
    getPlanForUser(supabase, user.id),
    supabase.from("project_prompts").select("id", { count: "exact", head: true }).eq("is_active", true)
  ]);
  if (!activePromptCountError) {
    const remaining = plan.caps.prompts - (activePromptCount ?? 0);
    if (remaining <= 0) {
      return { success: false, error: feedbackErrorMessages.prompt_limit_reached };
    }
    if (normalized.length > remaining) {
      return {
        success: false,
        error: `Tu plan admite ${remaining} prompt${remaining === 1 ? "" : "s"} más. Desmarca alguno para continuar.`
      };
    }
  }

  const { data: activePromptRowsRaw } = await supabase
    .from("project_prompts")
    .select("prompt_text, category")
    .eq("project_id", projectId)
    .eq("is_active", true);
  const existingKeys = new Set(
    ((activePromptRowsRaw ?? []) as unknown as ActivePromptRow[]).map((row) => normalizePromptKey(row.prompt_text))
  );
  const duplicate = normalized.find((p) => existingKeys.has(normalizePromptKey(p.text)));
  if (duplicate) {
    return { success: false, error: `Ya vigilas «${duplicate.text}». Edítalo o desmárcalo.` };
  }

  const { data: insertedRows, error: insertError } = await supabase
    .from("project_prompts")
    .insert(
      normalized.map((p) => ({
        project_id: projectId,
        prompt_text: p.text,
        category: p.category || "General",
        is_active: true
      }))
    )
    .select("id");

  if (insertError || !insertedRows?.length) {
    return { success: false, error: "No se han podido guardar los nuevos prompts." };
  }

  try {
    await launchScan({
      projectId,
      supabase,
      user,
      onlyPromptIds: insertedRows.map((row) => row.id as string)
    });
    return { success: true, addedCount: insertedRows.length, scanLaunched: true };
  } catch (error) {
    const code = getActionErrorCode(error);
    return {
      success: true,
      addedCount: insertedRows.length,
      scanLaunched: false,
      scanWarning: feedbackErrorMessages[code] ?? feedbackErrorMessages.unexpected_error
    };
  }
}
