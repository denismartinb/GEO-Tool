import type { SerpResult } from "@/lib/seo-data/dataforseo-parse";
import { isRetryable, needsOperator, SEO_ERROR_MESSAGES, type SeoErrorCategory } from "@/lib/seo-tracking/errors";

/**
 * SEO-TRACK-1 (log §340): one pass of the weekly SERP cron, with every side
 * effect injected so the scheduling rules are testable without a database or
 * a provider. The rules are the scan pipeline's, applied one level down:
 *
 * - The pass is bounded by an absolute deadline and a spend ceiling, never by
 *   a row count. What it cannot reach stays pending for the next pass of the
 *   same Monday (ADR 0029).
 * - Nothing starts without room for a real call, and a call in flight gets a
 *   timeout trimmed to the deadline (log §228).
 * - A call the budget cut is NOT persisted as a provider error: that would
 *   drop the keyword from this week for a reason that was ours (log §228).
 * - One bounded retry for timeouts and provider errors; none for `auth` or
 *   `balance`, which stop the whole pass because every other call would fail
 *   the same way. Those two are not saved as the keyword's error: it stays
 *   pending for the next pass.
 * - Calls start staggered, not all on the same tick (log §56).
 */

export type PendingKeyword = { keywordId: string; projectId: string; ownerUserId: string; keyword: string; ownDomain: string };

export type SerpFetchResult = { ok: true; cost: number; serp: SerpResult } | { ok: false; cost: number; category: SeoErrorCategory };

export type SnapshotRow = {
  keyword_id: string;
  project_id: string;
  owner_user_id: string;
  week_start: string;
  status: "ok" | "error";
  error: string | null;
  own_position: number | null;
  own_url: string | null;
  own_title: string | null;
  top10: { position: number; domain: string; url: string; title: string | null }[];
  has_local_pack: boolean | null;
  questions: string[];
  cost_usd: number;
};

export type SerpPassDeps = {
  pending: PendingKeyword[];
  weekStart: string;
  fetchSerp: (keyword: string, ownDomain: string, timeoutMs: number) => Promise<SerpFetchResult>;
  save: (row: SnapshotRow) => Promise<boolean>;
  now: () => number;
  sleep: (ms: number) => Promise<void>;
  /** Absolute epoch ms by which the pass must have stopped starting work. */
  deadline: number;
  spendCeilingUsd: number;
  concurrency?: number;
};

export type SerpPassResult = {
  saved: number;
  errors: Partial<Record<SeoErrorCategory, number>>;
  /** Left for the next pass: never started, or cut by our own budget. */
  deferred: number;
  spentUsd: number;
  stoppedBy: "done" | "deadline" | "spend" | "operator";
  /** Set when the pass stopped on `auth` or `balance`. */
  operatorCategory: SeoErrorCategory | null;
};

/** A real SERP call takes a few seconds; below this there is no point starting one. */
export const MIN_CALL_MS = 8_000;
export const CALL_TIMEOUT_MS = 30_000;
const STAGGER_MS = 250;
/** Unit price of a Top 20 SERP call (log §338). */
export const TIMEOUT_CHARGE_USD = 0.004;
const DEFAULT_CONCURRENCY = 4;
/** Matches the length check on `seo_serp_snapshots.own_title`. */
export const OWN_TITLE_MAX = 300;

export function snapshotFromSerp(keyword: PendingKeyword, weekStart: string, serp: SerpResult, cost: number): SnapshotRow {
  return {
    keyword_id: keyword.keywordId,
    project_id: keyword.projectId,
    owner_user_id: keyword.ownerUserId,
    week_start: weekStart,
    status: "ok",
    error: null,
    own_position: serp.ownPosition,
    own_url: serp.ownUrl,
    own_title: serp.ownTitle ? serp.ownTitle.slice(0, OWN_TITLE_MAX) : null,
    top10: serp.organic.filter((row) => row.position <= 10).slice(0, 10),
    has_local_pack: serp.hasLocalPack,
    questions: serp.questions.slice(0, 8),
    cost_usd: cost
  };
}

function errorRow(keyword: PendingKeyword, weekStart: string, category: SeoErrorCategory, cost: number): SnapshotRow {
  return {
    keyword_id: keyword.keywordId,
    project_id: keyword.projectId,
    owner_user_id: keyword.ownerUserId,
    week_start: weekStart,
    status: "error",
    error: SEO_ERROR_MESSAGES[category],
    own_position: null,
    own_url: null,
    own_title: null,
    top10: [],
    has_local_pack: null,
    questions: [],
    cost_usd: cost
  };
}

export async function runSerpPass(deps: SerpPassDeps): Promise<SerpPassResult> {
  const queue = [...deps.pending];
  const result: SerpPassResult = { saved: 0, errors: {}, deferred: 0, spentUsd: 0, stoppedBy: "done", operatorCategory: null };
  let stop: SerpPassResult["stoppedBy"] | null = null;

  const room = () => deps.deadline - deps.now();

  /** Starts one call if it fits, with the timeout trimmed to the deadline. */
  async function attempt(item: PendingKeyword): Promise<{ outcome: SerpFetchResult; budgetCut: boolean } | null> {
    const left = room();
    if (left < MIN_CALL_MS) return null;
    const timeout = Math.min(CALL_TIMEOUT_MS, left - 1_000);
    const outcome = await deps.fetchSerp(item.keyword, item.ownDomain, timeout);
    // An aborted live task may still be billed, so a timeout counts at the
    // unit price toward the ceiling even when the reply reported nothing.
    const timedOut = !outcome.ok && outcome.category === "timeout";
    result.spentUsd += outcome.cost > 0 ? outcome.cost : timedOut ? TIMEOUT_CHARGE_USD : 0;
    const budgetCut = !outcome.ok && outcome.category === "timeout" && timeout < CALL_TIMEOUT_MS;
    return { outcome, budgetCut };
  }

  async function worker(index: number) {
    await deps.sleep(index * STAGGER_MS);
    for (;;) {
      if (stop) return;
      if (result.spentUsd >= deps.spendCeilingUsd) {
        stop = "spend";
        return;
      }
      if (room() < MIN_CALL_MS) {
        stop = "deadline";
        return;
      }
      const item = queue.shift();
      if (!item) return;

      let first = await attempt(item);
      if (!first) {
        queue.unshift(item);
        stop = "deadline";
        return;
      }
      if (!first.outcome.ok && !first.budgetCut && isRetryable(first.outcome.category)) {
        const second = await attempt(item);
        if (second) first = second;
      }

      const { outcome, budgetCut } = first;
      if (outcome.ok) {
        if (await deps.save(snapshotFromSerp(item, deps.weekStart, outcome.serp, outcome.cost))) result.saved += 1;
        continue;
      }
      if (budgetCut) {
        result.deferred += 1;
        continue;
      }
      result.errors[outcome.category] = (result.errors[outcome.category] ?? 0) + 1;
      if (needsOperator(outcome.category)) {
        // Not the keyword's fault: it stays pending, so a top-up on the same
        // Monday lets the next pass take it.
        queue.unshift(item);
        result.operatorCategory = outcome.category;
        stop = "operator";
        return;
      }
      await deps.save(errorRow(item, deps.weekStart, outcome.category, outcome.cost));
    }
  }

  const workers = Math.max(1, Math.min(deps.concurrency ?? DEFAULT_CONCURRENCY, queue.length || 1));
  await Promise.all(Array.from({ length: workers }, (_, index) => worker(index)));

  result.deferred += queue.length;
  result.stoppedBy = stop ?? "done";
  return result;
}
