"use client";

import { useState } from "react";
import {
  MAX_GAP_COMPETITORS,
  MAX_LINK_GAP_TARGETS,
  MAX_SEEDS,
  MAX_SERP,
  MAX_VOLUME_KEYWORDS,
  type BacklinkSummary,
  type GapKeyword,
  type KeywordIdea,
  type LinkGapDomain,
  type OrganicCompetitor,
  type RankedKeyword,
  type SerpResult
} from "@/lib/seo-data/dataforseo-parse";
import { runSeoDiagStep, type SeoDiagResult, type SeoDiagStep } from "./actions";

/**
 * SEO-DIAG-0 (log §338): drives the diagnosis one DataForSEO call at a time
 * and keeps every result, including failures and what each call cost, so the
 * downloaded JSON is the whole record of the run.
 */

type StepLog = { label: string; ok: boolean; cost: number; message?: string };

type Diagnosis = {
  domain: string;
  date: string;
  balanceBefore: number | null;
  balanceAfter: number | null;
  ranked: { total: number | null; items: RankedKeyword[] } | null;
  competitors: OrganicCompetitor[] | null;
  gaps: { competitor: string; items: GapKeyword[] }[];
  ideas: KeywordIdea[] | null;
  serps: SerpResult[];
  backlinks: { domain: string; summary: BacklinkSummary }[];
  volumes?: KeywordIdea[] | null;
  linkGap?: { competitors: string[]; total: number | null; items: LinkGapDomain[] } | null;
  steps: StepLog[];
};

const DEFAULT_SEEDS = ["herramienta geo", "posicionamiento en chatgpt", "visibilidad de marca en ia"];
const DEFAULT_SERP = [
  "herramienta geo",
  "qué es geo",
  "posicionamiento en chatgpt",
  "cómo aparecer en chatgpt",
  "seo para ia",
  "generative engine optimization",
  "auditoría geo",
  "visibilidad en ia"
];

/**
 * SEO-RESEARCH-1: the keyword list the SEO plan for genscore.es needs volumes
 * for, and the GEO tools whose linking sites are outreach prospects. Both are
 * editable; they only prefill the boxes.
 */
const DEFAULT_VOLUME_KEYWORDS = [
  "herramienta geo",
  "herramientas geo",
  "mejores herramientas geo",
  "herramientas de visibilidad en ia",
  "herramienta seo para ia",
  "qué es geo",
  "que significa geo",
  "geo seo",
  "geo marketing digital",
  "posicionamiento geo",
  "posicionamiento en ia",
  "posicionamiento en inteligencia artificial",
  "posicionamiento en chatgpt",
  "cómo aparecer en chatgpt",
  "aparecer en chatgpt",
  "cómo aparecer en gemini",
  "cómo aparecer en perplexity",
  "seo para chatgpt",
  "seo para ia",
  "seo ia",
  "aeo",
  "qué es aeo",
  "geo vs seo",
  "diferencia entre seo y geo",
  "generative engine optimization",
  "optimización para motores generativos",
  "auditoría geo",
  "auditoría geo gratis",
  "auditoría seo ia",
  "visibilidad en ia",
  "visibilidad de marca en ia",
  "medir visibilidad en ia",
  "monitorizar marca en chatgpt",
  "aparece mi marca en chatgpt",
  "chatgpt recomienda mi empresa",
  "llms.txt",
  "qué es llms.txt",
  "ai overviews",
  "modo ia google",
  "share of voice ia",
  "geo score",
  "llmo",
  "peec ai",
  "otterly ai",
  "profound ai",
  "alternativas a peec ai",
  "comercio agéntico",
  "agentic commerce",
  "tráfico de chatgpt en ga4",
  "bots de ia robots.txt",
  "gptbot",
  "query fan out",
  "agencia geo",
  "consultor geo",
  "geo para ecommerce",
  "posicionamiento en ia para empresas",
  "herramienta gratuita visibilidad ia"
];
const DEFAULT_LINK_GAP = ["peec.ai", "otterly.ai"];

