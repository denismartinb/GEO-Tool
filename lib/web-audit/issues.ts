import type { PageAuditEntry } from "@/lib/web-audit/technical-audit";
import type { PageCheckResult } from "@/lib/web-audit/page-checks";
import type { BotAccessReport } from "@/lib/web-audit/robots";

/**
 * WEB-AUDIT-ISSUES-1 (founder-approved 2026-08-02, design artifact "Auditoría
 * web — opción B especificada"): aggregates the per-page technical checks
 * (page-checks.ts) and the bot-access report (robots.ts) that a technical
 * audit snapshot already carries into a short, severity-ordered list of
 * technical problems — plus its mirror, the checks that already pass. Pure
 * function, no I/O, deliberately NOT marked `import "server-only"` (same
 * rationale as opportunity-matrix.ts / action-plan.ts / global-score.ts:
 * importable from Vitest and from the server page alike).
 *
 * Scope boundary: this module covers ONLY technical problems — the ones a
 * single HTML edit or file upload fixes (structured data, metadata,
 * indexability, bot access...). Content gaps (a topic with no own page, a
 * page the AI doesn't cite) are Recomendaciones' territory and are
 * deliberately NOT modeled here — the web-audit page reads
 * opportunity-matrix.ts's WebAuditSummary directly for that recount. See the
 * design artifact's "reparto" section for the full rationale: "La Auditoría
 * arregla tu web. Recomendaciones consigue que te citen."
 */

export type IssueSeverity = "critical" | "warning" | "improvement";

export type IssueCheckKey =
  | "structured_data"
  | "single_h1"
  | "two_h2"
  | "answer_first_intro"
  | "title_length"
  | "description_length"
  | "open_graph"
  | "noindex"
  | "canonical"
  | "hreflang"
  | "list_or_table"
  | "content_length"
  | "freshness"
  | "bot_blocked"
  | "llms_txt_missing"
  | "sitemap_missing";

export type TechnicalIssue = {
  check: IssueCheckKey;
  severity: IssueSeverity;
  /** How many measured instances fail this check (pages, or tracked bot agents for bot_blocked). */
  affectedCount: number;
  /** How many instances this check was actually measured on — the denominator for "N de M". */
  applicableCount: number;
  /**
   * Exact readiness-score points gained by fixing this check alone, rounded
   * to one decimal. Computed from the REAL persisted per-page `pageScore`
   * (never reconstructed from scratch) plus the documented weight table
   * below — see `buildTechnicalIssuesReport`'s header for why this is exact,
   * not an estimate. Null for checks with no scoring weight (bot_blocked,
   * llms_txt_missing, sitemap_missing) or when no affected page has a
   * computable gain (freshness "unknown" — see WEIGHT below).
   */
  pointDelta: number | null;
  /** Affected page URLs (already sanitized, from PageAuditEntry.url) — for bot_blocked, the blocked agent names instead. */
  affectedLabels: string[];
};

export type TechnicalPassingCheck = {
  check: IssueCheckKey;
  /** How many measured instances pass this check. Only present in this list when > 0 — a full fail is fully represented by its `TechnicalIssue`, no redundant "0 de N" row. */
  passedCount: number;
  applicableCount: number;
};

export type TechnicalIssuesReport = {
  /** Severity-ordered (critical → warning → improvement), then by pointDelta descending within a tier. */
  issues: TechnicalIssue[];
  passing: TechnicalPassingCheck[];
  /** How many analyzed pages this report is built from. */
  analyzedPageCount: number;
  /** The real, currently persisted readiness score (mean of analyzed pages' pageScore) — null when no page was analyzed. */
  actualReadinessScore: number | null;
  /** Exact projected readiness score if every issue above were fixed — null when no page was analyzed. */
  projectedReadinessScore: number | null;
  /** projectedReadinessScore - actualReadinessScore, as a real integer (both are real rounded scores) — 0 when there is nothing to project. */
  totalPointPotential: number;
};

/**
 * Mirrors page-checks.ts's point weights exactly (WEB-AUDIT-R3) — kept as a
 * literal copy, not an import, so this module stays a pure aggregator
 * decoupled from the check computation itself (page-checks.ts has no
 * per-sub-check weight exports to import: PageCheckResult only exposes the
 * already-combined `.points` per group). issues.test.ts's "mirrored weights
 * reproduce a real buildPageCheckResult delta" case guards the two from
 * silently diverging if page-checks.ts's weights ever change without this
 * file being updated too — same rationale opportunity-matrix.ts documents
 * for its own mirrored GROUNDED_PROVIDERS copy.
 */
