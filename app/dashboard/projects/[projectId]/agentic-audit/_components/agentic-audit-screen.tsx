"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import type { AgenticCheckResult, AgenticComponentId, CheckState } from "@/lib/agentic-audit/api-contract";
import {
  componentLine,
  componentStatus,
  firstSteps,
  foundSentence,
  notApplicableNote,
  offerLabel,
  projectedSentence,
  unmeasuredReason,
  type Tone
} from "@/lib/agentic-audit/console-model";
import { stepTone } from "@/lib/agentic-audit/visibility-model";
import { AgenticLoadingScene } from "@/components/agentic/agentic-loading-scene";
import { runAgenticAuditAction } from "../actions";

/**
 * «Auditoría agéntica» (AGENTIC-COMMERCE-1 Fase 2a, log §322), design in
 * docs/design-reference/agentic-commerce-1/fase-2a-auto.html (log §323).
 * Pure presentation of the last stored review, which GenScore makes by itself
 * after each scan, plus «Elegir otra página». Every state and label comes from
 * the engine's result; what we could not measure says «Sin medir», never
 * «Bien».
 */

const STATE_TONE: Record<CheckState, Tone> = { pass: "ok", avg: "warn", fail: "bad", unknown: "na" };
const STATE_MARK: Record<CheckState, string> = { pass: "✓", avg: "!", fail: "✕", unknown: "i" };
const INTEROP_TONE = { found: "ok", absent: "bad", unknown: "na" } as const;
const INTEROP_MARK = { found: "✓", absent: "✕", unknown: "i" } as const;

const RING = 201;

