"use client";

import { useMemo, useRef, useState } from "react";
import {
  answerCost,
  COMPARE_ENGINE_LABEL,
  COMPARE_ENGINES,
  COMPARE_LIMITS,
  CURRENT,
  estimateAnswerCost,
  EXTRACTION_OPTIONS,
  GENERATION_MODELS,
  type CompareEngine,
  type PassModels
} from "@/lib/model-compare/catalogue";
import type {
  CompareAnswer,
  CompareAnswerOk,
  ComparePass,
  CompareSummary,
  PairMetrics,
  Verdict
} from "@/lib/model-compare/compare";
import { runCompareStep, summarizeCompare, type CompareProjectOption } from "./actions";

/** Two steps in flight at a time: never a whole batch on one tick (.claude/rules/scan.md). */
const STEP_CONCURRENCY = 2;

const VERDICT_LABEL: Record<Verdict, string> = {
  equivalente: "Equivalente",
  revisar: "Revisar",
  distinto: "Distinto",
  sin_datos: "Sin datos"
};

const VERDICT_CLASS: Record<Verdict, string> = {
  equivalente: "adm-pill adm-pill-paid",
  revisar: "adm-pill adm-pill-trial",
  distinto: "adm-pill adm-pill-error",
  sin_datos: "adm-pill adm-pill-free"
};

const usd = (value: number | null | undefined, digits = 2) =>
  value === null || value === undefined ? "sin tarifa" : `${value.toLocaleString("es-ES", { minimumFractionDigits: digits, maximumFractionDigits: digits })} $`;
const pct = (value: number | null) => (value === null ? "—" : `${Math.round(value)} %`);
const score = (value: number | null | undefined) => (value === null || value === undefined ? "—" : String(Math.round(value)));
const isOk = (answer: CompareAnswer): answer is CompareAnswerOk => answer.error === null;

function modelLabel(engine: CompareEngine, id: string): string {
  return GENERATION_MODELS[engine].find((option) => option.id === id)?.label ?? id;
}

type Result = { summary: CompareSummary & { answersPerEngineInScan: number }; answers: CompareAnswer[]; stoppedAtCap: boolean };