const lines = (text: string) => text.split("\n").map((line) => line.trim()).filter(Boolean);
const usd = (value: number) => `${value.toLocaleString("es-ES", { minimumFractionDigits: 3, maximumFractionDigits: 4 })} $`;
const n = (value: number | null) => (value === null ? "—" : value.toLocaleString("es-ES", { maximumFractionDigits: 1 }));

function download(name: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

export function SeoDiagRunner() {
  const [domain, setDomain] = useState("genscore.es");
  const [seedsText, setSeedsText] = useState(DEFAULT_SEEDS.join("\n"));
  const [serpText, setSerpText] = useState(DEFAULT_SERP.join("\n"));
  const [competitorsText, setCompetitorsText] = useState("");
  const [volumeText, setVolumeText] = useState(DEFAULT_VOLUME_KEYWORDS.join("\n"));
  const [linkGapText, setLinkGapText] = useState(DEFAULT_LINK_GAP.join("\n"));
  const [running, setRunning] = useState(false);
  const [phase, setPhase] = useState<string | null>(null);
  const [diag, setDiag] = useState<Diagnosis | null>(null);

  const seeds = lines(seedsText).slice(0, MAX_SEEDS);
  const serpKeywords = lines(serpText).slice(0, MAX_SERP);
  const volumeKeywords = lines(volumeText).slice(0, MAX_VOLUME_KEYWORDS);
  const linkGapTargets = lines(linkGapText).slice(0, MAX_LINK_GAP_TARGETS);

  /** "full" is the SEO-DIAG-0 diagnosis; "research" runs only the two SEO-RESEARCH-1 calls. */
  async function run(mode: "full" | "research") {
    setRunning(true);
    const result: Diagnosis = {
      domain: domain.trim(),
      date: new Date().toISOString().slice(0, 10),
      balanceBefore: null,
      balanceAfter: null,
      ranked: null,
      competitors: null,
      gaps: [],
      ideas: null,
      serps: [],
      backlinks: [],
      steps: []
    };
    const publish = () => setDiag({ ...result, steps: [...result.steps] });

    async function step<T>(label: string, input: SeoDiagStep): Promise<T | null> {
      setPhase(label);
      let reply: SeoDiagResult;
      try {
        reply = await runSeoDiagStep(input);
      } catch {
        reply = { ok: false, cost: 0, message: "El paso falló (tiempo agotado o dato no válido)" };
      }
      result.steps.push(reply.ok ? { label, ok: true, cost: reply.cost } : { label, ok: false, cost: reply.cost, message: reply.message });
      publish();
      return reply.ok ? (reply.data as T) : null;
    }

    try {
      result.balanceBefore = await step<number>("Saldo inicial", { kind: "balance" });
      if (mode === "research") {
        if (volumeKeywords.length) result.volumes = await step<KeywordIdea[]>("Volumen de tus palabras", { kind: "volume", keywords: volumeKeywords });
        if (linkGapTargets.length >= 2) {
          const gap = await step<{ total: number | null; items: LinkGapDomain[] }>("Webs que enlazan a tus competidores y no a ti", {
            kind: "linkgap",
            domain,
            competitors: linkGapTargets
          });
          if (gap) result.linkGap = { competitors: linkGapTargets, ...gap };
        }
        result.balanceAfter = await step<number>("Saldo final", { kind: "balance" });
        return;
      }
      result.ranked = await step("Palabras en las que ya sale", { kind: "ranked", domain });
      result.competitors = await step("Competidores orgánicos", { kind: "competitors", domain });

      const chosen = lines(competitorsText);
      const rivals = (chosen.length ? chosen : (result.competitors ?? []).map((row) => row.domain)).slice(0, MAX_GAP_COMPETITORS);
      for (const competitor of rivals) {
        const items = await step<GapKeyword[]>(`Palabras de ${competitor} que tú no tienes`, { kind: "gap", domain, competitor });
        if (items) result.gaps.push({ competitor, items });
      }

      if (seeds.length) result.ideas = await step("Ideas por tema", { kind: "ideas", seeds });

      for (const keyword of serpKeywords) {
        const serp = await step<SerpResult>(`Top 20 de «${keyword}»`, { kind: "serp", domain, keyword });
        if (serp) result.serps.push(serp);
      }

      for (const target of [domain, ...rivals]) {
        const summary = await step<BacklinkSummary>(`Enlaces de ${target}`, { kind: "backlinks", domain: target });
        if (summary) result.backlinks.push({ domain: target, summary });
      }

      result.balanceAfter = await step<number>("Saldo final", { kind: "balance" });
    } finally {
      publish();
      setPhase(null);
      setRunning(false);
    }
  }

  const total = diag?.steps.reduce((sum, row) => sum + row.cost, 0) ?? 0;
  const worstCalls = 2 + MAX_GAP_COMPETITORS + 1 + serpKeywords.length + 1 + MAX_GAP_COMPETITORS;

  return (
    <section className="adm-study">
      <div style={{ display: "grid", gap: 10, maxWidth: 640, margin: "12px 0" }}>
        <label>
          Dominio <input value={domain} onChange={(event) => setDomain(event.target.value)} disabled={running} />
        </label>
        <label>
          Temas para buscar ideas, uno por línea (máximo {MAX_SEEDS})
          <textarea rows={3} value={seedsText} onChange={(event) => setSeedsText(event.target.value)} disabled={running} style={{ width: "100%" }} />
        </label>
        <label>
          Búsquedas para ver su Top 20, una por línea (máximo {MAX_SERP})
          <textarea rows={6} value={serpText} onChange={(event) => setSerpText(event.target.value)} disabled={running} style={{ width: "100%" }} />
        </label>
        <label>
          Competidores para comparar, uno por línea (si lo dejas vacío, los {MAX_GAP_COMPETITORS} primeros que encuentre DataForSEO)
          <textarea rows={3} value={competitorsText} onChange={(event) => setCompetitorsText(event.target.value)} disabled={running} style={{ width: "100%" }} />
        </label>
        <h2 className="adm-h2">Investigación</h2>
        <label>
          Palabras de las que quieres el volumen, una por línea (máximo {MAX_VOLUME_KEYWORDS}, una sola llamada)
          <textarea rows={6} value={volumeText} onChange={(event) => setVolumeText(event.target.value)} disabled={running} style={{ width: "100%" }} />
        </label>
        <label>
          Competidores cuyas webs enlazadoras quieres ver, uno por línea (entre 2 y {MAX_LINK_GAP_TARGETS}; salen las webs que enlazan a todos ellos y no a
          tu dominio)
          <textarea rows={3} value={linkGapText} onChange={(event) => setLinkGapText(event.target.value)} disabled={running} style={{ width: "100%" }} />
        </label>
      </div>
      <div className="adm-toolbar" style={{ gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <button type="button" className="btn btn-primary" onClick={() => run("full")} disabled={running || !domain.trim()}>
          {running ? "Ejecutando…" : `Lanzar diagnóstico (hasta ${worstCalls} llamadas)`}
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => run("research")}
          disabled={running || !domain.trim() || (volumeKeywords.length === 0 && linkGapTargets.length < 2)}
        >
          Lanzar sólo la investigación (2 llamadas)
        </button>
        {diag && !running ? (
          <button type="button" className="btn btn-ghost" onClick={() => download(`seo-${diag.domain}-${diag.date}.json`, JSON.stringify(diag, null, 2))}>
            Descargar resultados (.json)
          </button>
        ) : null}
      </div>
      {running ? <p className="adm-note">{phase}… No cierres esta pestaña: es la que lanza cada paso.</p> : null}

      {diag ? (
        <div style={{ display: "grid", gap: 24, marginTop: 16 }}>
          <div>
            <h2 className="adm-h2">Coste</h2>
            <p className="adm-note">
              Total: <b>{usd(total)}</b>
              {diag.balanceBefore !== null ? ` · saldo antes ${usd(diag.balanceBefore)}` : ""}
              {diag.balanceAfter !== null ? ` · después ${usd(diag.balanceAfter)}` : ""}
            </p>
            <div className="adm-table-wrap">
              <table className="adm-table">
                <thead>
                  <tr>
                    <th>Paso</th>
                    <th>Resultado</th>
                    <th className="adm-num">Coste</th>
                  </tr>
                </thead>
                <tbody>
                  {diag.steps.map((row, index) => (
                    <tr key={index}>
                      <td>{row.label}</td>
                      <td>{row.ok ? "Bien" : `Error: ${row.message}`}</td>
                      <td className="adm-num">{usd(row.cost)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {diag.ranked ? (
            <Table
              title={`Palabras en las que ya sale (${n(diag.ranked.total)} en total)`}
              head={["Palabra", "Búsq./mes", "Dificultad", "Puesto", "Página"]}
              rows={diag.ranked.items.slice(0, 50).map((row) => [row.keyword, n(row.volume), n(row.difficulty), n(row.position), row.url ?? "—"])}
            />
          ) : null}
          {diag.competitors ? (
            <Table
              title="Competidores orgánicos"
              head={["Dominio", "Palabras en común", "Puesto medio", "Palabras", "Tráfico estimado"]}
              rows={diag.competitors.map((row) => [row.domain, n(row.sharedKeywords), n(row.avgPosition), n(row.keywords), n(row.traffic)])}
            />
          ) : null}
          {diag.gaps.map((gap) => (
            <Table
              key={gap.competitor}
              title={`Palabras de ${gap.competitor} que ${diag.domain} no tiene`}
              head={["Palabra", "Búsq./mes", "Dificultad", `Puesto de ${gap.competitor}`]}
              rows={gap.items.slice(0, 30).map((row) => [row.keyword, n(row.volume), n(row.difficulty), n(row.competitorPosition)])}
            />
          ))}
          {diag.ideas ? (
            <Table
              title="Ideas por tema"
              head={["Palabra", "Búsq./mes", "Dificultad", "Intención"]}
              rows={diag.ideas.slice(0, 50).map((row) => [row.keyword, n(row.volume), n(row.difficulty), row.intent ?? "—"])}
            />
          ) : null}
          {diag.serps.length ? (
            <Table
              title="Top 20 de cada búsqueda"
              head={["Búsqueda", "Tu puesto", "Mapa", "Primeros 5"]}
              rows={diag.serps.map((serp) => [
                serp.keyword,
                serp.ownPosition === null ? "Fuera del Top 20" : String(serp.ownPosition),
                serp.hasLocalPack ? "Sí" : "No",
                serp.organic.slice(0, 5).map((row) => row.domain).join(", ") || "—"
              ])}
            />
          ) : null}
          {diag.volumes ? (
            <Table
              title="Volumen de tus palabras"
              head={["Palabra", "Búsq./mes", "Dificultad", "Intención"]}
              rows={[...diag.volumes]
                .sort((a, b) => (b.volume ?? -1) - (a.volume ?? -1))
                .map((row) => [row.keyword, n(row.volume), n(row.difficulty), row.intent ?? "—"])}
            />
          ) : null}
          {diag.linkGap ? (
            <Table
              title={`Webs que enlazan a ${diag.linkGap.competitors.join(", ")} y no a ${diag.domain} (${n(diag.linkGap.total)} en total)`}
              head={["Web", "Rango", "Enlaza a", "Enlaces", "Spam"]}
              rows={diag.linkGap.items.map((row) => [row.domain, n(row.rank), String(row.linkedTargets), n(row.backlinks), n(row.spamScore)])}
            />
          ) : null}
          {diag.backlinks.length ? (
            <Table
              title="Enlaces"
              head={["Dominio", "Webs que enlazan", "Enlaces", "Rango DataForSEO"]}
              rows={diag.backlinks.map((row) => [row.domain, n(row.summary.referringDomains), n(row.summary.backlinks), n(row.summary.rank)])}
            />
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function Table({ title, head, rows }: { title: string; head: string[]; rows: string[][] }) {
  return (
    <div>
      <h2 className="adm-h2">{title}</h2>
      {rows.length === 0 ? (
        <p className="adm-note">Sin resultados.</p>
      ) : (
        <div className="adm-table-wrap">
          <table className="adm-table">
            <thead>
              <tr>
                {head.map((cell) => (
                  <th key={cell}>{cell}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={index}>
                  {row.map((cell, cellIndex) => (
                    <td key={cellIndex}>{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
