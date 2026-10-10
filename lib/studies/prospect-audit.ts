import "server-only";

import { fetchPageSafely } from "@/lib/web-audit/fetch-page";
import { buildPageCheckResult } from "@/lib/web-audit/page-checks";
import { buildBotAccessReport } from "@/lib/web-audit/robots";
import { buildTechnicalIssuesReport } from "@/lib/web-audit/issues";
import { selectCandidateUrls, TECH_AUDIT_TOTAL_BUDGET_MS, type PageAuditEntry } from "@/lib/web-audit/technical-audit";
import { sanitizeField } from "@/lib/text/sanitize";
import { collectJsonLdTypes, extractTitle, type PageEvidence, type ProspectAudit, type ProspectPage } from "@/lib/studies/prospect-audit-format";

const KEY_BOTS = ["GPTBot", "ClaudeBot", "Google-Extended"];

/**
 * SECTOR-STUDY-1 (prospect report) — the technical half of the web audit for
 * a domain that is not a project, through the same SSRF-guarded fetchers and
 * the same checks the product uses. Nothing is persisted.
 *
 * Pages: the homepage, plus — when given — the own-domain pages that ALREADY
 * came out of the data (pages the coverage check verified, pages an engine
 * cited), chosen by the product's own `selectCandidateUrls` (same order, same
 * dedupe, same `MAX_AUDIT_PAGES` cap, same host check). No link is ever
 * followed: discovery would be a crawler (.claude/rules/web-audit.md).
 * Fetched one by one against the product's `TECH_AUDIT_TOTAL_BUDGET_MS`; a page
 * past the budget is reported "skipped_budget", never dropped silently.
 *
 * Worst case ≈ 25 s of pages + the robots/llms/sitemap probes, inside one 60 s
 * action. Never throws.
 */
export async function runProspectAudit(
  domain: string,
  extra?: {
    coveragePages: Array<{ url: string; topic: string }>;
    citedUrls: Array<{ url: string; promptCount: number }>;
  }
): Promise<ProspectAudit> {
  const candidates = selectCandidateUrls({
    homepageUrl: `https://${domain}/`,
    coveragePages: extra?.coveragePages ?? [],
    groundingCitationUrls: extra?.citedUrls ?? [],
    projectDomainNormalized: domain
  });

  const entries: PageAuditEntry[] = [];
  const pages: ProspectPage[] = [];
  const startedAt = Date.now();
  for (const candidate of candidates) {
    const url = sanitizeField(candidate.url, 2000);
    const base = { url, source: candidate.source, contextLabel: sanitizeField(candidate.contextLabel, 120) };
    if (Date.now() - startedAt > TECH_AUDIT_TOTAL_BUDGET_MS) {
      entries.push({ url, contextLabel: base.contextLabel, status: "skipped_budget", check: null, fetchMs: null, htmlBytes: null });
      pages.push({ ...base, status: "skipped_budget", pageScore: null, evidence: null });
      continue;
    }
    const fetched = await fetchPageSafely(candidate.url, domain);
    if (fetched.status !== "analyzed") {
      entries.push({ url, contextLabel: base.contextLabel, status: fetched.status, check: null, fetchMs: null, htmlBytes: null });
      pages.push({ ...base, status: fetched.status, pageScore: null, evidence: null });
      continue;
    }
    const check = buildPageCheckResult(fetched.html, { pageUrl: fetched.finalUrl, projectDomainNormalized: domain, xRobotsTag: fetched.xRobotsTag });
    entries.push({ url, contextLabel: base.contextLabel, status: "analyzed", check, fetchMs: fetched.fetchMs ?? null, htmlBytes: fetched.htmlBytes ?? null });
    const evidence: PageEvidence = {
      finalUrl: sanitizeField(fetched.finalUrl, 2000),
      title: extractTitle(fetched.html),
      titleLength: check.metadata.titleLength,
      descriptionLength: check.metadata.descriptionLength,
      jsonLdTypes: collectJsonLdTypes(fetched.html),
      wordCount: check.citability?.wordCount ?? 0,
      contentOk: check.citability?.contentOk ?? false,
      h1Count: check.answerFormat.h1Count
    };
    pages.push({ ...base, status: "analyzed", pageScore: check.pageScore, evidence });
  }

  const bots = await buildBotAccessReport(domain);
  const report = buildTechnicalIssuesReport(entries, bots);
  const robots = bots.probes?.robots ?? (bots.robotsFound ? "found" : "absent");
  const homepage = pages[0];

  return {
    domain,
    homepageStatus: homepage?.status ?? "skipped_error",
    homepageScore: homepage?.pageScore ?? null,
    issues: report.issues,
    passing: report.passing,
    robots,
    trackedBots: bots.bots.length,
    // With robots.txt unreadable every bot defaults to "allowed"; listing none is correct, and the section says "sin dato".
    blockedBots: bots.bots.filter((bot) => !bot.allowed).map((bot) => bot.agent),
    llmsTxt: bots.probes?.llmsTxt ?? (bots.llmsTxtFound ? "found" : "absent"),
    sitemap: bots.probes?.sitemap ?? (bots.sitemapFound ? "found" : "absent"),
    sitemapLocs: bots.sitemap && bots.sitemap.kind !== "invalid" ? bots.sitemap.locCount : null,
    sitemapInvalid: bots.sitemap?.kind === "invalid",
    keyBots: bots.bots.filter((bot) => KEY_BOTS.includes(bot.agent)).map((bot) => ({ agent: bot.agent, allowed: bot.allowed })),
    evidence: homepage?.evidence ?? null,
    pages,
    readinessScore: report.actualReadinessScore
  };
}
