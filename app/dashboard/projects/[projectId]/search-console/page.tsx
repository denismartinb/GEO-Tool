import type { Metadata } from "next";
import { Motion } from "@/components/ins/kit/motion";
import { requireUser } from "@/lib/auth";
import { getPlanForUser } from "@/lib/billing";
import { requireActiveProject } from "@/lib/project-workspace";
import { projectScreenMetadata } from "@/lib/seo/console-metadata";
import { loadSearchConsoleScreen } from "@/lib/search-console/load";
import { propertyLabel } from "@/lib/search-console/property";
import { readSearchConsoleInputs } from "@/lib/search-console/screen-inputs";
import { loadSeoTracking, weeklyTodo } from "@/lib/seo-tracking/screen";
import { buildSetupProposal } from "@/lib/seo-tracking/setup-proposal";
import { normalizeKeyword } from "@/lib/seo-tracking/keyword-text";
import { pagePath } from "@/lib/seo-tracking/topic-actions";
import { weeklySummary } from "@/lib/seo-tracking/view-model";
import { AUDIT_BLOCK_PARAM } from "@/lib/web-audit/audit-blocks";
import { ClicksImpressionsChart, NearPageOneScatter } from "./_components/gsc-charts";
import { GscConnect } from "./_components/gsc-connect";
import { GscDisconnect } from "./_components/gsc-disconnect";
import { GscCannibal, GscCtr, GscDevices, GscPages } from "./_components/gsc-insights";
import { GscKpis } from "./_components/gsc-kpis";
import { GscOutcome } from "./_components/gsc-outcome";
import { GscPickProperty } from "./_components/gsc-pick-property";
import { GscPosition } from "./_components/gsc-position";
import { GscQueries } from "./_components/gsc-queries";
import { GscQuestions } from "./_components/gsc-questions";
import { SeoTracking, type SeoView } from "./_components/seo/seo-tracking";

/**
 * «Posición en Google» — SEARCH-SEO-1 Fase 3 (log §284), design in
 * docs/design-reference/search-seo-1/maqueta.html (screens "gsc" and
 * "connect"). Every number is read live from the customer's own Search
 * Console; nothing is stored or estimated. Fase 3b (log §287, design in
 * docs/design-reference/search-seo-1/fase-3b/) adds position, pages crossed
 * with the audit, CTR, questions, devices and cannibalization. Indexing is asked for the pages
 * the technical audit already reviews (at most ten), so it never pretends to
 * cover the whole site.
 */

export const dynamic = "force-dynamic";
// The server actions of this page run the first Google snapshot in `after()` (log §346).
export const maxDuration = 60;

const VIEWS: SeoView[] = ["resumen", "temas", "descubrir"];

export async function generateMetadata({ params }: { params: Promise<{ projectId: string }> }): Promise<Metadata> {
  const { projectId } = await params;
  return projectScreenMetadata("Posición en Google", async () => (await requireActiveProject(projectId)).domain);
}

