"use server";

import { requireOperator } from "@/lib/admin/operator";
import { callDataForSeo, readBalance, SPAIN } from "@/lib/seo-data/dataforseo";
import {
  MAX_SEEDS,
  readBacklinkSummary,
  readCompetitors,
  readKeywordGap,
  readKeywordIdeas,
  readRankedKeywords,
  readSerp
} from "@/lib/seo-data/dataforseo-parse";
import { normalizeStudyDomain } from "@/lib/studies/sector-study";

/**
 * SEO-DIAG-0 (log §339): one step of the operator SEO diagnosis. The browser
 * drives the steps so each one gets its own 60 s invocation; every step is
 * revalidated here and bounded by fixed `limit`s and `MAX_SEEDS` topics. The
 * runner sends at most `MAX_SERP` searches, so the worst case is known
 * before pressing.
 *
 * Gate: `requireOperator()` inside the action (.claude/rules/admin.md). No
 * database write and nothing sent anywhere but DataForSEO.
 */

const MAX_TEXT = 80;

export type SeoDiagStep =
  | { kind: "balance" }
  | { kind: "ranked"; domain: string }
  | { kind: "competitors"; domain: string }
  | { kind: "gap"; domain: string; competitor: string }
  | { kind: "ideas"; seeds: string[] }
  | { kind: "serp"; domain: string; keyword: string }
  | { kind: "backlinks"; domain: string };

export type SeoDiagResult = { ok: true; cost: number; data: unknown } | { ok: false; cost: number; message: string };

const cleanText = (value: string) => value.trim().replace(/\s+/g, " ").slice(0, MAX_TEXT);

function domainOrThrow(raw: string): string {
  const domain = normalizeStudyDomain(raw);
  if (!domain) throw new Error("bad_domain");
  return domain;
}

export async function runSeoDiagStep(step: SeoDiagStep): Promise<SeoDiagResult> {
  await requireOperator("/admin/seo-diagnostico");

  if (step.kind === "balance") {
    const balance = await readBalance();
    return balance === null ? { ok: false, cost: 0, message: "No se pudo leer el saldo" } : { ok: true, cost: 0, data: balance };
  }

  if (step.kind === "ideas") {
    const seeds = [...new Set(step.seeds.map(cleanText).filter(Boolean))].slice(0, MAX_SEEDS);
    if (seeds.length === 0) throw new Error("no_seeds");
    const reply = await callDataForSeo("dataforseo_labs/google/keyword_ideas/live", { keywords: seeds, ...SPAIN, limit: 100 });
    return reply.ok ? { ok: true, cost: reply.cost, data: readKeywordIdeas(reply.result) } : { ok: false, cost: reply.cost, message: reply.message };
  }

  const domain = domainOrThrow(step.domain);

  if (step.kind === "ranked") {
    const reply = await callDataForSeo("dataforseo_labs/google/ranked_keywords/live", {
      target: domain,
      ...SPAIN,
      limit: 200,
      order_by: ["keyword_data.keyword_info.search_volume,desc"]
    });
    return reply.ok ? { ok: true, cost: reply.cost, data: readRankedKeywords(reply.result) } : { ok: false, cost: reply.cost, message: reply.message };
  }

  if (step.kind === "competitors") {
    const reply = await callDataForSeo("dataforseo_labs/google/competitors_domain/live", { target: domain, ...SPAIN, limit: 10 });
    return reply.ok
      ? { ok: true, cost: reply.cost, data: readCompetitors(reply.result).filter((row) => row.domain.replace(/^www\./, "") !== domain) }
      : { ok: false, cost: reply.cost, message: reply.message };
  }

  if (step.kind === "gap") {
    const competitor = domainOrThrow(step.competitor);
    const reply = await callDataForSeo("dataforseo_labs/google/domain_intersection/live", {
      target1: competitor,
      target2: domain,
      intersections: false,
      ...SPAIN,
      limit: 100,
      order_by: ["keyword_data.keyword_info.search_volume,desc"]
    });
    return reply.ok ? { ok: true, cost: reply.cost, data: readKeywordGap(reply.result) } : { ok: false, cost: reply.cost, message: reply.message };
  }

  if (step.kind === "serp") {
    const keyword = cleanText(step.keyword);
    if (!keyword) throw new Error("no_keyword");
    const reply = await callDataForSeo("serp/google/organic/live/advanced", { keyword, ...SPAIN, device: "desktop", depth: 20 });
    return reply.ok ? { ok: true, cost: reply.cost, data: readSerp(reply.result, keyword, domain) } : { ok: false, cost: reply.cost, message: reply.message };
  }

  const reply = await callDataForSeo("backlinks/summary/live", { target: domain, include_subdomains: true });
  return reply.ok ? { ok: true, cost: reply.cost, data: readBacklinkSummary(reply.result) } : { ok: false, cost: reply.cost, message: reply.message };
}
