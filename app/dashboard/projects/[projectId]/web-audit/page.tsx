import Link from "next/link";
import { after } from "next/server";
import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { requireActiveProject } from "@/lib/project-workspace";
import { ReentryMission } from "@/components/reentry-mission";
import { FirstScanTakeover } from "@/components/first-scan-takeover";
import { triggerWebAuditRun } from "@/lib/web-audit/audit-dispatch";
import { loadWebAuditPageData } from "@/lib/web-audit/page-data";
import { buildFixList, buildSeoAreas } from "@/lib/web-audit/seo-audit-view";
import { projectScreenMetadata } from "@/lib/seo/console-metadata";
import { formatDate } from "./_components/format";
import { PageAuditRow } from "./_components/page-audit-row";
import { BotAccessCard } from "./_components/bot-access-card";
import { SeoAreasCard, SeoScoreCard } from "./_components/seo-summary";
import { FixListCard } from "./_components/fix-list";

/**
 * Auditoría SEO (SEARCH-SEO-1, design in
 * `docs/design-reference/search-seo-1/maqueta.html`, log §271). How Google and
 * the AI engines see the site, from the technical audit that runs after every
 * scan: score and areas, «Qué arreglar», and the pages reviewed.
 *
 * Fase 1b moved the coverage map (Contenido / Implementado, its trend and its
 * history) to Páginas citadas, where the citations it is checked against
 * live. Speed (Core Web Vitals), mobile and «Salud SEO» are Fase 2 and are not
 * drawn here until there is a measurement behind them.
 */

// Same ADR-0003 rationale as the Escaneos page: the screen can wake the audit
// worker on render (`after()` below).
export const maxDuration = 60;

// WEB-AUDIT-R3 (founder-approved 2026-07-12) rescaled page-checks.ts's point
// weights and added new sub-checks — the SAME page's pageScore can differ
// before/after this ships even with zero content change. A snapshot taken
// before this date used the old criteria; the note below says so, so a lower
// score never reads as a silent regression.
const TECHNICAL_CRITERIA_EXPANDED_AT = new Date("2026-07-13T00:00:00Z");

// ROOT-METADATA-1: el dominio va en la pestaña.
export async function generateMetadata({
  params
}: {
  params: Promise<{ projectId: string }>;
}): Promise<Metadata> {
  const { projectId } = await params;
  return projectScreenMetadata("Auditoría SEO", async () => (await requireActiveProject(projectId)).domain);
}