const WEIGHT = {
  structuredData: 15,
  singleH1: 5,
  twoH2: 5,
  answerFirstIntro: 5,
  titleLength: 5,
  descriptionLength: 5,
  openGraph: 5,
  indexableNotNoindex: 10,
  canonicalOk: 5,
  hreflangPresent: 5,
  listOrTable: 10,
  contentLength: 10,
  freshnessFresh: 15,
  freshnessAging: 8
} as const;

type PageLevelCheckKey = Exclude<IssueCheckKey, "bot_blocked" | "llms_txt_missing" | "sitemap_missing">;

type PageCheckDefinition = {
  key: PageLevelCheckKey;
  /** Whether this check's underlying data exists on this page — guards the optional indexability/citability/metadata.ogOk fields (absent on snapshots taken before WEB-AUDIT-R3). A never-measured check is silently excluded, never asserted as passing or failing. */
  isMeasured: (check: PageCheckResult) => boolean;
  /** Only called when isMeasured is true. */
  fails: (check: PageCheckResult) => boolean;
  /**
   * Exact readiness-score points gained on THIS page by fixing the check,
   * given everything else about the page stays the same. Only called for a
   * failing page. Returns null when the gain genuinely cannot be computed —
   * see `pointGainForCheck` below for the one case that needs special
   * handling (a page whose freshness is "unknown").
   */
  gain: (check: PageCheckResult) => number | null;
  /** A hard blocker overrides the point-based severity to "critical" regardless of its computed delta — it doesn't just cost points, it removes the page from citability entirely. */
  hardBlock: boolean;
};

/**
 * The page's current points on every ADDITIVE sub-check (everything except
 * freshness), recomputed from its own booleans against the WEIGHT table
 * above — i.e. the same 0-85 "baseline" buildPageCheckResult itself computes
 * before folding in freshness. Needed only for pages whose freshness is
 * "unknown" (see `pointGainForCheck`); null when this page is missing any of
 * the optional R3 fields (indexability/citability/metadata.ogOk), since then
 * the true baseline isn't fully knowable from this page's data.
 *
 * Known, narrow limitation: this assumes the page's booleans are meant to be
 * weighted under the CURRENT (R3) scheme, which is true for any snapshot
 * this product generates today. A snapshot literally persisted before
 * WEB-AUDIT-R3 shipped (2026-07-13) that ALSO has unknown freshness is the
 * one combination where the resulting gain could be marginally approximate
 * — the same "criterios ampliados" caveat the web-audit page already shows
 * the user for pre-R3 snapshots elsewhere.
 */
function currentBaselineSum(c: PageCheckResult): number | null {
  if (c.indexability === undefined || c.citability === undefined || c.metadata.ogOk === undefined) return null;
  return (
    (c.structuredData.pass ? WEIGHT.structuredData : 0) +
    (c.answerFormat.hasOneH1 ? WEIGHT.singleH1 : 0) +
    (c.answerFormat.hasTwoH2 ? WEIGHT.twoH2 : 0) +
    (c.answerFormat.hasAnswerFirstIntro ? WEIGHT.answerFirstIntro : 0) +
    (c.metadata.titleOk ? WEIGHT.titleLength : 0) +
    (c.metadata.descriptionOk ? WEIGHT.descriptionLength : 0) +
    (c.metadata.ogOk ? WEIGHT.openGraph : 0) +
    (c.indexability.noindex ? 0 : WEIGHT.indexableNotNoindex) +
    (c.indexability.canonicalOk ? WEIGHT.canonicalOk : 0) +
    (c.indexability.hreflangPresent ? WEIGHT.hreflangPresent : 0) +
    (c.citability.hasListOrTable ? WEIGHT.listOrTable : 0) +
    (c.citability.contentOk ? WEIGHT.contentLength : 0)
  );
}

/**
 * Exact per-page point gain from fixing ONE additive sub-check worth
 * `weight` points. For a page with a KNOWN freshness (fresh/aging/stale),
 * `pageScore = round(baseline + freshnessPoints)` — the baseline is summed
 * un-rescaled, so gaining `weight` in the baseline gains exactly `weight` in
 * the final score. That is NOT true for a page with "unknown" freshness:
 * there, `pageScore = round(baseline / 85 * 100)` — the baseline is
 * RESCALED, so the real gain from adding `weight` points to it is
 * `round((baseline+weight)/85*100) - round(baseline/85*100)`, which is
 * LARGER than `weight` (100/85 ≈ 1.18×) and depends on the page's other
 * points too. Verified concretely: fixing structured data (15 pt) alone on
 * an otherwise-empty unknown-freshness page moves that page's score by 18,
 * not 15. A flat constant would have understated every single-check gain on
 * every unknown-freshness page — this function exists specifically to keep
 * that promise ("no es una estimación, es la definición del score") true for
 * those pages too, not just the common (known-freshness) case.
 */
