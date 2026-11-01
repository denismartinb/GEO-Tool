import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { BotAccessReport } from "@/lib/web-audit/robots";
import { BotAccessCard, aiBotsSectionProps, describeSitemap } from "./bot-access-card";
import { AI_BOT_TOKENS } from "@/lib/web-audit/ai-bots";

/**
 * PRELAUNCH-HARDENING-1 R7 — tests de render de la tarjeta de acceso de bots.
 * Ver `issue-rows.test.tsx` para el porqué del enfoque.
 *
 * `describeSitemap` es donde vive la distinción que esta zona más repite y más
 * fácil es romper: **«no lo hemos podido comprobar» no es «no existe»**. Es un
 * caso del invariante «ningún número de relleno» aplicado a una etiqueta.
 */

function report(overrides: Partial<BotAccessReport> = {}): BotAccessReport {
  return {
    robotsFound: true,
    bots: [
      { agent: "GPTBot", allowed: true },
      { agent: "ClaudeBot", allowed: false }
    ],
    llmsTxtFound: false,
    llmsTxtBytes: null,
    sitemapFound: true,
    ...overrides
  } as BotAccessReport;
}

describe("describeSitemap", () => {
  it("un sondeo fallido gana a cualquier lectura del contenido", () => {
    const result = describeSitemap(
      report({
        sitemapFound: true,
        sitemap: { kind: "urlset", locCount: 40, truncated: false, locs: [] },
        probes: { robots: "found", llmsTxt: "found", sitemap: "unknown" }
      } as Partial<BotAccessReport>)
    );
    expect(result.sitemapIsReal).toBe(false);
    expect(result.sitemapBadge).toBe("Sin comprobar");
    expect(result.sitemapDetail).toContain("No significa que falte");
  });

  /**
   * Snapshots anteriores a WEB-AUDIT-SITEMAP-1 no tienen el campo `sitemap`.
   * Ahí la única evidencia es la alcanzabilidad, y hay que decir exactamente
   * eso — ni más ni menos.
   */
  it("sin el campo nuevo cae a la alcanzabilidad de siempre", () => {
    expect(describeSitemap(report({ sitemapFound: true })).sitemapBadge).toBe("Encontrado");
    expect(describeSitemap(report({ sitemapFound: false })).sitemapBadge).toBe("No encontrado");
  });

  it("un 404 blando no cuenta como sitemap", () => {
    const result = describeSitemap(report({ sitemap: { kind: "invalid", locCount: 0, truncated: false, locs: [] } } as Partial<BotAccessReport>));
    expect(result.sitemapIsReal).toBe(false);
    expect(result.sitemapBadge).toBe("No es un sitemap");
  });

  it("un índice dice que no se sigue, porque seguirlo sería rastrear", () => {
    const result = describeSitemap(
      report({ sitemap: { kind: "index", locCount: 3, truncated: false, locs: [] } } as Partial<BotAccessReport>)
    );
    expect(result.sitemapIsReal).toBe(true);
    expect(result.sitemapDetail).toContain("no lo hace");
  });

  it("singulariza y pluraliza el recuento de URLs", () => {
    const one = describeSitemap(
      report({ sitemap: { kind: "urlset", locCount: 1, truncated: false, locs: [] } } as Partial<BotAccessReport>)
    );
    const many = describeSitemap(
      report({ sitemap: { kind: "urlset", locCount: 9, truncated: false, locs: [] } } as Partial<BotAccessReport>)
    );
    expect(one.sitemapDetail).toBe("1 URL.");
    expect(many.sitemapDetail).toBe("9 URLs.");
  });

  it("un fichero truncado no publica su recuento como exacto", () => {
    const result = describeSitemap(
      report({ sitemap: { kind: "urlset", locCount: 500, truncated: true, locs: [] } } as Partial<BotAccessReport>)
    );
    expect(result.sitemapDetail).toContain("Más de 500");
  });
});

describe("BotAccessCard (Ficheros para la IA, log §424)", () => {
  it("ya no lista los bots de IA: viven en «Bots de IA»", () => {
    const html = renderToStaticMarkup(<BotAccessCard bots={report()} checkedAt="2026-08-11T10:00:00Z" />);
    expect(html).toContain("Ficheros para la IA");
    expect(html).not.toContain("GPTBot");
    expect(html).toContain("llms.txt");
    expect(html).toContain("sitemap.xml");
  });

  it("fecha la comprobación, porque un permiso caduca", () => {
    const html = renderToStaticMarkup(<BotAccessCard bots={report()} checkedAt="2026-08-11T10:00:00Z" />);
    expect(html).toContain("11 ago 2026");
  });
});

describe("aiBotsSectionProps", () => {
  it("no ofrece el bloque para copiar sin las reglas generales guardadas", () => {
    const props = aiBotsSectionProps(report(), "acme.es");
    expect(props.starRules).toBeNull();
    expect(props.note).toContain("próxima revisión");
    expect(props.robotsUrl).toBe("https://acme.es/robots.txt");
  });

  it("un bot de entrenamiento cerrado no bloquea al motor", () => {
    const tokens = Object.fromEntries(AI_BOT_TOKENS.map((t) => [t, t !== "GPTBot"]));
    const props = aiBotsSectionProps(report({ aiBots: { tokens, starRules: [] } } as Partial<BotAccessReport>), "acme.es");
    expect(props.engines.find((e) => e.engine === "chatgpt")?.state).toBe(true);
    expect(props.switches.find((s) => s.id === "chatgpt-training")?.state).toBe(false);
    expect(props.starRules).toEqual([]);
    expect(props.note).toBeNull();
  });
});
