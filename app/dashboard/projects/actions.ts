"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { suggestCompetitors, suggestPrompts } from "@/lib/llm/gemini";
import { getActionErrorCode, launchScan } from "@/lib/scan/scan-runner";
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
  prompts: string[];
};

/**
 * Generate (real Gemini) the suggested competitors + prompts for a domain so the
 * onboarding wizard can show them for the user to edit before creating the
 * project. Returns data to the client; does not persist anything.
 */
export async function suggestProjectSetup(input: { domain: string; country: string }): Promise<ProjectSetupSuggestion> {
  await requireUser();

  const domain = cleanDomain(String(input.domain ?? ""));
  const country = String(input.country ?? "").trim();
  const empty: ProjectSetupSuggestion = { ok: false, brand: "", language: "", competitors: [], prompts: [] };

  if (!isValidDomain(domain) || country.length < 2) {
    return empty;
  }

  const brand = deriveBrandFromDomain(domain);
  const language = languageForCountry(country);

  const [competitors, prompts] = await Promise.all([
    suggestCompetitors({ brand, domain, country, language, limit: MAX_INITIAL_COMPETITORS }).catch(() => []),
    suggestPrompts({ brand, domain, country, language, limit: MAX_INITIAL_PROMPTS }).catch(() => [])
  ]);

  return {
    ok: competitors.length > 0 || prompts.length > 0,
    brand,
    language,
    competitors,
    prompts
  };
}

export async function createProject(formData: FormData) {
  const parsedForm = parseProjectForm(formData);
  if (!parsedForm.ok) {
    redirect(`/dashboard/projects/new?error=${parsedForm.error}`);
  }

  const { domain, country, brand, name, language } = parsedForm.value;
  const { supabase, user } = await requireUser();

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
  // user does not provide them explicitly. No fake fallbacks: if Gemini yields
  // nothing, we persist nothing and surface an honest state.
  let initialCompetitors = parsedForm.value.initialCompetitors;
  if (!initialCompetitors.length) {
    try {
      const suggested = await suggestCompetitors({ brand, domain, country, language, limit: MAX_INITIAL_COMPETITORS });
      initialCompetitors = suggested.slice(0, MAX_INITIAL_COMPETITORS);
    } catch {
      initialCompetitors = [];
    }
  }

  let initialPrompts = parsedForm.value.initialPrompts;
  if (!initialPrompts.length) {
    try {
      const suggested = await suggestPrompts({ brand, domain, country, language, limit: MAX_INITIAL_PROMPTS });
      initialPrompts = suggested.slice(0, MAX_INITIAL_PROMPTS).map((prompt_text, index) => ({
        prompt_text,
        category: null,
        sort_order: index
      }));
    } catch {
      initialPrompts = [];
    }
  }

  const { data, error } = await supabase
    .from("projects")
    .insert({
      owner_user_id: user.id,
      name,
      domain,
      brand,
      country,
      language
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

  revalidatePath("/dashboard/projects");
  revalidatePath(`/dashboard/projects/${data.id}`);

  // Without at least one active prompt there is nothing to scan. Surface an
  // honest state instead of pretending a scan started.
  if (!initialPrompts.length) {
    redirect(`/dashboard/projects/${data.id}?success=project_created&error=suggestions_unavailable`);
  }

  // Auto-launch the first scan for the new domain (sync when enabled).
  let scanExecuted = false;
  try {
    const result = await launchScan({ projectId: data.id, supabase, user });
    scanExecuted = result.executed;
  } catch (scanError) {
    revalidatePath(`/dashboard/projects/${data.id}`);
    redirect(`/dashboard/projects/${data.id}?success=project_created&error=${encodeURIComponent(getActionErrorCode(scanError))}`);
  }

  revalidatePath(`/dashboard/projects/${data.id}`);

  if (setupError) {
    redirect(`/dashboard/projects/${data.id}?success=project_created&error=project_setup_partial`);
  }

  redirect(`/dashboard/projects/${data.id}?success=${scanExecuted ? "scan_completed" : "scan_pending"}`);
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
