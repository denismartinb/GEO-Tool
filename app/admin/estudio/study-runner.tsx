"use client";

import { useState } from "react";
import {
  aggregateBrands,
  buildCustomStudy,
  CUSTOM_STUDY_LIMITS,
  ENGINE_LABEL,
  ENGINES,
  formatReport,
  SECTORS,
  studySeeds,
  type AnswerRecord,
  type Engine,
  type SectorConfig
} from "@/lib/studies/sector-study";
import { formatAuditSection, type ProspectAudit } from "@/lib/studies/prospect-audit-format";
import { prepareBrandStudy, runProspectAuditAction, runSectorStudyStep, type StudySpec } from "./actions";

type SectorOption = { id: string; label: string; promptCount: number };

/** Two steps in flight at a time: ~6 provider calls, never a whole batch on one tick (.claude/rules/scan.md). */
const STEP_CONCURRENCY = 2;

const CUSTOM_ERRORS: Record<string, string> = {
  bad_domain: "El dominio no parece válido.",
  bad_prompt_count: `Escribe entre 1 y ${CUSTOM_STUDY_LIMITS.maxPrompts} preguntas, una por línea.`,
  bad_prompt_length: `Cada pregunta debe tener entre 5 y ${CUSTOM_STUDY_LIMITS.maxPromptChars} caracteres.`,
  too_many_competitors: `Como mucho ${CUSTOM_STUDY_LIMITS.maxCompetitors} competidores.`,
  bad_competitor: `Cada competidor, como mucho ${CUSTOM_STUDY_LIMITS.maxNameChars} caracteres.`
};

const PREPARE_ERRORS: Record<string, string> = {
  bad_domain: "El dominio no parece válido.",
  homepage_unreadable: "No se pudo leer la portada de ese dominio; escribe las preguntas y competidores a mano.",
  profile_failed: "La IA no devolvió un perfil del negocio (fallo del proveedor). Prueba otra vez.",
  profile_low_confidence: "La IA no tiene claro a qué se dedica esta web; escribe las preguntas y competidores a mano."
};

const lines = (text: string) => text.split("\n").map((line) => line.trim()).filter(Boolean);

