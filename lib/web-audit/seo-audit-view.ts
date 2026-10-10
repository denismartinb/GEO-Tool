import type {
  IssueCheckKey,
  IssueSeverity,
  TechnicalIssue,
  TechnicalIssuesReport,
  TechnicalPassingCheck
} from "@/lib/web-audit/issues";
import type { IssueAudience } from "@/lib/web-audit/issue-labels";

/**
 * What the Auditoría SEO screen shows on top of `buildTechnicalIssuesReport`
 * (SEARCH-SEO-1 Fase 1b, design in `docs/design-reference/search-seo-1/`).
 * Pure and side-effect free, like the report it reads: it never counts a
 * check the report did not measure, so the screen, Visión general's card and
 * this view always agree on what failed.
 */

export type SeoAreaKey = "crawl" | "tags" | "content" | "structured";

export type SeoAreaDefinition = {
  key: SeoAreaKey;
  label: string;
  /** What the area covers, in the user's words. */
  hint: string;
  audience: IssueAudience[];
  checks: IssueCheckKey[];
};

/**
 * Every check belongs to exactly one area (asserted by test). Speed and
 * mobile experience, which the approved design also shows, have no check
 * behind them until Fase 2, so they are not areas yet: a bar with nothing
 * measured under it would be a filler number.
 */
export const SEO_AREAS: SeoAreaDefinition[] = [
  {
    key: "crawl",
    label: "Rastreo e indexación",
    hint: "robots.txt, sitemap, noindex, canonical",
    audience: ["google", "ia"],
    checks: ["noindex", "snippet_blocked", "canonical", "bot_blocked", "sitemap_missing", "llms_txt_missing"]
  },
  {
    key: "tags",
    label: "Etiquetas",
    hint: "título, descripción, encabezados, idiomas",
    audience: ["google", "ia"],
    checks: ["title_length", "description_length", "single_h1", "two_h2", "open_graph", "hreflang"]
  },
  {
    key: "content",
    label: "Contenido citable",
    hint: "respuesta al principio, listas, extensión, fecha",
    audience: ["google", "ia"],
    checks: ["answer_first_intro", "list_or_table", "content_length", "freshness"]
  },
  {
    key: "structured",
    label: "Datos estructurados",
    hint: "JSON-LD que entienden Google y la IA",
    audience: ["google", "ia"],
    checks: ["structured_data"]
  }
];

export type SeoArea = {
  key: SeoAreaKey;
  label: string;
  hint: string;
  audience: IssueAudience[];
  /** Share of measured instances (pages, bots or files) that pass, 0–100. */
  pct: number;
};

/**
 * One bar per area: the share of measured instances that pass its checks.
 * A ratio of real counts, never a weight table of our own, so it cannot
 * contradict the technical score next to it. An area with nothing measured
 * is left out.
 */
export function buildSeoAreas(report: Pick<TechnicalIssuesReport, "issues" | "passing">): SeoArea[] {
  const passedByCheck = new Map<IssueCheckKey, { passed: number; applicable: number }>();
  for (const p of report.passing) passedByCheck.set(p.check, { passed: p.passedCount, applicable: p.applicableCount });
  for (const issue of report.issues) {
    if (!passedByCheck.has(issue.check)) {
      passedByCheck.set(issue.check, { passed: 0, applicable: issue.applicableCount });
    }
  }

  const areas: SeoArea[] = [];
  for (const def of SEO_AREAS) {
    let passed = 0;
    let applicable = 0;
    for (const check of def.checks) {
      const counts = passedByCheck.get(check);
      if (!counts) continue;
      passed += counts.passed;
      applicable += counts.applicable;
    }
    if (applicable === 0) continue;
    areas.push({
      key: def.key,
      label: def.label,
      hint: def.hint,
      audience: def.audience,
      pct: Math.round((passed / applicable) * 100)
    });
  }
  return areas;
}

export type FixFilter = "all" | IssueSeverity | "ok";

export type FixListRow =
  | { kind: "issue"; issue: TechnicalIssue }
  | { kind: "ok"; passing: TechnicalPassingCheck };

export type FixList = {
  rows: FixListRow[];
  counts: Record<FixFilter, number>;
};

/**
 * «Qué arreglar»: the report's issues in its own order (severity, then
 * points), followed by the checks every measured page passes. A check that
 * passes on some pages and fails on others is an issue, not «Bien»: listing
 * it under both would say two things about the same check.
 */
export function buildFixList(report: Pick<TechnicalIssuesReport, "issues" | "passing">): FixList {
  const failing = new Set(report.issues.map((i) => i.check));
  const ok = report.passing.filter((p) => !failing.has(p.check) && p.passedCount === p.applicableCount);
  const rows: FixListRow[] = [
    ...report.issues.map((issue) => ({ kind: "issue" as const, issue })),
    ...ok.map((passing) => ({ kind: "ok" as const, passing }))
  ];
  const counts: Record<FixFilter, number> = {
    all: rows.length,
    critical: report.issues.filter((i) => i.severity === "critical").length,
    warning: report.issues.filter((i) => i.severity === "warning").length,
    improvement: report.issues.filter((i) => i.severity === "improvement").length,
    ok: ok.length
  };
  return { rows, counts };
}

export type SeoScoreBand = { key: "good" | "fair" | "poor"; label: string };

/**
 * The verbal band under the score. Same thresholds `scoreColor` already
 * paints the page rings with (`< 40` red, `< 70` amber), so a page row and
 * the headline never disagree about what a number means.
 */
export function seoScoreBand(score: number): SeoScoreBand {
  if (score >= 70) return { key: "good", label: "Buena" };
  if (score >= 40) return { key: "fair", label: "Mejorable" };
  return { key: "poor", label: "Baja" };
}
