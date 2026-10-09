"use client";

import { useState } from "react";
import {
  aggregateBrands,
  aggregateCitedDomains,
  brandKey,
  buildCustomStudy,
  CUSTOM_STUDY_LIMITS,
  ENGINE_LABEL,
  ENGINES,
  formatReport,
  normalizeStudyDomain,
  SECTORS,
  studySeeds,
  type AnswerRecord,
  type Engine,
  type SectorConfig
} from "@/lib/studies/sector-study";
import { formatAuditSection } from "@/lib/studies/prospect-audit-format";
import {
  formatCompetitorComparison,
  formatCoverageSection,
  formatGlobalScoreSection,
  isOwnDomain,
  prospectGlobalScore,
  summarizeCoverage,
  type CoverageTopicResult
} from "@/lib/studies/prospect-scorecard";
import {
  computeBrandCompetitors,
  prepareBrandStudy,
  runProspectAuditAction,
  runProspectCoverageStep,
  runSectorStudyStep,
  type StudySpec
} from "./actions";

type SectorOption = { id: string; label: string; promptCount: number };

/** Two steps in flight at a time: ~6 provider calls, never a whole batch on one tick (.claude/rules/scan.md). */
const STEP_CONCURRENCY = 2;
/** Must match COVERAGE_TOPICS_PER_STEP in actions.ts (the server caps it anyway). */
const COVERAGE_BATCH = 2;
/** Competitors compared side by side in the technical audit. */
const COMPARED_COMPETITORS = 3;

const CUSTOM_ERRORS: Record<string, string> = {
  bad_domain: "El dominio no parece válido.",
  bad_prompt_count: `Escribe entre 1 y ${CUSTOM_STUDY_LIMITS.maxPrompts} preguntas, una por línea.`,
  bad_prompt_length: `Cada pregunta debe tener entre 5 y ${CUSTOM_STUDY_LIMITS.maxPromptChars} caracteres.`,
  too_many_competitors: `Como mucho ${CUSTOM_STUDY_LIMITS.maxCompetitors} competidores.`,
  bad_competitor: `Cada competidor, como mucho ${CUSTOM_STUDY_LIMITS.maxNameChars} caracteres.`
};