function download(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

export function StudyRunner({ sectors }: { sectors: SectorOption[] }) {
  const [mode, setMode] = useState<"sector" | "custom">("sector");
  const [sectorId, setSectorId] = useState(sectors[0]?.id ?? "");
  const [domain, setDomain] = useState("");
  const [brand, setBrand] = useState("");
  const [promptsText, setPromptsText] = useState("");
  const [competitorsText, setCompetitorsText] = useState("");
  const [engines, setEngines] = useState<Engine[]>([...ENGINES]);
  const [samples, setSamples] = useState(2);
  const [promptCount, setPromptCount] = useState(15);
  const [preparing, setPreparing] = useState(false);
  const [prepareNote, setPrepareNote] = useState<string | null>(null);
  const [includeAudit, setIncludeAudit] = useState(true);
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(0);
  const [total, setTotal] = useState(0);
  const [stepErrors, setStepErrors] = useState(0);
  const [result, setResult] = useState<{ report: string; json: string; date: string; slug: string } | null>(null);

  const custom =
    mode === "custom"
      ? buildCustomStudy({ domain, brand, prompts: lines(promptsText), competitors: lines(competitorsText) })
      : null;
  const config: SectorConfig | undefined =
    mode === "sector" ? SECTORS.find((candidate) => candidate.id === sectorId) : custom?.ok ? custom.sector : undefined;
  const spec: StudySpec =
    mode === "sector"
      ? { kind: "sector", sectorId }
      : { kind: "custom", domain, brand, prompts: lines(promptsText), competitors: lines(competitorsText) };
  const answers = (config?.prompts.length ?? 0) * engines.length * samples;

  async function prepare() {
    setPreparing(true);
    setPrepareNote(null);
    try {
      const prepared = await prepareBrandStudy({ domain, brand, promptCount });
      if (!prepared.ok) {
        setPrepareNote(PREPARE_ERRORS[prepared.error] ?? prepared.error);
        return;
      }
      setDomain(prepared.domain);
      setBrand(prepared.brand);
      setPromptsText(prepared.prompts.join("\n"));
      setCompetitorsText(prepared.competitors.join("\n"));
      setPrepareNote(
        `Perfil detectado: ${prepared.profile}. ${prepared.prompts.length} preguntas y ${prepared.competitors.length} competidores sugeridos; revísalos antes de lanzar.`
      );
    } catch {
      setPrepareNote("La preparación falló (tiempo agotado o error). Prueba otra vez.");
    } finally {
      setPreparing(false);
    }
  }

  async function run() {
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

    const auditPromise: Promise<ProspectAudit | null> =
      mode === "custom" && includeAudit ? runProspectAuditAction({ domain }).catch(() => null) : Promise.resolve(null);
    const records: AnswerRecord[] = [];
    let cursor = 0;
    await Promise.all(
      Array.from({ length: STEP_CONCURRENCY }, async () => {
        while (cursor < steps.length) {
          const step = steps[cursor++];
          try {
            records.push(...(await runSectorStudyStep({ spec, engines, ...step })));
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
    const rows = aggregateBrands(records, studySeeds(config));
    const date = new Date().toISOString().slice(0, 10);
    const audit = await auditPromise;
    const auditSection =
      mode === "custom" && includeAudit
        ? `\n${audit ? formatAuditSection(audit) : "## Auditoría técnica\n\nNo se pudo ejecutar (tiempo agotado o error).\n"}`
        : "";
    setResult({
      date,
      slug: config.id,
      report: formatReport({ sector: config, records, rows, samples, date, engines }) + auditSection,
      json: `${JSON.stringify({ sector: config, samples, engines, date, rows, records, audit }, null, 2)}\n`
    });
    setRunning(false);
  }

  return (
    <section>
      <div className="adm-toolbar" style={{ flexWrap: "wrap", gap: 16, alignItems: "center" }}>
        <label>
          <input type="radio" checked={mode === "sector"} onChange={() => setMode("sector")} disabled={running} /> Sector
        </label>
        <label>
          <input type="radio" checked={mode === "custom"} onChange={() => setMode("custom")} disabled={running} /> Una marca
        </label>
      </div>

      {mode === "sector" ? (
        <div className="adm-toolbar">
          <select value={sectorId} onChange={(event) => setSectorId(event.target.value)} disabled={running}>
            {sectors.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label} ({option.promptCount} preguntas)
              </option>
            ))}
          </select>
        </div>
      ) : (
        <div style={{ display: "grid", gap: 10, maxWidth: 640, margin: "12px 0" }}>
          <label>
            Dominio <input value={domain} onChange={(event) => setDomain(event.target.value)} placeholder="ejemplo.es" disabled={running} />
          </label>
          <label>
            Nombre de marca (opcional; si no, sale del dominio){" "}
            <input value={brand} onChange={(event) => setBrand(event.target.value)} disabled={running} />
          </label>
          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <button type="button" onClick={prepare} disabled={running || preparing || !domain.trim()}>
              {preparing ? "Preparando…" : "Preparar con IA"}
            </button>
            <label>
              Preguntas a sugerir{" "}
              <select value={promptCount} onChange={(event) => setPromptCount(Number(event.target.value))} disabled={running || preparing}>
                {[10, 15, 20].map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <input type="checkbox" checked={includeAudit} onChange={(event) => setIncludeAudit(event.target.checked)} disabled={running} />{" "}
              Incluir auditoría técnica
            </label>
          </div>
          {prepareNote ? <p className="adm-note">{prepareNote}</p> : null}
          <label>
            Preguntas, una por línea
            <textarea rows={10} value={promptsText} onChange={(event) => setPromptsText(event.target.value)} disabled={running} style={{ width: "100%" }} />
          </label>
          <label>
            Competidores, uno por línea (opcional)
            <textarea rows={6} value={competitorsText} onChange={(event) => setCompetitorsText(event.target.value)} disabled={running} style={{ width: "100%" }} />
          </label>
          {custom && !custom.ok && (domain || promptsText) ? <p className="adm-note">{CUSTOM_ERRORS[custom.error] ?? custom.error}</p> : null}
        </div>
      )}

      <div className="adm-toolbar" style={{ flexWrap: "wrap", gap: 16, alignItems: "center" }}>
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
        <button type="button" onClick={run} disabled={running || !config || engines.length === 0}>
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
            <button type="button" onClick={() => download(`estudio-${result.slug}-${result.date}.md`, result.report, "text/markdown")}>
              Descargar informe (.md)
            </button>
            <button
              type="button"
              onClick={() => download(`estudio-${result.slug}-${result.date}.json`, result.json, "application/json")}
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
