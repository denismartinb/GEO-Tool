"use client";

import { useMemo, useState } from "react";
import { Ic } from "@/components/ins/ic";
import { EngineLogo } from "@/components/ins/kit/engine";
import { buildAiBotsRobotsBlock } from "@/lib/web-audit/ai-bots";

/**
 * AI-BOTS-CONSOLE-1 (log §426): the WordPress plugin's «Bots de IA» in the
 * console. Who can read the site (one tile per engine), the six switches by
 * engine and use, and, since the console cannot write robots.txt, the block
 * to paste. Every state comes from the audit; the switches only build text.
 */

export type AiBotsEngineTile = {
  engine: string;
  name: string;
  state: boolean | null;
  hint: string | null;
  /** GEO-ALERTS-1 (log §440): robots.txt lets it in, our simulation says the server refuses it. */
  serverBlocked?: boolean;
  /**
   * EXT-1.5.0 (log §446): the extension's «¿Te deja pasar el servidor?» in the
   * console. robots.txt and what the server answered our probe as this
   * engine's search bot. `server` null: not probed (Gemini reads through
   * Googlebot, which we never impersonate, or an audit before the probe).
   */
  probe?: { robots: boolean | null; server: "allowed" | "blocked" | "unknown" | null; status: number | null };
};
export type AiBotsSwitchRow = {
  id: string;
  engine: string;
  name: string;
  what: string;
  tokens: string[];
  training: boolean;
  state: boolean | null;
};

const cellTone = (v: "allowed" | "blocked" | "unknown" | null) => (v === "allowed" ? "ok" : v === "blocked" ? "no" : "na");
function serverCell(p: NonNullable<AiBotsEngineTile["probe"]>): string {
  if (p.server === null || p.server === "unknown") return "—";
  if (p.status !== null) return String(p.status);
  return p.server === "allowed" ? "Pasa" : "Reto";
}
function shortDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("es-ES", { day: "numeric", month: "short", timeZone: "Europe/Madrid" }).replace(".", "");
  } catch {
    return "";
  }
}

