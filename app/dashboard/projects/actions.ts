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
  language: z.string().min(2).max(20)
});

export async function createProject(formData: FormData) {
  const parsed = projectSchema.safeParse({
    name: formData.get("name"),
    domain: formData.get("domain"),
    brand: formData.get("brand"),
    country: formData.get("country"),
    language: formData.get("language")
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
    redirect("/dashboard/projects?error=project_already_archived");
  }

  if (existingProject) {
    redirect("/dashboard/projects?error=project_already_active");
  }

  const { data, error } = await supabase
    .from("projects")
    .insert({
      owner_user_id: user.id,
      ...payload
    })
    .select("id")
    .single();

  if (error || !data) {
    redirect("/dashboard/projects/new?error=project_creation_failed");
  }

  revalidatePath("/dashboard/projects");
  redirect(`/dashboard/projects/${data.id}`);
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
