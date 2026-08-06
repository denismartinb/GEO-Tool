import { getWorkspaceCounters } from "@/lib/project-workspace";
import { requireUser } from "@/lib/auth";
import { Sidebar } from "@/components/sidebar";
import { WorkspaceTopbar } from "@/components/workspace-topbar";
import { NotificationBell } from "@/components/notification-bell";
import { DataMaturityBanner } from "@/components/data-maturity-banner";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { MobileShellProvider } from "@/components/mobile-shell";
import { TourProvider } from "@/components/tour-provider";
import { signOut } from "./actions";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user } = await requireUser();

  const {
    projects,
    promptCountByProject,
    competitorCountByProject,
    recommendationCountByProject,
    latestScanStatusByProject,
    dataMaturityByProject,
    plan,
    notifications
  } = await getWorkspaceCounters();

  return (
    <MobileShellProvider>
      {/* ONBOARDING-TOUR-1: el popup «Aprende cómo funciona». Envuelve la
          consola entera porque tiene que poder abrirse desde el menú lateral
          y saltar solo en el primer acceso, sea cual sea la pantalla. */}
      <TourProvider>
      <Sidebar
        projects={projects ?? []}
        promptCountByProject={promptCountByProject}
        competitorCountByProject={competitorCountByProject}
        recommendationCountByProject={recommendationCountByProject}
        userEmail={user.email ?? ""}
        planId={plan.id}
        planName={plan.name}
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
        <DataMaturityBanner dataMaturityByProject={dataMaturityByProject} />
        <main className="dash-content">{children}</main>
      </div>
      </TourProvider>
    </MobileShellProvider>
  );
}
