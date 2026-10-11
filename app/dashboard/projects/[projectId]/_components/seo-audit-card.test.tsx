import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SeoAuditCard } from "./seo-audit-card";
import type { OverviewSeoSummary } from "@/lib/web-audit/overview-seo-summary";

/**
 * Render tests for Visión general's Auditoría SEO card (SEARCH-SEO-1, log
 * §271). They assert content, never appearance: the counts shown are the
 * counts passed in, labels come from the shared issue labels, and the
 * founder-removed elements (projected score, CTA button) stay out.
 */

const HREF = "/dashboard/projects/p1/web-audit";

const withIssues: OverviewSeoSummary = {
  analyzedPageCount: 10,
  saludScore: 63,
  counts: { critical: 1, warning: 3, improvement: 0 },
  top: [
    {
      issue: { check: "noindex", severity: "critical", affectedCount: 6, applicableCount: 10, pointDelta: 9.2, affectedLabels: [] },
      blockPoints: 9.2
    },
    {
      issue: { check: "sitemap_missing", severity: "warning", affectedCount: 1, applicableCount: 1, pointDelta: null, affectedLabels: [] },
      blockPoints: null
    },
    {
      issue: {
        check: "page_speed",
        severity: "warning",
        affectedCount: 1,
        applicableCount: 1,
        pointDelta: null,
        affectedLabels: [],
        scopeText: "LCP de 3,4 s en móvil (bueno: 2,5 s o menos)"
      },
      blockPoints: 0.4
    }
  ],
  speed: { vital: "lcp", value: 3400, rating: "needs_improvement" }
};

describe("SeoAuditCard", () => {
  it("shows the severity counts and pluralizes each label by its own count", () => {
    const html = renderToStaticMarkup(<SeoAuditCard summary={withIssues} auditedAt="9 oct" href={HREF} />);
    expect(html).toContain("Revisada el 9 oct · 10 páginas");
    expect(html).toMatch(/<b>1<\/b><span>Crítico<\/span>/);
    expect(html).toMatch(/<b>3<\/b><span>Avisos<\/span>/);
    expect(html).toMatch(/<b>0<\/b><span>Mejoras<\/span>/);
  });

  it("shows the Salud SEO and the mobile speed line", () => {
    const html = renderToStaticMarkup(<SeoAuditCard summary={withIssues} auditedAt="9 oct" href={HREF} />);
    expect(html).toContain("Salud SEO");
    expect(html).toMatch(/<b>63<\/b><span>\/100<\/span>/);
    expect(html).toContain("Velocidad en móvil: <b>LCP 3,4 s</b>, mejorable");
  });

  it("lists the SEO block's top issues with the screen's labels, scopes and block points, all linking to the SEO block", () => {
    const html = renderToStaticMarkup(<SeoAuditCard summary={withIssues} auditedAt="9 oct" href={HREF} />);
    expect(html).toContain("Página indexable");
    expect(html).toContain("6 de 10 páginas");
    expect(html).toContain("No encontrado");
    expect(html).toContain("LCP de 3,4 s en móvil");
    expect(html).toContain("+9 pt");
    expect(html).toContain("&lt;1 pt");
    expect(html.match(new RegExp(`href="${HREF}\\?bloque=seo"`, "g"))?.length).toBe(3);
    expect(html).not.toContain("bloque=geo");
  });

  it("never shows points it does not have", () => {
    const html = renderToStaticMarkup(<SeoAuditCard summary={withIssues} auditedAt="9 oct" href={HREF} />);
    // The sitemap has no weight: no badge for it.
    expect(html.match(/ pt</g)?.length).toBe(2);
  });

  it("leaves out the score and the speed line when they were not measured", () => {
    const html = renderToStaticMarkup(
      <SeoAuditCard summary={{ ...withIssues, saludScore: null, speed: null }} auditedAt="9 oct" href={HREF} />
    );
    expect(html).not.toContain("Salud SEO");
    expect(html).not.toContain("ov2-seo-speed");
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
        summary={{ analyzedPageCount: 4, saludScore: 100, counts: { critical: 0, warning: 0, improvement: 0 }, top: [], speed: null }}
        auditedAt={null}
        href={HREF}
      />
    );
    expect(html).toContain("Sin problemas de SEO");
    expect(html).toContain("Las 4 páginas revisadas pasan todas las comprobaciones SEO.");
    expect(html).toContain("4 páginas revisadas");
    expect(html).not.toContain("Lo primero que arreglar");
  });
});
