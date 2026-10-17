import type { CSSProperties } from "react";

/**
 * AGENTIC-POSTS-1 (log §316): diagramas de los artículos de comercio agéntico.
 *
 * Misma política que `animations.tsx` (log §314): cada diagrama explica un
 * concepto del artículo con su propio texto, nunca adorna. Todo es HTML real
 * (se lee, se traduce y se copia), la animación es CSS pura y en bucle lento,
 * y con `prefers-reduced-motion: reduce` se quedan quietos en un fotograma que
 * cuenta la historia entera (`app/globals.css`, bloque `.art-dg-*`).
 *
 * No hay logotipos ni imágenes de terceros: los avatares son iniciales sobre
 * la paleta de la casa, para no usar marcas ajenas sin permiso.
 */

type Vars = CSSProperties & Record<`--${string}`, string | number>;

export type FlowStep = {
  /** Quién hace el paso («Tú», «El agente», «Tu tienda»). */
  who?: string;
  title: string;
  /** Dónde suele pararse un agente en este paso. Se pinta como aviso. */
  stop?: string;
  /** Paso que el artículo quiere señalar (borde cian y nota). */
  key?: string;
};

export type FlowLane = { label?: string; steps: FlowStep[] };

/**
 * Pasos en fila, con un punto que los recorre de izquierda a derecha. Una o
 * varias calles: con dos se compara el mismo recorrido hecho por una persona
 * y por un agente. Bajo 760 px las calles pasan a columna.
 */
export function StepFlow({ lanes }: { lanes: FlowLane[] }) {
  return (
    <div className="art-anim art-dg-flow">
      {lanes.map((lane, li) => (
        <div
          key={li}
          className="art-dg-lane"
          style={{ "--n": lane.steps.length } as Vars}
        >
          {lane.label ? (
            <div className="art-dg-lane-l">{lane.label}</div>
          ) : null}
          <div className="art-dg-steps">
            <span className="art-dg-track" aria-hidden="true">
              <span className="art-dg-token" />
            </span>
            <ol>
              {lane.steps.map((s, i) => (
                <li
                  key={i}
                  className={s.key ? "art-dg-step is-key" : "art-dg-step"}
                  style={{ "--i": i } as Vars}
                >
                  <span className="art-dg-node" aria-hidden="true">
                    {i + 1}
                  </span>
                  <span className="art-dg-body">
                    {s.who ? <span className="art-dg-who">{s.who}</span> : null}
                    <span className="art-dg-title">{s.title}</span>
                    {s.key ? <span className="art-dg-key">{s.key}</span> : null}
                    {s.stop ? (
                      <span className="art-dg-stop">
                        <span className="art-dg-stop-l">Aquí se para</span>
                        {s.stop}
                      </span>
                    ) : null}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      ))}
    </div>
  );
}

export type Milestone = { date: string; title: string; now?: boolean };

/** Línea de tiempo: horizontal en escritorio, vertical en móvil. */
export function Timeline({ items }: { items: Milestone[] }) {
  return (
    <div className="art-anim art-dg-time" style={{ "--n": items.length } as Vars}>
      <span className="art-dg-time-line" aria-hidden="true">
        <span className="art-dg-time-fill" />
      </span>
      <ol>
        {items.map((m, i) => (
          <li
            key={i}
            className={m.now ? "art-dg-time-i is-now" : "art-dg-time-i"}
            style={{ "--i": i } as Vars}
          >
            <span className="art-dg-time-dot" aria-hidden="true" />
            <span className="art-dg-time-d">{m.date}</span>
            <span className="art-dg-time-t">{m.title}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

export type AgentCard = {
  name: string;
  maker: string;
  talk: string;
  pay: string;
  where: string;
};

/** Ficha de cada agente, con avatar de iniciales (no su logotipo). */
export function AgentLineup({ agents }: { agents: AgentCard[] }) {
  return (
    <ul className="art-anim art-dg-agents">
      {agents.map((a, i) => (
        <li key={a.name} className="art-dg-agent" style={{ "--i": i } as Vars}>
          <div className="art-dg-agent-h">
            <span className="art-dg-avatar" aria-hidden="true">
              {a.name.slice(0, 1)}
            </span>
            <span>
              <span className="art-dg-agent-n">{a.name}</span>
              <span className="art-dg-agent-m">{a.maker}</span>
            </span>
          </div>
          <dl>
            <dt>Se le habla</dt>
            <dd>{a.talk}</dd>
            <dt>Paga con</dt>
            <dd>{a.pay}</dd>
          </dl>
          <span className="art-dg-where">{a.where}</span>
        </li>
      ))}
    </ul>
  );
}

export type Door = { who: string; verdict: string; text: string };

/**
 * Dos tiendas ante el mismo agente: una le deja llegar al pago y otra le
 * cierra la puerta. El punto del agente avanza en las dos y sólo cruza en la
 * abierta.
 */
export function TwoDoors({ open, closed }: { open: Door; closed: Door }) {
  return (
    <div className="art-anim art-dg-doors">
      {[
        { d: open, cls: "is-open" },
        { d: closed, cls: "is-closed" },
      ].map(({ d, cls }) => (
        <div key={d.who} className={`art-dg-door ${cls}`}>
          <div className="art-dg-door-h">
            <span className="art-dg-door-who">{d.who}</span>
            <span className="art-dg-door-v">{d.verdict}</span>
          </div>
          <div className="art-dg-door-scene" aria-hidden="true">
            <span className="art-dg-door-agent" />
            <span className="art-dg-door-gate" />
            <span className="art-dg-door-end">
              Pago
            </span>
          </div>
          <p className="art-dg-door-t">{d.text}</p>
        </div>
      ))}
    </div>
  );
}
