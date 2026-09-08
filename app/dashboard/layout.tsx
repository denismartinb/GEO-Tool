// PRELAUNCH-HARDENING-1 Fase V (V5). Las hojas que sólo pinta la consola
// entran por aquí, no por `globals.css`: así no viajan a /blog ni a la
// landing. Ver la cabecera de `app/console.css` para qué se movió y qué no.
import "@/app/console.css";
import { cookies } from "next/headers";
import { getWorkspaceCounters } from "@/lib/project-workspace";
import { requireUser } from "@/lib/auth";
import { getAccountRole } from "@/lib/account-role";
import { getDomainOverage } from "@/lib/billing";
import { ACTIVE_PROJECT_COOKIE } from "@/lib/active-project-cookie";
import { Sidebar } from "@/components/sidebar";
import { WorkspaceTopbar } from "@/components/workspace-topbar";
import { ConsoleHeader } from "@/components/console-header";
import { NotificationBell } from "@/components/notification-bell";
import { DataMaturityBanner } from "@/components/data-maturity-banner";
import { DomainOverageGate } from "@/components/billing/domain-overage-gate";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { MobileShellProvider } from "@/components/mobile-shell";
import { TourProvider } from "@/components/tour-provider";
import { signOut } from "./actions";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { supabase, user } = await requireUser();

  // DOMAINS-LIVE-SELECT-1 — outside a project's own route (e.g. right after
  // picking a domain card on /dashboard/domains, which selects without
  // navigating) the sidebar has no pathname to read a project id from. The
  // cookie middleware.ts now writes for that screen too is the fallback, so
  // selecting a domain there updates the sidebar immediately instead of only
  // after clicking into the project.
  const cookieStore = await cookies();
  const preferredProjectId = cookieStore.get(ACTIVE_PROJECT_COOKIE)?.value ?? null;

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

  /* ONBOARDING-TOUR-PERSIST-1 — misma forma que auditFlagRow/samplingFlagRow
     en la página de debug: `onboarding_tour_seen_at` llega en la migración
     0035, aplicada a mano, y esta consulta va sola para que no arrastre a
     `getWorkspaceCounters()` (compartida por toda la consola) si la
     migración todavía no está aplicada.

     Dirección de fallo a propósito: ante un error de lectura se asume «ya
     visto» y NO se muestra el popup. La otra dirección —mostrarlo siempre que
     la consulta falle— repetiría el tour en cada carga para cada cuenta
     mientras la migración no esté aplicada, la misma regresión que este
     cambio existe para arreglar. */
  const { data: tourFlagRow, error: tourFlagError } = await supabase
    .from("profiles")
    .select("onboarding_tour_seen_at")
    .eq("id", user.id)
    .maybeSingle();
  const hasSeenTour = tourFlagError ? true : tourFlagRow?.onboarding_tour_seen_at != null;

  // DOMAINS-OVERAGE-GATE-1 (founder-approved Task Intake): every account is
  // "admin" today (lib/account-role.ts — no teams/RBAC yet), matching the
  // same condition Ajustes gates the Plan section behind, so this stays
  // correct without changes once multi-user ships. Computed after the tour
  // flag read, not in parallel with it: getDomainOverage() shares
  // requireUser()/getPlanForUser()'s per-request cache with the rest of this
  // render, and it is cheap in the overwhelming common case (one COUNT
  // query) — see lib/billing.ts.
  const role = await getAccountRole();
  const overage = role === "admin" ? await getDomainOverage() : null;

  return (
    <MobileShellProvider>
      {/* Blocking on purpose: no close button, no Escape, no click-outside.
          Rendered above everything else in the console — Sidebar included —
          for as long as the account holds more active domains than its plan
          allows, on every page in app/dashboard/**, incl. Facturación. */}
      {overage?.isOverCapacity && (
        <DomainOverageGate
          planId={overage.planId}
          planName={overage.planName}
          activeCount={overage.activeCount}
          cap={overage.cap}
          requiredRemoveCount={overage.requiredRemoveCount}
          domains={overage.domains}
          hasStripeSubscription={overage.hasStripeSubscription}
        />
      )}
      {/* ONBOARDING-TOUR-1: el popup «Aprende cómo funciona». Envuelve la
          consola entera porque tiene que poder abrirse desde el menú lateral
          y saltar solo en el primer acceso, sea cual sea la pantalla. */}
      <TourProvider hasSeenTour={hasSeenTour}>
      <Sidebar
        projects={projects ?? []}
        preferredProjectId={preferredProjectId}
        promptCountByProject={promptCountByProject}
        competitorCountByProject={competitorCountByProject}
        recommendationCountByProject={recommendationCountByProject}
        userEmail={user.email ?? ""}
        planId={plan.id}
        planName={plan.name}
        signOutAction={signOut}
      />
      <div className="dash-main">
        <ConsoleHeader>
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
        </ConsoleHeader>
        <DataMaturityBanner dataMaturityByProject={dataMaturityByProject} />
        <main className="dash-content">{children}</main>
      </div>
      </TourProvider>
    </MobileShellProvider>
  );
}
