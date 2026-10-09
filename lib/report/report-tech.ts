import type { IssueCheckKey, TechnicalIssuesReport } from "@/lib/web-audit/issues";
import { formatShare, type ReportTechCheck } from "@/lib/report/report-model";

/**
 * GEO-REPORT-1 Fase 2 — the technical table of the report (page 6), read off
 * the same `buildTechnicalIssuesReport` the Auditoría web screen shows. Pure.
 *
 * A check that appears in neither `issues` nor `passing` was never measured
 * on this snapshot (an old row, a page that could not be read) and is left
 * out, never shown as passing (`.claude/rules/web-audit.md`, tri-state).
 * Partial failures are a percentage of pages, never "N de M"
 * (`.claude/rules/report.md`).
 */

type RowDef = { check: IssueCheckKey; label: string; detail: string | null; ok: string; missing?: string };

const ROWS: RowDef[] = [
  { check: "bot_blocked", label: "Bots de IA con acceso", detail: "GPTBot, ClaudeBot, Google-Extended y otros", ok: "Todos" },
  { check: "llms_txt_missing", label: "llms.txt", detail: "Guía de la web pensada para modelos de IA", ok: "Lo tienes", missing: "No lo tienes" },
  { check: "sitemap_missing", label: "Mapa del sitio", detail: "Comprobado en /sitemap.xml", ok: "Responde", missing: "No responde" },
  { check: "answer_first_intro", label: "La primera frase responde", detail: "Un párrafo inicial que dice qué haces", ok: "Bien" },
  { check: "structured_data", label: "Datos estructurados", detail: "JSON-LD que la IA puede leer", ok: "Bien" },
  { check: "noindex", label: "Páginas indexables", detail: null, ok: "Bien" },
  { check: "snippet_blocked", label: "Fragmentos permitidos", detail: "Sin nosnippet ni max-snippet:0", ok: "Bien" },
  { check: "title_length", label: "Título de la página", detail: "Entre 15 y 70 caracteres", ok: "Bien" },
  { check: "description_length", label: "Meta descripción", detail: "Entre 50 y 160 caracteres", ok: "Bien" },
  { check: "freshness", label: "Contenido actualizado", detail: "Con fecha de última modificación", ok: "Bien" }
];

export function buildReportTechChecks(report: TechnicalIssuesReport): ReportTechCheck[] {
  const out: ReportTechCheck[] = [];
  for (const row of ROWS) {
    const issue = report.issues.find((i) => i.check === row.check);
    const passing = report.passing.find((p) => p.check === row.check);
    const base = { label: row.label, detail: row.detail };
    if (issue) {
      if (row.check === "bot_blocked") {
        out.push({ ...base, state: "bad", text: `Bloqueas a ${issue.affectedLabels.join(", ")}` });
      } else if (row.missing) {
        out.push({ ...base, state: "warn", text: row.missing });
      } else {
        const all = issue.applicableCount > 0 && issue.affectedCount >= issue.applicableCount;
        const state = issue.severity === "critical" || all ? "bad" : "warn";
        const text = all
          ? issue.applicableCount === 1
            ? "No"
            : "Falla en todas las páginas"
          : `Falla en el ${formatShare(issue.affectedCount / Math.max(issue.applicableCount, 1))} de las páginas`;
        out.push({ ...base, state, text });
      }
    } else if (passing) {
      out.push({ ...base, state: "ok", text: row.ok });
    }
  }
  return out;
}
