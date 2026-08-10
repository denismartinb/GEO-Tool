"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { getPlanForUser } from "@/lib/billing";
import { generateAddedPrompts, suggestCompetitors, suggestPrompts, type BusinessProfile } from "@/lib/llm/gemini";
import { reportLlmIncident } from "@/lib/llm/llm-incident";
import { deriveBrandAliases, resolveBusinessContext } from "@/lib/projects/business-profile";
import type { PromptCategory } from "@/lib/projects/prompt-categories";
import { createPendingScanRun, ENABLE_SYNC_SCAN_EXECUTION, getActionErrorCode } from "@/lib/scan/scan-runner";
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

  const { domain, country, brand, name, language } = parsedForm.value;

  const { count: activeProjectCount, error: activeProjectsError } = await supabase
    .from("projects")
    .select("id", { count: "exact", head: true })
    .eq("owner_user_id", user.id)
    .eq("is_archived", false);

  if (!activeProjectsError && (activeProjectCount ?? 0) >= plan.caps.projects) {
    redirect("/dashboard/projects/new?error=project_limit_reached");
  }

  const { data: existingProject, error: existingProjectError } = await supabase
    .from("projects")
    .select("id, is_archived")
    .eq("owner_user_id", user.id)
    .eq("domain", domain)
    .eq("country", country)
    .eq("language", language)
    .maybeSingle();

  if (existingProjectError) {
    redirect("/dashboard/projects/new?error=project_creation_failed");
  }

  if (existingProject?.is_archived) {
    redirect("/dashboard/projects/new?error=project_already_archived");
  }

  if (existingProject) {
    redirect("/dashboard/projects/new?error=project_already_active");
  }

  // Competitors and prompts are suggested by the system (real Gemini) when the
  // user does not provide them explicitly (e.g. wizard was skipped or
  // submitted empty). No fake fallbacks: if Gemini yields nothing, we persist
  // nothing and surface an honest state. Both suggestions now require a
  // business profile (see resolveBusinessContext) — computed once here and
  // reused for whichever of the two is actually missing, instead of guessing
  // from the domain string (docs/adr/0020-grounded-business-profile.md).
  let initialCompetitors = parsedForm.value.initialCompetitors;
  let initialPrompts = parsedForm.value.initialPrompts;
  // COMPETITOR-GROUNDING-2 (docs/adr/0022): persisted below alongside the
  // new project row when this fallback path actually computed one — the
  // common wizard-filled path never reaches here, so most new projects still
  // get their profile lazily on first "Añadir prompts" use instead
  // (lib/projects/add-prompts.ts). Never required; null is a normal state.
  let resolvedBusinessProfile: BusinessProfile | null = null;

  if (!initialCompetitors.length || !initialPrompts.length) {
    const context = await resolveBusinessContext({
      domain,
      country,
      language,
      userDescription: parsedForm.value.businessDescription
    }).catch(() => ({ status: "unidentified" }) as const);

    if (context.status === "identified") {
      resolvedBusinessProfile = context.profile;
      if (!initialCompetitors.length) {
        try {
          const suggested = await suggestCompetitors({
            brand,
            domain,
            country,
            language,
            profile: context.profile,
            limit: MAX_INITIAL_COMPETITORS
          });
          initialCompetitors = suggested.slice(0, MAX_INITIAL_COMPETITORS);
        } catch {
          initialCompetitors = [];
        }
      }

      if (!initialPrompts.length) {
        try {
          const suggested = await suggestPrompts({
            brand,
            domain,
            country,
            language,
            profile: context.profile,
            limit: MAX_INITIAL_PROMPTS
          });
          initialPrompts = suggested.slice(0, MAX_INITIAL_PROMPTS).map((prompt, index) => ({
            prompt_text: prompt.text,
            category: prompt.category,
            sort_order: index
          }));
        } catch {
          initialPrompts = [];
        }
      }
    }
  }

  // GEO-SCORE-BRAND-IDENTITY-1: derived at creation so the very first scan
  // already measures the brand correctly. A brand whose product carries the
  // recognizable name (Mozilla/Firefox) is otherwise scored as absent from
  // answers that recommend it — see docs/geo-score-variability-2026-08.md.
  // Never blocks creation: deriveBrandAliases swallows its own failures and
  // returns [], which is also the correct value for most brands.
  const derivedBrandAliases = await deriveBrandAliases({ brand, domain }).catch(() => [] as string[]);

  const { data, error } = await supabase
    .from("projects")
    .insert({
      owner_user_id: user.id,
      name,
      domain,
      brand,
      country,
      language,
      business_profile: resolvedBusinessProfile,
      brand_aliases: derivedBrandAliases
    })
    .select("id")
    .single();

  if (error || !data) {
    redirect("/dashboard/projects/new?error=project_creation_failed");
  }

  let setupError = false;

  if (initialPrompts.length) {
    const { error: promptInsertError } = await supabase.from("project_prompts").insert(
      initialPrompts.map((prompt) => ({
        project_id: data.id,
        prompt_text: prompt.prompt_text,
        category: prompt.category,
        sort_order: prompt.sort_order
      }))
    );

    if (promptInsertError) {
      setupError = true;
    }
  }

  if (initialCompetitors.length) {
    const { error: competitorInsertError } = await supabase.from("project_competitors").insert(
      initialCompetitors.map((competitor) => ({
        project_id: data.id,
        name: competitor.name,
        domain: competitor.domain
      }))
    );

    if (competitorInsertError) {
      setupError = true;
    }
  }

  // Revalidates the shared dashboard layout (Sidebar's project list, driven
  // by getWorkspaceCounters()) — without this, a newly created project stays
  // invisible in navigation until something else (archive/restore/delete)
  // happens to trigger a layout revalidation, even though the project itself
  // is correctly persisted and visible on /dashboard/projects.
  revalidatePath("/dashboard", "layout");
  revalidatePath("/dashboard/projects");
  revalidatePath(`/dashboard/projects/${data.id}`);

  // Without at least one active prompt there is nothing to scan. Surface an
  // honest state instead of pretending a scan started.
  if (!initialPrompts.length) {
    redirect(`/dashboard/projects/${data.id}?success=project_created&error=suggestions_unavailable`);
  }

  // Create the pending scan run (fast, no Gemini calls) and land the user on
  // Visión general immediately. Execution itself is driven from that page's
  // `AutoExecuteScan` so the user sees the real "scan in progress" UI instead
  // of waiting on this request.
  //
  // DOMAINS-REDESIGN-1 moved this target from Escaneos. The two have to change
  // together: the driver is mounted on exactly one page, and this redirect
  // decides which page a brand-new project's first scan gets driven from. If
  // they ever disagree, the first scan of every new customer stalls in
  // `pending` until the daily cron rescues it — silently, since nothing here
  // fails.
  try {
    await createPendingScanRun({ projectId: data.id, supabase, user });
  } catch (scanError) {
    revalidatePath(`/dashboard/projects/${data.id}`);
    redirect(`/dashboard/projects/${data.id}?success=project_created&error=${encodeURIComponent(getActionErrorCode(scanError))}`);
  }

  revalidatePath(`/dashboard/projects/${data.id}`);
  revalidatePath("/dashboard/domains");

  if (setupError) {
    redirect(`/dashboard/projects/${data.id}?success=project_created&error=project_setup_partial`);
  }

  redirect(`/dashboard/projects/${data.id}?success=${ENABLE_SYNC_SCAN_EXECUTION ? "scan_started" : "scan_pending"}`);
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