export function ScoreGauge({ score }: { score: number }) {
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
        aria-label="Dirección de una página donde vendas algo"
        placeholder="https://tuweb.es/precios"
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
          Revisar esta página
        </button>
      </div>
      {pending ? (
        <span className="ag-busy" role="status">
          <span className="btn-spinner" aria-hidden="true" />
          Revisando la página. Tarda unos segundos.
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

/** How long the screen waits for a review started elsewhere (another tab, the post-scan job) before giving up. */
const WAIT_POLLS = 8;
const WAIT_POLL_MS = 5_000;

/**
 * Starts the automatic review once on mount and refreshes the page when it
 * ends (log §323). When a review is already in flight the action answers
 * `skipped` and this polls the page a few times instead. Renders nothing;
 * `onStuck` lets the searching card say it is taking longer than usual.
 */
function AutoReview({ projectId, onStuck }: { projectId: string; onStuck?: (message: string) => void }) {
  const router = useRouter();
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    void runAgenticAuditAction({ projectId }).then((result) => {
      if (cancelled) return;
      if (result.success && result.skipped === "recent") {
        let polls = 0;
        const poll = () => {
          if (cancelled) return;
          if (polls++ >= WAIT_POLLS) {
            onStuck?.("Está tardando más de lo normal. Vuelve en unos minutos.");
            return;
          }
          router.refresh();
          timer = setTimeout(poll, WAIT_POLL_MS);
        };
        timer = setTimeout(poll, WAIT_POLL_MS);
        return;
      }
      router.refresh();
    });
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [projectId, router, onStuck]);
  return null;
}

/**
 * First visit: no review yet, so it starts by itself. The scene is ambient
 * (log §325), like the wait of «Posición en Google»: nothing in it says how
 * far along the review is, because nothing here knows.
 */
export function AgenticAuditSearching({ projectId }: { projectId: string }) {
  const [stuck, setStuck] = useState<string | null>(null);
  return (
    <div className="card ag-searching">
      <AutoReview projectId={projectId} onStuck={setStuck} />
      <AgenticLoadingScene />
      <div className="ag-searching-copy" role="status">
        <b>Buscando qué vendes en tu web</b>
        <span>{stuck ?? "Tarda unos segundos. Al terminar, la pantalla se rellena sola."}</span>
      </div>
    </div>
  );
}

/** The automatic review could not open the site. The customer can still point at a product page. */
export function AgenticAuditUnreachable({ projectId, domain, remaining }: { projectId: string; domain: string; remaining: number }) {
  return (
    <div className="card">
      <h2 className="ag-h">No hemos podido abrir tu web</h2>
      <p className="ag-muted">
        Lo volveremos a intentar tras tu próximo escaneo. También puedes indicarnos la página de {domain} donde vendes algo:
        un producto, tus precios, un servicio o tus reservas.
      </p>
      {remaining > 0 ? (
        <UrlForm projectId={projectId} initialUrl="" />
      ) : (
        <p className="ag-muted">Has usado las revisiones de hoy; podrás volver a intentarlo mañana.</p>
      )}
    </div>
  );
}

export function AgenticAuditScreen({
  projectId,
  reviewedLabel,
  result,
  remaining,
  refresh,
  openOn
}: {
  projectId: string;
  /** «Revisada hoy a las 10:42.», formatted on the server in Europe/Madrid. */
  reviewedLabel: string;
  result: AgenticCheckResult;
  /** Reviews left in the last 24 hours. */
  remaining: number;
  /** The review is stale: start a new one quietly and refresh when it ends. */
  refresh: boolean;
  /** The component to open first, from a card on «Visibilidad en agentes». */
  openOn?: AgenticComponentId | "interop";
}) {
  const [editing, setEditing] = useState(false);
  const [selected, setSelected] = useState<AgenticComponentId | "interop">(() => openOn ?? "discovery");

  const steps = firstSteps(result);
  const projected = projectedSentence(result, steps);
  const current = result.components.find((c) => c.id === selected);
  const noStore = result.found === "none";
  const picker = editing ? (
    <UrlForm projectId={projectId} initialUrl="" onCancel={() => setEditing(false)} />
  ) : null;
  const limitNote = remaining > 0 ? null : " Has usado las revisiones de hoy; podrás elegir otra página mañana.";
  const kindChip = offerLabel(result);
  const naNote = notApplicableNote(result);
  // Read and scored: the URL adds nothing, a check says it went well (Denis, log §332).
  const analyzed = !noStore && result.pageRead && result.score !== null;

  return (
    <>
      {refresh ? <AutoReview projectId={projectId} /> : null}
      <div className="card">
        {noStore ? (
          <>
            <h2 className="ag-h">No hemos encontrado qué vendes en tu web</h2>
            <p className="ag-muted">
              Ni productos, ni precios, ni servicios, ni reservas. Te enseñamos lo que sí se mide en tu portada.{" "}
              {reviewedLabel}
              {limitNote}
            </p>
            {picker ??
              (remaining > 0 ? (
                <button type="button" className="ag-link" onClick={() => setEditing(true)}>
                  ¿Vendes algo? Indícanos la página
                </button>
              ) : null)}
          </>
        ) : (
          <>
            <div className="ag-head-row">
              {analyzed ? (
                <h2 className="ag-h ag-done">
                  <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true">
                    <circle cx="10" cy="10" r="10" fill="currentColor" />
                    <path
                      d="M6 10.4l2.6 2.6L14.2 7.4"
                      fill="none"
                      stroke="#fff"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  Tienda analizada
                </h2>
              ) : (
                <h2 className="ag-h">Página revisada</h2>
              )}
              {kindChip ? <span className="ag-kind">{kindChip}</span> : null}
            </div>
            {picker ??
              (analyzed ? (
                remaining > 0 ? (
                  <button type="button" className="ag-link" onClick={() => setEditing(true)}>
                    Elegir otra página
                  </button>
                ) : null
              ) : (
                <div className="ag-url">
                  <span className="ag-url-box" title={result.url}>
                    {result.url}
                  </span>
                  {remaining > 0 ? (
                    <div className="ag-url-actions">
                      <button type="button" className="btn btn-ghost" onClick={() => setEditing(true)}>
                        Elegir otra página
                      </button>
                    </div>
                  ) : null}
                </div>
              ))}
            <p className="ag-muted">
              {[foundSentence(result), reviewedLabel].filter(Boolean).join(" ")}
              {limitNote}
            </p>
          </>
        )}
      </div>

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
            {!result.pageRead
              ? "Tu protección anti-bots no dejó leer la página a nuestro robot, así que no hay nota. Hay agentes verificados que sí podrán leerla."
              : noStore
                ? "La nota se calcula sobre la página donde vendes algo. Sin ella, medimos lo que se puede ver en tu portada."
                : "La nota se calcula sobre la página donde vendes algo. Esta no lo parece: elige otra página."}
          </p>
        )}
        <div className="ag-comps">
          {result.components.map((c) => {
            const status = componentStatus(c, result);
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
        {naNote ? <p className="ag-muted">{naNote}</p> : null}
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

        <div className="card agx-first">
          <div className="card-h">
            <h3>Qué hacer primero</h3>
          </div>
          <div className="card-b">
            {steps.length > 0 ? (
              <ol>
                {steps.map((step, i) => (
                  <li key={step.key}>
                    <span className="n num">{i + 1}</span>
                    <div>
                      <div className="ch">
                        <span className={`dot ${stepTone(result, step) === "warn" ? "warn" : ""}`} aria-hidden="true" />
                        <span>{result.components.find((c) => c.id === step.component)?.name}</span>
                      </div>
                      <b>{step.title}</b>
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="none">No hemos encontrado nada que arreglar en lo que pudimos medir.</p>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
