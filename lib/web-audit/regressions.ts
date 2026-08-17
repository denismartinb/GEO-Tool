import type { BotAccessReport, BotAgent, ProbeState } from "@/lib/web-audit/robots";
import type { PageAuditEntry } from "@/lib/web-audit/technical-audit";
import type { WebAuditSummary } from "@/lib/web-audit/opportunity-matrix";

/**
 * WEB-AUDIT-ALERTS-1 — the pure half of the audit regression alerts: given the
 * previous audit and the current one, name everything that got *worse*.
 *
 * Why this exists at all (founder, 2026-08-04): since AUDIT-AFTER-SCAN-1 the
 * audit refreshes itself every day, and nobody is told when the result is
 * worse than yesterday's. You would have to go and look. The two technical
 * kinds are the reason the phase is worth doing — a robots.txt edit, a deploy
 * that drops a file — because they happen without anyone touching them on
 * purpose and they leave you invisible to the AI with no visible symptom.
 *
 * ------------------------------------------------------------------------
 * Every kind here is a TRANSITION, never a state
 * ------------------------------------------------------------------------
 *
 * Nothing fires because a condition *is* bad; it fires because it *became*
 * bad since the previous audit. That single rule is what keeps a daily job
 * from turning into a daily nag: llms.txt that is still missing tomorrow
 * produces silence, because tomorrow's "previous" already had it missing.
 * It is also why every comparison here needs an explicit previous value and
 * degrades to "no finding" when it does not have one — a first audit, or an
 * older snapshot written before a field existed, is unknown, not a
 * regression (docs/specs/web-audit/phase-3-daily-audit.md, "Regression
 * notices"; docs/specs/notifications/notifications-v1.md section 4.5).
 *
 * Pure and I/O-free on purpose (same rationale as opportunity-matrix.ts):
 * the caller loads both sides, this decides. lib/web-audit/regression-alerts.ts
 * is the server-side half that loads and emits.
 */

/** Sample topic labels carried in a payload, so the bell copy can name one. */
const MAX_SAMPLE_TOPICS = 3;

/** Sample page URLs carried in a `page_unreachable` payload. */
const MAX_SAMPLE_PAGES = 3;

/**
 * Fetch statuses that mean "the page did not answer", as opposed to "we chose
 * not to analyze it". Deliberately narrow: `skipped_offsite`,
 * `skipped_unsafe_ip` and `skipped_not_html` are decisions this product made
 * about a URL, and reporting them as an outage would be a false alarm on the
 * one alert whose whole value is that it is believable.
 */
const UNREACHABLE_STATUSES = new Set<PageAuditEntry["status"]>(["skipped_timeout", "skipped_error"]);

export type AuditRegression =
  | { kind: "coverage_dropped"; count: number; sampleTopics: string[] }
  | { kind: "surfacing_dropped"; count: number; sampleTopics: string[] }
  | { kind: "ai_bot_blocked"; agent: BotAgent }
  | { kind: "llms_txt_lost" }
  | { kind: "sitemap_lost" }
  | { kind: "page_unreachable"; count: number; sampleUrls: string[] };

export type AuditRegressionKind = AuditRegression["kind"];

/**
 * One side of the comparison. `summary` is null for a project that has never
 * completed a coverage campaign — the technical half still compares.
 */
export type AuditSide = {
  summary: WebAuditSummary | null;
  bots: BotAccessReport | null;
  pages: PageAuditEntry[];
};

function topicsByPromptId(summary: WebAuditSummary | null): Map<string, WebAuditSummary["topics"][number]> {
  const map = new Map<string, WebAuditSummary["topics"][number]>();
  for (const topic of summary?.topics ?? []) map.set(topic.promptId, topic);
  return map;
}

