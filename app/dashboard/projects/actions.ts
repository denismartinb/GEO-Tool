"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth";

const projectSchema = z.object({
  name: z.string().min(1).max(120),
  domain: z.string().min(3).max(255),
  brand: z.string().min(1).max(120),
  country: z.string().min(2).max(10),
  language: z.string().min(2).max(20),
  businessDescription: z.string().max(500).optional(),
  initialPrompts: z.string().optional(),
  initialCompetitors: z.string().optional()
});

const MAX_INITIAL_PROMPTS = 10;
const MAX_INITIAL_COMPETITORS = 5;

function normalizePrompt(prompt: string) {
  return prompt.trim().toLocaleLowerCase();
}

function normalizeCompetitorValue(value: string) {
  return value.trim().toLocaleLowerCase();
}

function parseInitialPrompts(input: string | undefined) {
  if (!input) return [];

  const seen = new Set<string>();
  const prompts: Array<{ prompt_text: string; category: null; sort_order: number }> = [];

  for (const rawLine of input.split("\n")) {
    const promptText = rawLine.trim();
    if (!promptText) continue;

    const normalized = normalizePrompt(promptText);
    if (seen.has(normalized)) continue;
    seen.add(normalized);

    prompts.push({
      prompt_text: promptText,
      category: null,
      sort_order: prompts.length
    });

    if (prompts.length >= MAX_INITIAL_PROMPTS) break;
  }

  return prompts;
}

function parseInitialCompetitors(input: string | undefined) {
  if (!input) return [];

  const seen = new Set<string>();
  const competitors: Array<{ name: string; domain: string }> = [];

  for (const rawLine of input.split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;

    const [rawName, rawDomain] = line.split("|", 2);
    const name = rawName?.trim() ?? "";
    const domain = rawDomain?.trim() ?? "";

    if (!name) continue;

    const dedupeKey = domain
      ? `${normalizeCompetitorValue(name)}|${normalizeCompetitorValue(domain)}`
      : normalizeCompetitorValue(name);

    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    competitors.push({
      name,
      domain
    });

    if (competitors.length >= MAX_INITIAL_COMPETITORS) break;
  }

  return competitors;
}

export async function createProject(formData: FormData) {
  const parsed = projectSchema.safeParse({
    name: formData.get("name"),
    domain: formData.get("domain"),
    brand: formData.get("brand"),
    country: formData.get("country"),
    language: formData.get("language"),
    businessDescription: formData.get("business_description"),
    initialPrompts: formData.get("initial_prompts"),
    initialCompetitors: formData.get("initial_competitors")
  });

  if (!parsed.success) {
    redirect("/dashboard/projects/new?error=invalid_project_data");
  }

  const payload = parsed.data;
  const { supabase, user } = await requireUser();

  const { data: existingProject, error: existingProjectError } = await supabase
    .from("projects")
    .select("id, is_archived")
    .eq("owner_user_id", user.id)
    .eq("domain", payload.domain)
    .eq("country", payload.country)
    .eq("language", payload.language)
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

  const initialPrompts = parseInitialPrompts(payload.initialPrompts);
  const initialCompetitors = parseInitialCompetitors(payload.initialCompetitors);

  const { data, error } = await supabase
    .from("projects")
    .insert({
      owner_user_id: user.id,
      name: payload.name,
      domain: payload.domain,
      brand: payload.brand,
      country: payload.country,
      language: payload.language
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

  if (setupError) {
    redirect(`/dashboard/projects/${data.id}?success=project_created&error=project_setup_partial`);
  }

  redirect(`/dashboard/projects/${data.id}?success=project_created`);
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
