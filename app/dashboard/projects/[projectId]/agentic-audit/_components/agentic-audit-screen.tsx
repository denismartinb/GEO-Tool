"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { AgenticCheckResult, AgenticComponentId, CheckState } from "@/lib/agentic-audit/api-contract";
import {
  componentLine,
  componentStatus,
  firstSteps,
  initialComponent,
  projectedSentence,
  unmeasuredReason,
  type Tone
} from "@/lib/agentic-audit/console-model";
import { runAgenticAuditAction } from "../actions";

/**
 * «Auditoría agéntica» (AGENTIC-COMMERCE-1 Fase 2a, log §322), design in
 * docs/design-reference/agentic-commerce-1/fase-2a.html. Pure presentation of
 * the last stored review plus the «Revisar ahora» form. Every state and label
 * comes from the engine's result; what we could not measure says «Sin medir»,
 * never «Bien».
 */

const STATE_TONE: Record<CheckState, Tone> = { pass: "ok", avg: "warn", fail: "bad", unknown: "na" };
const STATE_MARK: Record<CheckState, string> = { pass: "✓", avg: "!", fail: "✕", unknown: "i" };
const INTEROP_TONE = { found: "ok", absent: "bad", unknown: "na" } as const;
const INTEROP_MARK = { found: "✓", absent: "✕", unknown: "i" } as const;

const RING = 201;

function ScoreGauge({ score }: { score: number }) {
  const tone = componentStatus({ id: "discovery", name: "", weight: 0, score, checks: [] }).tone;
  return (
    <svg className={`ag-gauge is-${tone}`} viewBox="0 0 80 80" role="img" aria-label={`${score} de 100`}>
      <circle className="ag-track" cx="40" cy="40" r="32" />
      <circle
        className="ag-val"
        cx="40"
        cy="40"
        r="32"
        strokeDasharray={RING}
        strokeDashoffset={RING * (1 - score / 100)}
        transform="rotate(-90 40 40)"
      />
      <text x="40" y="48" textAnchor="middle">
        {score}
      </text>
    </svg>
  );
}

function UrlForm({
  projectId,
  initialUrl,
  onCancel
}: {
  projectId: string;
  initialUrl: string;
  onCancel?: () => void;
}) {
  const router = useRouter();
  const [url, setUrl] = useState(initialUrl);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await runAgenticAuditAction({ projectId, url });
      if (result.success) {
        onCancel?.();
        router.refresh();
      } else {
        setError(result.message);
      }
    });
  }

  return (
    <form className="ag-url" onSubmit={submit}>
      <input
        type="text"
        inputMode="url"
        autoComplete="url"
        aria-label="Dirección de una ficha de producto"
        placeholder="https://tutienda.es/producto"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        disabled={pending}
        required
      />
      <div className="ag-url-actions">
        {onCancel ? (
          <button type="button" className="btn btn-ghost" onClick={onCancel} disabled={pending}>
            Cancelar
          </button>
        ) : null}
        <button type="submit" className="btn btn-primary" disabled={pending || url.trim().length === 0}>
          Revisar ahora
        </button>
      </div>
      {pending ? (
        <span className="ag-busy" role="status">
          <span className="btn-spinner" aria-hidden="true" />
          Revisando la ficha. Tarda unos segundos.
        </span>
      ) : null}
      {error ? (
        <p className="ag-error" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}

function RerunButton({ projectId, url }: { projectId: string; url: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <>
      <button
        type="button"
        className="btn btn-primary"
        disabled={pending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const result = await runAgenticAuditAction({ projectId, url });
            if (result.success) router.refresh();
            else setError(result.message);
          });
        }}
      >
        Revisar ahora
      </button>
      {pending ? (
        <span className="ag-busy" role="status">
          <span className="btn-spinner" aria-hidden="true" />
          Revisando la ficha. Tarda unos segundos.
        </span>
      ) : null}
      {error ? (
        <p className="ag-error" role="alert">
          {error}
        </p>
      ) : null}
    </>
  );
}

export function AgenticAuditForm({ projectId, domain }: { projectId: string; domain: string }) {
  return (
    <div className="card">
      <h2 className="ag-h">¿Qué ficha revisamos?</h2>
      <p className="ag-muted">
        Escribe la dirección de una ficha de producto de {domain}. La guardamos y podrás cambiarla cuando quieras.
      </p>
      <UrlForm projectId={projectId} initialUrl="" />
    </div>
  );
}

