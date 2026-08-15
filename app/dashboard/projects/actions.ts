"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { getPlanForUser } from "@/lib/billing";
import { generateAddedPrompts, suggestCompetitors, suggestPrompts } from "@/lib/llm/gemini";
import { reportLlmIncident } from "@/lib/llm/llm-incident";
import { resolveBusinessContext } from "@/lib/projects/business-profile";
import type { PromptCategory } from "@/lib/projects/prompt-categories";
import { ENABLE_SYNC_SCAN_EXECUTION } from "@/lib/scan/scan-runner";
import { createProjectCore } from "@/lib/projects/create-project";
import {
  cleanDomain,
  deriveBrandFromDomain,
  isValidDomain,
  languageForCountry,
  MAX_INITIAL_COMPETITORS,
  MAX_INITIAL_PROMPTS,
  parseProjectForm
} from "@/lib/projects/project-form";

export type ProjectSetupSuggestion = {
  ok: boolean;
  brand: string;
  language: string;
  competitors: Array<{ name: string; domain: string }>;
  prompts: Array<{ text: string; category: PromptCategory }>;
  /**
   * LLM-RESILIENCE-1: which halves of the suggestion actually failed, as
   * opposed to succeeding with nothing to say.
   *
   * `ok` alone could not tell those apart, and the gap was visible in
   * production: on 2026-08-09 the grounded competitor call hit Gemini's 429
   * while the ungrounded prompt call went through, so `ok` was true (prompts
   * existed), the wizard advanced, and the user was shown an empty competitor
   * list with no explanation. An empty list caused by a provider outage and an
   * empty list caused by a niche domain look identical on screen unless the
   * server says which one happened.
   */
  failed: Array<"competitors" | "prompts">;
};

/**
 * Generate (real Gemini) the suggested competitors + prompts for a domain so the
 * onboarding wizard can show them for the user to edit before creating the
 * project. Returns data to the client; does not persist anything.
 *
 * COMPETITOR-GROUNDING-1: first resolves a business profile from the
 * domain's own homepage (lib/projects/business-profile.ts) — without it,
 * suggestCompetitors/suggestPrompts have nothing to reason from but the
 * domain string, which produces wrong results for any business the model
 * doesn't already know from training data (i.e. most SMEs — see
 * docs/adr/0020-grounded-business-profile.md). When the business can't be
 * identified, returns the honest empty result instead of guessing.
 */
export async function suggestProjectSetup(input: { domain: string; country: string }): Promise<ProjectSetupSuggestion> {
  const { supabase, user } = await requireUser();

  const domain = cleanDomain(String(input.domain ?? ""));
  const country = String(input.country ?? "").trim();
  const empty: ProjectSetupSuggestion = { ok: false, brand: "", language: "", competitors: [], prompts: [], failed: [] };

  if (!isValidDomain(domain) || country.length < 2) {
    return empty;
  }

  const brand = deriveBrandFromDomain(domain);
  const language = languageForCountry(country);
  const plan = await getPlanForUser(supabase, user.id);
  // suggestPrompts itself hard-caps at 15 (lib/llm/gemini.ts) regardless of
  // what's requested — Math.min just avoids asking for more than the plan
  // allows when a lower-tier plan's cap is below that.
  const promptLimit = Math.min(plan.caps.prompts, MAX_INITIAL_PROMPTS);

  const context = await resolveBusinessContext({ domain, country, language }).catch(
    () => ({ status: "unidentified" }) as const
  );

  if (context.status === "unidentified") {
    // Both halves are unreachable without a profile, so both count as failed —
    // `resolveBusinessContext` has already reported the incident if the cause
    // was the provider rather than a genuinely unidentifiable site.
    return { ok: false, brand, language, competitors: [], prompts: [], failed: ["competitors", "prompts"] };
  }

  const failed: Array<"competitors" | "prompts"> = [];

  const [competitors, prompts] = await Promise.all([
    // suggestCompetitors reports its own incident (it is the grounded call and
    // owns the error) and answers [] either way, so the flag here records that
    // the half failed, not why.
    suggestCompetitors({ brand, domain, country, language, profile: context.profile, limit: MAX_INITIAL_COMPETITORS }).catch(
      () => {
        failed.push("competitors");
        return [];
      }
    ),
    suggestPrompts({ brand, domain, country, language, profile: context.profile, limit: promptLimit }).catch(async (error) => {
      failed.push("prompts");
      await reportLlmIncident({ surface: "onboarding_suggestions", provider: "gemini", error, domain });
      return [];
    })
  ]);

  // A half that threw is a failure; a half that answered nothing is a failure
  // too, from the user's side — the screen is empty either way and the honest
  // thing is to say we could not fill it, not to leave them guessing.
  if (!failed.includes("competitors") && competitors.length === 0) failed.push("competitors");
  if (!failed.includes("prompts") && prompts.length === 0) failed.push("prompts");

  return {
    ok: competitors.length > 0 || prompts.length > 0,
    brand,
    language,
    competitors,
    prompts,
    failed
  };
}

