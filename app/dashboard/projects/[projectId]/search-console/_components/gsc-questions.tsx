"use client";

import Link from "next/link";
import { CheckIcon, useWatchPrompt, watchStatusText } from "@/components/search-console/watch-prompt";
import type { QuestionQuery } from "@/lib/search-console/insights";
import { fmtInt, fmtPosition } from "./format";

/**
 * «Preguntas que te hacen en Google» (log §287): queries phrased as a
 * question, and whether the AI scan already tracks them. «Vigilar prompt»
 * goes through `addPrompts` (`useWatchPrompt`, shared with Recomendaciones).
 */

function QuestionRow({ projectId, item }: { projectId: string; item: QuestionQuery }) {
  const { state, tracked, watch } = useWatchPrompt(projectId, item.query, item.tracked);
  const status = watchStatusText(state);

  return (
    <li>
      <div>
        <b className="gsc-qq">{item.query}</b>
        <span className="gsc-sub">
          Puesto {fmtPosition(item.position)} en Google · {fmtInt(item.impressions)}{" "}
          {item.impressions === 1 ? "impresión" : "impresiones"}
        </span>
        {status && (
          <span
            className={`gsc-act${status.tone === "muted" ? " gsc-muted" : status.tone === "error" ? " gsc-down" : ""}`}
            role={status.tone === "error" ? "alert" : "status"}
          >
            {status.text}
          </span>
        )}
      </div>
      {tracked ? (
        <Link className="gsc-qbtn is-done" href={`/dashboard/projects/${projectId}/prompts`} title="Ver en Prompts">
          <CheckIcon />
          Prompt vigilado
        </Link>
      ) : (
        <button type="button" className="gsc-qbtn" onClick={watch}>
          Vigilar prompt
        </button>
      )}
    </li>
  );
}

export function GscQuestions({ projectId, questions }: { projectId: string; questions: QuestionQuery[] }) {
  return (
    <div className="card">
      <div className="sa-ch">
        <h3>Preguntas que te hacen en Google</h3>
        <span className="sa-src">Búsquedas con forma de pregunta</span>
      </div>
      {questions.length === 0 ? (
        <p className="sa-empty">Ninguna de tus búsquedas en Google tiene forma de pregunta todavía.</p>
      ) : (
        <ul className="gsc-list gsc-list-q">
          {questions.map((q) => (
            <QuestionRow key={q.query} projectId={projectId} item={q} />
          ))}
        </ul>
      )}
      <p className="sa-note" style={{ marginTop: 10, marginBottom: 0 }}>
        La gente ya hace estas preguntas en Google, y cada vez más también a la IA. Añádelas a tus preguntas para ver si
        los motores de IA te nombran.
      </p>
    </div>
  );
}
