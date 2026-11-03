import { Ic } from "@/components/ins/ic";
import {
  NAV_AGENTS,
  NAV_STATE_LINE,
  READ_AGENTS,
  type AgentLanes,
  type Brake,
  type Lane,
  type LaneStation
} from "@/lib/agentic-audit/agent-lanes";
import type { Tone } from "@/lib/agentic-audit/console-model";

/**
 * AGENTS-BROWSER-1 (log §453): «Hasta dónde llega cada agente» and «Lo que se
 * encuentra un agente que navega», from the approved mockup
 * (`docs/design-reference/agents-browser-1/`). Every word comes from
 * `lib/agentic-audit/agent-lanes.ts`; this only lays it out. Server
 * component: the moving dot is CSS and stands still with reduced motion.
 */

const STATION_ICON: Record<Tone, string> = { ok: "check", warn: "warn", bad: "x", na: "c-dot" };
const REACH_PCT = [12.5, 37.5, 62.5, 87.5];

/** How far the dot runs: to the last station before the first one that stops the agent. */
function runTo(stations: LaneStation[]): number {
  if (stations.every((s) => s.tone === "na")) return -1;
  const stop = stations.findIndex((s) => s.tone === "bad");
  return stop === -1 ? stations.length - 1 : stop - 1;
}

function LaneRow({ kind, title, who, lane, gate }: { kind: "read" | "nav"; title: string; who: string; lane: Lane; gate: boolean }) {
  const to = runTo(lane.stations);
  const run = to < 0 ? 0 : to * 25;
  return (
    <div className={`agl-lane agl-${kind}`}>
      <div className="agl-lane-h">
        <span className="agl-av">
          <Ic n={kind === "read" ? "notes" : "agent"} />
        </span>
        <span className="agl-who">
          <b>{title}</b>
          <small>{who}</small>
        </span>
        <span className={`agx-pill ${lane.reach.tone}`}>{lane.reach.label}</span>
      </div>
      <div className="agl-track" style={{ ["--w" as string]: `${run}%`, ["--l" as string]: `${to < 0 ? 12.5 : REACH_PCT[to]}%` }}>
        <span className="agl-rail" aria-hidden="true" />
        <span className="agl-run" aria-hidden="true" />
        {to >= 0 ? <span className="agl-bot" aria-hidden="true" /> : null}
        {gate ? <span className="agl-gate">cookies</span> : null}
        {lane.stations.map((s, i) => (
          <div key={s.id} className={`agl-stn ${s.tone}${to >= 0 && i > to ? " dim" : ""}`}>
            <span className="agl-dot">
              <Ic n={STATION_ICON[s.tone]} sm />
            </span>
            <b>{s.title}</b>
            <small>{s.line}</small>
          </div>
        ))}
      </div>
    </div>
  );
}

function BrakeCard({ kind, brake }: { kind: "read" | "nav"; brake: Brake }) {
  return (
    <div className={`agl-brake agl-${kind}`}>
      <span className="agl-brake-ic">
        <Ic n={kind === "read" ? "notes" : "agent"} />
      </span>
      <div>
        <span className="agl-k">{kind === "read" ? "Frena a los que leen" : "Frena a los que navegan"}</span>
        <b>{brake.title}</b>
        <p>{brake.line}</p>
      </div>
    </div>
  );
}