export default async function SearchConsolePage({
  params,
  searchParams
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ gsc?: string; vista?: string }>;
}) {
  const [{ projectId }, { gsc, vista }] = await Promise.all([params, searchParams]);
  const project = await requireActiveProject(projectId);
  const { supabase, user } = await requireUser();

  const { auditedPages, trackedPrompts } = await readSearchConsoleInputs(supabase, projectId);

  const [state, plan, competitors] = await Promise.all([
    loadSearchConsoleScreen(projectId, user.id, project.domain, auditedPages, trackedPrompts),
    getPlanForUser(supabase, user.id),
    supabase.from("project_competitors").select("name, domain").eq("project_id", projectId).eq("is_active", true)
  ]);
  const ready = state.kind === "ready" && !state.report.empty ? state : null;
  const seo = await loadSeoTracking(supabase, {
    projectId,
    ownerUserId: user.id,
    ownDomain: project.domain,
    planId: plan.id,
    ctr: ready ? ready.insights.ctr.map((c) => ({ query: c.query, page: c.page, position: c.position })) : []
  });
  const connectHref = `/api/search-console/connect?projectId=${projectId}`;
  const auditHref = `/dashboard/projects/${projectId}/web-audit?${AUDIT_BLOCK_PARAM}=seo`;

  const gscContent = (
    <>

          {state.kind === "not_configured" || state.kind === "unavailable" ? (
            <div className="card gsc-pick">
              <h3>Muy pronto podrás conectar tu Search Console</h3>
              <p>Estamos terminando de activar la conexión con Google. Mientras tanto, la Auditoría SEO ya revisa tu web.</p>
            </div>
          ) : state.kind === "disconnected" ? (
            <GscConnect connectHref={connectHref} />
          ) : state.kind === "reconnect" ? (
            <GscConnect
              connectHref={connectHref}
              title="Vuelve a conectar tu Search Console"
              lead={
                state.reason === "permission"
                  ? "Tu cuenta de Google ya no tiene acceso a la propiedad de este dominio en Search Console. Conecta la cuenta que la gestiona para volver a ver:"
                  : "Google ha retirado el permiso de GenScore (se revocó o caducó). Conecta de nuevo para volver a ver:"
              }
            />
          ) : state.kind === "pick_property" ? (
            <GscPickProperty
              projectId={projectId}
              domain={project.domain}
              candidates={state.candidates}
              verifiedCount={state.verifiedCount}
              connectHref={connectHref}
            />
          ) : state.kind === "error" ? (
            <div className="card gsc-pick">
              <h3>Google no ha respondido esta vez</h3>
              <p>
                {state.category === "quota"
                  ? "Hemos pedido muchos datos a Google en poco tiempo. Vuelve a abrir la pantalla en unos minutos."
                  : "No hemos podido leer tus datos de Search Console. Vuelve a abrir la pantalla en un rato."}
              </p>
            </div>
          ) : state.report.empty ? (
            <div className="card gsc-pick">
              <h3>Google todavía no tiene datos de tu web</h3>
              <p>
                En los últimos 28 días tu web no ha salido en ninguna búsqueda de Google, o la propiedad es muy reciente.
                Search Console tarda unos días en empezar a contar.
              </p>
            </div>
          ) : (
            <>
              <GscPosition position={state.report.position} tiers={state.insights.tiers} daily={state.report.daily} />
              <GscKpis report={state.report} daily={state.report.daily} index={state.report.index} uninspected={state.uninspected} />
              <div className="gsc-grid-2 gsc-grid-charts">
              <div className="card">
                <div className="sa-ch">
                  <h3>Clics e impresiones</h3>
                  <div className="gsc-legend">
                    <span>
                      <i style={{ background: "#2563eb" }} />
                      Clics (eje izquierdo)
                    </span>
                    <span>
                      <i style={{ background: "#9ee6ee" }} />
                      Impresiones (eje derecho)
                    </span>
                  </div>
                </div>
                <ClicksImpressionsChart daily={state.report.daily} />
              </div>
              <div className="card">
                <div className="sa-ch">
                  <h3>Búsquedas por página de Google</h3>
                  <span className="sa-src">Cada punto es una búsqueda</span>
                </div>
                <NearPageOneScatter queries={state.report.queries} />
                <p className="sa-note" style={{ marginTop: 8, marginBottom: 0 }}>
                  {state.report.nearPage1.length > 0
                    ? "Las búsquedas de la franja azul están en la página 2 (puestos 11 a 20). Son las más fáciles de subir a la primera: ahí está tu mejor oportunidad a corto plazo."
                    : "Ahora mismo no tienes búsquedas en la página 2 de Google."}
                </p>
              </div>
              </div>
              <GscQueries queries={state.report.queries} pageByQuery={state.insights.pageByQuery} />
              <GscPages pages={state.insights.pages} auditHref={auditHref} />
              <div className="gsc-grid-2">
                <GscCtr items={state.insights.ctr} />
                <GscQuestions projectId={projectId} questions={state.insights.questions} />
              </div>
              <div className="gsc-grid-2">
                <GscDevices devices={state.insights.devices} />
                <GscCannibal items={state.insights.cannibalization} />
              </div>
            </>
          )}

          {(state.kind === "ready" || state.kind === "pick_property" || state.kind === "error") && (
            <p className="gsc-foot">
              {state.kind === "ready" ? <>Propiedad: {propertyLabel(state.property)} · </> : null}
              <GscDisconnect projectId={projectId} />
            </p>
          )}
    </>
  );

  let seoContent = gscContent;
  if (seo.kind === "setup" || seo.kind === "ready") {
    const keywords = seo.topics.flatMap((t) => t.keywords);
    const tracked = new Set(keywords.map((k) => k.keyword));
    const topicByPath = new Map(seo.topics.filter((t) => t.targetUrl).map((t) => [pagePath(t.targetUrl as string), t.id]));
    const queries = ready?.report.queries ?? [];
    const pageByQuery = ready?.insights.pageByQuery ?? {};
    const near = queries
      .filter((q) => q.position >= 4 && q.position <= 20 && !tracked.has(normalizeKeyword(q.query) ?? ""))
      .sort((a, b) => b.impressions - a.impressions)
      .slice(0, 30)
      .map((q) => ({
        keyword: normalizeKeyword(q.query) ?? q.query,
        position: q.position,
        impressions: q.impressions,
        topicId: pageByQuery[q.query] ? topicByPath.get(pagePath(pageByQuery[q.query])) ?? null : null
      }));
    const gscPositions = Object.fromEntries(queries.map((q) => [normalizeKeyword(q.query) ?? q.query, q.position]));
    const proposal = {
      topics:
        seo.kind === "setup"
          ? buildSetupProposal({
              queries: queries.map((q) => ({ query: q.query, position: q.position, impressions: q.impressions })),
              pageByQuery,
              brandTerms: [project.name, project.brand, project.domain.replace(/^www\./, "").split(".")[0]].filter((t): t is string => Boolean(t)),
              keywordCap: seo.caps.keywords
            })
          : [],
      rivals: (competitors.data ?? [])
        .filter((c): c is { name: string; domain: string } => Boolean(c.domain) && typeof c.name === "string")
        .map((c) => ({ domain: c.domain.replace(/^www\./, ""), name: c.name }))
        .slice(0, 10)
    };
    seoContent = (
      <SeoTracking
        projectId={projectId}
        ownDomain={project.domain}
        data={seo}
        todo={weeklyTodo(seo.topics)}
        summary={weeklySummary(keywords)}
        gsc={
          ready
            ? {
                clicks: ready.report.clicks.value,
                impressions: ready.report.impressions.value,
                position: ready.report.position.value,
                nearPage1: ready.report.nearPage1.length
              }
            : null
        }
        near={near}
        gscPositions={gscPositions}
        proposal={proposal}
        initialView={VIEWS.includes(vista as SeoView) ? (vista as SeoView) : "resumen"}
      >
        <div id="google-detalle" className="skw-detail">
          {gscContent}
        </div>
      </SeoTracking>
    );
  }

  /* «Instrumento» (CONSOLE-INSTRUMENTO-1 F6b, log §364): new chrome around
     the same data, tracking and Search Console blocks. */
  return (
    <div className="ins">
      <Motion id={`search-console:${projectId}`}>
        <div className="page sc-gsc">
          <div className="eyebrow bare">
            Posición en Google · <span className="mono" style={{ letterSpacing: 0, textTransform: "none" }}>{project.domain}</span>
          </div>
          <div className="pr-hd">
            <h1>Posición en Google</h1>
            {state.kind === "ready" && (
              <span className="btn line sm gsc-on">
                <span className="gsc-live" aria-hidden="true" />
                Search Console conectado · últimos 28 días
              </span>
            )}
          </div>
          <p className="lead">En qué puesto sales en Google, para qué búsquedas y qué hacer para subir.</p>
          <div className="gsc-page">
            <div className="gsc-screen">
              <GscOutcome code={gsc} />
              {seoContent}
            </div>
          </div>
        </div>
      </Motion>
    </div>
  );
}
