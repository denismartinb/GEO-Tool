import Link from "next/link";
import type { CSSProperties } from "react";
import { Ic } from "@/components/ins/ic";
import type { AiReadCard } from "@/lib/web-audit/ai-view";
import type { RenderKind } from "@/lib/web-audit/ai-render";

/**
 * «Lo que lee la IA» on Visión general (AI-READ-2, log §451; redesign
 * AI-READ-OVERVIEW-2, log §461). Tick ring with the lost share in warm,
 * one tile per kind of content with ten blocks, the literal sentence that
 * does not arrive and where the biggest gap is. Every figure comes from
 * `aiReadCard` (`lib/web-audit/ai-view.ts`), the same model as the Auditoría
 * GEO block. Approved mockup: docs/design-reference/agents-browser-1/maqueta-v3.html
 * (template `v-ov`).
 */

const KIND_ICON: Record<RenderKind, string> = { price: "c-card", faq: "c-help", review: "users", spec: "list" };
const ENGINES = ["ChatGPT", "Claude", "Perplexity"];

function PctRing({ value, big, sub }: { value: number; big: string; sub: string }) {
  const v = Math.max(0, Math.min(100, value));
  const on = Math.round(v * 0.6);
  return (
    <svg className="tring dial" viewBox="0 0 120 120" role="img" aria-label={`${big} ${sub}`}>
      {Array.from({ length: 60 }, (_, i) => {
        const a = ((-90 + i * 6) * Math.PI) / 180;
        return (
          <line
            key={i}
            className={`t${i < on ? " on" : v > 0 ? " lost" : ""}`}
            style={{ "--d": `${i * 12}ms` } as CSSProperties}
            x1={(60 + 44 * Math.cos(a)).toFixed(1)}
            y1={(60 + 44 * Math.sin(a)).toFixed(1)}
            x2={(60 + 54 * Math.cos(a)).toFixed(1)}
            y2={(60 + 54 * Math.sin(a)).toFixed(1)}
          />
        );
      })}
      <text x="60" y="64" textAnchor="middle" style={{ font: "300 30px var(--font)", fill: "var(--ink)", letterSpacing: "-.04em" }}>
        {big}
      </text>
      <text x="60" y="80" textAnchor="middle" style={{ font: "500 10px var(--font)", fill: "var(--ink-3)" }}>
        {sub}
      </text>
    </svg>
  );
}

function Blocks({ value }: { value: number }) {
  const on = Math.round(Math.max(0, Math.min(100, value)) / 10);
  return (
    <span className="aio-blocks" aria-hidden="true">
      {Array.from({ length: 10 }, (_, i) => (
        <i key={i} className={i < on ? undefined : "x"} style={{ "--d": `${i * 40}ms` } as CSSProperties} />
      ))}
    </span>
  );
}

function Engines() {
  return (
    <div className="aio-who">
      {ENGINES.map((e) => (
        <span key={e}>
          <i />
          {e}
        </span>
      ))}
    </div>
  );
}

type Filled = Extract<AiReadCard, { kind: "card" }>;

/** The right column only exists when it has something to say; otherwise the tiles take its place. */
function hasSide(card: Filled): boolean {
  return card.items.length > 0 || Boolean(card.where) || Boolean(card.split);
}

/** How much arrives per kind of page: label, figure and a thin bar, warm below 86%. */
function Split({ title, lines }: { title: string; lines: Array<{ label: string; pct: number }> }) {
  return (
    <div className="aio-split">
      <span className="aio-lab">{title}</span>
      {lines.map((l) => (
        <div key={l.label} className={`aio-sl${l.pct <= 85 ? " warm" : ""}`}>
          <span className="l">{l.label}</span>
          <b className="num">{l.pct}%</b>
          <span className="bar" aria-hidden="true">
            <i style={{ width: `${Math.max(0, Math.min(100, l.pct))}%` }} />
          </span>
        </div>
      ))}
    </div>
  );
}

export function AiReadOverviewCard({ card, href }: { card: AiReadCard; href: string }) {
  if (card.kind === "hidden") return null;
  return (
    <section className="sec" aria-label="Lo que lee la IA">
      <div className="card aio">
        <div className="card-h">
          <h3>Lo que lee la IA</h3>
          <span className="new">Nuevo</span>
          {card.kind === "card" ? (
            <Link className="see" href={href}>
              Ver todo
              <Ic n="chevr" sm />
            </Link>
          ) : null}
        </div>
        <div className="card-b">
          {card.kind === "measuring" ? (
            <div className="aio-grid">
              <div className="aio-hero">
                <div className="aio-gauge">
                  <PctRing value={0} big="–" sub="midiendo" />
                  <p className="aio-hl">Estamos abriendo tu web con un navegador, como una persona.</p>
                </div>
                <p className="aio-sub">
                  En cuanto termine verás qué parte de tu contenido no le llega a ChatGPT, Claude y Perplexity.
                </p>
              </div>
              <div className="aio-scan" aria-hidden="true">
                <div className="lines">
                  <i />
                  <i />
                  <i />
                  <i />
                  <i />
                </div>
                <div className="beam" />
              </div>
            </div>
          ) : (
            <div
              className={`aio-grid${hasSide(card) ? "" : " solo"}`}
              style={{ "--n": Math.max(1, card.rows.length) } as CSSProperties}
            >
              <div className="aio-hero">
                <div className="aio-gauge">
                  <PctRing value={card.pct} big={`${card.pct}%`} sub="llega" />
                  <div>
                    <p className="aio-hl">{card.headline}</p>
                    {card.delta !== null ? (
                      <span className={`aio-delta${card.delta < 0 ? " neg" : ""}`}>
                        <Ic n={card.delta < 0 ? "arrowdown" : "arrowup"} sm />
                        {`${card.delta > 0 ? "+" : "\u2212"}${Math.abs(card.delta)} desde la última medida`}
                      </span>
                    ) : null}
                  </div>
                </div>
                <p className="aio-sub">{card.sub}</p>
                <Engines />
              </div>
              {card.rows.length > 0 ? (
                <div className="aio-kinds">
                  {card.rows.map((r) => (
                    <div key={r.kind} className={`aio-kind${r.lost ? " lost" : ""}`}>
                      <div className="kt">
                        <span className="ic">
                          <Ic n={KIND_ICON[r.kind]} sm />
                        </span>
                        <b>{r.label}</b>
                        <em className="num">{r.reachPct}%</em>
                      </div>
                      <Blocks value={r.reachPct} />
                      <small>{r.reachPct >= 100 ? "Llega entero" : `Se pierde el ${100 - r.reachPct}%`}</small>
                    </div>
                  ))}
                </div>
              ) : null}
              {hasSide(card) ? (
                <div className="aio-lost">
                  {card.items.length > 0 ? <span className="aio-lab">{card.title}</span> : null}
                  {card.items.map((it) => (
                    <Link key={it.text} className="aio-li" href={href}>
                      <span className="r">
                        <i className={`sd${it.tone === "ok" ? " ok" : ""}`} />
                        <span>{it.text}</span>
                        <Ic n="chevr" sm />
                      </span>
                      {it.quote ? <span className="aio-quote">{it.quote}</span> : null}
                    </Link>
                  ))}
                  {card.split ? <Split title={card.split.title} lines={card.split.lines} /> : null}
                  {card.where ? (
                    <div className="aio-where">
                      <Ic n="c-target" sm />
                      {card.where}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
