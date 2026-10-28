import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SeoAuditCard } from "./seo-audit-card";
import type { OverviewSeoSummary } from "@/lib/web-audit/overview-seo-summary";

/**
 * Render tests for Visión general's Auditoría SEO card (SEARCH-SEO-1, log
 * §271; «Instrumento» layout, log §352). They assert content, never appearance:
 * the counts shown are the counts passed in, the one recommendation is the
 * first issue of the SEO block, and what the founder removed stays out.
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
    expect(html).toMatch(/<b class="num">1<\/b>Crítico</);
    expect(html).toMatch(/<b class="num">3<\/b>Avisos</);
    expect(html).toMatch(/<b class="num">0<\/b>Mejoras</);
  });

  it("shows the Salud SEO and the mobile speed line", () => {
    const html = renderToStaticMarkup(<SeoAuditCard summary={withIssues} auditedAt="9 oct" href={HREF} />);
    expect(html).toContain("Salud SEO");
    expect(html).toContain("63<small>/100</small>");
    expect(html).toContain("Velocidad en móvil: <b>LCP 3,4 s</b>, mejorable");
  });

  it("recommends the first issue of the SEO block with the screen's label and scope, linking to the SEO block", () => {
    const html = renderToStaticMarkup(<SeoAuditCard summary={withIssues} auditedAt="9 oct" href={HREF} />);
    expect(html).toContain("Recomendaciones");
    expect(html).toContain("Página indexable");
    expect(html).toContain("6 de 10 páginas");
    expect(html).not.toContain("LCP de 3,4 s en móvil");
    expect(html.match(new RegExp(`href="${HREF}\\?bloque=seo"`, "g"))?.length).toBeGreaterThanOrEqual(1);
    expect(html).not.toContain("bloque=geo");
  });

  it("never shows points it does not have", () => {
    const html = renderToStaticMarkup(<SeoAuditCard summary={withIssues} auditedAt="9 oct" href={HREF} />);
    expect(html).not.toMatch(/\+\d+ pt/);
  });

  it("shows a dash instead of a score, and no speed line, when they were not measured", () => {
    const html = renderToStaticMarkup(
      <SeoAuditCard summary={{ ...withIssues, saludScore: null, speed: null }} auditedAt="9 oct" href={HREF} />
    );
    expect(html).toContain("Salud SEO");
    expect(html).not.toContain("/100");
    expect(html).not.toContain("Velocidad en móvil");
  });

  it("keeps out what the founder removed: projected score, re-audit note and CTA button", () => {
    const html = renderToStaticMarkup(<SeoAuditCard summary={withIssues} auditedAt="9 oct" href={HREF} />);
    expect(html).not.toContain("arreglándolo todo");
    expect(html).not.toContain("tras cada escaneo");
    expect(html).not.toContain("Ver Auditoría SEO");
  });

  it("titles the card with Google only when the Google half has its column", () => {
    const solo = renderToStaticMarkup(<SeoAuditCard summary={withIssues} auditedAt="9 oct" href={HREF} />);
    expect(solo).toContain("<h3>Auditoría SEO</h3>");
    const both = renderToStaticMarkup(
      <SeoAuditCard summary={withIssues} auditedAt="9 oct" href={HREF} googleColumn googleHref="/dashboard/projects/p1/search-console">
        <div>mitad de Google</div>
      </SeoAuditCard>
    );
    expect(both).toContain("Auditoría SEO y Google");
    expect(both).toContain("Posición en Google");
    expect(both).toContain("mitad de Google");
  });

  it("says a clean site is clean instead of rendering an empty row", () => {
    const html = renderToStaticMarkup(
      <SeoAuditCard
        summary={{ analyzedPageCount: 4, saludScore: 100, counts: { critical: 0, warning: 0, improvement: 0 }, top: [], speed: null }}
        auditedAt={null}
        href={HREF}
      />
    );
    expect(html).toContain("Las 4 páginas revisadas pasan todas las comprobaciones SEO.");
    expect(html).toContain("4 páginas revisadas");
  });
});
