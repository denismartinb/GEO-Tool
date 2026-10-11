"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { addPrompts } from "@/app/dashboard/projects/[projectId]/actions";
import type { QuestionQuery } from "@/lib/search-console/insights";
import { fmtInt, fmtPosition } from "./format";

/**
 * «Preguntas que te hacen en Google» (log §287): queries phrased as a
 * question, and whether the AI scan already tracks them. «Vigilar en IA»
 * goes through `addPrompts` in manual mode, the same path as adding a prompt
 * by hand: plan cap, categorisation and a scan of just that prompt.
 */

type RowState = { kind: "idle" } | { kind: "added"; scanLaunched: boolean } | { kind: "error"; message: string };

function QuestionRow({ projectId, item }: { projectId: string; item: QuestionQuery }) {
  const [state, setState] = useState<RowState>({ kind: "idle" });
  const [pending, startTransition] = useTransition();
  const tracked = item.tracked || state.kind === "added";

  const watch = () =>
    startTransition(async () => {
      const result = await addPrompts({ projectId, mode: "manual", manualPrompts: [item.query] });
      setState(result.success ? { kind: "added", scanLaunched: result.scanLaunched } : { kind: "error", message: result.error });
    });

  return (
    <li>
      <div>
        <b className="gsc-qq">{item.query}</b>
        <span className="gsc-sub">
          Puesto {fmtPosition(item.position)} en Google · {fmtInt(item.impressions)} impresiones ·{" "}
          {tracked ? "ya la vigilas en IA" : "todavía no la vigilas en IA"}
        </span>
        {state.kind === "added" ? (
          <span className="gsc-act" role="status">
            {state.scanLaunched
              ? "Añadida a tus preguntas. La estamos preguntando a los motores de IA."
              : "Añadida a tus preguntas. Entrará en tu próximo escaneo."}
          </span>
        ) : state.kind === "error" ? (
          <span className="gsc-act gsc-down" role="alert">
            {state.message}
          </span>
        ) : null}
      </div>
      {tracked ? (
        <Link className="gsc-qbtn" href={`/dashboard/projects/${projectId}/prompts`}>
          Ver en Prompts
        </Link>
      ) : (
        <button type="button" className="gsc-qbtn" onClick={watch} disabled={pending}>
          {pending ? "Añadiendo…" : "Vigilar en IA"}
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
