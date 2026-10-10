import { buildGlobalScore, type GlobalScore } from "@/lib/web-audit/global-score";
import { brandKey, type AnswerRecord } from "@/lib/studies/sector-study";
import { LOCAL_SCHEMA, type ProspectAudit } from "@/lib/studies/prospect-audit-format";

/**
 * SECTOR-STUDY-1 (prospect report) — the web-audit screen's opportunity
 * matrix and global score, rebuilt over one study instead of persisted scans.
 * Pure, so it is tested and importable from the browser.
 *
 * Same rules as `lib/web-audit/opportunity-matrix.ts`, with the window being
 * this study's answers to the question instead of the last scans:
 *  - a topic is "covered" only when the coverage call verified an own-domain
 *    page; a failed or skipped call is inconclusive and leaves the
 *    denominator, never counts as "no content";
 *  - "cited" means a grounded engine's answer cited the domain, by majority of
 *    that question's grounded answers (`isCitedByMajority`);
 *  - only Gemini and ChatGPT are grounded (GROUNDED_PROVIDERS, ADR 0012):
 *    Claude does not search, so it never counts toward "cited".
 */

export type CoverageTopicResult = {
  promptIndex: number;
  /** "failed" = the call threw; "skipped" = not attempted for lack of time. Both are inconclusive. */
  status: "ok" | "failed" | "skipped";
  pages: Array<{ url: string; title: string }>;
  /** The model's description of the pages it found — interpretation, never the verdict. */
  aiNote: string | null;
};

export type CoverageClass = "content_named" | "content_not_named" | "no_content" | "inconclusive";
export type MatrixOutcome = "performing" | "invisible" | "content_gap" | "open_opportunity" | "unverified_cited" | "inconclusive";

export type CoverageRow = {
  promptIndex: number;
  coverageClass: CoverageClass;
  outcome: MatrixOutcome;
  /** Valid answers to this question that named the brand / valid answers. */
  named: number;
  valid: number;
  /** Grounded answers citing an own-domain page / grounded valid answers. */
  cited: number;
  grounded: number;
  pages: Array<{ url: string; title: string }>;
};

export type CoverageSummary = {
  rows: CoverageRow[];
  conclusive: number;
  covered: number;
  performing: number;
  coveragePct: number | null;
  surfacingPct: number | null;
  /** Coverage calls actually made (attempted), i.e. LLM spend. */
  calls: number;
};

const GROUNDED = new Set(["gemini", "openai"]);

export function isOwnDomain(domain: string | null, root: string): boolean {
  if (!domain || !root) return false;
  const host = domain.toLowerCase().replace(/^www\./, "");
  return host === root || host.endsWith(`.${root}`);
}

export function summarizeCoverage(input: {
  domain: string;
  brand: string;
  promptCount: number;
  records: AnswerRecord[];
  coverage: CoverageTopicResult[];
}): CoverageSummary {
  const brand = brandKey(input.brand);
  const byPrompt = new Map(input.coverage.map((result) => [result.promptIndex, result]));
  const rows: CoverageRow[] = [];
  for (let promptIndex = 0; promptIndex < input.promptCount; promptIndex += 1) {
    const valid = input.records.filter((record) => record.promptIndex === promptIndex && record.error === null);
    const named = valid.filter((record) => record.seedMentions.some((mention) => brandKey(mention.name) === brand)).length;
    const grounded = valid.filter((record) => GROUNDED.has(record.engine));
    const cited = grounded.filter((record) => (record.citations ?? []).some((citation) => isOwnDomain(citation.domain, input.domain))).length;
    const competitorsNamed = valid.some((record) => record.seedMentions.some((mention) => brandKey(mention.name) !== brand));
    const result = byPrompt.get(promptIndex);
    const pages = result?.status === "ok" ? result.pages : [];

    let coverageClass: CoverageClass;
    let outcome: MatrixOutcome;
    if (!result || result.status !== "ok" || valid.length === 0) {
      coverageClass = "inconclusive";
      outcome = "inconclusive";
    } else {
      const found = pages.length > 0;
      const citedByMajority = grounded.length > 0 && cited * 2 >= grounded.length;
      coverageClass = !found ? "no_content" : named > 0 || cited > 0 ? "content_named" : "content_not_named";
      outcome = found
        ? citedByMajority
          ? "performing"
          : "invisible"
        : citedByMajority
          ? "unverified_cited"
          : competitorsNamed
            ? "content_gap"
            : "open_opportunity";
    }
    rows.push({ promptIndex, coverageClass, outcome, named, valid: valid.length, cited, grounded: grounded.length, pages });
  }
  const conclusive = rows.filter((row) => row.outcome !== "inconclusive");
  const covered = conclusive.filter((row) => row.pages.length > 0);
  const performing = covered.filter((row) => row.outcome === "performing");
  return {
    rows,
    conclusive: conclusive.length,
    covered: covered.length,
    performing: performing.length,
    coveragePct: conclusive.length > 0 ? Math.round((covered.length / conclusive.length) * 100) : null,
    surfacingPct: covered.length > 0 ? Math.round((performing.length / covered.length) * 100) : null,
    calls: input.coverage.filter((result) => result.status !== "skipped").length
  };
}

