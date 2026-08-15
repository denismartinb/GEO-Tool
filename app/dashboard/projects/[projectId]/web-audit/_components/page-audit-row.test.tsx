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
    const html = renderToStaticMarkup(<PageAuditRow page={page()} fixContext={fixContext} />);
    expect(html).toContain("/precios");
    expect(html).toContain("portada");
  });

  it("publica la nota real de la página", () => {
    const html = renderToStaticMarkup(<PageAuditRow page={page({ check: check({ pageScore: 42 }) })} fixContext={fixContext} />);
    expect(html).toContain("42");
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
    expect(() => renderToStaticMarkup(<PageAuditRow page={legacy} fixContext={fixContext} />)).not.toThrow();
  });

  /** Mismo motivo, un nivel más abajo: `ogOk` también es opcional por lo mismo. */
  it("no se cae con metadatos anteriores a R3, sin ogOk", () => {
    const legacy = page({
      check: check({ metadata: { points: 15, titleOk: true, descriptionOk: true, titleLength: 40, descriptionLength: 120 } })
    });
    expect(() => renderToStaticMarkup(<PageAuditRow page={legacy} fixContext={fixContext} />)).not.toThrow();
  });

  /**
   * Una página descartada dice POR QUÉ. Un hueco sin explicar es justo lo que
   * `.claude/rules/web-audit.md` prohíbe, y «fuera del dominio» y «no pudimos
   * verificar la IP» son dos cosas distintas que se confundieron una vez
   * (WEB-AUDIT-2, 2026-07-11).
   */
  it("cada motivo de descarte tiene su propio texto", () => {
    const offsite = renderToStaticMarkup(
      <PageAuditRow page={page({ status: "skipped_offsite", check: null })} fixContext={fixContext} />
    );
    const unsafeIp = renderToStaticMarkup(
      <PageAuditRow page={page({ status: "skipped_unsafe_ip", check: null })} fixContext={fixContext} />
    );
    expect(offsite).toContain("fuera del dominio verificado");
    expect(unsafeIp).toContain("IP");
    expect(offsite).not.toEqual(unsafeIp);
  });

  it("una página sin comprobar por presupuesto no se presenta como fallida", () => {
    const html = renderToStaticMarkup(
      <PageAuditRow page={page({ status: "skipped_budget", check: null })} fixContext={fixContext} />
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
