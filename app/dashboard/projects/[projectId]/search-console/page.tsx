import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { requireActiveProject } from "@/lib/project-workspace";
import { projectScreenMetadata } from "@/lib/seo/console-metadata";
import { loadSearchConsoleScreen } from "@/lib/search-console/load";
import { propertyLabel } from "@/lib/search-console/property";
import { readSearchConsoleInputs } from "@/lib/search-console/screen-inputs";
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

export async function generateMetadata({ params }: { params: Promise<{ projectId: string }> }): Promise<Metadata> {
  const { projectId } = await params;
  return projectScreenMetadata("Posición en Google", async () => (await requireActiveProject(projectId)).domain);
}

export default async function SearchConsolePage({
  params,
  searchParams
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ gsc?: string }>;
}) {
  const [{ projectId }, { gsc }] = await Promise.all([params, searchParams]);
  const project = await requireActiveProject(projectId);
  const { supabase, user } = await requireUser();

  const { auditedPages, trackedPrompts } = await readSearchConsoleInputs(supabase, projectId);

  const state = await loadSearchConsoleScreen(projectId, user.id, project.domain, auditedPages, trackedPrompts);
  const connectHref = `/api/search-console/connect?projectId=${projectId}`;
  const auditHref = `/dashboard/projects/${projectId}/web-audit?${AUDIT_BLOCK_PARAM}=seo`;

  return (
    <div className="page">
      <div className="ov-sticky-header">
        <div className="ov-sticky-left">
          <div>
            <p className="kicker" style={{ marginBottom: 2 }}>Posición en Google</p>
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
        {state.kind === "ready" && (
          <div className="ov-sticky-right">
            <span className="gsc-chip">
              <span className="gsc-live" aria-hidden="true" />
              <span className="gsc-chip-full">Search Console conectado · últimos 28 días</span>
              <span className="gsc-chip-compact">Últimos 28 días</span>
            </span>
          </div>
        )}
      </div>

      <div className="gsc-page">
        <div className="gsc-screen">
          <div className="gsc-intro">
            <p>En qué puesto sales en Google, para qué búsquedas y qué hacer para subir.</p>
          </div>
          <GscOutcome code={gsc} />

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
                  <h3>Búsquedas en la página 2 de Google</h3>
                  <span className="sa-src">Cada punto es una búsqueda</span>
                </div>
                <NearPageOneScatter queries={state.report.queries} />
                <p className="sa-note" style={{ marginTop: 8, marginBottom: 0 }}>
                  {state.report.nearPage1.length > 0
                    ? "Las búsquedas de la franja azul están en la página 2 (puestos 11 a 20). Son las más fáciles de subir a la primera: ahí está tu mejor oportunidad a corto plazo."
                    : "Ahora mismo no tienes búsquedas en la página 2 de Google."}
                </p>
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
        </div>
      </div>
    </div>
  );
}