export function AgenticAuditScreen({
  projectId,
  savedUrl,
  reviewedLabel,
  result,
  remaining
}: {
  projectId: string;
  savedUrl: string;
  /** «Revisada hoy a las 10:42», formatted on the server in Europe/Madrid. */
  reviewedLabel: string | null;
  result: AgenticCheckResult | null;
  /** Reviews left in the last 24 hours. */
  remaining: number;
}) {
  const [editing, setEditing] = useState(false);
  const [selected, setSelected] = useState<AgenticComponentId | "interop">(() =>
    result ? initialComponent(result) : "discovery"
  );

  const steps = result ? firstSteps(result) : [];
  const projected = result ? projectedSentence(result, steps) : null;
  const current = result?.components.find((c) => c.id === selected);

  return (
    <>
      <div className="card">
        <h2 className="ag-h">Ficha revisada</h2>
        {editing ? (
          <UrlForm projectId={projectId} initialUrl={savedUrl} onCancel={() => setEditing(false)} />
        ) : (
          <div className="ag-url">
            <span className="ag-url-box" title={savedUrl}>
              {savedUrl}
            </span>
            <div className="ag-url-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setEditing(true)}>
                Cambiar
              </button>
              {remaining > 0 ? <RerunButton projectId={projectId} url={savedUrl} /> : null}
            </div>
          </div>
        )}
        <p className="ag-muted">
          {reviewedLabel ?? "Todavía no hay una revisión completa de esta ficha."}
          {remaining > 0 ? null : " Has usado las revisiones de hoy; podrás volver a revisar mañana."}
        </p>
      </div>

      {result ? (
        <>
          <div className="card">
            {result.score !== null ? (
              <div className="ag-score">
                <ScoreGauge score={result.score} />
                <div className="ag-score-what">
                  <b>Visibilidad agéntica: {result.score} de 100</b>
                  {projected ? <span>{projected}</span> : null}
                </div>
              </div>
            ) : (
              <p className="ag-muted">
                {result.pageRead
                  ? "La nota se calcula sobre una ficha de producto. Esta página no lo parece: cambia la dirección por la de un producto."
                  : "Tu protección anti-bots no dejó leer la página a nuestro robot, así que no hay nota. Hay agentes verificados que sí podrán leerla."}
              </p>
            )}
            <div className="ag-comps">
              {result.components.map((c) => {
                const status = componentStatus(c);
                return (
                  <button
                    key={c.id}
                    type="button"
                    className="ag-comp"
                    aria-pressed={selected === c.id}
                    onClick={() => setSelected(c.id)}
                  >
                    <b>{c.name}</b>
                    <span className={`ag-st is-${status.tone}`}>{status.word}</span>
                    <span className="ag-comp-line">{componentLine(result, c)}</span>
                  </button>
                );
              })}
              <button
                type="button"
                className="ag-comp"
                aria-pressed={selected === "interop"}
                onClick={() => setSelected("interop")}
              >
                <b>Interoperabilidad</b>
                <span className="ag-st">
                  {result.interop.found} de {result.interop.total}
                </span>
                <span className="ag-comp-line">Protocolos publicados</span>
              </button>
            </div>
          </div>

          <div className="card">
            {selected === "interop" ? (
              <>
                <h2 className="ag-h">Interoperabilidad</h2>
                <ul className="ag-checks">
                  {result.interop.items.map((item) => (
                    <li key={item.id}>
                      <span className={`ag-mk is-${INTEROP_TONE[item.state]}`} aria-hidden="true">
                        {INTEROP_MARK[item.state]}
                      </span>
                      <span>
                        {item.label}
                        <small>{item.detail}</small>
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            ) : current ? (
              <>
                <h2 className="ag-h">{current.name}</h2>
                {current.checks.length === 0 ? (
                  <p className="ag-muted">{unmeasuredReason(result, current.id)}.</p>
                ) : (
                  <ul className="ag-checks">
                    {current.checks.map((check) => (
                      <li key={check.id}>
                        <span className={`ag-mk is-${STATE_TONE[check.state]}`} aria-hidden="true">
                          {STATE_MARK[check.state]}
                        </span>
                        <span>
                          {check.label}
                          {check.state === "unknown" ? <small>No se pudo medir.</small> : check.fix ? <small>{check.fix}</small> : null}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            ) : null}
          </div>

          <div className="ag-grid">
            <div className="card">
              <h2 className="ag-h">Asistentes según tu robots.txt</h2>
              <table className="ag-agents">
                <thead>
                  <tr>
                    <th scope="col">Asistente</th>
                    <th scope="col">robots.txt</th>
                  </tr>
                </thead>
                <tbody>
                  {result.agents.map((a) => (
                    <tr key={a.assistant}>
                      <th scope="row">{a.assistant}</th>
                      <td>
                        <span className={`badge ${a.allowed === null ? "badge-neutral" : a.allowed ? "badge-pos" : "badge-neg"}`}>
                          {a.allowed === null ? "No se pudo leer" : a.allowed ? "Permitido" : "Bloqueado"}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {result.challenge !== null ? (
                    <tr>
                      <th scope="row">Visitas automáticas</th>
                      <td>
                        <span className={`badge ${result.challenge ? "badge-neutral" : "badge-pos"}`}>
                          {result.challenge ? "Reto anti-bots" : "Sin reto"}
                        </span>
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
              <p className="ag-muted">
                Lo que tu robots.txt deja pasar a cada asistente. El reto lo medimos con nuestro propio robot, que se identifica
                como tal.
              </p>
            </div>

            <div className="card">
              <h2 className="ag-h">Qué hacer primero</h2>
              {steps.length > 0 ? (
                steps.map((step) => (
                  <div className="ag-fix" key={step.key}>
                    <b>{step.title}</b>
                    <span>{step.seen}</span>
                  </div>
                ))
              ) : (
                <p className="ag-muted">No hemos encontrado nada que arreglar en lo que pudimos medir.</p>
              )}
            </div>
          </div>
        </>
      ) : null}
    </>
  );
}