export function prospectGlobalScore(summary: CoverageSummary | null, audit: ProspectAudit | null): GlobalScore {
  return buildGlobalScore({
    coveragePct: summary?.coveragePct ?? null,
    surfacingPct: summary?.surfacingPct ?? null,
    technicalScore: audit?.readinessScore ?? audit?.homepageScore ?? null
  });
}

const CLASS_LABEL: Record<CoverageClass, string> = {
  content_named: "Tiene contenido y la IA la nombra o la cita",
  content_not_named: "Tiene contenido, pero la IA no la nombra",
  no_content: "No tiene contenido sobre esto",
  inconclusive: "Sin dato (la comprobación falló)"
};

const OUTCOME_LABEL: Record<MatrixOutcome, string> = {
  performing: "Funciona",
  invisible: "Invisible",
  content_gap: "Hueco de contenido",
  open_opportunity: "Oportunidad abierta",
  unverified_cited: "Citada sin página verificada",
  inconclusive: "Sin dato"
};

const pct = (part: number, whole: number) => (whole > 0 ? `${Math.round((part / whole) * 100)}%` : "—");

export function formatCoverageSection(summary: CoverageSummary, prompts: string[]): string {
  const out = ["## Cobertura de contenido por consulta", ""];
  out.push(
    `Para cada consulta, una búsqueda de Google restringida al dominio (la misma que hace «Auditar mi web» en GenScore) y sólo cuenta como contenido una página que resuelve al propio dominio. ${summary.calls === 1 ? "1 búsqueda" : `${summary.calls} búsquedas`} en total. «La IA la cita» se mide sobre las respuestas de Gemini y ChatGPT, los dos motores que buscan en la web; Claude no cita páginas.`,
    ""
  );
  if (summary.conclusive === 0) {
    out.push("No se pudo comprobar ninguna consulta: sin dato de cobertura.", "");
    return out.join("\n");
  }
  out.push(
    `- **Consultas con contenido propio:** ${summary.coveragePct}% de las que se pudieron comprobar${summary.conclusive < summary.rows.length ? ` (${pct(summary.rows.length - summary.conclusive, summary.rows.length)} sin dato)` : ""}.`,
    `- **De esas, la IA cita la web en la mayoría de respuestas:** ${summary.surfacingPct === null ? "sin dato (ninguna consulta con contenido)" : `${summary.surfacingPct}%`}.`,
    ""
  );
  for (const coverageClass of ["content_named", "content_not_named", "no_content", "inconclusive"] as const) {
    const count = summary.rows.filter((row) => row.coverageClass === coverageClass).length;
    if (count > 0) out.push(`- ${CLASS_LABEL[coverageClass]}: ${pct(count, summary.rows.length)} de las consultas.`);
  }
  out.push("", "| # | Consulta | Clase | Matriz | Nombra la marca | Cita la web | Página propia encontrada |", "|---|---|---|---|---|---|---|");
  for (const row of summary.rows) {
    out.push(
      `| ${row.promptIndex + 1} | ${(prompts[row.promptIndex] ?? "").replace(/\|/g, "/")} | ${CLASS_LABEL[row.coverageClass]} | ${OUTCOME_LABEL[row.outcome]} | ${pct(row.named, row.valid)} | ${pct(row.cited, row.grounded)} | ${row.pages.length ? row.pages.map((page) => page.url.replace(/\|/g, "/")).join(" · ") : "—"} |`
    );
  }
  out.push("");
  return out.join("\n");
}

