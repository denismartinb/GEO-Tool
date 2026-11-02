import Link from "next/link";
import { Ic } from "@/components/ins/ic";
import { aiViewHeadline, type AiView } from "@/lib/web-audit/ai-view";

/**
 * «Lo que lee la IA» in Auditoría GEO (AI-READ-2, log §451, replaces the page
 * list of AI-VIEW-CONSOLE-1, log §449). Global figures only: no page count,
 * no URL list and no fix block (Denis, 2026-11-02). Every figure comes from
 * `buildAiView`. Server component: nothing here is interactive.
 */

export function aiTone(pct: number): "ok" | "mid" | "low" {
  return pct >= 90 ? "ok" : pct >= 60 ? "mid" : "low";
}

export function AiRing({ pct, className = "aiv-ring" }: { pct: number; className?: string }) {
  const c = 2 * Math.PI * 40;
  const tone = aiTone(pct);
  return (
    <svg className={`${className} ${tone}`} viewBox="0 0 96 96" aria-hidden="true">
      <circle className="t" cx="48" cy="48" r="40" fill="none" strokeWidth="9" />
      <circle
        className="v"
        cx="48"
        cy="48"
        r="40"
        fill="none"
        strokeWidth="9"
        strokeLinecap="round"
        strokeDasharray={`${(Math.max(0, Math.min(100, pct)) / 100) * c} ${c}`}
        transform="rotate(-90 48 48)"
      />
    </svg>
  );
}

function Bar({ pct }: { pct: number }) {
  const tone = aiTone(pct);
  return (
    <span className={`aiv-bar${tone === "ok" ? "" : ` ${tone}`}`} aria-hidden="true">
      <i style={{ width: `${Math.max(3, pct)}%` }} />
    </span>
  );
}

export function AiViewSection({
  view,
  measuring,
  pricePrompts,
  promptsHref
}: {
  view: AiView;
  /** The browser measurement is configured but has not reached this project yet. */
  measuring: boolean;
  /** Active prompts that ask for a price (`classifyPurchaseQuestion`). */
  pricePrompts: number;
  promptsHref: string;
}) {
  const measured = view.mode === "measured";
  const pct = measured ? view.pct : view.okPct;
  const lost = measured ? view.kinds.filter((k) => k.missingPct > 0) : [];

  return (
    <section className="card aiv" id="lo-que-lee-la-ia" aria-labelledby="aiv-title">
      <div className="card-h">
        <h3 id="aiv-title">Lo que lee la IA</h3>
        <span className="badge b-pos">
          <Ic n="check" sm />
          {measured ? "Comprobado con un navegador real" : "Comprobado"}
        </span>
      </div>
      <div className="card-b">
        <div className="aiv-hero">
          <div className="aiv-fig">
            <AiRing pct={pct} />
            <div>
              <b className="num">{pct}%</b>
              <p>{aiViewHeadline(view)}</p>
              {measured && (
                <small>
                  Pesado por lo que importa cada página
                  {view.delta !== null && (
                    <>
                      {" · "}
                      <span className={view.delta > 0 ? "up" : "down"}>
                        {view.delta > 0 ? "▲" : "▼"} {Math.abs(view.delta)} pt
                      </span>{" "}
                      desde la medición anterior
                    </>
                  )}
                </small>
              )}
            </div>
          </div>
          {measured && view.kinds.length > 0 && (
            <div className="aiv-tiles">
              {view.kinds.map((k) => (
                <div key={k.kind} className={k.missingPct === 0 ? "ok" : undefined}>
                  <span>{k.label.replace(/^Tus /, "")}</span>
                  <b className="num">{k.missingPct === 0 ? "100%" : `${k.missingPct}%`}</b>
                  <em>{k.missingPct === 0 ? "llega" : "no llega"}</em>
                </div>
              ))}
            </div>
          )}
        </div>

        {lost.length > 0 && (
          <>
            <div className="aiv-lbl">Lo que la IA no ve de ti</div>
            <div className="aiv-miss">
              {lost.map((k) => (
                <div key={k.kind} className="aiv-m">
                  <h4>
                    {k.label}
                    <span className="badge b-warm">{k.missingPct === 100 ? "No llega" : `${k.missingPct}% no llega`}</span>
                  </h4>
                  <p>{k.consequence}</p>
                  {k.sample && <div className="aiv-q">«{k.sample}»</div>}
                  {k.where && <div className="aiv-w">{k.where}</div>}
                  {k.kind === "price" && pricePrompts > 0 && (
                    <Link href={promptsHref}>
                      Afecta a {pricePrompts === 1 ? "1 pregunta que vigilas" : `${pricePrompts} preguntas que vigilas`} →
                    </Link>
                  )}
                </div>
              ))}
            </div>
          </>
        )}

        {measured && view.groups.length > 0 && (
          <>
            <div className="aiv-lbl">Dónde se pierde</div>
            <div className="aiv-where">
              {view.groups.map((g) => (
                <div key={g.title} className="aiv-g">
                  <h4>{g.title}</h4>
                  {g.lines.map((l) => (
                    <div key={l.label} className="aiv-gl">
                      <span>{l.label}</span>
                      <Bar pct={l.pct} />
                      <span className="num">{l.pct}%</span>
                    </div>
                  ))}
                  {g.insight && <p className="aiv-ins">{g.insight}</p>}
                </div>
              ))}
            </div>
          </>
        )}

        {!measured && measuring && (
          <p className="aiv-hint">
            Estamos midiendo tu web con un navegador real. Cuando termine, verás aquí qué contenido no le llega a la IA.
          </p>
        )}
      </div>
    </section>
  );
}