const generateMorePromptsSchema = z.object({
  domain: z.string().min(3).max(255),
  country: z.string().min(2).max(10),
  existingPromptTexts: z.array(z.string().max(300)).max(500),
  existingCategories: z.array(z.string().max(100)).max(50)
});

const GENERATE_MORE_PROMPTS_LIMIT = 5;

export type GenerateMorePromptsResult =
  | { ok: true; prompts: Array<{ text: string; category: PromptCategory }> }
  | { ok: false };

/**
 * "Generar N más" in the onboarding wizard's prompts step: generates
 * additional AI-suggested prompts, distinct from the ones already listed,
 * before the project exists yet — there is no projectId to scope a DB read/
 * write to, so (like suggestProjectSetup) this returns candidates to the
 * client rather than persisting anything. Reuses generateAddedPrompts in
 * "auto" mode — the same Gemini call the post-creation "Añadir prompts" flow
 * uses (lib/projects/add-prompts.ts) — so results are deduped against
 * whatever the user already has in the wizard, using the client's current
 * draft as `existingPromptTexts` since no persisted rows exist yet.
 */
export async function generateMorePrompts(input: {
  domain: string;
  country: string;
  existingPromptTexts: string[];
  existingCategories: string[];
}): Promise<GenerateMorePromptsResult> {
  await requireUser();

  const parsed = generateMorePromptsSchema.safeParse(input);
  if (!parsed.success) return { ok: false };

  const domain = cleanDomain(parsed.data.domain);
  const country = parsed.data.country.trim();
  if (!isValidDomain(domain) || country.length < 2) return { ok: false };

  const brand = deriveBrandFromDomain(domain);
  const language = languageForCountry(country);

  try {
    const candidates = await generateAddedPrompts({
      mode: "auto",
      brand,
      domain,
      country,
      language,
      existingPromptTexts: parsed.data.existingPromptTexts,
      existingCategories: parsed.data.existingCategories,
      limit: GENERATE_MORE_PROMPTS_LIMIT
    });

    if (!candidates.length) return { ok: false };

    return {
      ok: true,
      prompts: candidates.map((candidate) => ({ text: candidate.text, category: candidate.category as PromptCategory }))
    };
  } catch (error) {
    await reportLlmIncident({ surface: "prompt_generation", provider: "gemini", error, domain });
    return { ok: false };
  }
}

/**
 * Column defaults applied ONLY outside production, so the founder can exercise
 * the first-scan mission end to end on a preview without paying for it.
 *
 * Why this exists: the mission's audit half (the band, and the re-entry beat
 * on Auditoría web) needs a `web_audit` job, and `enqueueWebAuditJob` only
 * creates one when the project has the audit switched on. WEB-AUDIT-AUTO-SPLIT-1
 * (log §52) made both halves default to `false` — a deliberate cost decision —
 * so every new domain is born unable to show that half of the mission. And the
 * switch lives in `/debug`, which cannot be reached before the project exists:
 * by the time it can be flipped, the scan has finished and the auto-audit
 * moment has passed. The founder burned several real scans on that loop
 * (2026-08-11) before we found it.
 *
 * Gated on `VERCEL_ENV` rather than a comment asking someone to remember: this
 * CANNOT reach production even if the branch merges, which is the only version
 * of "temporary" that is actually true. Production keeps the founder's
 * defaults exactly as WEB-AUDIT-AUTO-SPLIT-1 set them.
 *
 * - **Technical audit on, coverage off.** The technical half spends no LLM at
 *   all (ADR 0035) and is what the re-entry beat narrates — the sixteen checks.
 *   Coverage is grounded Gemini calls, one per active prompt, so it stays off:
 *   the point of this is to make testing cheap, not to move the bill.
 * - **Gemini only.** One engine instead of three cuts a test scan's LLM cost to
 *   a third.
 */
function previewTestingDefaults(): Record<string, boolean> {
  // Allow-list, not a deny-list, and the direction matters. Written as "if
  // production, do nothing" it failed OPEN: an unset or renamed `VERCEL_ENV`
  // would have handed production the cheap defaults — the one environment the
  // founder was explicit about ("en main nada de lo de probar barato",
  // 2026-08-11). Now anything that is not demonstrably a preview or a local
  // dev server behaves exactly like production.
  const env = process.env.VERCEL_ENV;
  if (env !== "preview" && env !== "development") return {};

  return {
    auto_technical_audit_enabled: true,
    auto_coverage_audit_enabled: false,
    engine_gemini_enabled: true,
    engine_claude_enabled: false,
    engine_openai_enabled: false
  };
}