function pointGainForCheck(c: PageCheckResult, weight: number): number | null {
  if (c.freshness.status !== "unknown") return weight;
  const baseline = currentBaselineSum(c);
  if (baseline === null) return null;
  const before = Math.round((baseline / 85) * 100);
  const after = Math.round(((baseline + weight) / 85) * 100);
  return after - before;
}

const PAGE_CHECKS: PageCheckDefinition[] = [
  {
    key: "structured_data",
    isMeasured: () => true,
    fails: (c) => !c.structuredData.pass,
    gain: (c) => pointGainForCheck(c, WEIGHT.structuredData),
    hardBlock: false
  },
  {
    key: "single_h1",
    isMeasured: () => true,
    fails: (c) => !c.answerFormat.hasOneH1,
    gain: (c) => pointGainForCheck(c, WEIGHT.singleH1),
    hardBlock: false
  },
  {
    key: "two_h2",
    isMeasured: () => true,
    fails: (c) => !c.answerFormat.hasTwoH2,
    gain: (c) => pointGainForCheck(c, WEIGHT.twoH2),
    hardBlock: false
  },
  {
    key: "answer_first_intro",
    isMeasured: () => true,
    fails: (c) => !c.answerFormat.hasAnswerFirstIntro,
    gain: (c) => pointGainForCheck(c, WEIGHT.answerFirstIntro),
    hardBlock: false
  },
  {
    key: "title_length",
    isMeasured: () => true,
    fails: (c) => !c.metadata.titleOk,
    gain: (c) => pointGainForCheck(c, WEIGHT.titleLength),
    hardBlock: false
  },
  {
    key: "description_length",
    isMeasured: () => true,
    fails: (c) => !c.metadata.descriptionOk,
    gain: (c) => pointGainForCheck(c, WEIGHT.descriptionLength),
    hardBlock: false
  },
  {
    key: "open_graph",
    // `!== undefined`, not truthy: a legacy pre-R3 snapshot never measured OG
    // at all — that is not the same as a measured failure (see page-checks.ts's
    // buildPageCheckGuidance, which draws the same distinction).
    isMeasured: (c) => c.metadata.ogOk !== undefined,
    fails: (c) => c.metadata.ogOk === false,
    gain: (c) => pointGainForCheck(c, WEIGHT.openGraph),
    hardBlock: false
  },
  {
    key: "noindex",
    isMeasured: (c) => c.indexability !== undefined,
    fails: (c) => c.indexability!.noindex,
    gain: (c) => pointGainForCheck(c, WEIGHT.indexableNotNoindex),
    hardBlock: true
  },
  {
    key: "canonical",
    isMeasured: (c) => c.indexability !== undefined,
    fails: (c) => !c.indexability!.canonicalOk,
    gain: (c) => pointGainForCheck(c, WEIGHT.canonicalOk),
    hardBlock: false
  },
  {
    key: "hreflang",
    isMeasured: (c) => c.indexability !== undefined,
    fails: (c) => !c.indexability!.hreflangPresent,
    gain: (c) => pointGainForCheck(c, WEIGHT.hreflangPresent),
    hardBlock: false
  },
  {
    key: "list_or_table",
    isMeasured: (c) => c.citability !== undefined,
    fails: (c) => !c.citability!.hasListOrTable,
    gain: (c) => pointGainForCheck(c, WEIGHT.listOrTable),
    hardBlock: false
  },
  {
    key: "content_length",
    isMeasured: (c) => c.citability !== undefined,
    fails: (c) => !c.citability!.contentOk,
    gain: (c) => pointGainForCheck(c, WEIGHT.contentLength),
    hardBlock: false
  },
  {
    key: "freshness",
    isMeasured: () => true,
    fails: (c) => c.freshness.status !== "fresh",
    gain: (c) => {
      // Fixing freshness ITSELF means a date now exists — the page leaves
      // the rescale branch entirely rather than moving within it, which is a
      // different (and non-linear, page-dependent) transition than
      // pointGainForCheck models. Left uncomputed (null) for "unknown", same
      // as before; "aging"/"stale" pages already have a known date, so
      // they're not in the rescale branch and the flat delta is exact.
      if (c.freshness.status === "aging") return WEIGHT.freshnessFresh - WEIGHT.freshnessAging;
      if (c.freshness.status === "stale") return WEIGHT.freshnessFresh;
      return null; // "unknown"
    },
    hardBlock: false
  }
];

