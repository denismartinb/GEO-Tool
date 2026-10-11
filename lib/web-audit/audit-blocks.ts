import type { PageCheckResult } from "@/lib/web-audit/page-checks";
import type { PageAuditEntry } from "@/lib/web-audit/technical-audit";
import { buildSeoExtras, seoPageExtraStates, type SeoExtraState } from "@/lib/web-audit/seo-health";
import type { BotAccessReport } from "@/lib/web-audit/robots";
import {
  SEVERITY_ORDER,
  pageCheckStates,
  type IssueCheckKey,
  type TechnicalIssue,
  type TechnicalIssuesReport,
  type TechnicalPassingCheck
} from "@/lib/web-audit/issues";

/**
 * The two blocks of the audit screen (SEARCH-SEO-1 Fase 1b, log §275, design
 * in `docs/design-reference/search-seo-1/auditoria-geo-seo.html`): «Auditoría
 * GEO» asks whether the AI can cite the site, «Auditoría SEO» whether Google
 * finds it. Pure, like `buildTechnicalIssuesReport`, which it only splits.
 *
 * No new metric. A block's score is the share of its own checks' points the
 * pages earn, with the weights `page-checks.ts` already uses (GEO 55 points,
 * SEO 45), so the two blocks together are the same technical score that feeds
 * the GEO Score. Unscored checks (bots, llms.txt, snippet, sitemap) stay
 * unscored here too.
 *
 * Exception, approved by the founder for SEARCH-SEO-1 Fase 2 (log §281): the
 * SEO block's score is the «Salud SEO». It adds the checks of
 * `seo-health.ts` (speed, Googlebot, HTTPS, viewport, alt text, duplicate
 * metadata) with their own weights, so its 45 + 55 points make 100. Those
 * checks never reach `pageScore`, so the Salud técnica and the GEO Score
 * stay exactly as they were. The GEO block is untouched.
 */

export type AuditBlockKey = "geo" | "seo";

export type AuditBlockDefinition = {
  key: AuditBlockKey;
  /** Kicker, menu entry and tab title. */
  label: string;
  question: string;
  /** What the block's number is called: «Nota GEO», «Salud SEO». */
  scoreLabel: string;
  /** Every check lives in exactly one block (asserted by test). */
  checks: IssueCheckKey[];
};

export const AUDIT_BLOCKS: Record<AuditBlockKey, AuditBlockDefinition> = {
  geo: {
    key: "geo",
    label: "Auditoría GEO",
    question: "¿Te puede citar la IA?",
    scoreLabel: "Nota GEO",
    checks: [
      "structured_data",
      "answer_first_intro",
      "list_or_table",
      "content_length",
      "freshness",
      "bot_blocked",
      "snippet_blocked",
      "llms_txt_missing"
    ]
  },
  seo: {
    key: "seo",
    label: "Auditoría SEO",
    question: "¿Te encuentra Google?",
    scoreLabel: "Salud SEO",
    checks: [
      "title_length",
      "description_length",
      "single_h1",
      "two_h2",
      "open_graph",
      "canonical",
      "noindex",
      "hreflang",
      "sitemap_missing",
      "page_speed",
      "googlebot_blocked",
      "https_redirect",
      "viewport_missing",
      "image_alt_missing",
      "duplicate_metadata",
      "local_business_missing"
    ]
  }
};

export const AUDIT_BLOCK_ORDER: AuditBlockKey[] = ["geo", "seo"];

/** The query parameter the menu entries and the block switch use. */
export const AUDIT_BLOCK_PARAM = "bloque";

export function auditBlockOf(check: IssueCheckKey): AuditBlockKey {
  return AUDIT_BLOCKS.seo.checks.includes(check) ? "seo" : "geo";
}

/** `?bloque=seo` opens the SEO block; anything else, or nothing, the GEO one. */
export function parseAuditBlock(value: string | string[] | null | undefined): AuditBlockKey {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw === "seo" ? "seo" : "geo";
}

export type BlockIssue = {
  issue: TechnicalIssue;
  /**
   * Block points gained by fixing this check alone, one decimal. Null for an
   * unscored check, which the screen labels «sin puntos».
   */
  blockPoints: number | null;
};

export type AuditBlockView = {
  key: AuditBlockKey;
  /** 0–100, null when no analyzed page measured any scored check of the block. */
  score: number | null;
  /** The block's score if every scored issue were fixed. */
  projectedScore: number | null;
  /** In the report's order: severity, then points. */
  issues: BlockIssue[];
  /** Issues that carry block points: the «Si arreglas los N…» count. */
  scoredIssueCount: number;
  /** Checks every measured instance passes. A partial pass is an issue, not «Correcto». */
  passing: TechnicalPassingCheck[];
};

