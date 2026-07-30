import { getWorkspaceCounters } from "@/lib/project-workspace";
import { requireUser } from "@/lib/auth";
import { Sidebar } from "@/components/sidebar";
import { WorkspaceTopbar } from "@/components/workspace-topbar";
import { NotificationBell } from "@/components/notification-bell";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { MobileShellProvider } from "@/components/mobile-shell";
import { signOut } from "./actions";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requireUser();

  const {
    projects,
    promptCountByProject,
    competitorCountByProject,
    recommendationCountByProject,
    latestScanStatusByProject,
    notifications
  } = await getWorkspaceCounters();

  return (
    <MobileShellProvider>
      <Sidebar
        projects={projects ?? []}
        promptCountByProject={promptCountByProject}
        competitorCountByProject={competitorCountByProject}
        recommendationCountByProject={recommendationCountByProject}
        userEmail={user.email ?? ""}
        signOutAction={signOut}
      />
      <div className="dash-main">
        <header className="dash-header">
          <WorkspaceTopbar
            projects={projects ?? []}
            latestScanStatusByProject={latestScanStatusByProject}
          />
          <div className="dash-header-actions">
            <NotificationBell notifications={notifications} projects={projects ?? []} />
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
    </MobileShellProvider>
  );
}