const CRITICAL_POINT_DELTA = 5;
const WARNING_POINT_DELTA = 1.5;

/**
 * Severity thresholds (founder-approved 2026-08-02): a hard blocker is always
 * "critical" — it isn't a matter of degree. Otherwise severity follows the
 * REAL readiness-score impact: >= 5 pt is worth fixing this week, >= 1.5 pt
 * is worth queuing, anything smaller (including exactly 0, when a check
 * genuinely fails but moves the rounded score by less than a point) is a
 * real but minor improvement — never omitted, just not urgent. A check whose
 * gain isn't computable (pointDelta null — freshness "unknown" on the page,
 * or a legacy page missing the R3 fields `pointGainForCheck` needs to
 * rescale correctly) defaults to "warning": a real, uncosted problem must
 * never read as more urgent than evidence supports, nor be silently
 * downgraded to cosmetic.
 */
function resolveSeverity(hardBlock: boolean, pointDelta: number | null): IssueSeverity {
  if (hardBlock) return "critical";
  if (pointDelta === null) return "warning";
  if (pointDelta >= CRITICAL_POINT_DELTA) return "critical";
  if (pointDelta >= WARNING_POINT_DELTA) return "warning";
  return "improvement";
}

const SEVERITY_ORDER: Record<IssueSeverity, number> = { critical: 0, warning: 1, improvement: 2 };

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

type AnalyzedPage = PageAuditEntry & { check: PageCheckResult };

function isAnalyzed(page: PageAuditEntry): page is AnalyzedPage {
  return page.status === "analyzed" && page.check !== null;
}

/**
 * Builds the technical issues report from an already-computed technical
 * audit snapshot (its `pages` + `bots`, exactly as persisted in
 * `web_audit_snapshots`).
 *
 * Why the point math is exact, not an estimate: `actualReadinessScore` and
 * `projectedReadinessScore` are both `round(mean(pageScore))` over the SAME
 * set of analyzed pages — the former using each page's real, already-
 * persisted `pageScore`, the latter using that same real sum plus the exact
 * point weight gained on every currently-failing page for every check
 * (`combinedTotalGain`). No page's score is ever reconstructed from scratch,
 * so there is no risk of drifting from whatever weight scheme originally
 * produced the persisted `pageScore` (including a snapshot pre-dating
 * WEB-AUDIT-R3's reweighting) — only the GAIN from fixing a specific check is
 * computed from the mirrored WEIGHT table above, and only for pages where
 * that check was actually measured. That gain is a flat weight for a page
 * with known freshness (additive baseline), but is rescaled per page for a
 * page with "unknown" freshness — see `pointGainForCheck`'s header for why a
 * flat weight would silently understate the real gain there.
 *
 * Each issue's own `pointDelta` is `checkGain / analyzedPageCount`, left
 * unrounded-to-integer (rounded only to one decimal) so that, unlike the two
 * final headline scores, it stays proportionally honest for a single check
 * in isolation. Individual pointDeltas will not always sum to exactly
 * `totalPointPotential` — that's expected two-stage rounding, not an error
 * (the headline figure rounds the combined projected mean ONCE; per-issue
 * figures each round independently for their own row).
 */
/**
 * The page-level checks a single page currently fails, in this table's
 * canonical order.
 *
 * Exists so the per-page UI (fase 3b's copyable fixes) can ask "what is wrong
 * with THIS page" without re-implementing the predicates — `PAGE_CHECKS` stays
 * the single definition of what counts as failing, and a check that was never
 * measured on this page is excluded rather than reported as failing.
 */
export function failingPageChecks(check: PageCheckResult): PageLevelCheckKey[] {
  return PAGE_CHECKS.filter((def) => def.isMeasured(check) && def.fails(check)).map((def) => def.key);
}