type Totals = { earned: number; possible: number };

function analyzedChecks(pages: PageAuditEntry[]): PageCheckResult[] {
  return pages.flatMap((p) => (p.status === "analyzed" && p.check ? [p.check] : []));
}

function ratio({ earned, possible }: Totals): number | null {
  return possible > 0 ? (earned / possible) * 100 : null;
}

/**
 * Exact, not estimated: the block score is Σearned / Σpossible over the
 * analyzed pages, and fixing a check moves each failing page to its full
 * weight. A page with no detected date also gains the 15 freshness points in
 * its denominator when it gets one, which is why the gain is a difference of
 * two ratios and not a plain weight.
 */
export function buildAuditBlock(
  key: AuditBlockKey,
  pages: PageAuditEntry[],
  report: Pick<TechnicalIssuesReport, "issues" | "passing">,
  /** The snapshot's site report. The SEO block reads the Salud SEO site facts from it; without it, only the page checks count. */
  bots?: BotAccessReport | null
): AuditBlockView {
  const checks = new Set(AUDIT_BLOCKS[key].checks);
  const base: Totals = { earned: 0, possible: 0 };
  const gainByCheck = new Map<IssueCheckKey, Totals>();
  const extras = key === "seo" ? buildSeoExtras(pages, bots) : { states: [], issues: [], passing: [] };

  const add = (state: { check: IssueCheckKey; fails: boolean; weight: number | null; earned: number; possible: number }) => {
    if (!checks.has(state.check) || state.weight === null) return;
    base.earned += state.earned;
    base.possible += state.possible;
    if (!state.fails) return;
    const gain = gainByCheck.get(state.check) ?? { earned: 0, possible: 0 };
    gain.earned += state.weight - state.earned;
    gain.possible += state.weight - state.possible;
    gainByCheck.set(state.check, gain);
  };
  for (const page of analyzedChecks(pages)) for (const state of pageCheckStates(page)) add(state);
  for (const state of extras.states) add(state);

  const before = ratio(base);
  const all: Totals = { ...base };
  const allIssues = [...report.issues.filter((issue) => checks.has(issue.check)), ...extras.issues];
  const issues: BlockIssue[] = allIssues
    .map((issue) => {
      const gain = gainByCheck.get(issue.check);
      if (!gain || gain.earned <= 0) return { issue, blockPoints: null };
      all.earned += gain.earned;
      all.possible += gain.possible;
      const after = ratio({ earned: base.earned + gain.earned, possible: base.possible + gain.possible });
      const blockPoints = after === null ? null : Math.round((after - (before ?? 0)) * 10) / 10;
      return { issue, blockPoints };
    });
  // The report's order (severity, then readiness points) does not know the
  // Salud SEO checks, so the SEO block re-sorts by its own points.
  if (key === "seo") {
    issues.sort((a, b) => {
      const bySeverity = SEVERITY_ORDER[a.issue.severity] - SEVERITY_ORDER[b.issue.severity];
      if (bySeverity !== 0) return bySeverity;
      return (b.blockPoints ?? -1) - (a.blockPoints ?? -1);
    });
  }

  const score = before === null ? null : Math.round(before);
  const projected = ratio(all);
  const failing = new Set(allIssues.map((i) => i.check));

  return {
    key,
    score,
    projectedScore: score === null || projected === null ? null : Math.round(projected),
    issues,
    scoredIssueCount: issues.filter((i) => i.blockPoints !== null).length,
    passing: [...report.passing, ...extras.passing].filter(
      (p) => checks.has(p.check) && !failing.has(p.check) && p.passedCount === p.applicableCount
    )
  };
}

/** One page's score within a block, for the Páginas tab. Null when the page measured none of its scored checks. */
export function pageBlockScore(
  check: PageCheckResult,
  key: AuditBlockKey,
  /** The Salud SEO states that apply to this page (`seoPageExtraStates`, plus the site facts if the caller has them). */
  extraStates: SeoExtraState[] = key === "seo" ? seoPageExtraStates(check) : []
): number | null {
  const checks = new Set(AUDIT_BLOCKS[key].checks);
  const totals: Totals = { earned: 0, possible: 0 };
  for (const state of [...pageCheckStates(check), ...extraStates]) {
    if (!checks.has(state.check) || state.weight === null) continue;
    totals.earned += state.earned;
    totals.possible += state.possible;
  }
  const value = ratio(totals);
  return value === null ? null : Math.round(value);
}

/**
 * «+22 pt» on a row. Under one point reads «<1 pt» rather than «+0 pt»: the
 * check does fail and fixing it does move the score.
 */
export function formatBlockPoints(points: number): string {
  return points < 1 ? "<1 pt" : `+${Math.round(points)} pt`;
}
