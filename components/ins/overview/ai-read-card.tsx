import Link from "next/link";
import type { CSSProperties } from "react";
import { Ic } from "@/components/ins/ic";
import { Bar } from "@/components/ins/kit/bar";
import type { AiReadCard } from "@/lib/web-audit/ai-view";

/**
 * «Lo que lee la IA» on Visión general (AI-READ-2, log §451), in the shape of
 * the Comercio agéntico card: tick ring, thin bars per kind of content and the
 * grey link box. Every figure comes from `aiReadCard` (`lib/web-audit/ai-view.ts`),
 * the same model as the Auditoría GEO block. Approved mockup:
 * docs/design-reference/ai-read-2/tarjeta-vision-general.html.
 */

function PctRing({ value, big, sub }: { value: number; big: string; sub: string }) {
  const on = Math.round(Math.max(0, Math.min(100, value)) * 0.6);
  return (
    <svg className="tring dial" viewBox="0 0 120 120" role="img" aria-label={`${big} ${sub}`}>
      {Array.from({ length: 60 }, (_, i) => {
        const a = ((-90 + i * 6) * Math.PI) / 180;
        return (
          <line
            key={i}
            className={`t ${i < on ? "on" : ""}`}
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
            <div className="ag">
              <PctRing value={0} big="–" sub="midiendo" />
              <div>
                <p className="aio-hl">Estamos abriendo tu web con un navegador, como una persona.</p>
                <p className="aio-sub">
                  En cuanto termine verás qué parte de tu contenido no le llega a ChatGPT, Claude y Perplexity.
                </p>
              </div>
            </div>
          ) : (
            <div className="aio-g">
              <div className="ag">
                <PctRing value={card.pct} big={`${card.pct}%`} sub="llega" />
                <div>
                  <p className="aio-hl">{card.headline}</p>
                  <p className="aio-sub">{card.sub}</p>
                </div>
              </div>
              {card.rows.length > 0 ? (
                <div className="aio-rows">
                  {card.rows.map((r, i) => (
                    <div key={r.kind}>
                      <span>{r.label}</span>
                      <Bar value={r.reachPct} cls={`thin ${r.reachPct < 50 ? "warm" : ""}`.trim()} delay={i * 80} />
                      <b className="num">{r.reachPct}%</b>
                    </div>
                  ))}
                </div>
              ) : null}
              {card.items.length > 0 ? (
                <div className="aio-fx">
                  <div className="fx-k">{card.title}</div>
                  {card.items.map((it) => (
                    <Link key={it.text} className="fixln" href={href}>
                      <span className="sd" style={it.tone === "ok" ? { background: "var(--pos)" } : undefined} />
                      {it.text}
                      <Ic n="chevr" sm />
                    </Link>
                  ))}
                </div>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
