import Link from "next/link";
import {
  engineRank,
  PURCHASE_MIN_QUESTIONS,
  PURCHASE_RULE_SENTENCE,
  type PurchaseOutcome,
  type PurchaseQuestionsReport
} from "@/lib/agentic-audit/purchase-questions";
import { purchaseCountLine } from "@/lib/agentic-audit/visibility-model";
import { formatShare } from "@/lib/report/report-model";
import { Ic } from "@/components/ins/ic";
import { Bar } from "@/components/ins/kit/bar";
import { EngineLogo } from "@/components/ins/kit/engine";
import { getEngineMeta } from "@/lib/scan/engine-meta";

/**
 * «Preguntas de compra» (AGENTIC-COMMERCE-1 Fase 2d, log §332), restyled as the
 * «Instrumento» prototype (`agxPurchase`, log §370): one row per engine with
 * three thin bars, and the questions behind «Ver las N preguntas por motor».
 * Every figure comes from `buildPurchaseQuestions`; below the sample floor the
 * questions show but no percentage does.
 */

function Marks({ outcome }: { outcome: PurchaseOutcome | undefined }) {
  if (!outcome) return <span className="agx-mk is-none" title="Sin respuesta">·</span>;
  const marks: Array<{ cls: string; letter: string; title: string }> = [];
  if (outcome.named) marks.push({ cls: "is-named", letter: "N", title: "Te nombra" });
  if (outcome.cited) marks.push({ cls: "is-cited", letter: "W", title: "Cita tu web" });
  if (outcome.marketplaces.length > 0)
    marks.push({ cls: "is-market", letter: "M", title: `Manda a ${outcome.marketplaces.join(", ")}` });
  if (marks.length === 0) return <span className="agx-mk is-none" title="Nada de eso">–</span>;
  return (
    <>
      {marks.map((m) => (
        <span key={m.letter} className={`agx-mk ${m.cls}`} title={m.title} aria-label={m.title}>
          {m.letter}
        </span>
      ))}
    </>
  );
}

function Cell({ share, cls, i }: { share: number | null; cls?: string; i: number }) {
  if (share === null) return <span className="m na">No busca en la web</span>;
  return (
    <span className="m">
      <b className="num">{formatShare(share)}</b>
      <Bar value={Math.round(share * 100)} max={60} cls={`thin nomark ${cls ?? ""}`.trim()} delay={i * 60} />
    </span>
  );
}

export function PurchaseQuestionsCard({ projectId, report }: { projectId: string; report: PurchaseQuestionsReport | null }) {
  const addHref = `/dashboard/projects/${projectId}/prompts`;
  const head = (
    <div className="card-h">
      <h3>Preguntas de compra</h3>
      <Link className="see" href={addHref}>
        Ver prompts
        <Ic n="chevr" sm />
      </Link>
    </div>
  );

  if (!report) {
    return (
      <div className="card agx-pq">
        {head}
        <div className="card-b">
          <p className="foot">De tus escaneos, sólo las preguntas de quien va a comprar.</p>
          <p className="foot">Saldrán de tu primer escaneo, cuando termine.</p>
        </div>
      </div>
    );
  }

  const providers = [...new Set(report.questions.flatMap((q) => Object.keys(q.byEngine)))].sort(
    (a, b) => engineRank(a) - engineRank(b)
  );
  const figures = report.figures;

  return (
    <div className="card agx-pq">
      {head}
      <div className="card-b">
        <p className="foot agx-sub">
          De tus escaneos, sólo las preguntas de quien va a comprar: {purchaseCountLine(report)}.
        </p>

        {report.questions.length === 0 ? (
          <>
            <p className="foot">
              Ninguna de tus preguntas es de quien va a comprar. Añade alguna para ver si la IA te nombra o manda a un marketplace.
            </p>
            <Link className="btn line" href={addHref}>
              Añadir preguntas de compra
            </Link>
          </>
        ) : figures ? (
          <>
            <div className="hh" aria-hidden="true">
              <span>Motor</span>
              <span>Te nombra</span>
              <span>Cita tu web</span>
              <span>Manda a un marketplace</span>
            </div>
            <div className="er">
              <span className="e">
                <b>Todos los motores</b>
              </span>
              <Cell share={figures.named} i={0} />
              <Cell share={figures.cited} cls="ink" i={0} />
              <Cell share={figures.marketplace} cls="warm" i={0} />
            </div>
            {report.byEngine.map((e, i) => (
              <div className="er" key={e.provider}>
                <span className="e">
                  <EngineLogo provider={e.provider} size={16} />
                  <b>{getEngineMeta(e.provider).label}</b>
                </span>
                <Cell share={e.named} i={i + 1} />
                <Cell share={e.cited} cls="ink" i={i + 1} />
                <Cell share={e.marketplace} cls="warm" i={i + 1} />
              </div>
            ))}
            <p className="foot">
              {report.topMarketplace ? `Sobre todo a ${report.topMarketplace}. ` : ""}
              Una respuesta puede hacer varias cosas a la vez, así que no suman 100.
            </p>
          </>
        ) : (
          <p className="foot">
            {report.questions.length < PURCHASE_MIN_QUESTIONS
              ? `Con menos de ${PURCHASE_MIN_QUESTIONS} preguntas de compra no damos porcentajes, porque cambiarían mucho de un escaneo a otro.`
              : "Aún hay pocas respuestas para dar porcentajes. Saldrán tras tu próximo escaneo."}
          </p>
        )}

        {report.example ? <p className="foot">{report.example}</p> : null}

        {report.questions.length > 0 ? (
          <>
            <div className="qs">
              {report.questions.slice(0, 3).map((q) => (
                <span key={q.promptId}>
                  <Ic n="cart" sm />
                  {q.text}
                </span>
              ))}
            </div>
            <details className="agx-more">
              <summary>Ver las {report.questions.length} preguntas por motor</summary>
              <ul className="agx-qs">
                {report.questions.map((q) => (
                  <li key={q.promptId}>
                    <span className="q">{q.text}</span>
                    <span className="qe">
                      {providers.map((p) => (
                        <span key={p} className="qen">
                          <span>{getEngineMeta(p).label}</span>
                          <Marks outcome={q.byEngine[p]} />
                        </span>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="agx-legend">
                <span><span className="agx-mk is-named">N</span>Te nombra</span>
                <span><span className="agx-mk is-cited">W</span>Cita tu web</span>
                <span><span className="agx-mk is-market">M</span>Manda a un marketplace</span>
                <span><span className="agx-mk is-none">–</span>Nada de eso</span>
              </div>
            </details>
          </>
        ) : null}

        {report.questions.length > 0 && !figures ? (
          <Link className="btn line" href={addHref}>
            Añadir preguntas de compra
          </Link>
        ) : null}

        <p className="foot">{PURCHASE_RULE_SENTENCE}</p>
      </div>
    </div>
  );
}
