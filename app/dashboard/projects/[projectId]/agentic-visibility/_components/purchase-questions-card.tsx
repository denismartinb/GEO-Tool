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
import { getEngineMeta } from "@/lib/scan/engine-meta";

/**
 * «Preguntas de compra» (AGENTIC-COMMERCE-1 Fase 2d, log §332), design in
 * docs/design-reference/agentic-commerce-1/fase-2d.html. Every figure comes
 * from `buildPurchaseQuestions`; below the sample floor the questions show
 * but no percentage does.
 */

/** Questions shown before «Ver N más». */
const VISIBLE_QUESTIONS = 5;

function Marks({ outcome }: { outcome: PurchaseOutcome | undefined }) {
  if (!outcome) return <span className="ag-pq-dot is-none" title="Sin respuesta">·</span>;
  const marks: Array<{ cls: string; letter: string; title: string }> = [];
  if (outcome.named) marks.push({ cls: "is-named", letter: "N", title: "Te nombra" });
  if (outcome.cited) marks.push({ cls: "is-cited", letter: "W", title: "Cita tu web" });
  if (outcome.marketplaces.length > 0)
    marks.push({ cls: "is-market", letter: "M", title: `Manda a ${outcome.marketplaces.join(", ")}` });
  if (marks.length === 0) return <span className="ag-pq-dot is-none" title="Nada de eso">–</span>;
  return (
    <>
      {marks.map((m) => (
        <span key={m.letter} className={`ag-pq-dot ${m.cls}`} title={m.title} aria-label={m.title}>
          {m.letter}
        </span>
      ))}
    </>
  );
}

function QuestionItem({ q, providers }: { q: PurchaseQuestionsReport["questions"][number]; providers: string[] }) {
  return (
    <li className="ag-pq-q">
      <span className="ag-pq-text">{q.text}</span>
      <span className="ag-pq-engines">
        {providers.map((p) => (
          <span key={p} className="ag-pq-engine">
            <span className="ag-pq-name">{getEngineMeta(p).label}</span>
            <Marks outcome={q.byEngine[p]} />
          </span>
        ))}
      </span>
    </li>
  );
}

export function PurchaseQuestionsCard({ projectId, report }: { projectId: string; report: PurchaseQuestionsReport }) {
  const providers = [...new Set(report.questions.flatMap((q) => Object.keys(q.byEngine)))].sort(
    (a, b) => engineRank(a) - engineRank(b)
  );
  const shown = report.questions.slice(0, VISIBLE_QUESTIONS);
  const rest = report.questions.slice(VISIBLE_QUESTIONS);
  const figures = report.figures;

  return (
    <div className="card">
      <div className="ag-head-row">
        <h2 className="ag-h">Preguntas de compra</h2>
        <span className="ag-muted">{purchaseCountLine(report)}</span>
      </div>

      {report.questions.length === 0 ? (
        <>
          <p className="ag-pq-lead">
            Ninguna de tus preguntas es de quien va a comprar. Añade alguna para ver si la IA te nombra o manda a un marketplace.
          </p>
          <Link className="btn btn-primary ag-pq-add" href={`/dashboard/projects/${projectId}/prompts`}>
            Añadir preguntas de compra
          </Link>
        </>
      ) : figures ? (
        <>
          <div className="ag-pq-figs">
            <div className="ag-pq-fig">
              <b>{formatShare(figures.named)}</b>
              <span>Te nombran</span>
            </div>
            <div className="ag-pq-fig">
              <b>{figures.cited === null ? "–" : formatShare(figures.cited)}</b>
              <span>Citan tu web</span>
              <small>Motores que buscan en la web</small>
            </div>
            <div className="ag-pq-fig">
              <b>{formatShare(figures.marketplace)}</b>
              <span>Mandan a un marketplace</span>
              {report.topMarketplace ? <small>Sobre todo a {report.topMarketplace}</small> : null}
            </div>
          </div>
          <p className="ag-muted">Una respuesta puede hacer varias cosas a la vez, así que no suman 100.</p>
          <div className="ag-pq-scroll">
            <table className="ag-agents ag-pq-eng">
              <thead>
                <tr>
                  <th scope="col">Motor</th>
                  <th scope="col">Te nombra</th>
                  <th scope="col">Cita tu web</th>
                  <th scope="col">Marketplace</th>
                </tr>
              </thead>
              <tbody>
                {report.byEngine.map((e) => (
                  <tr key={e.provider}>
                    <th scope="row">{getEngineMeta(e.provider).label}</th>
                    <td>{formatShare(e.named)}</td>
                    <td>{e.cited === null ? <span className="ag-muted">No busca en la web</span> : formatShare(e.cited)}</td>
                    <td>{formatShare(e.marketplace)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <p className="ag-pq-lead">
          {report.questions.length < PURCHASE_MIN_QUESTIONS
            ? `Con menos de ${PURCHASE_MIN_QUESTIONS} preguntas de compra no damos porcentajes, porque cambiarían mucho de un escaneo a otro.`
            : "Aún hay pocas respuestas para dar porcentajes. Saldrán tras tu próximo escaneo."}
        </p>
      )}

      {report.example ? <p className="ag-pq-example">{report.example}</p> : null}

      {report.questions.length > 0 ? (
        <>
          <ul className="ag-pq-list">
            {shown.map((q) => (
              <QuestionItem key={q.promptId} q={q} providers={providers} />
            ))}
          </ul>
          {rest.length > 0 ? (
            <details className="ag-pq-more">
              <summary>Ver {rest.length} más</summary>
              <ul className="ag-pq-list">
                {rest.map((q) => (
                  <QuestionItem key={q.promptId} q={q} providers={providers} />
                ))}
              </ul>
            </details>
          ) : null}
          <div className="ag-pq-legend">
            <span><span className="ag-pq-dot is-named">N</span>Te nombra</span>
            <span><span className="ag-pq-dot is-cited">W</span>Cita tu web</span>
            <span><span className="ag-pq-dot is-market">M</span>Manda a un marketplace</span>
            <span><span className="ag-pq-dot is-none">–</span>Nada de eso</span>
          </div>
          {!figures ? (
            <Link className="btn btn-ghost ag-pq-add" href={`/dashboard/projects/${projectId}/prompts`}>
              Añadir preguntas de compra
            </Link>
          ) : null}
        </>
      ) : null}

      <p className="ag-muted">{PURCHASE_RULE_SENTENCE}</p>
    </div>
  );
}