const COMPETITOR_NOTE: Record<"ok" | "empty" | "failed", (count: number) => string> = {
  ok: (count) => `${count} competidores calculados como en el alta de un proyecto.`,
  empty: () =>
    "El sugeridor de competidores no devolvió ninguno: escribe alguno a mano o lanza igual (el informe ya ordena las marcas que nombran los motores).",
  failed: () => "El sugeridor de competidores falló (proveedor): prueba otra vez o escríbelos a mano."
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
  const [competitorDomains, setCompetitorDomains] = useState<Record<string, string>>({});
  const [phase, setPhase] = useState<string | null>(null);
  const [engines, setEngines] = useState<Engine[]>([...ENGINES]);
  const [samples, setSamples] = useState(2);
  const [promptCount, setPromptCount] = useState(15);
  const [zone, setZone] = useState("");
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
      const prepared = await prepareBrandStudy({ domain, brand, promptCount, zone });
      if (!prepared.ok) {
        setPrepareNote(PREPARE_ERRORS[prepared.error] ?? prepared.error);
        return;
      }
      setDomain(prepared.domain);
      setBrand(prepared.brand);
      setPromptsText(prepared.prompts.join("\n"));
      setCompetitorsText(prepared.competitors.join("\n"));
      setCompetitorDomains(prepared.competitorDomains);
      setPrepareNote(
        `Perfil detectado: ${prepared.profile}. ${prepared.prompts.length} preguntas sugeridas. ${COMPETITOR_NOTE[prepared.competitorsStatus](prepared.competitors.length)} Revísalo antes de lanzar.`
      );
    } catch {
      setPrepareNote("La preparación falló (tiempo agotado o error). Prueba otra vez.");
    } finally {
      setPreparing(false);
    }
  }

  /**
   * After the study: content coverage per question, then the technical audit
   * of the brand (homepage + the own pages the data surfaced) and of the most
   * named competitors, then the global score. Every failure stays visible as
   * "sin dato" in the report, never as a clean result.
   */
  async function runDeepAudit(
    study: SectorConfig,
    records: AnswerRecord[],
    rows: ReturnType<typeof aggregateBrands>,
    domains: Record<string, string>
  ) {
    const root = normalizeStudyDomain(domain) ?? domain;
    const coverage: CoverageTopicResult[] = [];
    for (let start = 0; start < study.prompts.length; start += COVERAGE_BATCH) {
      setPhase(`Comprobando contenido de la web: ${start} de ${study.prompts.length} preguntas…`);
      const topics = study.prompts.slice(start, start + COVERAGE_BATCH).map((text, offset) => ({ promptIndex: start + offset, text }));
      try {
        coverage.push(...(await runProspectCoverageStep({ domain: root, brand: study.brand, topics })));
      } catch {
        coverage.push(...topics.map((topic) => ({ promptIndex: topic.promptIndex, status: "failed" as const, pages: [], aiNote: null })));
      }
    }
    const summary = summarizeCoverage({ domain: root, brand: study.brand ?? "", promptCount: study.prompts.length, records, coverage });

    const cited = new Map<string, Set<number>>();
    for (const record of records) {
      for (const citation of record.citations ?? []) {
        if (!isOwnDomain(citation.domain, root)) continue;
        cited.set(citation.url, (cited.get(citation.url) ?? new Set()).add(record.promptIndex));
      }
    }
    const citedUrls = [...cited].sort((a, b) => b[1].size - a[1].size).map(([url, prompts]) => ({ url, promptCount: prompts.size }));
    const coveragePages = summary.rows.flatMap((row) => row.pages.map((page) => ({ url: page.url, topic: study.prompts[row.promptIndex] })));

    const brand = brandKey(study.brand ?? "");
    const top = rows.filter((row) => row.seed && brandKey(row.name) !== brand && row.mentions > 0).slice(0, COMPARED_COMPETITORS);
    const omitted = top.filter((row) => !domains[row.name]).map((row) => row.name);
    const compared = top.filter((row) => domains[row.name]).map((row) => ({ name: row.name, domain: domains[row.name] }));

    setPhase("Auditando la web y la de los competidores más nombrados…");
    const [audit, ...competitorAudits] = await Promise.all([
      runProspectAuditAction({ domain: root, coveragePages, citedUrls }).catch(() => null),
      ...compared.map((competitor) => runProspectAuditAction({ domain: competitor.domain }).catch(() => null))
    ]);
    const competitors = compared.map((competitor, index) => ({ ...competitor, audit: competitorAudits[index] ?? null }));
    const globalScore = prospectGlobalScore(summary, audit);

    return {
      report: [
        formatGlobalScoreSection(globalScore),
        formatCoverageSection(summary, study.prompts),
        audit ? formatAuditSection(audit) : "## Auditoría técnica\n\nNo se pudo ejecutar (tiempo agotado o error).\n",
        formatCompetitorComparison({ brand: study.brand ?? root, target: audit, competitors, omitted })
      ].join("\n"),
      json: { globalScore, coverage: { summary, results: coverage }, audit, competitorAudits: { compared: competitors, omitted } }
    };
  }

  async function run() {
    if (!config || engines.length === 0) return;
    setRunning(true);
    let study = config;
    let domains = competitorDomains;
    if (mode === "custom" && study.seedBrands.length === 0) {
      // Same as the product: competitors are computed, not left to the operator.
      setPrepareNote("Calculando competidores…");
      const computed = await computeBrandCompetitors({ domain, brand }).catch(() => null);
      if (computed?.ok && computed.competitors.length > 0) {
        setCompetitorsText(computed.competitors.join("\n"));
        domains = computed.competitorDomains;
        setCompetitorDomains(domains);
        const rebuilt = buildCustomStudy({ domain, brand, prompts: lines(promptsText), competitors: computed.competitors });
        if (rebuilt.ok) study = rebuilt.sector;
        setPrepareNote(COMPETITOR_NOTE.ok(computed.competitors.length));
      } else {
        setPrepareNote(
          computed?.ok ? COMPETITOR_NOTE[computed.status](0) : `No se pudieron calcular competidores (${computed ? PREPARE_ERRORS[computed.error] ?? computed.error : "error"}). El estudio sigue sin ellos.`
        );
      }
    }
    const specToRun: StudySpec =
      mode === "custom" ? { kind: "custom", domain, brand, prompts: study.prompts, competitors: study.seedBrands } : spec;
    setResult(null);
    setDone(0);
    setStepErrors(0);

    const steps: Array<{ promptIndex: number; sample: number }> = [];
    for (let sample = 1; sample <= samples; sample += 1) {
      for (let promptIndex = 0; promptIndex < study.prompts.length; promptIndex += 1) steps.push({ promptIndex, sample });
    }
    setTotal(steps.length);

    const records: AnswerRecord[] = [];
    let cursor = 0;
    await Promise.all(
      Array.from({ length: STEP_CONCURRENCY }, async () => {
        while (cursor < steps.length) {
          const step = steps[cursor++];
          try {
            records.push(...(await runSectorStudyStep({ spec: specToRun, engines, ...step })));
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
    const rows = aggregateBrands(records, studySeeds(study));
    const date = new Date().toISOString().slice(0, 10);
    const deep = mode === "custom" && includeAudit ? await runDeepAudit(study, records, rows, domains) : null;
    setPhase(null);
    setResult({
      date,
      slug: study.id,
      report: formatReport({ sector: study, records, rows, samples, date, engines }) + (deep ? `\n${deep.report}` : ""),
      json: `${JSON.stringify(
        { sector: study, samples, engines, date, rows, citedDomains: aggregateCitedDomains(records), records, ...(deep?.json ?? {}) },
        null,
        2
      )}\n`
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
              Zona para consultas locales (opcional){" "}
              <input value={zone} onChange={(event) => setZone(event.target.value)} placeholder="Alicante" disabled={running || preparing} />
            </label>
            <label>
              <input type="checkbox" checked={includeAudit} onChange={(event) => setIncludeAudit(event.target.checked)} disabled={running} />{" "}
              Incluir auditoría web (técnica y de contenido: 1 búsqueda de Gemini por pregunta)
            </label>
          </div>
          {prepareNote ? <p className="adm-note">{prepareNote}</p> : null}
          <label>
            Preguntas, una por línea
            <textarea rows={10} value={promptsText} onChange={(event) => setPromptsText(event.target.value)} disabled={running} style={{ width: "100%" }} />
          </label>
          <label>
            Competidores, uno por línea (si lo dejas vacío, se calculan al lanzar)
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
          {phase ? ` ${phase}` : ""}
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
