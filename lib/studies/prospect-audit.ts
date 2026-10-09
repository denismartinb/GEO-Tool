import "server-only";

import { fetchPageSafely } from "@/lib/web-audit/fetch-page";
import { buildPageCheckResult } from "@/lib/web-audit/page-checks";
import { buildBotAccessReport } from "@/lib/web-audit/robots";
import { buildTechnicalIssuesReport } from "@/lib/web-audit/issues";
import type { PageAuditEntry } from "@/lib/web-audit/technical-audit";
import { collectJsonLdTypes, extractTitle, type ProspectAudit } from "@/lib/studies/prospect-audit-format";

const KEY_BOTS = ["GPTBot", "ClaudeBot", "Google-Extended"];

/**
 * SECTOR-STUDY-1 (prospect report) — the technical half of the web audit for
 * a domain that is not a project: the homepage plus robots.txt, llms.txt and
 * sitemap.xml, through the same SSRF-guarded fetchers and the same checks the
 * product uses. Nothing is persisted and no link is followed — four fixed
 * URLs, never discovery (.claude/rules/web-audit.md, "crawler").
 *
 * Worst case ≈ 4 s (page) + 3 × the txt timeout, inside one 60 s action.
 * Never throws.
 */
export async function runProspectAudit(domain: string): Promise<ProspectAudit> {
  const fetched = await fetchPageSafely(`https://${domain}/`, domain);
  const page: PageAuditEntry =
    fetched.status === "analyzed"
      ? {
          url: `https://${domain}/`,
          contextLabel: "Portada",
          status: "analyzed",
          check: buildPageCheckResult(fetched.html, { pageUrl: fetched.finalUrl, projectDomainNormalized: domain, xRobotsTag: fetched.xRobotsTag }),
          fetchMs: fetched.fetchMs ?? null,
          htmlBytes: fetched.htmlBytes ?? null
        }
      : { url: `https://${domain}/`, contextLabel: "Portada", status: fetched.status, check: null, fetchMs: null, htmlBytes: null };

  const bots = await buildBotAccessReport(domain);
  const report = buildTechnicalIssuesReport([page], bots);
  const robots = bots.probes?.robots ?? (bots.robotsFound ? "found" : "absent");

  return {
    domain,
    homepageStatus: page.status,
    homepageScore: page.check?.pageScore ?? null,
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
    evidence:
      fetched.status === "analyzed" && page.check
        ? {
            finalUrl: fetched.finalUrl,
            title: extractTitle(fetched.html),
            titleLength: page.check.metadata.titleLength,
            descriptionLength: page.check.metadata.descriptionLength,
            jsonLdTypes: collectJsonLdTypes(fetched.html),
            wordCount: page.check.citability?.wordCount ?? 0,
            contentOk: page.check.citability?.contentOk ?? false,
            h1Count: page.check.answerFormat.h1Count
          }
        : null
  };
}
