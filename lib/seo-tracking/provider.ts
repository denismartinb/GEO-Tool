import "server-only";

import { callDataForSeo, SPAIN } from "@/lib/seo-data/dataforseo";
import { readBacklinkSummary, readSerp } from "@/lib/seo-data/dataforseo-parse";
import { categorizeDfsFailure, type SeoErrorCategory } from "@/lib/seo-tracking/errors";
import type { SerpFetchResult } from "@/lib/seo-tracking/serp-pass";

/**
 * SEO-TRACK-1 (log §340): the two DataForSEO calls the weekly cron makes, on
 * the same transport and readers as the operator diagnosis (SEO-DIAG-0).
 * Live endpoints, Google Spain. A Top 20 (`depth: 20`) is what SEO-DIAG-0
 * measured at 0.004 $; the own position comes from Search Console anyway, so
 * a deeper read would cost more for a number the screen already has.
 */
export const SERP_DEPTH = 20;

export async function fetchSerp(keyword: string, ownDomain: string, timeoutMs: number): Promise<SerpFetchResult> {
  const reply = await callDataForSeo("serp/google/organic/live/advanced", { keyword, ...SPAIN, device: "desktop", depth: SERP_DEPTH }, timeoutMs);
  if (!reply.ok) return { ok: false, cost: reply.cost, category: categorizeDfsFailure(reply.code, reply.message) };
  return { ok: true, cost: reply.cost, serp: readSerp(reply.result, keyword, ownDomain) };
}

export type BacklinksFetchResult =
  | { ok: true; cost: number; referringDomains: number | null; backlinks: number | null }
  | { ok: false; cost: number; category: SeoErrorCategory };

export async function fetchBacklinks(domain: string, timeoutMs: number): Promise<BacklinksFetchResult> {
  const reply = await callDataForSeo("backlinks/summary/live", { target: domain, include_subdomains: true }, timeoutMs);
  if (!reply.ok) return { ok: false, cost: reply.cost, category: categorizeDfsFailure(reply.code, reply.message) };
  const summary = readBacklinkSummary(reply.result);
  return { ok: true, cost: reply.cost, referringDomains: summary.referringDomains, backlinks: summary.backlinks };
}
