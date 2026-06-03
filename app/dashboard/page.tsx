import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";

export default async function DashboardPage() {
  const { supabase } = await requireUser();
  const { data: project } = await supabase
    .from("projects")
    .select("id")
    .eq("is_archived", false)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  redirect(project ? `/dashboard/projects/${project.id}` : "/dashboard/projects/new");
}
