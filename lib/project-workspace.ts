import "server-only";

import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";

export async function requireActiveProject(projectId: string) {
  const { supabase } = await requireUser();
  const { data: project } = await supabase
    .from("projects")
    .select("id, name, brand, domain, country, language")
    .eq("id", projectId)
    .eq("is_archived", false)
    .single();

  if (!project) notFound();

  return project;
}
