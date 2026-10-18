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
 * «Preguntas de compra» (AGENTIC-COMMERCE-1 Fase 2d, log §332), laid out as the
 * approved prototype (docs/design-reference/agentic-commerce-1/prototipo.html):
 * three bars and one example up front, the per-engine table and the questions
 * behind «Ver las N preguntas por motor». Every figure comes from
 * `buildPurchaseQuestions`; below the sample floor the questions show but no
 * percentage does.
 */

function Marks({ outcome }: { outcome: PurchaseOutcome | undefined }) {
  if (!outcome) return <span className="av-mk is-none" title="Sin respuesta">·</span>;
  const marks: Array<{ cls: string; letter: string; title: string }> = [];
  if (outcome.named) marks.push({ cls: "is-named", letter: "N", title: "Te nombra" });
  if (outcome.cited) marks.push({ cls: "is-cited", letter: "W", title: "Cita tu web" });
  if (outcome.marketplaces.length > 0)
    marks.push({ cls: "is-market", letter: "M", title: `Manda a ${outcome.marketplaces.join(", ")}` });
  if (marks.length === 0) return <span className="av-mk is-none" title="Nada de eso">–</span>;
  return (
    <>
      {marks.map((m) => (
        <span key={m.letter} className={`av-mk ${m.cls}`} title={m.title} aria-label={m.title}>
          {m.letter}
        </span>
      ))}
    </>
  );
}

function Bar({ label, share, cyan }: { label: string; share: number | null; cyan?: boolean }) {
  return (
    <div className="av-bar">
      <span>{label}</span>
      <span className={`av-track${cyan ? " is-cyan" : ""}`} aria-hidden="true">
        <span style={{ width: `${Math.round((share ?? 0) * 100)}%` }} />
      </span>
      <span className="av-val">{share === null ? "–" : formatShare(share)}</span>
    </div>
  );
}

export function PurchaseQuestionsCard({ projectId, report }: { projectId: string; report: PurchaseQuestionsReport | null }) {
  const addHref = `/dashboard/projects/${projectId}/prompts`;
  const head = (
    <h3>
      Preguntas de compra <span className="badge badge-accent">Pro</span>
    </h3>
  );

  if (!report) {
    return (
      <div className="av-box">
        {head}
        <p className="av-hs">De tus escaneos, sólo las preguntas de quien va a comprar.</p>
        <p className="av-empty">Saldrán de tu primer escaneo, cuando termine.</p>
      </div>
    );
  }

  const providers = [...new Set(report.questions.flatMap((q) => Object.keys(q.byEngine)))].sort(
    (a, b) => engineRank(a) - engineRank(b)
  );
  const figures = report.figures;

  return (
    <div className="av-box av-pq">
      {head}
      <p className="av-hs">
        De tus escaneos, sólo las preguntas de quien va a comprar: {purchaseCountLine(report)}.
      </p>

      {report.questions.length === 0 ? (
        <>
          <p className="av-empty">
            Ninguna de tus preguntas es de quien va a comprar. Añade alguna para ver si la IA te nombra o manda a un marketplace.
          </p>
          <Link className="btn btn-primary av-btn" href={addHref}>
            Añadir preguntas de compra
          </Link>
        </>
      ) : figures ? (
        <>
          <div className="av-bars">
            <Bar label="Te nombran" share={figures.named} />
            <Bar label="Citan tu web" share={figures.cited} />
            <Bar label="Mandan a un marketplace" share={figures.marketplace} cyan />
          </div>
          <p className="av-note">
            {report.topMarketplace ? `Sobre todo a ${report.topMarketplace}. ` : ""}
            Una respuesta puede hacer varias cosas a la vez, así que no suman 100.
          </p>
        </>
      ) : (
        <p className="av-empty">
          {report.questions.length < PURCHASE_MIN_QUESTIONS
            ? `Con menos de ${PURCHASE_MIN_QUESTIONS} preguntas de compra no damos porcentajes, porque cambiarían mucho de un escaneo a otro.`
            : "Aún hay pocas respuestas para dar porcentajes. Saldrán tras tu próximo escaneo."}
        </p>
      )}

      {report.example ? (
        <div className="av-fix">
          <span className="av-dot is-na" aria-hidden="true" />
          <span>{report.example}</span>
        </div>
      ) : null}

      {report.questions.length > 0 ? (
        <details className="av-more">
          <summary>Ver las {report.questions.length} preguntas por motor</summary>
          {figures ? (
            <div className="av-tbl">
              <table>
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
                      <td>{e.cited === null ? <span className="av-muted">No busca en la web</span> : formatShare(e.cited)}</td>
                      <td>{formatShare(e.marketplace)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          <ul className="av-qs">
            {report.questions.map((q) => (
              <li key={q.promptId}>
                <span className="av-q-text">{q.text}</span>
                <span className="av-q-engines">
                  {providers.map((p) => (
                    <span key={p} className="av-q-engine">
                      <span className="av-q-name">{getEngineMeta(p).label}</span>
                      <Marks outcome={q.byEngine[p]} />
                    </span>
                  ))}
                </span>
              </li>
            ))}
          </ul>
          <div className="av-legend">
            <span><span className="av-mk is-named">N</span>Te nombra</span>
            <span><span className="av-mk is-cited">W</span>Cita tu web</span>
            <span><span className="av-mk is-market">M</span>Manda a un marketplace</span>
            <span><span className="av-mk is-none">–</span>Nada de eso</span>
          </div>
        </details>
      ) : null}

      {report.questions.length > 0 && !figures ? (
        <Link className="btn btn-ghost av-btn" href={addHref}>
          Añadir preguntas de compra
        </Link>
      ) : null}

      <p className="av-rule">{PURCHASE_RULE_SENTENCE}</p>
    </div>
  );
}
