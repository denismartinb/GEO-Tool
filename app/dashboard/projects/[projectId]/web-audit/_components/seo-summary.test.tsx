import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SeoAreasCard, SeoScoreCard } from "./seo-summary";
import { AudienceTags } from "./audience-tags";

/** Render tests for Auditoría SEO's top row (SEARCH-SEO-1 Fase 1b). Content, not looks. */

describe("SeoScoreCard", () => {
  const base = { delta: null, criticalCount: 0, issueCount: 0, analyzedPageCount: 7 };

  it("publica la nota, su franja y cuántas páginas promedia", () => {
    const html = renderToStaticMarkup(<SeoScoreCard {...base} score={62} />);
    expect(html).toContain("62");
    expect(html).toContain("Mejorable");
    expect(html).toContain("7 páginas revisadas");
  });

  /**
   * Hasta la Fase 2 la nota es la técnica de siempre, no «Salud SEO»: llamar
   * al número de hoy con el nombre del de mañana sería una afirmación que el
   * producto todavía no puede sostener.
   */
  it("se llama «Salud técnica», no «Salud SEO»", () => {
    const html = renderToStaticMarkup(<SeoScoreCard {...base} score={80} />);
    expect(html).toContain("Salud técnica");
    expect(html).not.toContain("Salud SEO");
  });

  it("manda a los críticos primero cuando los hay", () => {
    expect(renderToStaticMarkup(<SeoScoreCard {...base} score={50} criticalCount={2} issueCount={5} />)).toContain(
      "los 2 fallos críticos"
    );
    expect(renderToStaticMarkup(<SeoScoreCard {...base} score={90} issueCount={0} />)).toContain(
      "Todo lo que comprobamos está bien"
    );
  });

  it("sin páginas analizadas no inventa una nota", () => {
    const html = renderToStaticMarkup(<SeoScoreCard {...base} score={null} analyzedPageCount={0} />);
    expect(html).not.toContain(">0<");
    expect(html).toContain("No hemos podido analizar");
  });

  it("calla el delta cuando es cero o no existe", () => {
    expect(renderToStaticMarkup(<SeoScoreCard {...base} score={60} delta={0} />)).not.toContain("revisión anterior");
    expect(renderToStaticMarkup(<SeoScoreCard {...base} score={60} delta={4} />)).toContain("revisión anterior");
  });
});

describe("SeoAreasCard", () => {
  it("pinta cada área con su porcentaje real", () => {
    const html = renderToStaticMarkup(
      <SeoAreasCard
        areas={[{ key: "crawl", label: "Rastreo e indexación", hint: "robots.txt", audience: ["google", "ia"], pct: 88 }]}
      />
    );
    expect(html).toContain("Rastreo e indexación");
    expect(html).toContain("88%");
    expect(html).toContain("width:88%");
  });
});

describe("AudienceTags", () => {
  it("no pinta nada cuando ninguna etiqueta es honesta", () => {
    expect(renderToStaticMarkup(<AudienceTags audience={[]} />)).toBe("");
  });
});