/**
 * Topics that lost verified own content: conclusively covered before,
 * conclusively not covered now.
 *
 * Compared per topic, NOT by comparing the two coverage percentages. The
 * percentage's denominator is `conclusiveCount`, so a topic merely going
 * *inconclusive* (a transient Gemini failure, a budget cutoff) moves the
 * percentage without anything having regressed — and "inconclusive is
 * unknown, not regression" is an explicit acceptance criterion of this phase.
 * Excluding it is free here because `outcome === "inconclusive"` already
 * encodes exactly that case (opportunity-matrix.ts).
 */
export function detectCoverageDrops(previous: AuditSide, current: AuditSide): string[] {
  const currentByPromptId = topicsByPromptId(current.summary);
  const dropped: string[] = [];

  for (const before of previous.summary?.topics ?? []) {
    if (before.outcome === "inconclusive" || !before.found) continue;
    const after = currentByPromptId.get(before.promptId);
    // A topic that simply is not in the current audit was not measured
    // (the prompt was deactivated, the campaign did not reach it). Silence.
    if (!after || after.outcome === "inconclusive" || after.found) continue;
    dropped.push(after.topic || before.topic);
  }

  return dropped;
}

/**
 * Topics the AI stopped citing an own page for: `performing` → `invisible`.
 *
 * Both outcomes require `found === true`, so this can only ever mean "the
 * content is still there and the AI stopped surfacing it" — never a content
 * loss double-counted with coverage_dropped, and never an inconclusive topic
 * (neither outcome is reachable from one).
 *
 * The noise guard is not here: `performing`/`invisible` are already decided
 * by a majority-of-window rule over the last CITATION_WINDOW_SIZE scans
 * (opportunity-matrix.ts, WEB-AUDIT-R6 phase 2), precisely because grounding
 * is a noisy sensor and one scan's citation flip must not flip the verdict.
 * Adding a second smoothing layer on top would only delay a real regression.
 */
export function detectSurfacingDrops(previous: AuditSide, current: AuditSide): string[] {
  const currentByPromptId = topicsByPromptId(current.summary);
  const dropped: string[] = [];

  for (const before of previous.summary?.topics ?? []) {
    if (before.outcome !== "performing") continue;
    const after = currentByPromptId.get(before.promptId);
    if (after?.outcome !== "invisible") continue;
    dropped.push(after.topic || before.topic);
  }

  return dropped;
}

/**
 * Bots that went from being able to read the site to being blocked.
 *
 * Requires an explicit `allowed: true` on the previous side. The spec's draft
 * wording ("permitido *o inexistente*") is deliberately not implemented: an
 * agent absent from the previous report means the previous audit did not
 * track it, which happens the day a bot is added to TRACKED_BOT_AGENTS. That
 * is a discovery about a pre-existing robots.txt, not something that got
 * worse — and firing a `critical` alert for it would train the founder to
 * distrust the one alert that most needs to be believed.
 *
 * Not capped or aggregated. `Disallow: /` under `User-agent: *` genuinely
 * blocks every tracked bot at once, and a cap would report a total blackout
 * as if it were partial — the exact "silent truncation reads as full
 * coverage" failure this codebase keeps writing rules against.
 */
export function detectNewlyBlockedBots(previous: AuditSide, current: AuditSide): BotAgent[] {
  // `bots` comes off a jsonb column whose default is `{}`, so the inner
  // `bots` array genuinely can be absent on a persisted row however the
  // TypeScript type reads. Missing means "we have no bot data", which is
  // unknown, not blocked.
  const before = Array.isArray(previous.bots?.bots) ? previous.bots.bots : [];
  const after = Array.isArray(current.bots?.bots) ? current.bots.bots : [];
  const allowedBefore = new Map(before.map((entry) => [entry.agent, entry.allowed]));

  return after
    .filter((entry) => entry.allowed === false && allowedBefore.get(entry.agent) === true)
    .map((entry) => entry.agent);
}

