import Link from "next/link";
import { after } from "next/server";
import type { Metadata } from "next";
import { Icon } from "@/components/ui/icon";
import { Delta } from "@/components/ui/delta";
import { InfoTip } from "@/components/ui/info-tip";
import { Gauge } from "@/components/ui/gauge";
import { ScanStatePill } from "@/components/scan-state-pill";
import { requireUser } from "@/lib/auth";
import { requireActiveProject } from "@/lib/project-workspace";
import { isProOrAbove } from "@/lib/billing";
import { parseCoverageMap } from "@/lib/web-audit/coverage-map";
import { buildLlmsTxt, publishSteps, type LlmsTxtResult, type PublishStep } from "@/lib/web-audit/llms-txt";
import { sitemapSteps, type SitemapStep } from "@/lib/web-audit/sitemap";
import {
  buildWebAuditSummary,
  buildCitationWindowCandidates,
  type PromptResultLite,
  type ClassifiedTopic,
  type TopicOutcome
} from "@/lib/web-audit/opportunity-matrix";
import { buildCoverageTrend } from "@/lib/web-audit/trend";
import { buildGlobalScore } from "@/lib/web-audit/global-score";
import { isDeltaTrustworthy, SMALL_SAMPLE_THRESHOLD } from "@/lib/web-audit/sample-confidence";
import { WEB_AUDIT_JOB_TYPE, WEB_AUDIT_STALE_LOCK_MS } from "@/lib/web-audit/audit-job";
import { ReentryMission } from "@/components/reentry-mission";
import { FirstScanTakeover } from "@/components/first-scan-takeover";
import { deriveAuditPillState, isWebAuditJobDue } from "@/lib/web-audit/audit-liveness";
import { triggerWebAuditRun } from "@/lib/web-audit/audit-dispatch";
import { loadWebAuditPageData } from "@/lib/web-audit/page-data";
import { WebAuditProvider } from "./web-audit-context";
import { WebAuditDriveNotice } from "./web-audit-drive-notice";
import { AuditTabsProvider, AuditTabBar, AuditTabPanel } from "./audit-tabs";
import type { PageAuditEntry } from "@/lib/web-audit/technical-audit";
import type { BotAccessReport, BotAgent } from "@/lib/web-audit/robots";
import { buildPageCheckGuidance } from "@/lib/web-audit/page-checks";
import {
  buildTechnicalIssuesReport,
  failingPageChecks,
  type TechnicalIssue,
  type TechnicalIssuesReport,
  type TechnicalPassingCheck,
  type IssueCheckKey,
  type IssueSeverity
} from "@/lib/web-audit/issues";
import { buildPageFixes, type PageFixContext } from "@/lib/web-audit/page-fixes";
import { projectScreenMetadata } from "@/lib/seo/console-metadata";
import { PageFixBlock } from "./page-fix-block";
import { LlmsTxtBlock } from "./llms-txt-block";
import { SitemapStepsBlock } from "./sitemap-steps-block";
import { formatDate } from "./_components/format";
import { IssueRow, PassingRow } from "./_components/issue-rows";
import { ScoreGauge, SubScoreTile, LockedSubScoreTile, MiniBar } from "./_components/score-tiles";
import { PageAuditRow } from "./_components/page-audit-row";
import { BotAccessCard } from "./_components/bot-access-card";
import { TrendChart } from "./_components/trend-chart";
import { TechnicalPotentialBanner } from "./_components/technical-potential-banner";

// Server Actions invoked from this page (auditDomainCoverageAction) run
// several sequential Gemini grounding calls up to COVERAGE_TOTAL_BUDGET_MS
// (~45s) — same ADR-0003 rationale as the Escaneos page's maxDuration.
export const maxDuration = 60;

// WEB-AUDIT-R3 (founder-approved 2026-07-12) rescaled page-checks.ts's point
// weights and added new sub-checks — the SAME page's pageScore can differ
// before/after this ships even with zero content change. A snapshot taken
// before this date used the old (narrower) criteria; the banner below flags
// that explicitly so a lower score never reads as a silent regression. Purely
// a display cutoff — self-expiring the moment a project re-audits.
const TECHNICAL_CRITERIA_EXPANDED_AT = new Date("2026-07-13T00:00:00Z");

