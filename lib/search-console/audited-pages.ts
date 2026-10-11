import { AUDIT_BLOCKS } from "@/lib/web-audit/audit-blocks";
import { pageCheckStates } from "@/lib/web-audit/issues";
import { duplicateMetadataUrls, seoPageExtraStates } from "@/lib/web-audit/seo-health";
import type { PageAuditEntry } from "@/lib/web-audit/technical-audit";
import type { AuditedPage } from "@/lib/search-console/insights";

/**
 * The SEO problems the latest technical audit found on each page, for «Tus
 * páginas en Google» (log §287). Counts the page's own SEO-block checks with
 * the audit's predicates (`pageCheckStates`, `seoPageExtraStates`), never its
 * own: site-wide facts (Googlebot, HTTPS, speed) are left out because they
 * are not about the page. A page that was fetched but not analyzed is null.
 */
export function auditedPagesFromSnapshot(pages: PageAuditEntry[]): AuditedPage[] {
  const seoChecks = new Set(AUDIT_BLOCKS.seo.checks);
  const duplicates = duplicateMetadataUrls(pages);
  return pages
    .filter((p) => typeof p.url === "string" && /^https?:\/\//.test(p.url))
    .map((p) => {
      if (p.status !== "analyzed" || !p.check) return { url: p.url, seoIssues: null };
      const states = [
        ...pageCheckStates(p.check),
        ...seoPageExtraStates(p.check, duplicates ? { duplicate: duplicates.has(p.url) } : {})
      ];
      const failing = new Set(states.filter((s) => s.fails && seoChecks.has(s.check)).map((s) => s.check));
      return { url: p.url, seoIssues: failing.size };
    });
}