/**
 * A file the project used to serve and no longer does.
 *
 * Two guards, for two different ways this alert could lie.
 *
 * 1. `before === true`, never truthiness. `sitemapFound` only exists on
 *    snapshots written after WEB-AUDIT-R3, so it is `undefined` on older rows,
 *    and `undefined → false` is "we did not use to look", not "it vanished".
 *
 * 2. The current side must have been *told* the file is gone. WEB-AUDIT-SITEMAP-1
 *    gave the report a per-probe `ProbeState`, and it is what makes this alert
 *    worth believing: `found: false` on its own conflates "the server answered
 *    404" with "a WAF returned 403 / it timed out / DNS failed". Firing a
 *    *critical* «tu llms.txt ha desaparecido» on a transient blip is precisely
 *    the false positive that teaches the founder to ignore the alert — and the
 *    two file alerts exist because they are the ones that most need believing.
 *
 * A snapshot written before probes existed has no state to consult, so it
 * falls back to presence-only. That is strictly the old behaviour for old
 * rows, and never applies to a snapshot written from here on.
 */
function lostFile(
  before: boolean | undefined,
  after: boolean | undefined,
  afterProbe: ProbeState | undefined
): boolean {
  if (before !== true) return false;
  if (afterProbe) return afterProbe === "absent";
  return after === false;
}

/**
 * Pages that answered in the previous audit and did not in this one.
 *
 * Only URLs audited on BOTH sides are compared: the candidate set is derived
 * from data that moves between audits (coverage pages, grounding citations),
 * so a URL simply no longer being a candidate says nothing about whether it
 * is up. Aggregated into one finding — a deploy that takes down a section
 * takes down several pages, and that is one event, not five.
 */
export function detectUnreachablePages(previous: AuditSide, current: AuditSide): string[] {
  // Same jsonb caveat as the bot report: read defensively, never assume.
  const before = Array.isArray(previous.pages) ? previous.pages : [];
  const statusBefore = new Map(before.map((page) => [page.url, page.status]));

  return (Array.isArray(current.pages) ? current.pages : [])
    .filter((page) => UNREACHABLE_STATUSES.has(page.status) && statusBefore.get(page.url) === "analyzed")
    .map((page) => page.url);
}

/**
 * The whole comparison, in the order the findings should be read: what the AI
 * can no longer reach first (technical, silent, actionable in minutes), then
 * what got worse about the content itself.
 */
export function detectAuditRegressions(previous: AuditSide, current: AuditSide): AuditRegression[] {
  const regressions: AuditRegression[] = [];

  for (const agent of detectNewlyBlockedBots(previous, current)) {
    regressions.push({ kind: "ai_bot_blocked", agent });
  }

  if (lostFile(previous.bots?.llmsTxtFound, current.bots?.llmsTxtFound, current.bots?.probes?.llmsTxt)) {
    regressions.push({ kind: "llms_txt_lost" });
  }

  if (lostFile(previous.bots?.sitemapFound, current.bots?.sitemapFound, current.bots?.probes?.sitemap)) {
    regressions.push({ kind: "sitemap_lost" });
  }

  const unreachable = detectUnreachablePages(previous, current);
  if (unreachable.length > 0) {
    regressions.push({
      kind: "page_unreachable",
      count: unreachable.length,
      sampleUrls: unreachable.slice(0, MAX_SAMPLE_PAGES)
    });
  }

  const surfacingDrops = detectSurfacingDrops(previous, current);
  if (surfacingDrops.length > 0) {
    regressions.push({
      kind: "surfacing_dropped",
      count: surfacingDrops.length,
      sampleTopics: surfacingDrops.slice(0, MAX_SAMPLE_TOPICS)
    });
  }

  const coverageDrops = detectCoverageDrops(previous, current);
  if (coverageDrops.length > 0) {
    regressions.push({
      kind: "coverage_dropped",
      count: coverageDrops.length,
      sampleTopics: coverageDrops.slice(0, MAX_SAMPLE_TOPICS)
    });
  }

  return regressions;
}