// ROOT-METADATA-1: el dominio va en la pestaña. Sin esto las pantallas de
// consola heredaban `title: "GenScore"` del layout raíz y eran indistinguibles
// entre sí y entre proyectos. `requireActiveProject` está memoizada por
// petición, así que esto no añade ninguna consulta.
export async function generateMetadata({
  params
}: {
  params: Promise<{ projectId: string }>;
}): Promise<Metadata> {
  const { projectId } = await params;
  return projectScreenMetadata("Auditoría web", async () => (await requireActiveProject(projectId)).domain);
}
export default async function WebAuditPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const project = await requireActiveProject(projectId);
  const { supabase, user } = await requireUser();

  const {
    canAuditCoverage,
    hasCompletedScan,
    activeRun,
    technicalSnapshot,
    currentTechnicalReport,
    technicalScoreDelta,
    analyzedPagesCount,
    summary,
    grouped,
    trend,
    latestMap,
    auditedScanDate,
    coverageDelta,
    surfacingDelta,
    globalScore,
    heroScore,
    activeCampaignProgress,
    auditPillState,
    auditIsRunning,
    shouldDispatchAudit,
    llmsTxtFile,
    llmsPublishSteps,
    sitemapFixSteps,
    fixContext
  } = await loadWebAuditPageData({ supabase, userId: user.id, project });

  // El loader DECIDE si hay una auditoría vencida a la que despertar; actuar es
  // de esta pantalla (PRELAUNCH-HARDENING-1 Fase R7-b, log §106). Fire-and-forget
  // con `after()`, así que la respuesta de la página nunca espera por esto.
  if (shouldDispatchAudit) {
    after(() => triggerWebAuditRun());
  }

  // Mirrors the FirstScanTakeover condition below — hidden while the mission
  // takeover owns the screen, so the rocket animation reads as full screen
  // instead of sitting under a second chrome band (founder, 2026-08-25).
  const showMissionTakeover = !hasCompletedScan && Boolean(activeRun);

  return (
    <WebAuditProvider projectId={projectId} autoStart={activeCampaignProgress} canAudit={canAuditCoverage}>
    <div className={`page${showMissionTakeover ? " mrk-fill" : ""}`}>
      {/* Sticky header — oculta mientras la misión del primer escaneo ocupa
          la pantalla entera. */}
      {!showMissionTakeover && (
      <div className="ov-sticky-header">
        <div className="ov-sticky-left">
          <div>
            <p className="kicker" style={{ marginBottom: 2 }}>Auditoría web</p>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 15, fontWeight: 750, color: "var(--ink)", letterSpacing: "-.01em" }}>
                {project.name}
              </span>
              <span className="badge badge-neutral" style={{ fontFamily: "var(--mono)", fontSize: 11 }}>
                {project.domain}
              </span>
              {/* Was hardcoded unconditionally — read as "your account is
                  Pro" sitting right next to a "Disponible en plan Pro"
                  button when it wasn't (founder report: contradictory at a
                  glance after a plan downgrade). Reflects `canAuditCoverage`
                  specifically (WEB-AUDIT-TECH-ALL-PLANS-1): coverage is the
                  one half of this page that's still actually Pro-only, so
                  this is the one badge that still means something by plan —
                  the technical panels below render for every plan now. */}
              {canAuditCoverage && <span className="badge badge-accent" style={{ fontSize: 10 }}>PRO</span>}
            </div>
          </div>
        </div>
        {/* WEB-AUDIT-ISSUES-1 fase 2 (founder-approved 2026-08-02): the
            sticky header is shared chrome across every console page
            (docs/brand/design-decisions-log.md §3) — "el contexto vive
            entero en el sticky-header... título de sección + pill de fecha".
            Citations and Prompts, the two other v3-repainted pages, only put
            passive badges/status pills here, never an action button. The
            real "Auditar ahora" button moved into the page body below,
            leaving this side purely informational. (That button is gone
            entirely since AUDIT-NO-BUTTON-1; the body now holds only the
            audit's state.) */}
        <div className="ov-sticky-right" style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {/* Two lengths, not one. `.ov-sticky-right` is `flex-shrink: 0`, so
              whatever sits here keeps its intrinsic width — fine for the short
              pills Citations/Overview put here, but this is prose, and at
              375px the full sentence claimed ~340px of a 375px header. The
              left block (`flex: 1; min-width: 0`) collapsed to ~25px and its
              "Auditoría web" kicker painted straight over this text. Caught by
              reading the pilot's own mobile capture of PR #289 — no console
              error, no failed request and no overflow signal fired, because
              nothing overflowed: two elements simply shared the same pixels.
              The compact form keeps the audit date on mobile (it is the only
              place in the page that shows audit freshness) while fitting. */}
          {latestMap ? (
            <span style={{ fontSize: 11, color: "var(--ink-4)" }}>
              <span className="wa2-hdr-audit-full">
                Última auditoría: {formatDate(latestMap.generatedAt)}
                {auditedScanDate ? ` · sobre el escaneo del ${formatDate(auditedScanDate)}` : ""}
              </span>
              <span className="wa2-hdr-audit-compact">Auditada {formatDate(latestMap.generatedAt)}</span>
            </span>
          ) : (
            // WEB-AUDIT-TECH-ALL-PLANS-1: `latestMap` only ever exists for a
            // coverage campaign, so a non-Pro project (which never has one)
            // used to show no date here at all — even with a real, fresh
            // technical snapshot. That reads as "never audited", which is
            // false. Falls back to the technical snapshot's own date; still
            // nothing when neither exists.
            technicalSnapshot && (
              <span style={{ fontSize: 11, color: "var(--ink-4)" }}>Auditada {formatDate(technicalSnapshot.created_at)}</span>
            )
          )}
          {/* DOMAINS-REDESIGN-1: era un `.scan-status`, que el CSS oculta bajo
              el breakpoint móvil — el mismo fallo que §26 arregló para el
              escaneo y dejó anotado como pendiente para la auditoría. La
              pastilla compartida lo hace visible también en móvil y unifica el
              vocabulario de estado de toda la consola. Gate renombrado a
              `canAuditCoverage` por WEB-AUDIT-TECH-ALL-PLANS-1 (ADR 0035):
              este chip anuncia la campaña de COBERTURA, que sigue siendo Pro
              — la auditoría técnica corre en todos los planes y no tiene
              campaña que anunciar aquí. */}
          {/* WEB-AUDIT-DRIVE-1: the pill used to render off `status='running'`
              alone, with no notion of when that row last moved — so a campaign
              whose driver stopped 13 minutes earlier said "Auditando…"
              indefinitely (2026-08-07). `auditPillState` is the same claim
              measured against the clock and against the job's own status. */}
          {canAuditCoverage && auditPillState === "auditing" && <ScanStatePill auditing />}
          {canAuditCoverage && auditPillState === "pending" && (
            <span className="badge" style={{ fontSize: 11 }}>
              Auditoría pendiente
            </span>
          )}
        </div>
      </div>
      )}

      {/* WEB-AUDIT-ISSUES-1 fase 2: v3 repaint + the founder-approved
          640/1200/1280px console width standard (CITATIONS-REDESIGN-1,
          docs/brand/design-decisions-log.md §5), same mechanism as
          .ov2-scope/.cit2-scope — re-points the shared token names so every
          unedited `.card`/badge/etc. inside repaints automatically. Wraps
          everything below the sticky header, which stays on the shared
          chrome untouched, matching this repo's established nesting. */}
      <div className={`wa2-scope wa2-page${showMissionTakeover ? " mrk-fill" : ""}`}>

      {/* AUDIT-NO-BUTTON-1 (founder, 2026-08-05): here lived the page's one
          "Auditar ahora" button, and briefly after it a status pill. Both are
          gone. The audit has run on its own after every scan since
          AUDIT-AFTER-SCAN-1, so the button asked for work already done; and
          once the pill carried the date too, it repeated what the sticky
          header above already says ("dejamos solo la info de la cabecera").
          The header states the audit date, whether it covers the newest scan,
          and shows its own "Auditando" pill while a campaign runs — there was
          nothing left for a second element to add. */}

      {/* A campaign can be left "running" server-side while the account's
          plan lapses mid-audit (e.g. downgraded via Stripe billing) — the
          banner must never promise "seguirá por donde se quedó" when it
          genuinely can't: WebAuditProvider won't auto-resume without
          canAuditCoverage, and the button that would show any driving state
          is hidden entirely under the plan gate. Founder report: the old
          unconditional version left the page looking permanently stuck with
          no error, no explanation. This banner is about the COVERAGE
          campaign specifically — the technical half never had a "campaign"
          to pause, so WEB-AUDIT-TECH-ALL-PLANS-1 leaves this whole block
          keyed on canAuditCoverage unchanged. */}
      {/* Sólo la variante de plan pausado. La de "Auditoría en curso" se
          retiró (founder review 2026-08-04): mientras se audita, el propio
          botón ya lleva el spinner y el conteo de temas en vivo, así que el
          banner repetía la misma información en tres líneas más una pastilla
          — "todo el resto es liar la experiencia". Esta variante NO es
          redundante: cuando el plan decae a mitad de auditoría el botón
          desaparece entero bajo el gate, y entonces este banner es lo único
          que explica por qué la página parece atascada. */}
      {/* WEB-AUDIT-DRIVE-1: the coverage driver's own failures, which had no
          renderer at all until this phase — see the component. Placed above
          the plan-lapsed banner because the two are mutually exclusive in
          practice (that one only shows when the driver never starts) and this
          one is about work that did start and then stopped. */}
      <WebAuditDriveNotice />

      {activeCampaignProgress && !canAuditCoverage && (
          <div className="firstscan-banner">
            <div className="fb-ico">
              <Icon name="search" size={18} />
            </div>
            <div style={{ flex: 1 }}>
              <div className="fb-t">Auditoría pausada por cambio de plan</div>
              <div className="fb-d">
                Se quedó en {activeCampaignProgress.covered} de {activeCampaignProgress.total} temas. Tu plan actual
                no incluye esta función — el progreso está guardado y se reanudará en cuanto vuelvas a un plan Pro o
                superior.
              </div>
            </div>
            <Link href="/dashboard/settings/billing" className="btn btn-primary btn-sm">
              Ver planes
            </Link>
          </div>
        )}

      {/* Gated / empty states. WEB-AUDIT-TECH-ALL-PLANS-1 (2026-08-05): the
          old single `!canAudit` branch blanked out the ENTIRE page —
          technical panels included — for any non-Pro account. That was
          exactly the asymmetry GEO-SCORE-V4 (docs/adr/0033) turned into a
          scoring bug, not just a UX one: `readiness_score` is a real .20 GEO
          Score component, so a plan that can never see it structurally
          scored on four signals instead of five. The ladder below now gates
          on real data only — a completed scan, then either kind of audit
          result — never on plan. The plan-specific "not included" fact is
          told per-signal instead, inside the tiles/sections that need it
          (LockedSubScoreTile, the coverage-only Evolución/Historial blocks
          that stay empty by construction for a non-Pro project). */}
      {activeRun && showMissionTakeover ? (
        /* ONBOARDING-ROCKET-1's ascent beat, extended to this screen: it
           already took over Visión general, Prompts, Competidores,
           Recomendaciones and Páginas citadas while a project's first scan is
           in flight — Auditoría web was the one section still showing a
           static "sin escaneo" card instead. Safe by the same rule
           `ReentryMission` below already follows: this only replaces the
           screen when there is nothing yet to hide, since `!hasCompletedScan`
           means no summary and no technical snapshot exist. Once the scan
           finishes, `hasCompletedScan` flips and the mission continues into
           `ReentryMission` with no further wiring — that branch already
           covers "first audit, nothing to hide" on its own. */
        <FirstScanTakeover projectId={projectId} activeRun={activeRun} domain={project.domain} />
      ) : !hasCompletedScan ? (
        <div className="card" style={{ marginTop: 14, padding: "24px 22px", textAlign: "center" }}>
          <div style={{ fontSize: 15, fontWeight: 750, color: "var(--ink)", marginBottom: 8 }}>
            Todavía no hay ningún escaneo completado
          </div>
          <p style={{ fontSize: 13.5, color: "var(--ink-3)", maxWidth: 460, margin: "0 auto 16px", lineHeight: 1.6 }}>
            La auditoría web necesita al menos un escaneo completado para cruzar tus prompts con lo que la IA cita.
          </p>
          <Link href={`/dashboard/projects/${projectId}`} className="btn btn-primary btn-sm">
            Ir a la visión general
          </Link>
        </div>
      ) : !summary && !technicalSnapshot && auditIsRunning ? (
        /* SCAN-STATES-3: the mission's sixth beat. Only here, and only when
           there is nothing to hide — this page does NOT take the screen over
           while a re-audit runs, so a project with previous results keeps
           reading them. First audit only, same rule the rocket follows. */
        <ReentryMission domain={project.domain} />
      ) : !summary && !technicalSnapshot ? (
        // Neither signal exists yet for THIS account — true empty state,
        // reachable on any plan (e.g. right after a scan finishes, before
        // the async post-scan audit job has run). Copy branches on
        // canAuditCoverage because the two plans are waiting on different
        // things: a Pro account is waiting on ITS OWN next audit; a non-Pro
        // account will only ever get the technical half, so telling it
        // "hasta 5 auditorías al día" would describe a feature it can't use.
        <div className="card" style={{ marginTop: 14, padding: "24px 22px", textAlign: "center" }}>
          <div style={{ fontSize: 15, fontWeight: 750, color: "var(--ink)", marginBottom: 8 }}>
            Todavía no has auditado tu web
          </div>
          {canAuditCoverage ? (
            <p style={{ fontSize: 13.5, color: "var(--ink-3)", maxWidth: 460, margin: "0 auto 16px", lineHeight: 1.6 }}>
              Tu dominio visto como lo ve la IA: la auditoría comprueba, tema a tema, si tu dominio publica contenido
              que Google encuentra, y lo cruza con las citas de tu último escaneo.
            </p>
          ) : (
            <p style={{ fontSize: 13.5, color: "var(--ink-3)", maxWidth: 460, margin: "0 auto 16px", lineHeight: 1.6 }}>
              La salud técnica de tu web se audita sola tras cada escaneo — vuelve en unos minutos. Comparar lo que
              publicas con lo que la IA cita en sus respuestas es una función del plan Pro.
            </p>
          )}
          <p style={{ fontSize: 11.5, color: "var(--ink-4)", marginBottom: 16 }}>Hasta 5 auditorías al día por proyecto.</p>
        </div>
      ) : (
        <AuditTabsProvider>
          {/* HERO (WEB-AUDIT-R1): one composite verdict + its breakdown,
              replacing the old 4-tile KPI row that mixed units (fractions,
              scores, counts) with no hierarchy. */}
          <div className="card" style={{ marginTop: 14, padding: "16px 18px" }}>
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "center", gap: 20 }}>
              {/* Title ABOVE the dial, like the mockup's "Salud del sitio"
                  (founder review 2026-08-03: "el gauge inicial necesita un
                  título"). It used to sit over the tiles, which left the big
                  number unlabelled and made it read as competing with the
                  "Salud técnica" tile below rather than summarising it. */}
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, flexShrink: 0 }}>
                <div className="wa2-diag-title" style={{ display: "flex", alignItems: "center", fontSize: 13.5, fontWeight: 750 }}>
                  Diagnóstico general
                  {/* Qué te aporta, no cómo se calcula (founder review
                      2026-08-04). La versión anterior describía la aritmética
                      —"media simple de tus señales disponibles… no cuenta
                      como 0"— que es exactamente lo que un usuario no
                      necesita saber para decidir qué hacer, y además ocupaba
                      once líneas que tapaban el propio gauge. El desglose
                      sigue visible al lado, en los tres tiles. */}
                  <InfoTip text="Lo preparada que está tu web para que la IA te cite como fuente. Sube al cubrir los temas que te importan, al conseguir que la IA te mencione en ellos y al dejar tus páginas legibles para los motores." />
                </div>
                {/* WEB-AUDIT-TECH-ALL-PLANS-1: `heroScore` (computed above)
                    is the composite for a Pro account, same as before, and
                    the technical score alone for a non-Pro one — see its own
                    comment for why that's the honest headline rather than a
                    same-valued 1-of-3 average with a misleading caption. */}
                <ScoreGauge score={heroScore} />
              </div>
              <div style={{ flex: 1, minWidth: 240 }}>
                {/* Caption above the tiles: for a non-Pro account this is
                    always shown (coverage/surfacing can never be computed —
                    that's a plan fact, not a "not run yet" one); for Pro it
                    only shows below 3 signals, same as before
                    WEB-AUDIT-TECH-ALL-PLANS-1. */}
                {(!canAuditCoverage || globalScore.includedCount < 3) && (
                  <div style={{ fontSize: 11.5, color: "var(--ink-3)", margin: "2px 0 10px" }}>
                    {!canAuditCoverage
                      ? "Tu salud técnica — el contenido propio y lo que la IA cita se destapan en el plan Pro."
                      : `Media de ${globalScore.includedCount} ${globalScore.includedCount === 1 ? "señal disponible" : "señales disponibles"} — audita el resto para completarla.`}
                  </div>
                )}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8, marginTop: !canAuditCoverage || globalScore.includedCount < 3 ? 0 : 10 }}>
                  {/* Sin sparklines. Se probaron con 4 auditorías reales
                      (founder review 2026-08-04) y a 64×22px no se leen: "no
                      aportan mucho porque se ven muy pequeñas". Es además
                      información duplicada — el gráfico de Evolución, justo
                      debajo, dibuja exactamente la misma serie con ejes y
                      fechas. */}
                  {/* Contenido/Implementado: coverage stays Pro-only, and
                      `summary` is always null on a non-Pro account (no
                      coverage campaign ever runs) — locked, never "—", per
                      WEB-AUDIT-TECH-ALL-PLANS-1 (see LockedSubScoreTile). On
                      Pro, `summary` can ALSO be null transiently (a scan just
                      completed technical-first, coverage not through yet —
                      the structural fix that let this hero render at all
                      without a coverage summary), so this branch keeps its
                      own null-safety instead of assuming the old ladder's
                      guarantee. */}
                  {canAuditCoverage ? (
                    <>
                      <SubScoreTile
                        label="Contenido"
                        value={summary?.coveragePct == null ? "—" : `${summary.coveredCount} / ${summary.conclusiveCount}`}
                        hint="Temas con contenido propio verificado"
                        delta={coverageDelta}
                        pct={summary?.coveragePct ?? null}
                      />
                      <SubScoreTile
                        label="Implementado"
                        value={summary?.surfacingPct == null ? "—" : `${summary.surfacedCount} / ${summary.coveredCount}`}
                        hint={
                          summary?.surfacingPct != null && grouped.invisible.length > 0
                            ? `Palanca rápida: ${grouped.invisible.length} ${grouped.invisible.length === 1 ? "tema aún sin citar" : "temas aún sin citar"}`
                            : "De tus temas con contenido, cuántos cita la IA"
                        }
                        delta={surfacingDelta}
                        pct={summary?.surfacingPct ?? null}
                      />
                    </>
                  ) : (
                    <>
                      <LockedSubScoreTile label="Contenido" hint="Temas con contenido propio verificado por la IA" />
                      <LockedSubScoreTile label="Implementado" hint="Cuánto de ese contenido cita la IA en sus respuestas" />
                    </>
                  )}
                  <SubScoreTile
                    label="Salud técnica"
                    value={
                      technicalSnapshot
                        ? technicalSnapshot.readiness_score === null
                          ? "—"
                          : `${technicalSnapshot.readiness_score} / 100`
                        : "Sin auditar"
                    }
                    hint={
                      technicalSnapshot
                        ? `Media de ${analyzedPagesCount} ${analyzedPagesCount === 1 ? "página clave" : "páginas clave"}`
                        : "Se audita sola tras cada escaneo"
                    }
                    delta={null}
                    pct={technicalSnapshot?.readiness_score ?? null}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Evolución: subida aquí desde el pie de "Problemas" (founder
              review 2026-08-03: "subiría el gráfico de evolución de auditorías
              y lo pondría precisamente debajo de la primera caja"). Al vivir
              fuera del sistema de pestañas, la lectura pasa a ser: dónde
              estás (hero) → hacia dónde vas (esto) → qué hacer (pestañas).
              Umbral subido de 2 a 4 auditorías (founder-approved 2026-08-04,
              tras verlo en el preview): con dos puntos el gráfico dibuja una
              recta que se lee como tendencia sin serlo — el mismo criterio
              que ya aplican las sparklines de los tiles, y que pesa más aquí
              porque este bloque pasó a la posición más visible de la página.
              Sigue sin haber placeholder "necesitas más datos": desaparece
              entero. El Historial en tabla se queda en Problemas con umbral
              2 — es una tabla, no una línea: dos filas se leen perfectamente
              y son justo lo que da contexto mientras el gráfico no aparece. */}
          {trend.length >= 4 && (
            <div className="card" style={{ marginTop: 12 }}>
              <div style={{ padding: "13px 16px 0" }}>
                <div style={{ fontSize: 13.5, fontWeight: 750 }}>Evolución entre auditorías</div>
                <div style={{ fontSize: 11.5, color: "var(--ink-3)", marginTop: 2 }}>
                  Cobertura e implementación a lo largo de los últimos escaneos.
                </div>
              </div>
              <div style={{ display: "flex", gap: 14, fontSize: 11, color: "var(--ink-3)", fontWeight: 600, padding: "10px 16px 0" }}>
                <span>
                  <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 3, marginRight: 5, verticalAlign: -1, background: "var(--accent)" }} />
                  Cobertura de temas
                </span>
                <span>
                  <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 3, marginRight: 5, verticalAlign: -1, background: "var(--pos)" }} />
                  Tasa de implementación
                </span>
              </div>
              <div style={{ padding: "12px 16px 14px" }}>
                <TrendChart points={trend} />
              </div>
            </div>
          )}

          <AuditTabBar />

          {/* ─── Resumen ─── */}
          <AuditTabPanel id="problemas">
            {/* Salud técnica GEO — la lista de problemas (WEB-AUDIT-ISSUES-1
                fase 2, founder-approved 2026-08-02): "una auditoría web es
                para encontrar problemas técnicos" fue la lectura del
                fundador sobre los mockups, así que esta lista —no el antiguo
                resumen de una línea— abre ahora la pestaña. Cada fila sale
                de los checks reales por página/bot de lib/web-audit/issues.ts,
                ordenados por severidad; el delta de puntos de cada una es la
                ganancia exacta de score al arreglar solo ESE check (ver la
                cabecera de ese módulo para el porqué es exacto, no una
                estimación). */}
            {currentTechnicalReport ? (
              <>
                {/* Names WHICH score these two numbers are. Founder review
                    2026-08-03: the hero dial reads 58 and this card reads 81
                    — "ya veo que es salud técnica, pero me ha costado
                    identificarlo". They are different measures (global
                    average vs technical only), so the fix is a label, not a
                    shared number. Copy also cut down per the same review
                    ("la frase tiene que ser más pequeña"). Restyled
                    2026-08-17 (founder: "muy feo") — see
                    TechnicalPotentialBanner. */}
                {currentTechnicalReport.totalPointPotential > 0 &&
                  currentTechnicalReport.actualReadinessScore !== null &&
                  currentTechnicalReport.projectedReadinessScore !== null && (
                    <TechnicalPotentialBanner
                      issueCount={currentTechnicalReport.issues.length}
                      fromScore={currentTechnicalReport.actualReadinessScore}
                      toScore={currentTechnicalReport.projectedReadinessScore}
                    />
                  )}

                <div className="card" style={{ marginTop: 12 }}>
                  <div
                    style={{
                      padding: "13px 16px 0",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      flexWrap: "wrap",
                      gap: 8
                    }}
                  >
                    <div style={{ fontSize: 13.5, fontWeight: 750 }}>Problemas técnicos</div>
                    {technicalScoreDelta !== null && technicalScoreDelta !== 0 && (
                      <span style={{ fontSize: 11.5, fontWeight: 650, display: "flex", alignItems: "center", gap: 4 }}>
                        <Delta value={technicalScoreDelta} suffix=" pt" /> desde la auditoría anterior
                      </span>
                    )}
                  </div>
                  {/* Counts only. The sparklines that used to sit beside each
                      number were struck out by hand in the founder's review
                      screenshot (2026-08-03): "eso hay que eliminarlo, las
                      líneas me refiero. Dejamos solo el conteo de críticos y
                      el conteo de avisos". The same per-audit history is still
                      readable in Evolución/Historial, where it has axes. */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, padding: "12px 16px 0" }}>
                    <div>
                      <span
                        style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".05em", textTransform: "uppercase", color: "var(--ink-4)" }}
                      >
                        Críticos
                      </span>
                      <div style={{ marginTop: 2 }}>
                        <span style={{ fontSize: 22, fontWeight: 800, color: "var(--wa-crit)", fontVariantNumeric: "tabular-nums" }}>
                          {currentTechnicalReport.issues.filter((i) => i.severity === "critical").length}
                        </span>
                      </div>
                    </div>
                    <div>
                      <span
                        style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".05em", textTransform: "uppercase", color: "var(--ink-4)" }}
                      >
                        Avisos
                      </span>
                      <div style={{ marginTop: 2 }}>
                        <span style={{ fontSize: 22, fontWeight: 800, color: "var(--warn)", fontVariantNumeric: "tabular-nums" }}>
                          {currentTechnicalReport.issues.filter((i) => i.severity === "warning").length}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div style={{ padding: "14px 16px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
                    {currentTechnicalReport.issues.length > 0 ? (
                      currentTechnicalReport.issues.map((issue) => (
                        <IssueRow
                          key={issue.check}
                          issue={issue}
                          llmsTxt={
                            issue.check === "llms_txt_missing" && llmsTxtFile
                              ? { file: llmsTxtFile, steps: llmsPublishSteps }
                              : null
                          }
                          sitemap={issue.check === "sitemap_missing" ? { steps: sitemapFixSteps } : null}
                        />
                      ))
                    ) : (
                      <p style={{ fontSize: 12.5, color: "var(--ink-3)", margin: 0 }}>
                        Ningún problema técnico detectado en la última auditoría.
                      </p>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <div className="card" style={{ marginTop: 12, padding: "14px 16px" }}>
                <p style={{ fontSize: 12.5, color: "var(--ink-3)", margin: 0 }}>
                  {/* "no has auditado" ya no es cierto: nadie audita a mano
                      desde AUDIT-NO-BUTTON-1. Unconditional now
                      (WEB-AUDIT-TECH-ALL-PLANS-1): this used to only claim
                      "se comprueba sola" for canAudit (Pro) accounts, but the
                      technical half isn't plan-gated at all any more — it
                      auto-checks after every scan on every plan. */}
                  Todavía no se ha auditado la salud técnica de tu web. Se comprueba sola tras cada escaneo.
                </p>
              </div>
            )}

            {/* Plan de acción y Matriz de oportunidad, RETIRADOS de esta
                pantalla (founder-approved 2026-08-02): "toda la tabla de
                plan de acción no tiene sentido aquí... debe estar en la
                página de recomendaciones" y "la matriz no estaba en el
                artefacto". Efecto secundario real, señalado explícitamente:
                los temas content_gap/open_opportunity/capture no tienen hoy
                ninguna recomendación real que los cubra en el motor de
                reglas (ver el comentario histórico que vivía junto a la
                query de matchedRecs, ahora eliminada) — su guía sintetizada
                sólo existía en este bloque. Al quitarlo, esos temas se
                quedan sin ningún sitio en el producto hasta que se decida
                si esa guía migra a Recomendaciones o se descarta. No se
                reconstruye especulativamente aquí; queda como gap conocido
                para la siguiente fase. */}

            {/* "Lo que ya funciona": performing topics have no action, so
                they never belonged in a plan anyway. Plain always-expanded
                `.card`. No longer a matrix-quadrant scroll target (the
                matrix that used to link here is gone) — just a standalone
                confirmation block. */}
            {grouped.performing.length > 0 && (
              <div className="card" style={{ marginTop: 12 }}>
                {/* No "Rindiendo" pill: the heading already says these are
                    working, so the badge only repeated it (founder review
                    2026-08-03: "creo que no aporta nada, yo lo quitaría"). */}
                <div style={{ padding: "13px 16px 0" }}>
                  <div style={{ fontSize: 13.5, fontWeight: 750 }}>Lo que ya funciona ({grouped.performing.length})</div>
                </div>
                <div style={{ padding: "14px 16px 16px" }}>
                  <p style={{ fontSize: 12, color: "var(--ink-3)", margin: "0 0 10px" }}>
                    Contenido propio que la IA ya cita en sus respuestas — sin acción pendiente, solo mantenlo actualizado.
                  </p>
                  <ul style={{ display: "flex", flexDirection: "column", gap: 8, margin: 0, padding: 0, listStyle: "none" }}>
                    {grouped.performing.map((topic) => (
                      <li
                        key={topic.promptId}
                        style={{ padding: "8px 10px", background: "var(--surface-2)", borderRadius: 8, fontSize: 12.5, color: "var(--ink-2)" }}
                      >
                        {topic.topic}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}

            {/* El GRÁFICO de Evolución ya no vive aquí — subido a nivel de
                página, justo bajo el hero (founder review 2026-08-03). Lo que
                queda debajo es sólo el Historial en tabla. */}

            {trend.length >= 2 && (
              <div className="card" style={{ marginTop: 12 }}>
                <div style={{ padding: "13px 16px 0" }}>
                  <div style={{ fontSize: 13.5, fontWeight: 750 }}>Historial de auditorías</div>
                  <div style={{ fontSize: 11.5, color: "var(--ink-3)", marginTop: 2 }}>
                    Una entrada por escaneo auditado (máx. las 8 más recientes).
                  </div>
                </div>
                {/* Each row gets mini bars in the same series colors as the
                    chart above (accent = cobertura, pos = implementación) so
                    the history scans visually, not just numerically
                    (WEB-AUDIT-R4). A null rate renders "—" with no bar —
                    never a 0-width bar, which would read as a measured 0%. */}
                <div style={{ padding: "14px 16px 16px", display: "flex", flexDirection: "column", gap: 6 }}>
                  {[...trend].reverse().map((point) => (
                    <div
                      key={point.scanId}
                      style={{ padding: "8px 10px", borderRadius: 8, background: "var(--surface-2)" }}
                    >
                      <div style={{ fontSize: 12, fontWeight: 650, color: "var(--ink)", marginBottom: 6 }}>
                        {formatDate(point.generatedAt)}
                      </div>
                      {/* n/N always shown next to the % (WEB-AUDIT-R6 phase 1)
                          — the fraction itself is the honesty signal, no
                          separate warning text. */}
                      <div style={{ display: "grid", gridTemplateColumns: "110px minmax(0, 1fr) 92px", gap: 8, alignItems: "center" }}>
                        <span style={{ fontSize: 10.5, color: "var(--ink-4)" }}>Cobertura</span>
                        {point.coveragePct !== null ? (
                          <MiniBar pct={point.coveragePct} color="var(--accent)" />
                        ) : (
                          <span />
                        )}
                        <span style={{ fontSize: 11, color: "var(--ink-3)", fontVariantNumeric: "tabular-nums", textAlign: "right" }}>
                          {point.coveragePct === null
                            ? "—"
                            : `${point.coveragePct}% (${point.coveredCount}/${point.conclusiveCount})`}
                        </span>
                        <span style={{ fontSize: 10.5, color: "var(--ink-4)" }}>Implementado</span>
                        {point.surfacingPct !== null ? (
                          <MiniBar pct={point.surfacingPct} color="var(--pos)" />
                        ) : (
                          <span />
                        )}
                        <span style={{ fontSize: 11, color: "var(--ink-3)", fontVariantNumeric: "tabular-nums", textAlign: "right" }}>
                          {point.surfacingPct === null
                            ? "—"
                            : `${point.surfacingPct}% (${point.surfacedCount}/${point.coveredCount})`}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </AuditTabPanel>

          {/* ─── Correcto ─── */}
          <AuditTabPanel id="correcto">
            {/* Founder request (2026-08-02, tras ver los mockups): "me
                gustaría una sección... donde tenga tachado y con el check de
                verificado todo lo que el usuario tiene bien porque eso da la
                sensación de tienes cosas bien, pero tienes que mejorar
                otras". Cero backend nuevo — issues.ts ya calcula qué checks
                pasan, esta pestaña sólo enseña lo que hoy se descartaba. */}
            {currentTechnicalReport ? (
              <>
                <div className="card" style={{ marginTop: 12, padding: "14px 16px" }}>
                  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".03em", color: "var(--pos-ink)", textTransform: "uppercase" }}>
                    Comprobaciones superadas
                  </div>
                  <div style={{ fontSize: 26, fontWeight: 800, color: "var(--pos-ink)", marginTop: 2, fontVariantNumeric: "tabular-nums" }}>
                    {currentTechnicalReport.passing.reduce((sum, p) => sum + p.passedCount, 0)}
                    <span style={{ fontSize: 14, fontWeight: 650, color: "var(--ink-4)" }}>
                      {" "}
                      / {currentTechnicalReport.passing.reduce((sum, p) => sum + p.applicableCount, 0)}
                    </span>
                  </div>
                  <p style={{ fontSize: 11.5, color: "var(--ink-3)", margin: "8px 0 0" }}>
                    Tu web hace bien la mayoría de las cosas que comprobamos. Lo que falla está en la pestaña
                    Problemas.
                  </p>
                </div>
                <div className="card" style={{ marginTop: 12 }}>
                  <div style={{ padding: "13px 16px 16px", display: "flex", flexDirection: "column", gap: 8, marginTop: 4 }}>
                    {currentTechnicalReport.passing.length > 0 ? (
                      currentTechnicalReport.passing.map((p) => <PassingRow key={p.check} passing={p} />)
                    ) : (
                      <p style={{ fontSize: 12.5, color: "var(--ink-3)", margin: 0 }}>
                        Ninguna comprobación superada todavía en la última auditoría.
                      </p>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <div className="card" style={{ marginTop: 12, padding: "14px 16px" }}>
                <p style={{ fontSize: 12.5, color: "var(--ink-3)", margin: 0 }}>
                  Todavía no has auditado la salud técnica de tu web.
                </p>
              </div>
            )}
          </AuditTabPanel>

          {/* ─── Páginas ─── */}
          <AuditTabPanel id="paginas">
            {/* Salud técnica GEO (WEB-AUDIT-2): deterministic per-page checks +
                AI-bot access, independent from the Gemini-driven coverage
                audit. Renamed from "tecnica" (WEB-AUDIT-ISSUES-1 fase 2) —
                content unchanged, this is still the page-by-page detail the
                aggregated Problemas/Correcto lists summarize.
                RunTechnicalAuditButton retirado de aquí (founder-approved
                2026-08-02: "prefiero que no haya dos botones distintos") —
                "Auditar ahora" ya disparaba la auditoría técnica en el mismo
                clic (WEB-AUDIT-R2, piggyback en web-audit-context.tsx), así
                que este botón era estrictamente redundante, no una segunda
                función real. Desde AUDIT-NO-BUTTON-1 no hay ningún botón: la
                auditoría técnica corre con la automática tras cada escaneo. */}
            <div className="section-head" style={{ marginTop: 16 }}>
              <div className="section-title">Salud técnica GEO</div>
              <div className="section-desc">
                {technicalSnapshot
                  ? `Comprobado ${formatDate(technicalSnapshot.created_at)}`
                  : "Comprueba si tus páginas son técnicamente citables por la IA y si sus bots pueden rastrear tu web."}
              </div>
            </div>
            {technicalSnapshot && new Date(technicalSnapshot.created_at) < TECHNICAL_CRITERIA_EXPANDED_AT && (
              <p style={{ fontSize: 11.5, color: "var(--ink-4)", marginTop: 8 }}>
                Los criterios técnicos se ampliaron el 13 jul 2026 (canonical, indexabilidad, hreflang, listas/tablas,
                contenido, Open Graph). Esta auditoría es de antes de ese cambio — vuelve a auditar para comparar con
                los criterios actuales.
              </p>
            )}
            {technicalSnapshot ? (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 12, marginTop: 12 }}>
                <div className="card">
                  <div style={{ padding: "13px 16px 0" }}>
                    <div style={{ fontSize: 13.5, fontWeight: 750 }}>Salud técnica GEO por página</div>
                    <div style={{ fontSize: 11.5, color: "var(--ink-3)", marginTop: 2 }}>
                      Hasta {technicalSnapshot.pages.length} páginas clave: portada, páginas verificadas y páginas citadas por la IA. Toca una
                      página para ver qué mejorar.
                    </div>
                  </div>
                  <div style={{ padding: "14px 16px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
                    {technicalSnapshot.pages.map((page, i) => (
                      <PageAuditRow key={`${page.url}-${i}`} page={page} fixContext={fixContext} />
                    ))}
                  </div>
                </div>
                <BotAccessCard bots={technicalSnapshot.bots} checkedAt={technicalSnapshot.created_at} />
              </div>
            ) : (
              <p style={{ fontSize: 12.5, color: "var(--ink-3)", marginTop: 8 }}>
                Todavía no has auditado la salud técnica de tu web. Hasta 5 auditorías al día por proyecto.
              </p>
            )}
          </AuditTabPanel>
        </AuditTabsProvider>
      )}

      </div>
    </div>
    </WebAuditProvider>
  );
}
