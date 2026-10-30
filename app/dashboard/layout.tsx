// PRELAUNCH-HARDENING-1 Fase V (V5). Las hojas que sólo pinta la consola
// entran por aquí, no por `globals.css`: así no viajan a /blog ni a la
// landing. Ver la cabecera de `app/console.css` para qué se movió y qué no.
import { readAvatarUrl } from "@/lib/settings/avatar";
import "@/app/console.css";
import "@/app/ins/tokens.css";
import "@/app/ins/components.css";
import "@/app/ins/overlays.css";
import "@/app/ins/shell.css";
import "@/app/ins/app.css";
import "@/app/ins/overview.css";
import "@/app/ins/mission.css";
import "@/app/ins/newdomain.css";
import "@/app/ins/recs.css";
import "@/app/ins/sheet.css";
import "@/app/ins/competitors.css";
import "@/app/ins/citations.css";
import "@/app/ins/prompts.css";
import "@/app/ins/audit.css";
import "@/app/ins/google.css";
import "@/app/ins/agentic.css";
import "@/app/ins/settings.css";
import "@/app/ins/agents.css";
import "@/app/ins/errors.css";
import "@/app/ins/trial-ended.css";
import { cookies } from "next/headers";
import { SELLABLE_PLANS, resolveShownPromoPrice } from "@/app/pricing/plans-data";
import { getActivePromoPlanIds } from "@/lib/stripe";
import { getWorkspaceCounters } from "@/lib/project-workspace";
import { requireUser } from "@/lib/auth";
import { getAccountRole } from "@/lib/account-role";
import { getDomainOverage } from "@/lib/billing";
import { ACTIVE_PROJECT_COOKIE } from "@/lib/active-project-cookie";
import { getNextStepNotice } from "@/lib/notifications/next-step-data";
import { getAccountNotice } from "@/lib/notifications/account-notice-data";
import { DataMaturityBanner } from "@/components/data-maturity-banner";
import { DomainOverageGate } from "@/components/billing/domain-overage-gate";
import { TourProvider } from "@/components/tour-provider";
import { SessionCacheSync } from "@/components/session-cache-sync";
import { InsShell } from "@/components/ins/shell";
import { InternalVisitorMark } from "@/components/internal-visitor-mark";
import { isCountedAccount } from "@/lib/admin/kpi/own-accounts";
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

  // NOTIF-LANES-1: the «Tu cuenta» lane of the bell, computed in parallel.
  const accountNoticePromise = getAccountNotice(supabase, user.id);

  const {
    projects,
    promptCountByProject,
    competitorCountByProject,
    recommendationCountByProject,
    latestScanStatusByProject,
    latestScoreByProject,
    latestScanDateByProject,
    dataMaturityByProject,
    plan,
    notifications
  } = await getWorkspaceCounters();
  // NOTIF-LANES-1: «Tu siguiente paso» is the first action of the active
  // project's Recomendaciones plan, read with the screen's own `selectPlan`.
  // The active project is the cookie middleware writes on every project route,
  // falling back to the most recent one; the item names its domain either way.
  const nextStepProject =
    (projects ?? []).find((p) => p.id === preferredProjectId) ?? (projects ?? [])[0] ?? null;
  const [accountNotice, nextStep] = await Promise.all([
    accountNoticePromise,
    nextStepProject ? getNextStepNotice(supabase, nextStepProject) : Promise.resolve(null)
  ]);

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
  const avatarUrl = await readAvatarUrl(supabase, user.id);
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

  // CONSOLE-INSTRUMENTO-1 F8b (log §367): what an account with no plan is
  // offered. The founder price is only quoted when the real Stripe coupon is
  // active with slots left (same gate as Ajustes and /precios).
  const trialEndedOffers =
    plan.id === "free"
      ? await (async () => {
          const promoPlanIds = await getActivePromoPlanIds();
          return SELLABLE_PLANS.filter((p) => p.id === "starter" || p.id === "pro").map((p) => ({
            id: p.id,
            name: p.name,
            price: p.price,
            promoPrice: resolveShownPromoPrice({ plan: p, promoPlanIds })?.price ?? null,
            note: `${p.meter.engines} motores`
          }));
        })()
      : [];

  return (
    <>
      {/* header-flicker-prehydration-2 — seeds the public header's identity
          cache from the identity this layout already resolved server-side,
          so the first public page this visitor opens (the help menu's own
          "Manuales y estudios" link goes straight to /blog) paints the account chip
          instead of flashing the anonymous CTAs. Renders nothing; see
          components/session-cache-sync.tsx. */}
      <SessionCacheSync email={user.email ?? ""} planId={plan.id} planName={plan.name} />
      {/* ADMIN-PANEL-1: a team account's browser stops sending web analytics,
          so /admin/panel counts only real visitors. */}
      {!isCountedAccount({ id: user.id, email: user.email ?? "" }) && <InternalVisitorMark />}
      {/* Blocking on purpose: no close button, no Escape, no click-outside.
          Rendered above everything else in the console — the shell included —
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
          consola entera porque tiene que poder abrirse desde el menú de ayuda
          y saltar solo en el primer acceso, sea cual sea la pantalla. */}
      <TourProvider hasSeenTour={hasSeenTour}>
        {/* CONSOLE-INSTRUMENTO-1 F1 (log §349): el marco «Instrumento» v51
            sustituye al menú lateral y la cabecera anteriores. */}
        <InsShell
          data={{
            projects: (projects ?? []).map((p) => ({ id: p.id, name: p.name, domain: p.domain })),
            preferredProjectId,
            promptCountByProject,
            competitorCountByProject,
            recommendationCountByProject,
            latestScanStatusByProject,
            latestScoreByProject,
            latestScanDateByProject,
            userEmail: user.email ?? "",
            avatarUrl,
            planId: plan.id,
            planName: plan.name,
            planProjectCap: plan.caps.projects,
            onTrial: accountNotice?.kind === "trial",
            trialEndedOffers,
            signOutAction: signOut
          }}
          notifications={notifications}
          accountNotice={accountNotice}
          nextStep={nextStep}
          banner={<DataMaturityBanner dataMaturityByProject={dataMaturityByProject} />}
        >
          <main>{children}</main>
        </InsShell>
      </TourProvider>
    </>
  );
}
