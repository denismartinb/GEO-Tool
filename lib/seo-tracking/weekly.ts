import "server-only";

import { sendSeoTrackingAlertEmail } from "@/lib/email/transactional";
import { dataForSeoConfigured } from "@/lib/seo-data/dataforseo";
import { needsOperator, type SeoErrorCategory } from "@/lib/seo-tracking/errors";
import { fetchBacklinks, fetchSerp } from "@/lib/seo-tracking/provider";
import { runSerpPass, MIN_CALL_MS, CALL_TIMEOUT_MS, type SerpPassResult } from "@/lib/seo-tracking/serp-pass";
import { loadCompetitorsDue, loadPendingKeywords, markOperatorAlerted, operatorCategoriesAlertedThisWeek, saveBacklinks, saveSnapshot } from "@/lib/seo-tracking/store";
import { weekStartUtc } from "@/lib/seo-tracking/week";
import type { createServiceClient } from "@/lib/supabase/service";

/**
 * SEO-TRACK-1 (log §341, §342): one pass of keyword tracking. The cron
 * (`/api/cron/seo-serp`) fires every 10 minutes; each pass takes what is still
 * pending for this week (a keyword with no snapshot since Monday UTC), so a
 * pass that runs out of time or budget just leaves the rest to the next one,
 * and a quiet pass costs nothing. The cron is the engine; there is no chain
 * of self-calls to break (log §261, §262).
 *
 * The same pass, scoped to one project, runs right after a customer saves
 * keywords or rivals (`after()` in the server actions), so the first snapshot
 * exists within minutes instead of next week. That run is an accelerator:
 * whatever it cannot finish is still pending for the cron.
 *
 * After the SERPs, if time and money are left, it refreshes the monthly
 * backlink summaries of the projects it served.
 */

type Service = ReturnType<typeof createServiceClient>;

/** Leaves room under `maxDuration = 60` for the response and the alert. */
export const PASS_BUDGET_MS = 48_000;
/** Hard ceiling per pass, far above a normal Monday, so a bug cannot burn the balance. */
export const PASS_SPEND_CEILING_USD = 2;

export type WeeklyRunSummary =
  | { status: "not_configured" }
  | { status: "tables_missing" }
  | {
      status: "ran";
      weekStart: string;
      pending: number;
      overCap: number;
      notEligible: number;
      serp: SerpPassResult;
      backlinksRefreshed: number;
      alerted: SeoErrorCategory | null;
    };

export type SeoTrackingRunOptions = {
  startedAt?: number;
  /** Only this project's keywords and rivals (the run after a customer saves). */
  projectId?: string;
  /** Wall-clock budget for the pass; defaults to the cron's. */
  budgetMs?: number;
  concurrency?: number;
};

/** The run after a save shares its invocation with the action's response. */
export const IMMEDIATE_BUDGET_MS = 40_000;
export const IMMEDIATE_CONCURRENCY = 8;

export async function runWeeklySeoTracking(service: Service, opts: SeoTrackingRunOptions = {}): Promise<WeeklyRunSummary> {
  if (!dataForSeoConfigured()) return { status: "not_configured" };

  const startedAt = opts.startedAt ?? Date.now();
  const now = new Date(startedAt);
  const weekStart = weekStartUtc(now);
  const deadline = startedAt + Math.min(opts.budgetMs ?? PASS_BUDGET_MS, PASS_BUDGET_MS);

  const load = await loadPendingKeywords(service, weekStart, { projectId: opts.projectId });
  if (!load.available) return { status: "tables_missing" };

  const serp = await runSerpPass({
    pending: load.pending,
    weekStart,
    fetchSerp,
    save: (row) => saveSnapshot(service, row),
    now: Date.now,
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    deadline,
    spendCeilingUsd: PASS_SPEND_CEILING_USD,
    concurrency: opts.concurrency
  });

  let backlinksRefreshed = 0;
  let operatorCategory = serp.operatorCategory;
  let spent = serp.spentUsd;
  if (!operatorCategory && serp.deferred === 0) {
    for (const competitor of await loadCompetitorsDue(service, load.eligibleProjects, now)) {
      const left = deadline - Date.now();
      if (left < MIN_CALL_MS || spent >= PASS_SPEND_CEILING_USD) break;
      const reply = await fetchBacklinks(competitor.domain, Math.min(CALL_TIMEOUT_MS, left - 1_000));
      spent += reply.cost;
      if (reply.ok) {
        await saveBacklinks(service, competitor, reply, now);
        backlinksRefreshed += 1;
        continue;
      }
      if (needsOperator(reply.category)) {
        operatorCategory = reply.category;
        break;
      }
    }
  }

  // One email per category and week. The marker goes in only after the send
  // succeeded, so a failed send is retried by the next pass.
  let alerted: SeoErrorCategory | null = null;
  if (operatorCategory && !(await operatorCategoriesAlertedThisWeek(service, weekStart)).has(operatorCategory)) {
    const sent = await sendSeoTrackingAlertEmail({ category: operatorCategory, weekStart, saved: serp.saved, deferred: serp.deferred, spentUsd: spent });
    if (sent) {
      await markOperatorAlerted(service, weekStart, operatorCategory);
      alerted = operatorCategory;
    }
  }

  return {
    status: "ran",
    weekStart,
    pending: load.pending.length,
    overCap: load.overCap,
    notEligible: load.notEligible,
    serp: { ...serp, spentUsd: spent },
    backlinksRefreshed,
    alerted
  };
}
