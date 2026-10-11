import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { IssueRow, PassingRow } from "./issue-rows";
import { SpeedCard } from "./speed-card";
import { SeoWeightsCard, seoWeightGroups } from "./seo-weights-card";
import { NEW_SEO_CHECKS_UNTIL, isNewSeoCheck } from "@/lib/web-audit/issue-labels";

/**
 * Render tests for the Salud SEO pieces (SEARCH-SEO-1 Fase 2, log §278):
 * content, never appearance. The speed card is a client component, but its
 * first render (mobile) is plain markup and `renderToStaticMarkup` reads it.
 */

const report = {
  measuredAt: "2026-10-10T08:00:00Z",
  mobile: { source: "field" as const, lcpMs: 3400, inpMs: 180, cls: 0.02 },
  desktop: { source: "lab" as const, lcpMs: 1600, inpMs: null, cls: 0.01 }
};

describe("SpeedCard", () => {
  it("shows the three mobile vitals with their ratings, and says the data is from real users", () => {
    const html = renderToStaticMarkup(<SpeedCard pageSpeed={report} />);
    expect(html).toContain("Optimización de tu página Home");
    expect(html).toContain("3,4 s");
    expect(html).toContain("Mejorable");
    expect(html).toContain("180 ms");
    expect(html).toContain("0,02");
    expect(html).toContain("Datos de usuarios reales de Chrome");
    expect(html).toContain("Medido el 10 oct 2026");
    expect(html).toContain('aria-pressed="true">Móvil');
  });

  it("says when the data comes from the lab, and that INP needs real users", () => {
    const html = renderToStaticMarkup(<SpeedCard pageSpeed={{ ...report, mobile: report.desktop }} />);
    expect(html).toContain("Medición de laboratorio");
    expect(html).toContain("Sólo con usuarios reales");
    expect(html).not.toContain("Datos de usuarios reales de Chrome");
  });

  it("says Google did not answer instead of inventing numbers", () => {
    const failed = renderToStaticMarkup(<SpeedCard pageSpeed={null} />);
    expect(failed).toContain("Google no respondió");
    expect(failed).not.toContain(" s<");
    const noMobile = renderToStaticMarkup(<SpeedCard pageSpeed={{ ...report, mobile: null }} />);
    expect(noMobile).toContain("no devolvió la medición en móvil");
  });
});

describe("SeoWeightsCard", () => {
  it("publishes the Salud SEO weights from the scoring tables, adding up to 100", () => {
    const groups = seoWeightGroups();
    const total = groups.flatMap((g) => g.rows).reduce((sum, r) => sum + (r.points ?? 0), 0);
    expect(total).toBe(100);
    expect(groups.map((g) => g.title)).toEqual(["Comprobaciones de siempre", "Nuevas", "Sin puntos"]);
    const html = renderToStaticMarkup(<SeoWeightsCard />);
    expect(html).toContain("Cómo se calcula tu Salud SEO");
    expect(html).toContain("Velocidad en móvil");
    expect(html).toContain("20 pt");
    expect(html).toContain("Negocio local en datos estructurados");
    expect(html).toContain("No cambia tu Puntuación GEO");
  });
});

describe("«NUEVO» and the Salud SEO scope texts", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("badges the new checks for their first weeks only, and never an old one", () => {
    vi.setSystemTime(new Date("2026-10-12T10:00:00Z"));
    const html = renderToStaticMarkup(
      <IssueRow
        issue={{
          check: "page_speed",
          severity: "warning",
          affectedCount: 1,
          applicableCount: 1,
          pointDelta: null,
          affectedLabels: [],
          scopeText: "LCP de 3,4 s en móvil (bueno: 2,5 s o menos)"
        }}
        blockPoints={3.5}
      />
    );
    expect(html).toContain(">Nuevo<");
    expect(html).toContain("LCP de 3,4 s en móvil");
    expect(html).not.toContain("1 de 1");
    expect(isNewSeoCheck("noindex")).toBe(false);
    expect(isNewSeoCheck("page_speed", NEW_SEO_CHECKS_UNTIL)).toBe(false);
  });

  it("names a passing check by what is right, with its own scope", () => {
    vi.setSystemTime(new Date("2026-12-01T10:00:00Z"));
    const html = renderToStaticMarkup(
      <PassingRow passing={{ check: "image_alt_missing", passedCount: 5, applicableCount: 5 }} />
    );
    expect(html).toContain("Imágenes con texto alternativo");
    expect(html).toContain("5 de 5 páginas");
    expect(html).not.toContain(">Nuevo<");
    const site = renderToStaticMarkup(
      <PassingRow passing={{ check: "googlebot_blocked", passedCount: 1, applicableCount: 1, scopeText: "robots.txt no lo bloquea" }} />
    );
    expect(site).toContain("Googlebot permitido");
    expect(site).toContain("robots.txt no lo bloquea");
  });
});
