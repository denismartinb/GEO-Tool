import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { PageAuditEntry } from "@/lib/web-audit/technical-audit";
import type { PageCheckResult } from "@/lib/web-audit/page-checks";
import type { PageFixContext } from "@/lib/web-audit/page-fixes";
import { PageAuditRow, freshnessLabel } from "./page-audit-row";

/**
 * PRELAUNCH-HARDENING-1 R7 — tests de render de la fila de página auditada.
 * Ver `issue-rows.test.tsx` para el porqué del enfoque.
 *
 * El caso que más justifica este fichero es el de las filas antiguas. En
 * `lib/web-audit/page-checks.ts` está escrito así: *«Optional ONLY because
 * persisted pre-R3 snapshots lack them … Production crash 2026-07-12: the
 * web-audit page read `.noindex` off a pre-R3 row and took the whole page
 * down»*. Ese fallo tumbó la pantalla entera en producción y **no lo cubría
 * ningún test**: el aviso vivía en un comentario, que es exactamente el sitio
 * donde una advertencia no se ejecuta.
 */

const fixContext: PageFixContext = { projectName: "GenScore", domainNormalized: "genscore.es" };

function check(overrides: Partial<PageCheckResult> = {}): PageCheckResult {
  return {
    structuredData: { pass: true, matchedTypes: ["Article"] },
    answerFormat: { points: 20, hasOneH1: true, hasTwoH2: true, hasAnswerFirstIntro: true, h1Count: 1, h2Count: 3 },
    metadata: { points: 15, titleOk: true, descriptionOk: false, ogOk: true, titleLength: 40, descriptionLength: 215 },
    freshness: { status: "fresh", points: 10, date: "2026-08-01" },
    indexability: {
      points: 10,
      canonicalPresent: true,
      canonicalOk: true,
      canonicalUrl: "https://genscore.es/",
      noindex: false,
      hreflangPresent: false
    },
    citability: { points: 10, hasListOrTable: false, wordCount: 900, contentOk: true },
    pageScore: 76,
    ...overrides
  };
}

function page(overrides: Partial<PageAuditEntry> = {}): PageAuditEntry {
  return {
    url: "https://genscore.es/precios",
    contextLabel: "portada",
    status: "analyzed",
    check: check(),
    fetchMs: 115,
    htmlBytes: 118_681,
    ...overrides
  };
}