export function AiBotsSection({
  engines,
  switches,
  starRules,
  robotsUrl,
  note,
  probedAt = null
}: {
  engines: AiBotsEngineTile[];
  switches: AiBotsSwitchRow[];
  /** The `*` rules to repeat; null when the snapshot cannot back a block (old or unread robots.txt). */
  starRules: string[] | null;
  robotsUrl: string;
  /** Why the states are not what the file says (unread or missing robots.txt), if so. */
  note: string | null;
  /** When the server probe ran (GEO-ALERTS-1); null without one. */
  probedAt?: string | null;
}) {
  const current = useMemo(() => Object.fromEntries(switches.map((s) => [s.id, s.state === true])), [switches]);
  const [editing, setEditing] = useState(false);
  const [want, setWant] = useState<Record<string, boolean>>(current);
  const [copied, setCopied] = useState(false);
  const canEdit = starRules !== null && switches.every((s) => s.state !== null);

  const changes = switches.filter((s) => want[s.id] !== current[s.id]);
  const block = starRules ? buildAiBotsRobotsBlock(want, starRules) : "";

  function stop() {
    setEditing(false);
    setWant(current);
    setCopied(false);
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(block);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard unavailable: the block is on screen and selectable.
    }
  }

  return (
    <section className="ab" aria-labelledby="ab-title">
      <div className="ab-main">
        <div className="card ab-card">
          <div className="ab-head">
            <h2 id="ab-title" className="ab-lab">Quién puede leer tu web</h2>
            <span className="ab-meta">
              según tu robots.txt y tu servidor
              {probedAt && <span className="ab-sim">Simulación · {shortDate(probedAt)}</span>}
            </span>
          </div>
          {note && <p className="ab-note">{note}</p>}
          <ul className="ab-tiles">
            {engines.map((e) => (
              <li
                key={e.engine}
                className="ab-tile"
                data-state={e.serverBlocked ? "no" : e.state === null ? "unknown" : e.state ? "ok" : "no"}
              >
                <EngineLogo provider={e.engine} size={26} />
                <b>{e.name}</b>
                <span className="ab-st">
                  {e.serverBlocked
                    ? "Tu servidor lo bloquea"
                    : e.state === null
                      ? "Sin comprobar"
                      : e.state
                        ? "Puede leerla"
                        : "Bloqueado"}
                </span>
                {e.serverBlocked ? <small>Simulación · suele ser Cloudflare o el cortafuegos</small> : e.hint && <small>{e.hint}</small>}
                {probedAt && e.probe && (
                  <span className="ab-pr">
                    <span>
                      robots.txt <em data-v={cellTone(e.probe.robots === null ? null : e.probe.robots ? "allowed" : "blocked")}>{e.probe.robots === null ? "—" : e.probe.robots ? "Permite" : "Bloquea"}</em>
                    </span>
                    <span>
                      Servidor <em data-v={cellTone(e.probe.server)}>{serverCell(e.probe)}</em>
                    </span>
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>

        <div className="card ab-card">
          <div className="ab-head">
            <h2 className="ab-lab">Bots de IA</h2>
            {canEdit &&
              (editing ? (
                <button type="button" className="btn line sm" onClick={stop}>
                  Dejarlo como está
                </button>
              ) : (
                <button type="button" className="btn line sm" onClick={() => setEditing(true)}>
                  Cambiar acceso
                </button>
              ))}
          </div>
          <ul className="ab-rows">
            {switches.map((s) => {
              const on = want[s.id];
              const changed = editing && on !== current[s.id];
              return (
                <li key={s.id} className="ab-row">
                  <EngineLogo provider={s.engine} size={18} />
                  <span className="ab-tx">
                    <span>
                      <b>{s.name}</b> · {s.what}
                    </span>
                    <span className="ab-tok">{s.tokens.join(", ")}</span>
                  </span>
                  {changed && <span className="ab-chg">Cambio</span>}
                  {editing ? (
                    <button
                      type="button"
                      role="switch"
                      aria-checked={on}
                      aria-label={`${s.name}, ${s.what}`}
                      className="ab-sw"
                      onClick={() => {
                        setWant((w) => ({ ...w, [s.id]: !w[s.id] }));
                        setCopied(false);
                      }}
                    >
                      <i />
                    </button>
                  ) : (
                    <span className="ab-pill" data-state={pillState(s)}>
                      {pillText(s)}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
          <p className="ab-hint">
            Los bots de búsqueda deciden si los motores pueden leerte y citarte. Cerrar los de entrenamiento es decisión
            tuya y no te quita de las respuestas con búsqueda.
          </p>
          <p className="ab-hint ab-hint-2">
            Cuando un agente entra a comprar por alguien (Muse, Dots, el agente de Gemini), no consulta robots.txt: lo que
            lo frena es tu protección anti-bots. Lo verás en Visibilidad en agentes.
          </p>
        </div>
      </div>

      {editing && (
        <div className="card ab-card ab-out">
          <h2 className="ab-lab">Tu robots.txt con estos cambios</h2>
          {changes.length === 0 ? (
            <p className="ab-p">Mueve un interruptor y aquí aparecen las líneas para tu robots.txt.</p>
          ) : (
            <>
              <p className="ab-p">
                {changes
                  .map((s) => `${want[s.id] ? "Abrir" : "Cerrar"} ${s.name} (${s.training ? "entrenamiento" : "búsqueda"})`)
                  .join(" · ")}
                . Copia el bloque entero: repite tus reglas generales para que ningún bot entre donde no debe.
              </p>
              <pre className="ab-pre">{block}</pre>
              <div className="ab-acts">
                <button type="button" className="btn blue" onClick={copy}>
                  <Ic n="copy" sm /> {copied ? "Copiado" : "Copiar"}
                </button>
                <a className="btn line" href={robotsUrl} target="_blank" rel="noopener noreferrer">
                  Ver tu robots.txt
                </a>
              </div>
              <ol className="ab-steps">
                <li>Abre el robots.txt de la raíz de tu web (o pásaselo a quien la gestiona).</li>
                <li>Borra los grupos que ya tengas para estos bots y pega el bloque.</li>
                <li>Lo demás se queda como está. Lo comprobamos en la próxima revisión.</li>
              </ol>
            </>
          )}
        </div>
      )}
    </section>
  );
}

function pillState(s: AiBotsSwitchRow): string {
  if (s.state === null) return "unknown";
  if (s.state) return "open";
  return s.training ? "mine" : "closed";
}

function pillText(s: AiBotsSwitchRow): string {
  if (s.state === null) return "Sin comprobar";
  if (s.state) return "Abierto";
  return s.training ? "Cerrado, decisión tuya" : "Cerrado";
}
