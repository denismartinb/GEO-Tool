import type { PageCheckResult } from "@/lib/web-audit/page-checks";
import type { PageAuditEntry } from "@/lib/web-audit/technical-audit";
import {
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
 */

export type AuditBlockKey = "geo" | "seo";

export type AuditBlockDefinition = {
  key: AuditBlockKey;
  /** Kicker, menu entry and tab title. */
  label: string;
  question: string;
  /** Every check lives in exactly one block (asserted by test). */
  checks: IssueCheckKey[];
};

export const AUDIT_BLOCKS: Record<AuditBlockKey, AuditBlockDefinition> = {
  geo: {
    key: "geo",
    label: "Auditoría GEO",
    question: "¿Te puede citar la IA?",
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
    checks: [
      "title_length",
      "description_length",
      "single_h1",
      "two_h2",
      "open_graph",
      "canonical",
      "noindex",
      "hreflang",
      "sitemap_missing"
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
  report: Pick<TechnicalIssuesReport, "issues" | "passing">
): AuditBlockView {
  const checks = new Set(AUDIT_BLOCKS[key].checks);
  const base: Totals = { earned: 0, possible: 0 };
  const gainByCheck = new Map<IssueCheckKey, Totals>();

  for (const page of analyzedChecks(pages)) {
    for (const state of pageCheckStates(page)) {
      if (!checks.has(state.check) || state.weight === null) continue;
      base.earned += state.earned;
      base.possible += state.possible;
      if (!state.fails) continue;
      const gain = gainByCheck.get(state.check) ?? { earned: 0, possible: 0 };
      gain.earned += state.weight - state.earned;
      gain.possible += state.weight - state.possible;
      gainByCheck.set(state.check, gain);
    }
  }

  const before = ratio(base);
  const all: Totals = { ...base };
  const issues: BlockIssue[] = report.issues
    .filter((issue) => checks.has(issue.check))
    .map((issue) => {
      const gain = gainByCheck.get(issue.check);
      if (!gain || gain.earned <= 0) return { issue, blockPoints: null };
      all.earned += gain.earned;
      all.possible += gain.possible;
      const after = ratio({ earned: base.earned + gain.earned, possible: base.possible + gain.possible });
      const blockPoints = after === null ? null : Math.round((after - (before ?? 0)) * 10) / 10;
      return { issue, blockPoints };
    });

  const score = before === null ? null : Math.round(before);
  const projected = ratio(all);
  const failing = new Set(report.issues.map((i) => i.check));

  return {
    key,
    score,
    projectedScore: score === null || projected === null ? null : Math.round(projected),
    issues,
    scoredIssueCount: issues.filter((i) => i.blockPoints !== null).length,
    passing: report.passing.filter(
      (p) => checks.has(p.check) && !failing.has(p.check) && p.passedCount === p.applicableCount
    )
  };
}

/** One page's score within a block, for the Páginas tab. Null when the page measured none of its scored checks. */
export function pageBlockScore(check: PageCheckResult, key: AuditBlockKey): number | null {
  const checks = new Set(AUDIT_BLOCKS[key].checks);
  const totals: Totals = { earned: 0, possible: 0 };
  for (const state of pageCheckStates(check)) {
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
