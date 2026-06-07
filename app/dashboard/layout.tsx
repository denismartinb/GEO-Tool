import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceCounters } from "@/lib/project-workspace";
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

  const {
    projects,
    promptCountByProject,
    competitorCountByProject,
    completedRunCountByProject,
    recommendationCountByProject,
    latestScanStatusByProject
  } = await getWorkspaceCounters();

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
