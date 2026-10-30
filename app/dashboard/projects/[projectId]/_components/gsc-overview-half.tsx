import { GoogleMark } from "@/components/search-console/google-mark";
import { loadSearchConsoleOverview, type SearchConsoleOverview } from "@/lib/search-console/load";
import { GscConnectPanel } from "./gsc-connect-invite";
import { fmtDeltaPct, fmtInt, fmtPosition } from "../search-console/_components/format";

/**
 * The Google half of Visión general's Auditoría SEO card (SEARCH-SEO-1 Fase
 * 3, log §284; design: the "Buscadores" card of
 * docs/design-reference/search-seo-1/maqueta.html). The invitation to connect
 * is GSC-CONNECT-CTA-1 (log §313). Clicks and average
 * position of the last 28 days, and how many searches sit on Google's page 2.
 *
 * «Instrumento» layout (log §352): the second column of the SEO card's grid.
 * Rendered inside a Suspense boundary so Google's latency never holds up the
 * rest of the Overview. Not connected → an invitation to connect. Feature not
 * configured or table missing → nothing (the page does not even open the
 * column). Google failing or answering with no searches → the column says so
 * instead of a number we could not read.
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

function Head() {
  return (
    <div className="k">
      <GoogleMark size={13} />
      Google · 28 días
    </div>
  );
}

/** Same column, same height, while Google answers. */
export function GscOverviewHalfSkeleton() {
  return (
    <div aria-busy="true">
      <Head />
      <div className="bv">
        <span className="ins-skel-line" style={{ width: 120, height: 32 }} />
      </div>
      <div className="trio">
        <span className="ins-skel-line" style={{ width: 70, height: 30 }} />
        <span className="ins-skel-line" style={{ width: 70, height: 30 }} />
      </div>
    </div>
  );
}

export function GscOverviewHalfView({ projectId, state }: { projectId: string; state: SearchConsoleOverview }) {
  if (state.kind === "disconnected" || state.kind === "reconnect") {
    return (
      <div>
        <Head />
        {/* GSC-CONNECT-CTA-1 (log §313): a panel with what Google adds, and a
            button straight to Google's consent screen. */}
        <GscConnectPanel projectId={projectId} state={state.kind} />
      </div>
    );
  }
  if (state.kind === "error") {
    return (
      <div>
        <Head />
        <p className="ov-note" style={{ marginTop: 10 }}>
          Google no ha respondido ahora mismo. Se volverá a leer en la próxima visita.
        </p>
      </div>
    );
  }
  if (state.kind !== "ready") return null;
  if (state.report.empty) {
    return (
      <div>
        <Head />
        <p className="ov-note" style={{ marginTop: 10 }}>
          Google no ha devuelto búsquedas de tu web en estos 28 días.
        </p>
      </div>
    );
  }

  const { clicks, position, nearPage1 } = state.report;
  const pct = clicks.deltaPct;
  return (
    <div>
      <Head />
      <div className="bv num">
        {fmtInt(clicks.value)}
        <small> clics</small>
      </div>
      <div className="trio">
        <span>
          <b className="num">{position.value === null ? "—" : fmtPosition(position.value)}</b>
          Puesto medio
        </span>
        {nearPage1.length > 0 ? (
          <span>
            <b className="num">{nearPage1.length}</b>
            {nearPage1.length === 1 ? "búsqueda en página 2" : "búsquedas en página 2"}
          </span>
        ) : null}
        {pct !== null && Math.round(pct) !== 0 ? (
          <span>
            <b className="num">{fmtDeltaPct(pct)}</b>
            clics vs. 28 días antes
          </span>
        ) : null}
      </div>
    </div>
  );
}