describe("PageAuditRow", () => {
  it("enseña la ruta, no la URL entera, y su etiqueta de contexto", () => {
    const html = renderToStaticMarkup(<PageAuditRow page={page()} fixContext={fixContext} block="geo" />);
    expect(html).toContain("/precios");
    expect(html).toContain("portada");
  });

  it("publica la nota de la página dentro de su bloque, con los pesos de siempre", () => {
    // GEO: 45 de 55 (sin listas). SEO: 35 de 45 (sin description ni hreflang).
    const geo = renderToStaticMarkup(<PageAuditRow page={page()} fixContext={fixContext} block="geo" />);
    const seo = renderToStaticMarkup(<PageAuditRow page={page()} fixContext={fixContext} block="seo" />);
    expect(geo).toContain("Nota GEO de /precios: 82 de 100");
    expect(seo).toContain("Salud SEO de /precios: 78 de 100");
  });

  it("suma los checks nuevos de la Salud SEO de la página, sólo en el bloque SEO (log §281)", () => {
    const seoCheck = {
      viewportOk: true,
      imageCount: 4,
      imagesMissingAlt: 2,
      localBusiness: false,
      titleKey: "t1",
      descriptionKey: "d1",
      pageKey: "https://genscore.es/precios"
    };
    const withSeo = page({ check: check({ seo: seoCheck }) });
    // SEO: 35 de 45 + viewport 5 + alt 0 de 5 + únicos 5 → 45 de 60 = 75.
    const seo = renderToStaticMarkup(<PageAuditRow page={withSeo} fixContext={fixContext} block="seo" duplicate={false} />);
    expect(seo).toContain("Salud SEO de /precios: 75 de 100");
    expect(seo).toContain("Imágenes sin texto alternativo");
    expect(seo).toContain("Títulos y descripciones únicos");
    expect(seo).toContain("las 2 imágenes que no lo tienen");
    const geo = renderToStaticMarkup(<PageAuditRow page={withSeo} fixContext={fixContext} block="geo" />);
    expect(geo).toContain("Nota GEO de /precios: 82 de 100");
    expect(geo).not.toContain("texto alternativo");
    // A repeated title adds its guidance line.
    const dup = renderToStaticMarkup(<PageAuditRow page={withSeo} fixContext={fixContext} block="seo" duplicate />);
    expect(dup).toContain("Títulos o descripciones repetidos");
  });

  it("enseña sólo las comprobaciones y la guía de su bloque", () => {
    const geo = renderToStaticMarkup(<PageAuditRow page={page()} fixContext={fixContext} block="geo" />);
    const seo = renderToStaticMarkup(<PageAuditRow page={page()} fixContext={fixContext} block="seo" />);
    expect(geo).toContain("listas o tablas");
    expect(geo).not.toContain("meta description");
    expect(seo).toContain("meta description");
    expect(seo).not.toContain("listas o tablas");
  });

  /**
   * REGRESIÓN — fallo de producción del 2026-07-12. Una fila persistida antes
   * de WEB-AUDIT-R3 no tiene `indexability` ni `citability`, y leerlas sin
   * comprobar tumbó la pantalla entera. Renderizar tiene que sobrevivir.
   */
  it("no se cae con una fila anterior a R3, sin indexability ni citability", () => {
    const legacy = page({
      check: check({ indexability: undefined, citability: undefined })
    });
    expect(() => renderToStaticMarkup(<PageAuditRow page={legacy} fixContext={fixContext} block="geo" />)).not.toThrow();
  });

  /** Mismo motivo, un nivel más abajo: `ogOk` también es opcional por lo mismo. */
  it("no se cae con metadatos anteriores a R3, sin ogOk", () => {
    const legacy = page({
      check: check({ metadata: { points: 15, titleOk: true, descriptionOk: true, titleLength: 40, descriptionLength: 120 } })
    });
    expect(() => renderToStaticMarkup(<PageAuditRow page={legacy} fixContext={fixContext} block="geo" />)).not.toThrow();
  });

  /**
   * Una página descartada dice POR QUÉ. Un hueco sin explicar es justo lo que
   * `.claude/rules/web-audit.md` prohíbe, y «fuera del dominio» y «no pudimos
   * verificar la IP» son dos cosas distintas que se confundieron una vez
   * (WEB-AUDIT-2, 2026-07-11).
   */
  it("cada motivo de descarte tiene su propio texto", () => {
    const offsite = renderToStaticMarkup(
      <PageAuditRow page={page({ status: "skipped_offsite", check: null })} fixContext={fixContext} block="geo" />
    );
    const unsafeIp = renderToStaticMarkup(
      <PageAuditRow page={page({ status: "skipped_unsafe_ip", check: null })} fixContext={fixContext} block="geo" />
    );
    expect(offsite).toContain("fuera del dominio verificado");
    expect(unsafeIp).toContain("IP");
    expect(offsite).not.toEqual(unsafeIp);
  });

  it("una página sin comprobar por presupuesto no se presenta como fallida", () => {
    const html = renderToStaticMarkup(
      <PageAuditRow page={page({ status: "skipped_budget", check: null })} fixContext={fixContext} block="geo" />
    );
    expect(html).toContain("Sin comprobar");
  });
});

describe("freshnessLabel", () => {
  it("distingue «sin fecha» de «desactualizada»", () => {
    expect(freshnessLabel("unknown")).toBe("Sin fecha detectada");
    expect(freshnessLabel("stale")).toBe("Desactualizada");
    expect(freshnessLabel("unknown")).not.toBe(freshnessLabel("stale"));
  });

  it("nombra los cuatro estados", () => {
    for (const status of ["fresh", "aging", "stale", "unknown"] as const) {
      expect(freshnessLabel(status).length).toBeGreaterThan(0);
    }
  });
});
