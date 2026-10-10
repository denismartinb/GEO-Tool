import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { TechnicalIssue } from "@/lib/web-audit/issues";
import { FixListCard } from "./fix-list";

/** «Qué arreglar» (SEARCH-SEO-1 Fase 1b): render tests, content only. */

function issue(overrides: Partial<TechnicalIssue> = {}): TechnicalIssue {
  return {
    check: "noindex",
    severity: "critical",
    affectedCount: 1,
    applicableCount: 4,
    pointDelta: 2.5,
    affectedLabels: ["https://acme.com/precios"],
    ...overrides
  };
}

const steps = { llmsTxtFile: null, llmsPublishSteps: [], sitemapFixSteps: [] };

describe("FixListCard", () => {
  it("lista los problemas y lo que ya está bien, con sus recuentos en el filtro", () => {
    const html = renderToStaticMarkup(
      <FixListCard
        {...steps}
        list={{
          rows: [
            { kind: "issue", issue: issue() },
            { kind: "ok", passing: { check: "single_h1", passedCount: 4, applicableCount: 4 } }
          ],
          counts: { all: 2, critical: 1, warning: 0, improvement: 0, ok: 1 }
        }}
      />
    );
    expect(html).toContain("Página indexable");
    expect(html).toContain("Un solo &lt;h1&gt; por página");
    expect(html).toContain("Crítico");
    expect(html).toContain("Bien");
    // A filter with nothing under it is not offered.
    expect(html).not.toContain(">Aviso <");
  });

  it("dice que no hay problemas cuando sólo hay comprobaciones superadas", () => {
    const html = renderToStaticMarkup(
      <FixListCard
        {...steps}
        list={{
          rows: [{ kind: "ok", passing: { check: "single_h1", passedCount: 4, applicableCount: 4 } }],
          counts: { all: 1, critical: 0, warning: 0, improvement: 0, ok: 1 }
        }}
      />
    );
    expect(html).toContain("Ningún problema técnico");
  });

  it("trae los pasos del sitemap dentro de su fila", () => {
    const html = renderToStaticMarkup(
      <FixListCard
        llmsTxtFile={null}
        llmsPublishSteps={[]}
        sitemapFixSteps={[{ title: "Activa el sitemap", body: "En tu CMS." }]}
        list={{
          rows: [
            {
              kind: "issue",
              issue: issue({ check: "sitemap_missing", severity: "warning", affectedLabels: [], applicableCount: 1 })
            }
          ],
          counts: { all: 1, critical: 0, warning: 1, improvement: 0, ok: 0 }
        }}
      />
    );
    expect(html).toContain("Solución disponible");
  });
});
