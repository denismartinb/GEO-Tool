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
  const payload = projectSchema.parse({
    name: formData.get("name"),
    domain: formData.get("domain"),
    brand: formData.get("brand"),
    country: formData.get("country"),
    language: formData.get("language")
  });

  const { supabase, user } = await requireUser();

  const { data, error } = await supabase
    .from("projects")
    .insert({
      owner_user_id: user.id,
      ...payload
    })
    .select("id")
    .single();

  if (error || !data) {
    redirect(`/dashboard/projects/new?error=${encodeURIComponent(error?.message ?? "Could not create project")}`);
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
  const { supabase } = await requireUser();

  await supabase.from("projects").update({ is_archived: true }).eq("id", projectId);

  revalidatePath("/dashboard/projects");
  redirect("/dashboard/projects");
}
