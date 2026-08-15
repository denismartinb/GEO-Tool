import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { TechnicalIssue, TechnicalPassingCheck } from "@/lib/web-audit/issues";
import { CheckDot, IssueRow, PassingRow } from "./issue-rows";

/**
 * PRELAUNCH-HARDENING-1 R7 — los primeros tests de render del repositorio.
 *
 * El hueco que tapan está medido: la pantalla de Auditoría web no tenía NINGÚN
 * test de render, así que la mudanza de sus catorce componentes (log §83) pasó
 * 2.278 tests en verde sin que ni uno de ellos mirase el marcado. Lo único que
 * demostraba la equivalencia era una comparación de líneas hecha a mano, y eso
 * no se ejecuta en CI ni protege al siguiente cambio.
 *
 * **Sin dependencias nuevas, a propósito.** `renderToStaticMarkup` viene con
 * `react-dom`, que ya estaba, y no toca el DOM — por eso `environment: "node"`
 * sigue valiendo y no hace falta jsdom ni una biblioteca de testing. Estos
 * componentes son puros y síncronos (los extrajo R7 justo para eso), así que
 * son una función de props a marcado y se pueden llamar como tal.
 *
 * **Qué se asegura y qué no.** Se asegura el contenido: que el número que sale
 * es el que entra, que el alcance se pluraliza, que la guía aparece al abrir.
 * NO se asegura el aspecto — eso sigue siendo trabajo del `ux-pilot`, y los
 * dos juntos son la cobertura. Un test que fijara clases CSS sólo convertiría
 * cualquier retoque visual en un test rojo sin proteger nada.
 */

function issue(overrides: Partial<TechnicalIssue> = {}): TechnicalIssue {
  return {
    check: "single_h1",
    severity: "critical",
    affectedCount: 2,
    applicableCount: 2,
    pointDelta: 12,
    affectedLabels: ["https://example.com/", "https://example.com/precios"],
    ...overrides
  };
}

describe("IssueRow", () => {
  it("publica el alcance real, no un recuento inventado", () => {
    const html = renderToStaticMarkup(<IssueRow issue={issue({ affectedCount: 1, applicableCount: 3 })} />);
    expect(html).toContain("1 de 3");
  });

  it("pluraliza la unidad según el recuento", () => {
    const one = renderToStaticMarkup(<IssueRow issue={issue({ affectedCount: 1, applicableCount: 1 })} />);
    expect(one).toContain("1 de 1 página");
    expect(one).not.toContain("páginas");

    const many = renderToStaticMarkup(<IssueRow issue={issue({ affectedCount: 2, applicableCount: 4 })} />);
    expect(many).toContain("2 de 4 páginas");
  });

  it("cuenta bots, no páginas, cuando la comprobación es de bots", () => {
    const html = renderToStaticMarkup(
      <IssueRow issue={issue({ check: "bot_blocked", affectedCount: 2, applicableCount: 7, pointDelta: null })} />
    );
    expect(html).toContain("2 de 7 bots");
    expect(html).not.toContain("páginas");
  });

  it("no inventa una ganancia de puntos cuando la comprobación no tiene peso", () => {
    const html = renderToStaticMarkup(<IssueRow issue={issue({ pointDelta: null })} />);
    expect(html).not.toContain("pt");
  });

  it("muestra la ganancia con un solo decimal cuando sí la hay", () => {
    const html = renderToStaticMarkup(<IssueRow issue={issue({ pointDelta: 6 })} />);
    expect(html).toContain("6,0 pt");
  });

  it("lleva la guía concreta de la comprobación, no un texto genérico", () => {
    const html = renderToStaticMarkup(<IssueRow issue={issue({ check: "noindex" })} />);
    expect(html).toContain("noindex");
    expect(html).toContain("Página indexable");
  });

  it("enumera las páginas afectadas", () => {
    const html = renderToStaticMarkup(<IssueRow issue={issue()} />);
    expect(html).toContain("https://example.com/precios");
  });

  /**
   * `SINGLE_FACT_CHECKS`: llms.txt y sitemap.xml son un hecho del dominio, no
   * un recuento de páginas. "0 de 2 páginas" ahí sería una cifra sin sentido.
   */
  it("no cuenta páginas en las comprobaciones de hecho único", () => {
    const html = renderToStaticMarkup(
      <IssueRow issue={issue({ check: "sitemap_missing", severity: "warning", pointDelta: null })} />
    );
    expect(html).toContain("No encontrado");
    expect(html).not.toContain("de 2 páginas");
  });
});

describe("PassingRow", () => {
  function passing(overrides: Partial<TechnicalPassingCheck> = {}): TechnicalPassingCheck {
    return { check: "single_h1", passedCount: 2, applicableCount: 2, ...overrides };
  }

  it("publica cuántas instancias pasan sobre cuántas se midieron", () => {
    const html = renderToStaticMarkup(<PassingRow passing={passing({ passedCount: 3, applicableCount: 4 })} />);
    expect(html).toContain("3 de 4 páginas");
  });

  it("dice «Encontrado» en las comprobaciones de hecho único", () => {
    const html = renderToStaticMarkup(<PassingRow passing={passing({ check: "llms_txt_missing" })} />);
    expect(html).toContain("Encontrado");
  });
});

describe("CheckDot", () => {
  it("distingue cumplida de incumplida en el texto, no sólo en el color", () => {
    const ok = renderToStaticMarkup(<CheckDot ok label="Indexable" />);
    const notOk = renderToStaticMarkup(<CheckDot ok={false} label="Indexable" />);
    expect(ok).not.toEqual(notOk);
    expect(ok).toContain("Indexable");
    expect(notOk).toContain("Indexable");
  });
});