export default async function WebAuditPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const project = await requireActiveProject(projectId);
  const { supabase } = await requireUser();

  const {
    hasCompletedScan,
    activeRun,
    technicalSnapshot,
    currentTechnicalReport,
    technicalScoreDelta,
    auditIsRunning,
    shouldDispatchAudit,
    llmsTxtFile,
    llmsPublishSteps,
    sitemapFixSteps,
    fixContext
  } = await loadWebAuditPageData({ supabase, project });

  // El loader DECIDE si hay una auditoría vencida a la que despertar; actuar es
  // de esta pantalla (PRELAUNCH-HARDENING-1 Fase R7-b, log §106).
  if (shouldDispatchAudit) {
    after(() => triggerWebAuditRun());
  }

  // Mirrors the FirstScanTakeover condition below — hidden while the mission
  // takeover owns the screen (founder, 2026-08-25).
  const showMissionTakeover = !hasCompletedScan && Boolean(activeRun);

  return (
    <div className={`page${showMissionTakeover ? " mrk-fill" : ""}`}>
      {!showMissionTakeover && (
        <div className="ov-sticky-header">
          <div className="ov-sticky-left">
            <div>
              <p className="kicker" style={{ marginBottom: 2 }}>Auditoría SEO</p>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 15, fontWeight: 750, color: "var(--ink)", letterSpacing: "-.01em" }}>
                  {project.name}
                </span>
                <span className="badge badge-neutral" style={{ fontFamily: "var(--mono)", fontSize: 11 }}>
                  {project.domain}
                </span>
              </div>
            </div>
          </div>
          <div className="ov-sticky-right" style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {technicalSnapshot && (
              <span style={{ fontSize: 11, color: "var(--ink-4)" }}>
                <span className="wa2-hdr-audit-full">Última revisión: {formatDate(technicalSnapshot.created_at)}</span>
                <span className="wa2-hdr-audit-compact">Revisada {formatDate(technicalSnapshot.created_at)}</span>
              </span>
            )}
          </div>
        </div>
      )}

      {/* v3 scope + the founder-approved console width ladder (log §5, §178). */}
      <div className={`wa2-scope wa2-page${showMissionTakeover ? " mrk-fill" : ""}`}>
        {activeRun && showMissionTakeover ? (
          /* ONBOARDING-ROCKET-1's ascent beat: safe because `!hasCompletedScan`
             means no technical snapshot exists yet to hide. */
          <FirstScanTakeover projectId={projectId} activeRun={activeRun} domain={project.domain} />
        ) : !hasCompletedScan ? (
          <div className="card" style={{ marginTop: 14, padding: "24px 22px", textAlign: "center" }}>
            <div style={{ fontSize: 15, fontWeight: 750, color: "var(--ink)", marginBottom: 8 }}>
              Todavía no hay ningún escaneo completado
            </div>
            <p style={{ fontSize: 13.5, color: "var(--ink-3)", maxWidth: 460, margin: "0 auto 16px", lineHeight: 1.6 }}>
              Revisamos tu web automáticamente después de cada escaneo. Lanza el primero desde la visión general.
            </p>
            <Link href={`/dashboard/projects/${projectId}`} className="btn btn-primary btn-sm">
              Ir a la visión general
            </Link>
          </div>
        ) : !technicalSnapshot && auditIsRunning ? (
          /* SCAN-STATES-3: the mission's sixth beat, first audit only. */
          <ReentryMission domain={project.domain} />
        ) : !technicalSnapshot || !currentTechnicalReport ? (
          <div className="card" style={{ marginTop: 14, padding: "24px 22px", textAlign: "center" }}>
            <div style={{ fontSize: 15, fontWeight: 750, color: "var(--ink)", marginBottom: 8 }}>
              Todavía no hemos revisado tu web
            </div>
            <p style={{ fontSize: 13.5, color: "var(--ink-3)", maxWidth: 460, margin: "0 auto", lineHeight: 1.6 }}>
              La revisión técnica corre sola después de cada escaneo. Vuelve en unos minutos.
            </p>
          </div>
        ) : (
          <div className="sa-screen">
            <div className="sa-ph">
              <div className="sa-eyb">
                <span className="sa-eyb-dot" aria-hidden="true" />
                Posicionamiento en buscadores
              </div>
              <h2>Auditoría SEO</h2>
              <p>
                Cómo ven Google y la IA tu web. Revisamos tus páginas después de cada escaneo, sin que tengas que
                conectar nada.
              </p>
            </div>

            <div className="sa-grid-hero">
              <SeoScoreCard
                score={currentTechnicalReport.actualReadinessScore}
                delta={technicalScoreDelta}
                criticalCount={currentTechnicalReport.issues.filter((i) => i.severity === "critical").length}
                issueCount={currentTechnicalReport.issues.length}
                analyzedPageCount={currentTechnicalReport.analyzedPageCount}
              />
              <SeoAreasCard areas={buildSeoAreas(currentTechnicalReport)} />
            </div>

            <FixListCard
              list={buildFixList(currentTechnicalReport)}
              llmsTxtFile={llmsTxtFile}
              llmsPublishSteps={llmsPublishSteps}
              sitemapFixSteps={sitemapFixSteps}
            />

            <div className="sa-grid-2">
              <div className="card sa-pages">
                <div className="sa-ch">
                  <h3>Páginas revisadas</h3>
                  <span className="sa-src">Nota técnica por página · toca una para ver qué mejorar</span>
                </div>
                {new Date(technicalSnapshot.created_at) < TECHNICAL_CRITERIA_EXPANDED_AT && (
                  <p className="sa-note">
                    Esta revisión es anterior al 13 jul 2026, cuando se ampliaron los criterios (canonical,
                    indexabilidad, hreflang, listas y tablas, contenido, Open Graph). La próxima ya usará los actuales.
                  </p>
                )}
                <div className="sa-pg-list">
                  {technicalSnapshot.pages.map((page, i) => (
                    <PageAuditRow key={`${page.url}-${i}`} page={page} fixContext={fixContext} />
                  ))}
                </div>
              </div>
              <div className="sa-side">
                <div className="sa-scope">
                  <p>
                    <b>Esto es lo que vemos desde fuera.</b> Revisamos las páginas clave de tu web: la portada, las
                    que hemos verificado y las que cita la IA. No rastreamos la web entera.
                  </p>
                </div>
                <BotAccessCard bots={technicalSnapshot.bots} checkedAt={technicalSnapshot.created_at} />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
