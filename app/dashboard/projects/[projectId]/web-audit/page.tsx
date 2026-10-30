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
import { AUDIT_BLOCK_ORDER, AUDIT_BLOCK_PARAM, buildAuditBlock, parseAuditBlock } from "@/lib/web-audit/audit-blocks";
import { projectScreenMetadata } from "@/lib/seo/console-metadata";
import { Delta } from "@/components/ui/delta";
import { BotAccessCard } from "./_components/bot-access-card";
import { BLOCK_NOTES, InsBlockHero } from "@/components/ins/audit/block-cards";
import { Ic } from "@/components/ins/ic";
import { Motion } from "@/components/ins/kit/motion";
import { BlockIssuesCard, BlockPassingCard } from "./_components/block-panels";
import { CoverageHistory, CoverageSection } from "./_components/coverage-section";
import { SpeedCard } from "./_components/speed-card";
import { AuditTabBar, AuditTabPanel, AuditTabsProvider } from "./audit-tabs";
import { WebAuditProvider } from "./web-audit-context";

/**
 * Auditoría técnica: one screen, two blocks, Auditoría GEO and Auditoría SEO
 * (SEARCH-SEO-1 Fase 1b, log §275, design in
 * `docs/design-reference/search-seo-1/auditoria-geo-seo.html`). Since
 * NAV-SIMPLIFY-1 (log §291) the menu has one entry; the block cards switch
 * `?bloque=geo|seo`, and both read the same technical audit that runs after
 * every scan.
 *
 * GEO is «¿te puede citar la IA?»: the coverage map, AI bots, llms.txt and the
 * citable-content checks. SEO is «¿te encuentra Google?»: tags, headings,
 * canonical, indexing, hreflang and sitemap. Each block has its score, its
 * «Si arreglas…» banner and the Problemas / Correcto / Páginas tabs.
 *
 * Fase 2 (log §281): the SEO block's score is the «Salud SEO», with six more
 * checks and the home page speed («Optimización de tu página Home»). Those
 * count only there, never in the Salud técnica, so the GEO Score does not
 * move. Search Console is Fase 3 and is not drawn until it exists.
 */

// Same ADR-0003 rationale as the Escaneos page: the screen can wake the audit
// worker on render (`after()` below).
export const maxDuration = 60;

// ROOT-METADATA-1: el dominio va en la pestaña.
type PageProps = {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

// Log §368: the screen is split in two pages by `?bloque=`, each with its own
// menu entry. The kicker keeps naming the screen; the title names the block.
const SCREEN_LABEL = "Auditoría técnica";
const BLOCK_TITLES: Record<"geo" | "seo", string> = { geo: "Tu web para la IA", seo: "Tu web para Google" };

export async function generateMetadata({ params, searchParams }: PageProps): Promise<Metadata> {
  const { projectId } = await params;
  const block = parseAuditBlock((await searchParams)[AUDIT_BLOCK_PARAM]);
  return projectScreenMetadata(BLOCK_TITLES[block], async () => (await requireActiveProject(projectId)).domain);
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

  // Mirrors the FirstScanTakeover condition: the mission owns the whole screen
  // and hangs directly off `.page.mrk-fill` (founder, 2026-08-25; log §168).
  if (!hasCompletedScan && activeRun) {
    return (
      <div className="page mrk-fill">
        <FirstScanTakeover projectId={projectId} activeRun={activeRun} domain={project.domain} />
      </div>
    );
  }

  /* «Instrumento» (CONSOLE-INSTRUMENTO-1 F6a, log §363): the chrome is new
     (header, block cards with their arc, tabs); the audit itself, the
     coverage map and the fix generators are the same components as before. */
  return (
    <div className="ins">
      <Motion id={`web-audit:${projectId}`}>
        <div className="page sc-au">
          <div className="eyebrow bare">
            {SCREEN_LABEL} · <span className="mono" style={{ letterSpacing: 0, textTransform: "none" }}>{project.domain}</span>
          </div>
          <h1 style={{ marginTop: 14 }}>{BLOCK_TITLES[activeBlock]}</h1>
          <p className="lead">{BLOCK_NOTES[activeBlock]}</p>

          <WebAuditProvider
            projectId={projectId}
            autoStart={coverage.activeCampaignProgress}
            canAudit={coverage.canAuditCoverage}
          >
            {!hasCompletedScan ? (
              <div className="empty-s">
                <b>Todavía no hay ningún escaneo completado</b>
                <p>Revisamos tu web automáticamente después de cada escaneo. Lanza el primero desde la visión general.</p>
                <Link href={`/dashboard/projects/${projectId}`} className="btn line sm">
                  Ir a la visión general <Ic n="chevr" sm />
                </Link>
              </div>
            ) : !technicalSnapshot && auditIsRunning ? (
              /* SCAN-STATES-3: the mission's sixth beat, first audit only. */
              <ReentryMission domain={project.domain} />
            ) : !technicalSnapshot || !currentTechnicalReport ? (
              <div className="empty-s">
                <b>Todavía no hemos revisado tu web</b>
                <p>La revisión técnica corre sola después de cada escaneo. Vuelve en unos minutos.</p>
              </div>
            ) : (
              (() => {
                const pages = technicalSnapshot.pages;
                const bots = technicalSnapshot.bots;
                const views = AUDIT_BLOCK_ORDER.map((key) => buildAuditBlock(key, pages, currentTechnicalReport, bots));
                const view = views.find((v) => v.key === activeBlock)!;
                const isGeo = activeBlock === "geo";
                const pageSpeed = bots?.site?.pageSpeed;
                return (
                  <div className="sa-screen">
                    <InsBlockHero view={view} />
                    {currentTechnicalReport.actualReadinessScore !== null &&
                      technicalScoreDelta !== null &&
                      technicalScoreDelta !== 0 && (
                        <p className="sa-total">
                          <span className="sa-total-delta">
                            <Delta value={technicalScoreDelta} suffix=" pt" /> desde la revisión anterior
                          </span>
                        </p>
                      )}

                    <AuditTabsProvider>
                      <AuditTabBar
                        counts={{
                          problemas: view.issues.length,
                          correcto: view.passing.length
                        }}
                      />
                      <div className={isGeo ? "sa-grid-2" : undefined}>
                        <div className="sa-main">
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
                          {isGeo && <CoverageSection data={coverage} />}
                        </div>
                        {isGeo && (
                          <div className="sa-side">
                            <BotAccessCard bots={technicalSnapshot.bots} checkedAt={technicalSnapshot.created_at} />
                          </div>
                        )}
                      </div>
                      {isGeo && <CoverageHistory data={coverage} />}
                    </AuditTabsProvider>
                  </div>
                );
              })()
            )}
          </WebAuditProvider>
        </div>
      </Motion>
    </div>
  );
}
