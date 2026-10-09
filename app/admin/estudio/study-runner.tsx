"use client";

import { useState } from "react";
import {
  aggregateBrands,
  ENGINE_LABEL,
  ENGINES,
  formatReport,
  SECTORS,
  type AnswerRecord,
  type Engine
} from "@/lib/studies/sector-study";
import { runSectorStudyStep } from "./actions";

type SectorOption = { id: string; label: string; promptCount: number };

/** Two steps in flight at a time: ~6 provider calls, never a whole batch on one tick (.claude/rules/scan.md). */
const STEP_CONCURRENCY = 2;

function download(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

export function StudyRunner({ sectors }: { sectors: SectorOption[] }) {
  const [sectorId, setSectorId] = useState(sectors[0]?.id ?? "");
  const [engines, setEngines] = useState<Engine[]>([...ENGINES]);
  const [samples, setSamples] = useState(2);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(0);
  const [total, setTotal] = useState(0);
  const [stepErrors, setStepErrors] = useState(0);
  const [result, setResult] = useState<{ report: string; json: string; date: string } | null>(null);

  const sector = sectors.find((candidate) => candidate.id === sectorId);
  const answers = (sector?.promptCount ?? 0) * engines.length * samples;

  async function run() {
    const config = SECTORS.find((candidate) => candidate.id === sectorId);
    if (!config || engines.length === 0) return;
    setRunning(true);
    setResult(null);
    setDone(0);
    setStepErrors(0);

    const steps: Array<{ promptIndex: number; sample: number }> = [];
    for (let sample = 1; sample <= samples; sample += 1) {
      for (let promptIndex = 0; promptIndex < config.prompts.length; promptIndex += 1) steps.push({ promptIndex, sample });
    }
    setTotal(steps.length);

    const records: AnswerRecord[] = [];
    let cursor = 0;
    await Promise.all(
      Array.from({ length: STEP_CONCURRENCY }, async () => {
        while (cursor < steps.length) {
          const step = steps[cursor++];
          try {
            records.push(...(await runSectorStudyStep({ sectorId, engines, ...step })));
          } catch {
            // A step that died (timeout, deploy) still counts: its answers are
            // failures, never answers that named nobody.
            setStepErrors((count) => count + 1);
            for (const engine of engines) {
              records.push({ engine, ...step, model: null, error: "StepFailed", rawText: null, seedMentions: [], otherBrands: [] });
            }
          }
          setDone((count) => count + 1);
        }
      })
    );

    records.sort((a, b) => a.sample - b.sample || a.promptIndex - b.promptIndex || a.engine.localeCompare(b.engine));
    const rows = aggregateBrands(records, config.seedBrands);
    const date = new Date().toISOString().slice(0, 10);
    setResult({
      date,
      report: formatReport({ sector: config, records, rows, samples, date, engines }),
      json: `${JSON.stringify({ sector: config, samples, engines, date, rows, records }, null, 2)}\n`
    });
    setRunning(false);
  }

  return (
    <section>
      <div className="adm-toolbar" style={{ flexWrap: "wrap", gap: 16, alignItems: "center" }}>
        <label>
          Sector{" "}
          <select value={sectorId} onChange={(event) => setSectorId(event.target.value)} disabled={running}>
            {sectors.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label} ({option.promptCount} preguntas)
              </option>
            ))}
          </select>
        </label>
        {ENGINES.map((engine) => (
          <label key={engine}>
            <input
              type="checkbox"
              checked={engines.includes(engine)}
              disabled={running}
              onChange={(event) =>
                setEngines((current) =>
                  event.target.checked ? ENGINES.filter((e) => e === engine || current.includes(e)) : current.filter((e) => e !== engine)
                )
              }
            />{" "}
            {ENGINE_LABEL[engine]}
          </label>
        ))}
        <label>
          Repeticiones{" "}
          <select value={samples} onChange={(event) => setSamples(Number(event.target.value))} disabled={running}>
            {[1, 2, 3].map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
        <button type="button" onClick={run} disabled={running || engines.length === 0}>
          {running ? "Ejecutando…" : `Lanzar (${answers} respuestas)`}
        </button>
      </div>

      {running || done > 0 ? (
        <p className="adm-note">
          {done} de {total} preguntas completadas
          {stepErrors > 0 ? ` · ${stepErrors} con error (cuentan como respuestas fallidas)` : ""}. No cierres esta pestaña
          mientras se ejecuta: es la que lanza cada paso.
        </p>
      ) : null}

      {result ? (
        <div>
          <div className="adm-toolbar" style={{ gap: 12 }}>
            <button type="button" onClick={() => download(`estudio-${sectorId}-${result.date}.md`, result.report, "text/markdown")}>
              Descargar informe (.md)
            </button>
            <button
              type="button"
              onClick={() => download(`estudio-${sectorId}-${result.date}.json`, result.json, "application/json")}
            >
              Descargar respuestas (.json)
            </button>
          </div>
          <pre style={{ whiteSpace: "pre-wrap", fontSize: 13, lineHeight: 1.5 }}>{result.report}</pre>
        </div>
      ) : null}
    </section>
  );
}
