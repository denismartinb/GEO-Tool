import Link from "next/link";
import { loadSearchConsoleOverview, type SearchConsoleOverview } from "@/lib/search-console/load";
import { fmtDeltaPct, fmtInt, fmtPosition } from "../search-console/_components/format";

/**
 * The Google half of Visión general's Auditoría SEO card (SEARCH-SEO-1 Fase
 * 3, log §283; design: the "Buscadores" card of
 * docs/design-reference/search-seo-1/maqueta.html). Clicks and average
 * position of the last 28 days, and how many searches sit on Google's page 2.
 *
 * Rendered inside a Suspense boundary so Google's latency never holds up the
 * rest of the Overview. Not connected → an invitation to connect. Feature not
 * configured, table missing or Google failing → nothing: a button that cannot
 * work, or a number we could not read, is worse than no half at all.
 */
export async function GscOverviewHalf({
  projectId,
  ownerUserId,
  domain
}: {
  projectId: string;
  ownerUserId: string;
  domain: string;
}) {
  const state = await loadSearchConsoleOverview(projectId, ownerUserId, domain);
  return <GscOverviewHalfView projectId={projectId} state={state} />;
}

export function GscOverviewHalfView({ projectId, state }: { projectId: string; state: SearchConsoleOverview }) {
  const screen = `/dashboard/projects/${projectId}/search-console`;
  if (state.kind === "disconnected" || state.kind === "reconnect") {
    return (
      <div className="ov2-gsc">
        <div className="ov2-gsc-h">
          <b>Google · últimos 28 días</b>
          <span>Search Console</span>
        </div>
        <div className="ov2-gsc-cta">
          <p>
            {state.kind === "reconnect"
              ? "La conexión con Search Console se ha perdido. Vuelve a conectar para ver tus clics y tu puesto en Google."
              : "Conecta tu Search Console para ver tus clics, tu puesto en Google y las búsquedas a un paso de la página 1."}
          </p>
          <Link href={screen} className="btn btn-ghost btn-sm">
            {state.kind === "reconnect" ? "Volver a conectar" : "Conectar Search Console"}
          </Link>
        </div>
      </div>
    );
  }
  if (state.kind !== "ready" || state.report.empty) return null;

  const { clicks, position, nearPage1 } = state.report;
  const pct = clicks.deltaPct;
  const posDelta = position.delta;
  return (
    <div className="ov2-gsc">
      <div className="ov2-gsc-h">
        <b>Google · últimos 28 días</b>
        <span>Search Console</span>
      </div>
      <div className="ov2-gsc-mini">
        <div className="ov2-gsc-gm">
          <div className="k">Clics</div>
          <div className="v">{fmtInt(clicks.value)}</div>
          {pct !== null && Math.round(pct) !== 0 && (
            <div className={`d ${pct > 0 ? "gsc-up" : "gsc-down"}`}>{fmtDeltaPct(pct)}</div>
          )}
        </div>
        <div className="ov2-gsc-gm">
          <div className="k">Puesto medio</div>
          <div className="v">{position.value === null ? "—" : fmtPosition(position.value)}</div>
          {posDelta !== null && posDelta !== 0 && (
            <div className={`d ${posDelta > 0 ? "gsc-up" : "gsc-down"}`}>
              {posDelta > 0 ? "▲" : "▼"} {fmtPosition(Math.abs(posDelta))}
            </div>
          )}
        </div>
      </div>
      {nearPage1.length > 0 && (
        <Link href={screen} className="ov2-gsc-near">
          <span className="nn">{nearPage1.length}</span>
          <p>
            <b>{nearPage1.length === 1 ? "búsqueda a un paso" : "búsquedas a un paso"} de la página 1</b>. Son las más baratas
            de subir. <em>Verlas →</em>
          </p>
        </Link>
      )}
    </div>
  );
}