const COMPONENT_LABEL = { content: "Contenido", surfacing: "Visibilidad de ese contenido", technical: "Salud técnica" } as const;

export function formatGlobalScoreSection(score: GlobalScore): string {
  const out = ["## Nota global de preparación", ""];
  out.push(
    "Misma fórmula que la Auditoría web de GenScore: la media simple de los componentes que tienen dato. Un componente sin dato no cuenta como cero, se deja fuera.",
    ""
  );
  out.push(`- **Nota global:** ${score.score === null ? "sin dato" : `${score.score}/100 (sobre ${score.includedCount} de 3 componentes)`}.`);
  for (const component of score.components) {
    out.push(`- ${COMPONENT_LABEL[component.key]}: ${component.value === null ? "sin dato" : `${Math.round(component.value)}/100`}.`);
  }
  out.push("");
  return out.join("\n");
}

const probe = (state: string) => (state === "found" ? "sí" : state === "absent" ? "no" : "sin dato");

function auditCells(audit: ProspectAudit | null): string[] {
  if (!audit) return Array(8).fill("no se pudo auditar");
  const evidence = audit.evidence;
  const noData = "sin dato";
  return [
    audit.homepageScore === null ? noData : `${audit.homepageScore}/100`,
    audit.robots === "unknown" ? noData : audit.blockedBots.length ? audit.blockedBots.join(", ") : "ninguno",
    probe(audit.llmsTxt),
    audit.sitemap === "found" && audit.sitemapInvalid ? "no válido" : probe(audit.sitemap),
    evidence ? (evidence.jsonLdTypes.some((type) => LOCAL_SCHEMA.test(type)) ? "sí" : "no") : noData,
    evidence ? `${evidence.titleLength} caracteres` : noData,
    evidence ? (evidence.descriptionLength ? `${evidence.descriptionLength} caracteres` : "no tiene") : noData,
    evidence ? `${evidence.wordCount} palabras` : noData
  ];
}

const COMPARISON_ROWS = [
  "Nota técnica de la portada",
  "Bots de IA bloqueados",
  "llms.txt",
  "sitemap.xml",
  "Schema Organization / LocalBusiness",
  "Título",
  "Meta description",
  "Texto visible sin JavaScript"
];

export function formatCompetitorComparison(input: {
  brand: string;
  target: ProspectAudit | null;
  competitors: Array<{ name: string; domain: string; audit: ProspectAudit | null }>;
  omitted: string[];
}): string {
  const out = ["## Comparativa técnica con competidores", ""];
  out.push(
    "La misma auditoría determinista (portada, robots.txt, llms.txt, sitemap.xml) sobre los competidores más nombrados en este estudio. Sólo la portada: la comparación es de igual a igual.",
    ""
  );
  if (input.competitors.length === 0) {
    out.push("No hay competidores con dominio conocido para comparar.", "");
  } else {
    const columns = [{ name: input.brand, cells: auditCells(input.target) }, ...input.competitors.map((c) => ({ name: `${c.name} (${c.domain})`, cells: auditCells(c.audit) }))];
    out.push(`| Comprobación | ${columns.map((column) => column.name.replace(/\|/g, "/")).join(" | ")} |`, `|---|${columns.map(() => "---").join("|")}|`);
    COMPARISON_ROWS.forEach((label, index) => out.push(`| ${label} | ${columns.map((column) => column.cells[index]).join(" | ")} |`));
    out.push("");
  }
  if (input.omitted.length > 0) {
    out.push(`Sin comparar, porque no tenemos su dominio de forma fiable (se escribieron a mano): ${input.omitted.join(", ")}.`, "");
  }
  return out.join("\n");
}