export function CompareRunner({ projects }: { projects: CompareProjectOption[] }) {
  const [projectId, setProjectId] = useState(projects[0]?.id ?? "");
  const [samples, setSamples] = useState(1);
  const [engines, setEngines] = useState<CompareEngine[]>([...COMPARE_ENGINES]);
  const [candidate, setCandidate] = useState<PassModels>({
    gemini: GENERATION_MODELS.gemini[1].id,
    openai: GENERATION_MODELS.openai[1].id,
    claude: GENERATION_MODELS.claude[1].id
  });
  const [extractionId, setExtractionId] = useState(EXTRACTION_OPTIONS[1].id);
  const [measureNoise, setMeasureNoise] = useState(true);

  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(0);
  const [total, setTotal] = useState(0);
  const [spent, setSpent] = useState(0);
  const [stepErrors, setStepErrors] = useState(0);
  const [phase, setPhase] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const stopRef = useRef(false);

  const project = projects.find((p) => p.id === projectId) ?? null;
  const promptCount = project ? Math.min(project.promptCount, COMPARE_LIMITS.maxPrompts) : 0;
  const extraction = EXTRACTION_OPTIONS.find((option) => option.id === extractionId) ?? EXTRACTION_OPTIONS[0];

  const estimate = useMemo(() => {
    const extractionModel = extraction.choice.kind === "native" ? CURRENT : extraction.choice.model;
    const perQuestion = engines.reduce(
      (sum, engine) =>
        sum +
        estimateAnswerCost(engine, CURRENT, CURRENT) * (measureNoise ? 2 : 1) +
        estimateAnswerCost(engine, candidate[engine], extractionModel),
      0
    );
    return perQuestion * promptCount * samples;
  }, [engines, candidate, extraction, measureNoise, promptCount, samples]);

  function toggleEngine(engine: CompareEngine, on: boolean) {
    setEngines((current) => (on ? COMPARE_ENGINES.filter((e) => e === engine || current.includes(e)) : current.filter((e) => e !== engine)));
  }

  async function run() {
    if (!project || engines.length === 0) return;
    stopRef.current = false;
    setRunning(true);
    setResult(null);
    setError(null);
    setDone(0);
    setSpent(0);
    setStepErrors(0);
    setPhase("Lanzando preguntas…");

    // Passes interleaved per question, so stopping early (cap or button)
    // still leaves comparable pairs instead of a finished A and an empty B.
    const passes: ComparePass[] = measureNoise ? ["a", "a2", "b"] : ["a", "b"];
    const steps: Array<{ pass: ComparePass; promptIndex: number; sample: number }> = [];
    for (let sample = 0; sample < samples; sample += 1) {
      for (let promptIndex = 0; promptIndex < promptCount; promptIndex += 1) {
        for (const pass of passes) steps.push({ pass, promptIndex, sample });
      }
    }
    setTotal(steps.length);

    const answers: CompareAnswer[] = [];
    let measured = 0;
    let stoppedAtCap = false;
    let cursor = 0;
    await Promise.all(
      Array.from({ length: STEP_CONCURRENCY }, async () => {
        while (cursor < steps.length && !stopRef.current) {
          if (measured >= COMPARE_LIMITS.maxSpendUsd) {
            stoppedAtCap = true;
            break;
          }
          const step = steps[cursor++];
          try {
            const got = await runCompareStep({ projectId: project.id, engines, candidate, extractionId, ...step });
            answers.push(...got);
            measured += got.filter(isOk).reduce((sum, answer) => sum + (answerCost(answer) ?? 0), 0);
            setSpent(measured);
          } catch {
            // A step that died (timeout, deploy) counts as failed answers,
            // never as answers that did not name the brand.
            setStepErrors((count) => count + 1);
            for (const engine of engines) answers.push({ engine, ...step, error: "StepFailed" });
          }
          setDone((count) => count + 1);
        }
      })
    );

    setPhase("Calculando la nota de cada pasada…");
    try {
      const summary = await summarizeCompare({ projectId: project.id, engines, answers });
      setResult({ summary, answers, stoppedAtCap });
    } catch {
      setError("No se pudo calcular el resultado. Las respuestas siguen abajo para descargar.");
      setResult(null);
    }
    setPhase(null);
    setRunning(false);
  }

  function download() {
    if (!result || !project) return;
    const blob = new Blob(
      [
        `${JSON.stringify(
          {
            project: project.domain,
            date: new Date().toISOString(),
            samples,
            engines,
            candidate,
            extraction: extraction.id,
            summary: result.summary,
            answers: result.answers
          },
          null,
          2
        )}\n`
      ],
      { type: "application/json" }
    );
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `comparar-modelos-${project.domain}-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  if (projects.length === 0) {
    return <p className="adm-empty">No hay ningún proyecto activo con preguntas.</p>;
  }

  return (
    <section className="adm-study adm-cmp">
      <h2 className="adm-cmp-h2">1. Qué comparar</h2>
      <div className="adm-cmp-form">
        <label>
          Proyecto{" "}
          <select value={projectId} onChange={(event) => setProjectId(event.target.value)} disabled={running}>
            {projects.map((option) => (
              <option key={option.id} value={option.id}>
                {option.domain} · {option.promptCount} preguntas
              </option>
            ))}
          </select>
        </label>
        <label>
          Repeticiones por pregunta{" "}
          <select value={samples} onChange={(event) => setSamples(Number(event.target.value))} disabled={running}>
            {Array.from({ length: COMPARE_LIMITS.maxSamples }, (_, i) => i + 1).map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
        {project && project.promptCount > COMPARE_LIMITS.maxPrompts ? (
          <p className="adm-note">
            Este proyecto tiene {project.promptCount} preguntas; la comparación usa las {COMPARE_LIMITS.maxPrompts} primeras.
          </p>
        ) : null}
      </div>

      <p className="adm-cmp-hint">Los precios son por millón de tokens de entrada / salida.</p>
      <div className="adm-cmp-engines">
        {COMPARE_ENGINES.map((engine) => {
          const today = GENERATION_MODELS[engine][0];
          const options = GENERATION_MODELS[engine];
          const picked = options.find((option) => option.id === candidate[engine]) ?? today;
          const on = engines.includes(engine);
          return (
            <div key={engine} className={`adm-cmp-engine${on ? "" : " adm-cmp-engine-off"}`}>
              <label className="adm-cmp-engine-name">
                <input type="checkbox" checked={on} onChange={(event) => toggleEngine(engine, event.target.checked)} disabled={running} />{" "}
                {COMPARE_ENGINE_LABEL[engine]}
              </label>
              <div className="adm-cmp-vs">
                <div>
                  <span className="adm-cmp-tag">Hoy</span>
                  <div className="adm-cmp-model">{today.label}</div>
                </div>
                <span className="adm-cmp-arrow">frente a</span>
                <div>
                  <span className="adm-cmp-tag">Candidato</span>
                  <select
                    value={candidate[engine]}
                    onChange={(event) => setCandidate((current) => ({ ...current, [engine]: event.target.value }))}
                    disabled={running || !on}
                  >
                    {options.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="adm-cmp-price">
                {today.price.inPerM} / {today.price.outPerM} $ → {picked.price.inPerM} / {picked.price.outPerM} $
                {engine === "claude" ? "" : " · búsqueda igual"}
              </div>
            </div>
          );
        })}
      </div>

      <div className="adm-cmp-form">
        <label>
          Extracción de datos del candidato{" "}
          <select value={extractionId} onChange={(event) => setExtractionId(event.target.value)} disabled={running}>
            {EXTRACTION_OPTIONS.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <label className="adm-cmp-check">
          <input type="checkbox" checked={measureNoise} onChange={(event) => setMeasureNoise(event.target.checked)} disabled={running} />{" "}
          <span>
            <strong>Medir el ruido de los modelos de hoy.</strong> Repite la pasada actual una segunda vez. Sin esto no se sabe
            si una diferencia la causa el modelo barato o el azar de siempre.
          </span>
        </label>
      </div>

      <div className="adm-cmp-launch">
        <span>
          Coste estimado: <strong>≈ {usd(estimate)}</strong> · tope por prueba {COMPARE_LIMITS.maxSpendUsd} $ · tarda unos minutos
        </span>
        {running ? (
          <button type="button" className="btn" onClick={() => (stopRef.current = true)}>
            Parar
          </button>
        ) : (
          <button type="button" className="btn btn-primary" onClick={run} disabled={!project || engines.length === 0}>
            Lanzar comparación
          </button>
        )}
      </div>
      <p className="adm-cmp-hint">
        La pasada de hoy usa los mismos modelos y la misma extracción que producción. Sólo el candidato cambia.
      </p>

      {running || total > 0 ? (
        <p className="adm-cmp-progress">
          {phase ?? "Terminado."} {done} de {total} pasos · gastado {usd(spent)}
          {stepErrors > 0 ? ` · ${stepErrors} pasos fallidos` : ""}
        </p>
      ) : null}
      {error ? <p className="adm-note">{error}</p> : null}

      {result ? <Results result={result} engines={engines} candidate={candidate} onDownload={download} /> : null}
    </section>
  );
}

function Results({
  result,
  engines,
  candidate,
  onDownload
}: {
  result: Result;
  engines: CompareEngine[];
  candidate: PassModels;
  onDownload: () => void;
}) {
  const { summary } = result;
  const a = summary.passes.a;
  const b = summary.passes.b;
  const a2 = summary.passes.a2;
  const scoreDelta = a?.overall != null && b?.overall != null ? b.overall - a.overall : null;
  const noise = a?.overall != null && a2?.overall != null ? Math.abs(a2.overall - a.overall) : null;
  const scanA = summary.scanCost.a;
  const scanB = summary.scanCost.b;
  const saving = scanA && scanB !== null ? Math.round(((scanB - scanA) / scanA) * 100) : null;
  const counts = { equivalente: 0, revisar: 0, distinto: 0, sin_datos: 0 } as Record<Verdict, number>;
  for (const engine of summary.engines) counts[engine.verdict] += 1;
  const verdictLine = (["equivalente", "revisar", "distinto", "sin_datos"] as Verdict[])
    .filter((v) => counts[v] > 0)
    .map((v) => `${counts[v]} ${VERDICT_LABEL[v].toLowerCase()}`)
    .join(", ");

  return (
    <>
      <h2 className="adm-cmp-h2">2. Resultado</h2>
      {result.stoppedAtCap ? (
        <p className="adm-note">La prueba se paró al llegar al tope de {COMPARE_LIMITS.maxSpendUsd} $: el resultado cubre sólo lo que dio tiempo.</p>
      ) : null}
      <dl className="adm-kpis">
        <div className="adm-kpi">
          <dt>Nota de la pasada</dt>
          <dd>
            {score(a?.overall)} → {score(b?.overall)}
          </dd>
          <div className="adm-kpi-foot">
            hoy → candidato{scoreDelta !== null ? ` · ${scoreDelta > 0 ? "+" : ""}${Math.round(scoreDelta * 10) / 10} puntos` : ""}
            {noise !== null ? ` · ruido de hoy ±${Math.round(noise * 10) / 10}` : ""}
          </div>
        </div>
        <div className="adm-kpi">
          <dt>Coste por escaneo</dt>
          <dd>
            {usd(scanA)} → {usd(scanB)}
          </dd>
          <div className="adm-kpi-foot">
            {saving !== null ? `${saving > 0 ? "+" : ""}${saving} % · ` : ""}con los tokens y búsquedas reales de esta prueba, para{" "}
            {summary.answersPerEngineInScan} respuestas por motor
          </div>
        </div>
        <div className="adm-kpi">
          <dt>Veredicto</dt>
          <dd className="adm-cmp-verdict">{verdictLine || "—"}</dd>
          <div className="adm-kpi-foot">
            {a ? `${a.answered} respuestas hoy` : ""}
            {b ? ` · ${b.answered} del candidato` : ""}
            {(a?.failed ?? 0) + (b?.failed ?? 0) + (a2?.failed ?? 0) > 0
              ? ` · ${(a?.failed ?? 0) + (b?.failed ?? 0) + (a2?.failed ?? 0)} fallidas, fuera del cálculo`
              : ""}
          </div>
        </div>
      </dl>
      <p className="adm-cmp-hint">
        La nota es la misma fórmula de la Puntuación GEO, sin la parte técnica de la auditoría web: sirve para comparar
        pasadas, no es la puntuación del cliente.
      </p>

      <div className="adm-table-wrap">
        <table className="adm-table">
          <thead>
            <tr>
              <th>Motor</th>
              <th>Nota hoy → candidato</th>
              <th>Mismas menciones</th>
              <th>Competidores en común</th>
              <th>Sentimiento igual</th>
              <th>Fuentes en común</th>
              <th>Coste por respuesta</th>
              <th>Veredicto</th>
            </tr>
          </thead>
          <tbody>
            {summary.engines.map((row) => (
              <tr key={row.engine}>
                <td>
                  <strong>{COMPARE_ENGINE_LABEL[row.engine]}</strong>
                  <div className="adm-dim">{modelLabel(row.engine, candidate[row.engine])}</div>
                </td>
                <td className="adm-num">
                  {score(row.scoreA)} → {score(row.scoreB)}
                </td>
                <MetricCell metric="mention" candidate={row.candidate} noise={row.noise} />
                <MetricCell metric="competitors" candidate={row.candidate} noise={row.noise} />
                <MetricCell metric="sentiment" candidate={row.candidate} noise={row.noise} />
                <MetricCell metric="sources" candidate={row.candidate} noise={row.noise} empty={row.engine === "claude" ? "sin fuentes" : "—"} />
                <td className="adm-num">
                  {usd(a?.costPerAnswer[row.engine], 4)} → {usd(b?.costPerAnswer[row.engine], 4)}
                </td>
                <td>
                  <span className={VERDICT_CLASS[row.verdict]}>{VERDICT_LABEL[row.verdict]}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="adm-cmp-hint">
        <strong>Cómo se decide.</strong>{" "}
        {a2
          ? "Equivalente si cada medida queda a 5 puntos o menos de lo que los modelos de hoy coinciden consigo mismos, y la nota no se mueve más que ese ruido (mínimo 2). Distinto si alguna se aleja más del doble. Revisar en medio."
          : "Sin medir el ruido se usan umbrales fijos: equivalente si todas las medidas coinciden en un 85 % o más y la nota no se mueve más de 3 puntos; distinto por debajo del 70 % o más de 6 puntos."}
      </p>

      <h2 className="adm-cmp-h2">3. Pregunta a pregunta</h2>
      <Details answers={result.answers} engines={engines} />
      <p className="adm-cmp-hint">
        Primera repetición de cada pregunta. En rojo, competidor que sólo nombra el modelo de hoy; en ámbar, el que sólo nombra
        el candidato.
      </p>
      <button type="button" className="btn" onClick={onDownload}>
        Descargar todo (JSON)
      </button>
    </>
  );
}

function MetricCell({
  metric,
  candidate,
  noise,
  empty = "—"
}: {
  metric: "mention" | "competitors" | "sentiment" | "sources";
  candidate: PairMetrics;
  noise: PairMetrics | null;
  empty?: string;
}) {
  const value = candidate[metric];
  if (value === null) return <td className="adm-dim">{empty}</td>;
  return (
    <td className="adm-num">
      {pct(value)}
      {noise && noise[metric] !== null ? <div className="adm-dim">ruido {pct(noise[metric])}</div> : null}
    </td>
  );
}

function Details({ answers, engines }: { answers: CompareAnswer[]; engines: CompareEngine[] }) {
  const questions = useMemo(() => {
    const byPrompt = new Map<number, { a: Map<CompareEngine, CompareAnswer>; b: Map<CompareEngine, CompareAnswer> }>();
    for (const answer of answers) {
      if (answer.sample !== 0 || answer.pass === "a2") continue;
      const entry = byPrompt.get(answer.promptIndex) ?? { a: new Map(), b: new Map() };
      entry[answer.pass].set(answer.engine, answer);
      byPrompt.set(answer.promptIndex, entry);
    }
    return [...byPrompt].sort((x, y) => x[0] - y[0]);
  }, [answers]);

  return (
    <div className="adm-cmp-questions">
      {questions.map(([promptIndex, entry]) => (
        <details key={promptIndex} className="adm-cmp-q">
          <summary>
            <span>Pregunta {promptIndex + 1}</span>
            <span className="adm-cmp-dots">
              {engines.map((engine) => {
                const a = entry.a.get(engine);
                const b = entry.b.get(engine);
                const same = a && b && isOk(a) && isOk(b) && a.row.brand_mentioned === b.row.brand_mentioned;
                const failed = !a || !b || !isOk(a) || !isOk(b);
                return (
                  <span
                    key={engine}
                    className={`adm-cmp-dot ${failed ? "adm-cmp-dot-fail" : same ? "adm-cmp-dot-same" : "adm-cmp-dot-diff"}`}
                    title={`${COMPARE_ENGINE_LABEL[engine]}: ${failed ? "falló" : same ? "misma mención" : "cambia la mención"}`}
                  >
                    {COMPARE_ENGINE_LABEL[engine][0]}
                  </span>
                );
              })}
            </span>
          </summary>
          <div className="adm-cmp-q-body">
            {engines.map((engine) => (
              <EngineDetail key={engine} engine={engine} a={entry.a.get(engine)} b={entry.b.get(engine)} />
            ))}
          </div>
        </details>
      ))}
    </div>
  );
}

function EngineDetail({ engine, a, b }: { engine: CompareEngine; a?: CompareAnswer; b?: CompareAnswer }) {
  const okA = a && isOk(a) ? a : null;
  const okB = b && isOk(b) ? b : null;
  const yes = (answer: CompareAnswerOk | null) => (answer ? (answer.row.brand_mentioned ? "sí" : "no") : "falló");
  const key = (name: string) => name.trim().toLowerCase();
  const brandsA = new Set((okA?.namedBrands ?? []).map(key));
  const brandsB = new Set((okB?.namedBrands ?? []).map(key));
  const all = [...new Map([...(okA?.namedBrands ?? []), ...(okB?.namedBrands ?? [])].map((name) => [key(name), name])).values()];
  return (
    <div className="adm-cmp-eng">
      <div className="adm-mini-title">{COMPARE_ENGINE_LABEL[engine]}</div>
      <dl className="adm-dl">
        <dt>Te menciona</dt>
        <dd>
          {yes(okA)} → {yes(okB)}
        </dd>
        <dt>Posición</dt>
        <dd>
          {okA?.brandPosition ?? "—"} → {okB?.brandPosition ?? "—"}
        </dd>
        {engine !== "claude" ? (
          <>
            <dt>Fuentes</dt>
            <dd>
              {okA?.citedDomains.length ?? "—"} → {okB?.citedDomains.length ?? "—"}
            </dd>
          </>
        ) : null}
      </dl>
      <div className="adm-cmp-brands">
        {all.map((name) => {
          const inA = brandsA.has(key(name));
          const inB = brandsB.has(key(name));
          return (
            <span key={name} className={`adm-cmp-brand${inA && !inB ? " adm-cmp-brand-lost" : !inA && inB ? " adm-cmp-brand-new" : ""}`}>
              {name}
            </span>
          );
        })}
      </div>
    </div>
  );
}