export async function createProject(formData: FormData) {
  const { supabase, user } = await requireUser();
  const plan = await getPlanForUser(supabase, user.id);

  // The owner's real plan cap (not the hardcoded MAX_INITIAL_PROMPTS) bounds
  // how many manually-entered prompts survive parsing — the onboarding wizard
  // lets a Starter/Pro/Agency user add up to their plan's cap, so the server
  // must accept that many rather than silently truncating to 10.
  const parsedForm = parseProjectForm(formData, plan.caps.prompts);
  if (!parsedForm.ok) {
    redirect(`/dashboard/projects/new?error=${parsedForm.error}`);
  }

  // Fase Q1: toda la lógica vive en `createProjectCore` y devuelve un
  // resultado; lo único que queda aquí es traducirlo a revalidaciones y a un
  // destino. La traducción es una tabla —una variante, un `redirect`— y ése es
  // el punto: mientras el desenlace se decidía con `redirect()`, que lanza, no
  // había forma de observarlo desde un test.
  const result = await createProjectCore({
    input: parsedForm.value,
    plan,
    supabase,
    user,
    extraProjectColumns: previewTestingDefaults()
  });

  if (result.status === "project_limit_reached") {
    redirect("/dashboard/projects/new?error=project_limit_reached");
  }
  if (result.status === "lookup_failed" || result.status === "insert_failed") {
    redirect("/dashboard/projects/new?error=project_creation_failed");
  }
  if (result.status === "already_archived") {
    redirect("/dashboard/projects/new?error=project_already_archived");
  }
  if (result.status === "already_active") {
    redirect("/dashboard/projects/new?error=project_already_active");
  }

  const { projectId, outcome } = result;

  // Revalidates the shared dashboard layout (Sidebar's project list, driven
  // by getWorkspaceCounters()) — without this, a newly created project stays
  // invisible in navigation until something else (archive/restore/delete)
  // happens to trigger a layout revalidation, even though the project itself
  // is correctly persisted and visible on /dashboard/projects.
  revalidatePath("/dashboard", "layout");
  revalidatePath("/dashboard/projects");
  revalidatePath(`/dashboard/projects/${projectId}`);

  if (outcome.kind === "no_prompts") {
    redirect(`/dashboard/projects/${projectId}?success=project_created&error=suggestions_unavailable`);
  }

  if (outcome.kind === "scan_failed") {
    revalidatePath(`/dashboard/projects/${projectId}`);
    redirect(`/dashboard/projects/${projectId}?success=project_created&error=${encodeURIComponent(outcome.errorCode)}`);
  }

  revalidatePath(`/dashboard/projects/${projectId}`);
  revalidatePath("/dashboard/domains");

  if (outcome.kind === "setup_partial") {
    redirect(`/dashboard/projects/${projectId}?success=project_created&error=project_setup_partial`);
  }

  redirect(`/dashboard/projects/${projectId}?success=${ENABLE_SYNC_SCAN_EXECUTION ? "scan_started" : "scan_pending"}`);
}

export async function archiveProject(formData: FormData) {
  const parsedProjectId = z.string().uuid().safeParse(String(formData.get("projectId") ?? ""));
  if (!parsedProjectId.success) {
    redirect("/dashboard/projects?error=invalid_project_id");
  }

  const projectId = parsedProjectId.data;
  const { supabase, user } = await requireUser();

  const { data, error } = await supabase
    .from("projects")
    .update({ is_archived: true })
    .eq("id", projectId)
    .eq("owner_user_id", user.id)
    .eq("is_archived", false)
    .select("id")
    .maybeSingle();

  if (error || !data) {
    redirect("/dashboard/projects?error=project_archive_failed");
  }

  revalidatePath("/dashboard", "layout");
  revalidatePath("/dashboard/projects");
  redirect("/dashboard/projects?success=project_archived");
}

export type DeleteProjectResult = { success: true } | { success: false; error: string };

/**
 * Permanently deletes a project (domain) and all of its associated data
 * (scans, prompts, competitors, recommendations, generated solutions, jobs)
 * via the `on delete cascade` foreign keys added in migration 0006. This is
 * irreversible — there is no soft-delete or archive fallback here.
 */
export async function deleteProject(projectId: string): Promise<DeleteProjectResult> {
  const parsedProjectId = z.string().uuid().safeParse(projectId);
  if (!parsedProjectId.success) {
    return { success: false, error: "No se pudo eliminar el dominio." };
  }

  const { supabase, user } = await requireUser();

  const { error, count } = await supabase
    .from("projects")
    .delete({ count: "exact" })
    .eq("id", parsedProjectId.data)
    .eq("owner_user_id", user.id);

  if (error || !count) {
    return { success: false, error: "No se pudo eliminar el dominio. Inténtalo de nuevo." };
  }

  revalidatePath("/dashboard", "layout");
  revalidatePath("/dashboard/projects");
  revalidatePath(`/dashboard/projects/${parsedProjectId.data}`);

  return { success: true };
}

export async function restoreProject(formData: FormData) {
  const parsedProjectId = z.string().uuid().safeParse(String(formData.get("projectId") ?? ""));
  if (!parsedProjectId.success) {
    redirect("/dashboard/projects?error=project_restore_failed");
  }

  const projectId = parsedProjectId.data;
  const { supabase, user } = await requireUser();

  const { data, error } = await supabase
    .from("projects")
    .update({ is_archived: false })
    .eq("id", projectId)
    .eq("owner_user_id", user.id)
    .eq("is_archived", true)
    .select("id")
    .maybeSingle();

  if (error || !data) {
    redirect("/dashboard/projects?error=project_restore_failed");
  }

  revalidatePath("/dashboard", "layout");
  revalidatePath("/dashboard/projects");
  redirect("/dashboard/projects?success=project_restored");
}
