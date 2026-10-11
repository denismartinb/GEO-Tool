"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { addPrompts } from "@/app/dashboard/projects/[projectId]/actions";
import type { QuestionQuery } from "@/lib/search-console/insights";
import { fmtInt, fmtPosition } from "./format";

/**
 * «Preguntas que te hacen en Google» (log §287): queries phrased as a
 * question, and whether the AI scan already tracks them. «Vigilar prompt»
 * goes through `addPrompts` in manual mode, the same path as adding a prompt
 * by hand: plan cap, categorisation and a scan of just that prompt.
 */

type RowState =
  | { kind: "idle" }
  | { kind: "adding" }
  | { kind: "added"; scanLaunched: boolean }
  | { kind: "error"; message: string };

function CheckIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function QuestionRow({ projectId, item }: { projectId: string; item: QuestionQuery }) {
  const [state, setState] = useState<RowState>({ kind: "idle" });
  const [, startTransition] = useTransition();
  // Shown as watched the moment it is pressed: adding categorises the prompt
  // and launches its scan, which takes a few seconds. A failure undoes it.
  const tracked = item.tracked || state.kind === "adding" || state.kind === "added";

  const watch = () => {
    setState({ kind: "adding" });
    startTransition(async () => {
      try {
        const result = await addPrompts({ projectId, mode: "manual", manualPrompts: [item.query] });
        setState(result.success ? { kind: "added", scanLaunched: result.scanLaunched } : { kind: "error", message: result.error });
      } catch {
        setState({ kind: "error", message: "No se ha podido añadir. Inténtalo de nuevo." });
      }
    });
  };

  return (
    <li>
      <div>
        <b className="gsc-qq">{item.query}</b>
        <span className="gsc-sub">
          Puesto {fmtPosition(item.position)} en Google · {fmtInt(item.impressions)}{" "}
          {item.impressions === 1 ? "impresión" : "impresiones"}
        </span>
        {state.kind === "adding" ? (
          <span className="gsc-act gsc-muted" role="status">
            Añadiéndola a tus prompts…
          </span>
        ) : state.kind === "added" ? (
          <span className="gsc-act" role="status">
            {state.scanLaunched
              ? "Añadida a tus prompts. La estamos preguntando a los motores de IA."
              : "Añadida a tus prompts. Entrará en tu próximo escaneo."}
          </span>
        ) : state.kind === "error" ? (
          <span className="gsc-act gsc-down" role="alert">
            {state.message}
          </span>
        ) : null}
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
