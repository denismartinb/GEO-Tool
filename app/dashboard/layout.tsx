import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/sidebar";
import { WorkspaceTopbar } from "@/components/workspace-topbar";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";

async function signOut() {
  "use server";
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const [
    { data: projects },
    { data: runs },
    { data: allPrompts },
    { data: allCompetitors },
    { data: completedRuns },
    { data: allRecs }
  ] = await Promise.all([
    supabase
      .from("projects")
      .select("id, name, domain, country, language")
      .eq("is_archived", false)
      .order("created_at", { ascending: false }),
    supabase
      .from("scan_runs")
      .select("project_id, status, created_at")
      .order("created_at", { ascending: false }),
    supabase
      .from("project_prompts")
      .select("project_id")
      .eq("is_active", true),
    supabase
      .from("project_competitors")
      .select("project_id")
      .eq("is_active", true),
    supabase
      .from("scan_runs")
      .select("project_id, status")
      .eq("status", "completed"),
    supabase
      .from("recommendations")
      .select("project_id")
      .eq("status", "active")
  ]);

  const latestScanStatusByProject = (runs ?? []).reduce<Record<string, string>>((statuses, run) => {
    if (!statuses[run.project_id]) statuses[run.project_id] = run.status;
    return statuses;
  }, {});

  const promptCountByProject = (allPrompts ?? []).reduce<Record<string, number>>((acc, p) => {
    acc[p.project_id] = (acc[p.project_id] ?? 0) + 1;
    return acc;
  }, {});

  const competitorCountByProject = (allCompetitors ?? []).reduce<Record<string, number>>((acc, p) => {
    acc[p.project_id] = (acc[p.project_id] ?? 0) + 1;
    return acc;
  }, {});

  const completedRunCountByProject = (completedRuns ?? []).reduce<Record<string, number>>((acc, r) => {
    acc[r.project_id] = (acc[r.project_id] ?? 0) + 1;
    return acc;
  }, {});

  const recommendationCountByProject = (allRecs ?? []).reduce<Record<string, number>>((acc, r) => {
    acc[r.project_id] = (acc[r.project_id] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="shell">
      <Sidebar
        projects={projects ?? []}
        promptCountByProject={promptCountByProject}
        competitorCountByProject={competitorCountByProject}
        completedRunCountByProject={completedRunCountByProject}
        recommendationCountByProject={recommendationCountByProject}
        userEmail={user.email ?? ""}
      />
      <div className="dash-main">
        <header className="dash-header">
          <WorkspaceTopbar projects={projects ?? []} latestScanStatusByProject={latestScanStatusByProject} />
          <div className="dash-header-actions">
            <div className="meta">{user.email}</div>
            <form action={signOut}>
              <Button variant="outline" type="submit">
                <Icon name="settings" size={14} />
                Cerrar sesión
              </Button>
            </form>
          </div>
        </header>
        <main className="dash-content">{children}</main>
      </div>
    </div>
  );
}
