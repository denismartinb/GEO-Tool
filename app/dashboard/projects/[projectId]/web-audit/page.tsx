import Link from "next/link";
import { after } from "next/server";
import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { requireActiveProject } from "@/lib/project-workspace";
import { ReentryMission } from "@/components/reentry-mission";
import { FirstScanTakeover } from "@/components/first-scan-takeover";
import { triggerWebAuditRun } from "@/lib/web-audit/audit-dispatch";
import { loadWebAuditPageData } from "@/lib/web-audit/page-data";
import { loadCoverageSectionData } from "@/lib/web-audit/coverage-section-data";
import { AUDIT_BLOCKS, AUDIT_BLOCK_ORDER, AUDIT_BLOCK_PARAM, buildAuditBlock, parseAuditBlock } from "@/lib/web-audit/audit-blocks";
import { projectScreenMetadata } from "@/lib/seo/console-metadata";
import { Delta } from "@/components/ui/delta";
import { formatDate } from "./_components/format";
import { PageAuditRow } from "./_components/page-audit-row";
import { BotAccessCard } from "./_components/bot-access-card";
import { BlockSwitch } from "./_components/block-switch";
import { BlockPotentialBanner } from "./_components/block-potential-banner";
import { BlockIssuesCard, BlockPassingCard } from "./_components/block-panels";
import { CoverageSection } from "./_components/coverage-section";
import { SpeedCard } from "./_components/speed-card";
import { SeoWeightsCard } from "./_components/seo-weights-card";
import { duplicateMetadataUrls } from "@/lib/web-audit/seo-health";
import { AuditTabBar, AuditTabPanel, AuditTabsProvider } from "./audit-tabs";
import { WebAuditProvider } from "./web-audit-context";