export function buildTechnicalIssuesReport(pages: PageAuditEntry[], bots: BotAccessReport): TechnicalIssuesReport {
  const analyzed = pages.filter(isAnalyzed);
  const analyzedPageCount = analyzed.length;
  const sumActual = analyzed.reduce((sum, p) => sum + p.check.pageScore, 0);
  const actualReadinessScore = analyzedPageCount > 0 ? Math.round(sumActual / analyzedPageCount) : null;

  const issues: TechnicalIssue[] = [];
  const passing: TechnicalPassingCheck[] = [];
  let combinedTotalGain = 0;

  for (const def of PAGE_CHECKS) {
    const measuredPages = analyzed.filter((p) => def.isMeasured(p.check));
    const applicableCount = measuredPages.length;
    if (applicableCount === 0) continue; // never measured on any analyzed page — nothing to assert either way

    const failingPages = measuredPages.filter((p) => def.fails(p.check));
    const affectedCount = failingPages.length;
    const passedCount = applicableCount - affectedCount;

    if (passedCount > 0) {
      passing.push({ check: def.key, passedCount, applicableCount });
    }
    if (affectedCount === 0) continue;

    let checkGain = 0;
    let gainComputable = false;
    for (const p of failingPages) {
      const gain = def.gain(p.check);
      if (gain === null) continue;
      checkGain += gain;
      gainComputable = true;
    }
    combinedTotalGain += checkGain;

    const pointDelta = gainComputable && analyzedPageCount > 0 ? round1(checkGain / analyzedPageCount) : null;

    issues.push({
      check: def.key,
      severity: resolveSeverity(def.hardBlock, pointDelta),
      affectedCount,
      applicableCount,
      pointDelta,
      affectedLabels: failingPages.map((p) => p.url)
    });
  }

  // Bot access — not per-page, so its applicable/affected units are tracked agents.
  const blockedAgents = bots.bots.filter((b) => !b.allowed);
  const allowedAgentCount = bots.bots.length - blockedAgents.length;
  if (blockedAgents.length > 0) {
    issues.push({
      check: "bot_blocked",
      severity: "critical", // hard block: that whole AI engine can never read any page while it's disallowed
      affectedCount: blockedAgents.length,
      applicableCount: bots.bots.length,
      pointDelta: null, // bot access carries no readiness-score weight — see robots.ts
      affectedLabels: blockedAgents.map((b) => b.agent)
    });
  }
  if (allowedAgentCount > 0) {
    passing.push({ check: "bot_blocked", passedCount: allowedAgentCount, applicableCount: bots.bots.length });
  }

  // llms.txt / sitemap.xml — single project-level facts, always "warning": a
  // real, documented best-practice gap, never blocking, never scored.
  //
  // A probe we could NOT resolve (403 from a WAF, timeout, server error) is
  // neither an issue nor a pass: it is unmeasured, and lands in neither list.
  // That is the same rule `PageCheckDefinition.isMeasured` already applies
  // page-side — "a never-measured check is silently excluded, never asserted
  // as passing or failing" — applied here for the first time.
  //
  // It matters more than it looks. Before this, an unreachable probe produced
  // a warning indistinguishable from a real gap, and since fase 3a/sitemap
  // those warnings carry step-by-step instructions: we would be telling a
  // customer behind an ordinary WAF to create a file they already have.
  // Reachability is reported on its own, in the bot-access card.
  const llmsState = bots.probes?.llmsTxt ?? (bots.llmsTxtFound ? "found" : "absent");
  const sitemapState = bots.probes?.sitemap ?? (bots.sitemapFound ? "found" : "absent");

  if (llmsState === "found") {
    passing.push({ check: "llms_txt_missing", passedCount: 1, applicableCount: 1 });
  } else if (llmsState === "absent") {
    issues.push({ check: "llms_txt_missing", severity: "warning", affectedCount: 1, applicableCount: 1, pointDelta: null, affectedLabels: [] });
  }

  if (sitemapState === "found") {
    passing.push({ check: "sitemap_missing", passedCount: 1, applicableCount: 1 });
  } else if (sitemapState === "absent") {
    issues.push({ check: "sitemap_missing", severity: "warning", affectedCount: 1, applicableCount: 1, pointDelta: null, affectedLabels: [] });
  }

  issues.sort((a, b) => {
    const bySeverity = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    if (bySeverity !== 0) return bySeverity;
    return (b.pointDelta ?? -1) - (a.pointDelta ?? -1);
  });

  const projectedReadinessScore =
    analyzedPageCount > 0 ? Math.round((sumActual + combinedTotalGain) / analyzedPageCount) : null;
  const totalPointPotential =
    actualReadinessScore !== null && projectedReadinessScore !== null ? projectedReadinessScore - actualReadinessScore : 0;

  return { issues, passing, analyzedPageCount, actualReadinessScore, projectedReadinessScore, totalPointPotential };
}
