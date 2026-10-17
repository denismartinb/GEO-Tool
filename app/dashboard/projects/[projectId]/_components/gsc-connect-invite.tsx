import { Icon } from "@/components/ui/icon";
import { GoogleMark } from "@/components/search-console/google-mark";

/**
 * GSC-CONNECT-CTA-1 (log §313, design: docs/design-reference/gsc-connect-cta-1/,
 * proposal A). The invitation to connect Search Console, where its data
 * would appear: the Google half of Visión general's SEO card and the
 * «Con tus datos de Google» row of Recomendaciones. Only rendered while the
 * project is disconnected or has lost its connection; never with example
 * numbers, which would be fake metrics.
 *
 * The button goes straight to Google's consent screen
 * (`/api/search-console/connect`), which verifies ownership itself and
 * returns to «Posición en Google» to pick the property. A plain <a>, not
 * next/link: it leaves the app.
 */
export type ConnectInviteState = "disconnected" | "reconnect";

export function gscConnectHref(projectId: string) {
  return `/api/search-console/connect?projectId=${projectId}`;
}

// Copy by the founder (2026-10-17, log §313).
const GAINS = [
  "En qué puesto sales para cada búsqueda.",
  "Recomendaciones para mejorar en IA y SEO.",
  "Posicionamiento de prompts SEO y GEO."
];

function ConnectButton({ projectId, state }: { projectId: string; state: ConnectInviteState }) {
  return (
    <a className="gsc-invite-btn" href={gscConnectHref(projectId)} rel="nofollow">
      <span className="gsc-invite-g">
        <GoogleMark size={14} />
      </span>
      {state === "reconnect" ? "Volver a conectar" : "Conectar con Google"}
    </a>
  );
}

/** Visión general: the panel inside the Google half of the SEO card. */
export function GscConnectPanel({ projectId, state }: { projectId: string; state: ConnectInviteState }) {
  return (
    <div className="gsc-invite">
      <h4>{state === "reconnect" ? "Se ha perdido la conexión con Google" : "Añade lo que ve Google"}</h4>
      {state === "reconnect" && <p>Vuelve a conectar Search Console para seguir viendo:</p>}
      <ul>
        {GAINS.map((g) => (
          <li key={g}>{g}</li>
        ))}
      </ul>
      <div className="gsc-invite-row">
        <ConnectButton projectId={projectId} state={state} />
        <span className="gsc-invite-fine">Acceso de solo lectura</span>
      </div>
    </div>
  );
}

/** Recomendaciones: the «Con tus datos de Google» row, before any card exists. */
export function GscConnectRow({ projectId, state }: { projectId: string; state: ConnectInviteState }) {
  return (
    <section className="grec" aria-labelledby="grec-invite-title">
      <div className="grec-head" id="grec-invite-title">
        <span className="rec2-src rec2-src-g">
          <Icon name="search" size={11} />
          Google
        </span>
        Con tus datos de Google
        <span className="grec-head-sub">Search Console</span>
      </div>
      <div className="gsc-invite-slot">
        <div className="gsc-invite-slot-txt">
          <h4>
            {state === "reconnect"
              ? "Vuelve a conectar Google para recibir sus recomendaciones"
              : "Recomendaciones para mejorar en Google"}
          </h4>
          <p>
            Conecta Search Console y te diremos qué búsquedas subir a la página 1 y qué información tienes que
            optimizar.
          </p>
          <div className="gsc-invite-kinds">
            <span>Subir a la página 1</span>
            <span>SEO + GEO</span>
            <span>Vigilar keywords en la IA</span>
            <span>Posicionamiento global</span>
          </div>
        </div>
        <ConnectButton projectId={projectId} state={state} />
      </div>
    </section>
  );
}
