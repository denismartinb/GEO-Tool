import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SeoAuditCard } from "./seo-audit-card";
import type { OverviewSeoSummary } from "@/lib/web-audit/overview-seo-summary";

/**
 * Render tests for Visión general's Auditoría SEO card (SEARCH-SEO-1, log
 * §269). They assert content, never appearance: the counts shown are the
 * counts passed in, labels come from the shared issue labels, and the
 * founder-removed elements (projected score, CTA button) stay out.
 */

const HREF = "/dashboard/projects/p1/web-audit";

const withIssues: OverviewSeoSummary = {
  analyzedPageCount: 10,
  counts: { critical: 1, warning: 3, improvement: 0 },
  top: [
    {
      check: "structured_data",
      severity: "critical",
      affectedCount: 6,
      applicableCount: 10,
      pointDelta: 9.2,
      affectedLabels: []
    },
    {
      check: "sitemap_missing",
      severity: "warning",
      affectedCount: 1,
      applicableCount: 1,
      pointDelta: null,
      affectedLabels: []
    },
    {
      check: "list_or_table",
      severity: "warning",
      affectedCount: 1,
      applicableCount: 10,
      pointDelta: 0.4,
      affectedLabels: []
    }
  ]
};

describe("SeoAuditCard", () => {
  it("shows the severity counts and pluralizes each label by its own count", () => {
    const html = renderToStaticMarkup(<SeoAuditCard summary={withIssues} auditedAt="9 oct" href={HREF} />);
    expect(html).toContain("Revisada el 9 oct · 10 páginas");
    expect(html).toMatch(/<b>1<\/b><span>Crítico<\/span>/);
    expect(html).toMatch(/<b>3<\/b><span>Avisos<\/span>/);
    expect(html).toMatch(/<b>0<\/b><span>Mejoras<\/span>/);
  });

  it("lists the top issues with the Auditoría SEO screen's labels and scopes, each linking there", () => {
    const html = renderToStaticMarkup(<SeoAuditCard summary={withIssues} auditedAt="9 oct" href={HREF} />);
    expect(html).toContain("Datos estructurados");
    expect(html).toContain("6 de 10 páginas");
    expect(html).toContain("No encontrado");
    expect(html).toContain("+9 pts");
    expect(html.match(new RegExp(`href="${HREF}"`, "g"))?.length).toBe(3);
  });

  it("never shows points it does not have", () => {
    const html = renderToStaticMarkup(<SeoAuditCard summary={withIssues} auditedAt="9 oct" href={HREF} />);
    // sitemap has no weight and the list check rounds to 0: neither gets a badge.
    expect(html.match(/ pts</g)?.length).toBe(1);
  });

  it("keeps out what the founder removed: projected score, re-audit note and CTA button", () => {
    const html = renderToStaticMarkup(<SeoAuditCard summary={withIssues} auditedAt="9 oct" href={HREF} />);
    expect(html).not.toContain("arreglándolo todo");
    expect(html).not.toContain("tras cada escaneo");
    expect(html).not.toContain("Ver Auditoría SEO");
  });

  it("says a clean site is clean instead of rendering an empty list", () => {
    const html = renderToStaticMarkup(
      <SeoAuditCard
        summary={{ analyzedPageCount: 4, counts: { critical: 0, warning: 0, improvement: 0 }, top: [] }}
        auditedAt={null}
        href={HREF}
      />
    );
    expect(html).toContain("Sin problemas técnicos");
    expect(html).toContain("Las 4 páginas revisadas pasan todas las comprobaciones.");
    expect(html).toContain("4 páginas revisadas");
    expect(html).not.toContain("Lo primero que arreglar");
  });
});