/**
 * Auditoría GEO y Auditoría SEO: one screen, two blocks (SEARCH-SEO-1 Fase
 * 1b, log §275, design in
 * `docs/design-reference/search-seo-1/auditoria-geo-seo.html`). The menu has
 * an entry for each, `?bloque=geo|seo`, and both read the same technical
 * audit that runs after every scan.
 *
 * GEO is «¿te puede citar la IA?»: the coverage map, AI bots, llms.txt and the
 * citable-content checks. SEO is «¿te encuentra Google?»: tags, headings,
 * canonical, indexing, hreflang and sitemap. Each block has its score, its
 * «Si arreglas…» banner and the Problemas / Correcto / Páginas tabs.
 *
 * Fase 2 (log §278): the SEO block's score is the «Salud SEO», with six more
 * checks and the home page speed («Optimización de tu página Home»). Those
 * count only there, never in the Salud técnica, so the GEO Score does not
 * move. Search Console is Fase 3 and is not drawn until it exists.
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
type PageProps = {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params, searchParams }: PageProps): Promise<Metadata> {
  const { projectId } = await params;
  const block = parseAuditBlock((await searchParams)[AUDIT_BLOCK_PARAM]);
  return projectScreenMetadata(AUDIT_BLOCKS[block].label, async () => (await requireActiveProject(projectId)).domain);
}

export default async function WebAuditPage({ params, searchParams }: PageProps) {
  const { projectId } = await params;
  const activeBlock = parseAuditBlock((await searchParams)[AUDIT_BLOCK_PARAM]);
  const project = await requireActiveProject(projectId);
  const { supabase, user } = await requireUser();
  const coveragePromise = loadCoverageSectionData({ supabase, userId: user.id, project });

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
  const coverage = await coveragePromise;

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
              <p className="kicker" style={{ marginBottom: 2 }}>{AUDIT_BLOCKS[activeBlock].label}</p>
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

      {/* v3 scope + the founder-approved console width ladder (log §5, §178).
          WebAuditProvider resumes a coverage campaign from the browser as an
          accelerator (ADR 0038); the cron is the engine. It is a context
          provider and renders no box, so the mission still hangs from
          `.page.mrk-fill` through `display: contents` wrappers only. */}
      <WebAuditProvider
        projectId={projectId}
        autoStart={coverage.activeCampaignProgress}
        canAudit={coverage.canAuditCoverage}
      >
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
          (() => {
            const pages = technicalSnapshot.pages;
            const bots = technicalSnapshot.bots;
            const views = AUDIT_BLOCK_ORDER.map((key) => buildAuditBlock(key, pages, currentTechnicalReport, bots));
            const view = views.find((v) => v.key === activeBlock)!;
            const isGeo = activeBlock === "geo";
            const duplicates = isGeo ? null : duplicateMetadataUrls(pages);
            const pageSpeed = bots?.site?.pageSpeed;
            return (
              <div className="sa-screen">
                  <BlockSwitch projectId={projectId} active={activeBlock} blocks={views} />
                  {currentTechnicalReport.actualReadinessScore !== null && (
                    <p className="sa-total">
                      Tu Puntuación GEO usa la <b>Salud técnica ({currentTechnicalReport.actualReadinessScore}/100)</b>: los
                      checks GEO y los SEO de siempre. Las comprobaciones nuevas y la velocidad sólo cuentan en la Salud SEO.
                      {technicalScoreDelta !== null && technicalScoreDelta !== 0 && (
                        <span className="sa-total-delta">
                          <Delta value={technicalScoreDelta} suffix=" pt" /> desde la revisión anterior
                        </span>
                      )}
                    </p>
                  )}

                  {view.score !== null && view.projectedScore !== null && view.projectedScore > view.score && (
                    <BlockPotentialBanner
                      block={activeBlock}
                      issueCount={view.scoredIssueCount}
                      fromScore={view.score}
                      toScore={view.projectedScore}
                    />
                  )}

                  <AuditTabsProvider>
                    <AuditTabBar />
                    <div className="sa-grid-2">
                      <div className="sa-main">
                        {isGeo && <CoverageSection data={coverage} />}
                        {!isGeo && pageSpeed !== undefined && <SpeedCard pageSpeed={pageSpeed} />}
                        <AuditTabPanel id="problemas">
                          <BlockIssuesCard
                            view={view}
                            llmsTxtFile={llmsTxtFile}
                            llmsPublishSteps={llmsPublishSteps}
                            sitemapFixSteps={sitemapFixSteps}
                          />
                        </AuditTabPanel>
                        <AuditTabPanel id="correcto">
                          <BlockPassingCard view={view} citedTopics={isGeo ? coverage.grouped.performing : undefined} />
                        </AuditTabPanel>
                        <AuditTabPanel id="paginas">
                          <div className="card sa-pages">
                            <div className="sa-ch">
                              <h3>Páginas revisadas</h3>
                              <span className="sa-src">
                                {AUDIT_BLOCKS[activeBlock].scoreLabel} de cada página · toca una para ver qué mejorar
                              </span>
                            </div>
                            {new Date(technicalSnapshot.created_at) < TECHNICAL_CRITERIA_EXPANDED_AT && (
                              <p className="sa-note">
                                Esta revisión es anterior al 13 jul 2026, cuando se ampliaron los criterios (canonical,
                                indexabilidad, hreflang, listas y tablas, contenido, Open Graph). La próxima ya usará los
                                actuales.
                              </p>
                            )}
                            <div className="sa-pg-list">
                              {pages.map((page, i) => (
                                <PageAuditRow
                                  key={`${page.url}-${i}`}
                                  page={page}
                                  fixContext={fixContext}
                                  block={activeBlock}
                                  duplicate={duplicates ? duplicates.has(page.url) : undefined}
                                />
                              ))}
                            </div>
                          </div>
                        </AuditTabPanel>
                      </div>
                      <div className="sa-side">
                        <div className="sa-scope">
                          <p>
                            <b>Esto es lo que vemos desde fuera.</b> Revisamos las páginas clave de tu web: la portada,
                            las que hemos verificado y las que cita la IA. No rastreamos la web entera.
                          </p>
                        </div>
                        {isGeo && <BotAccessCard bots={technicalSnapshot.bots} checkedAt={technicalSnapshot.created_at} />}
                        {!isGeo && <SeoWeightsCard />}
                      </div>
                    </div>
                  </AuditTabsProvider>
                </div>
            );
          })()
        )}
      </div>
      </WebAuditProvider>
    </div>
  );
}
