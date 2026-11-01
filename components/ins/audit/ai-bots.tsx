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

export type AiBotsEngineTile = { engine: string; name: string; state: boolean | null; hint: string | null };
export type AiBotsSwitchRow = {
  id: string;
  engine: string;
  name: string;
  what: string;
  tokens: string[];
  training: boolean;
  state: boolean | null;
};

export function AiBotsSection({
  engines,
  switches,
  starRules,
  robotsUrl,
  note
}: {
  engines: AiBotsEngineTile[];
  switches: AiBotsSwitchRow[];
  /** The `*` rules to repeat; null when the snapshot cannot back a block (old or unread robots.txt). */
  starRules: string[] | null;
  robotsUrl: string;
  /** Why the states are not what the file says (unread or missing robots.txt), if so. */
  note: string | null;
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
            <span className="ab-meta">según tu robots.txt</span>
          </div>
          {note && <p className="ab-note">{note}</p>}
          <ul className="ab-tiles">
            {engines.map((e) => (
              <li key={e.engine} className="ab-tile" data-state={e.state === null ? "unknown" : e.state ? "ok" : "no"}>
                <EngineLogo provider={e.engine} size={26} />
                <b>{e.name}</b>
                <span className="ab-st">{e.state === null ? "Sin comprobar" : e.state ? "Puede leerla" : "Bloqueado"}</span>
                {e.hint && <small>{e.hint}</small>}
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