export function AgentLanesCard({ lanes }: { lanes: AgentLanes }) {
  const gate = lanes.navState === "measured" && Boolean(lanes.window?.cookies);
  return (
    <div className="card agl">
      <div className="card-h">
        <h3>Hasta dónde llega cada agente</h3>
      </div>
      <div className="card-b">
        <p className="agl-lead">
          Los agentes no recorren tu web igual. Los que leen sin navegador dependen de lo que llega en el HTML. Los que navegan
          como una persona ven tu web entera, pero se paran ante lo que también pararía a una persona con prisa.
        </p>
        <div className="agl-lanes">
          <LaneRow kind="read" title="Agentes que leen" who={READ_AGENTS} lane={lanes.read} gate={false} />
          <LaneRow kind="nav" title="Agentes que navegan" who={NAV_AGENTS} lane={lanes.nav} gate={gate} />
        </div>
        {lanes.navState !== "measured" ? <p className="agl-note">{NAV_STATE_LINE[lanes.navState]}</p> : null}
        {lanes.readBrake || lanes.navBrake ? (
          <div className="agl-brakes">
            {lanes.readBrake ? <BrakeCard kind="read" brake={lanes.readBrake} /> : null}
            {lanes.navBrake ? <BrakeCard kind="nav" brake={lanes.navBrake} /> : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function BrowserFindsCard({ lanes }: { lanes: AgentLanes }) {
  const w = lanes.window;
  if (lanes.navState !== "measured" || !w) return null;
  const pin = new Map(lanes.obstacles.filter((o) => o.tone !== "ok").map((o, i) => [o.id, { n: i + 1, tone: o.tone }]));
  const Pin = ({ id }: { id: string }) => {
    const p = pin.get(id as never);
    return p ? <span className={`agl-pn ${p.tone}`}>{p.n}</span> : null;
  };
  let path = w.url;
  try {
    const u = new URL(w.url);
    path = u.hostname.replace(/^www\./, "") + u.pathname;
  } catch {
    /* keep the stored url */
  }
  return (
    <div className="card agl-finds">
      <div className="card-h">
        <h3>Lo que se encuentra un agente que navega</h3>
      </div>
      <div className="card-b">
        <p className="agl-lead">
          Abrimos tu página con un navegador real, como Grok Bot o Instinct. Para ellos el JavaScript no es problema: lo que
          cuenta es lo que hay delante de lo que vendes.
        </p>
        <div className="agl-fx">
          <div className="agl-bw" aria-hidden="true">
            <div className="agl-bw-bar">
              <i />
              <i />
              <i />
              <span>{path}</span>
            </div>
            <div className="agl-bw-body">
              <div className="agl-bw-img" />
              <div className="agl-bw-tx">
                {w.name ? <b>{w.name}</b> : <span className="agl-ln" style={{ width: "70%" }} />}
                {w.price ? (
                  <span className="agl-pr">
                    {w.price} <Pin id="price" />
                  </span>
                ) : (
                  <span className="agl-pr miss">
                    Sin precio <Pin id="price" />
                  </span>
                )}
                {w.options ? (
                  <span className="agl-sel">
                    Opciones <Pin id="options" />
                  </span>
                ) : null}
                {w.buy ? (
                  <span className="agl-buy">{w.buy}</span>
                ) : (
                  <span className="agl-buy miss">
                    Sin botón <Pin id="buy" />
                  </span>
                )}
                <span className="agl-ln" style={{ width: "92%" }} />
                <span className="agl-ln" style={{ width: "64%" }} />
              </div>
              {w.cookies ? (
                <div className="agl-ck">
                  <Pin id="cookies" />
                  <p>Aviso de cookies</p>
                  <span>Aceptar</span>
                </div>
              ) : null}
            </div>
          </div>
          <ul className="agl-obs">
            {lanes.obstacles.map((o) => (
              <li key={o.id} className={o.tone}>
                {o.tone === "ok" ? (
                  <span className="agl-pn ok">
                    <Ic n="check" sm />
                  </span>
                ) : (
                  <span className={`agl-pn ${o.tone}`}>{pin.get(o.id)?.n}</span>
                )}
                <div>
                  <span className="agl-st">{o.word}</span>
                  <b>{o.title}</b>
                  <small>{o.line}</small>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <p className="agl-honest">Lo vimos al abrir la página, sin pulsar nada. Si un reto anti-bots nos para, no lo contamos en contra.</p>
      </div>
    </div>
  );
}
