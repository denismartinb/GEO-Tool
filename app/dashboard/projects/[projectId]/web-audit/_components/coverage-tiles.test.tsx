import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { LockedSubScoreTile, MiniBar, SubScoreTile } from "./coverage-tiles";

/**
 * Render tests for the coverage tiles, moved with them from Auditoría web
 * (SEARCH-SEO-1 Fase 1b). They protect «ningún número de relleno»: an absent
 * value looks absent, and a plan without coverage never reads as «todavía no
 * auditado».
 */

describe("MiniBar", () => {
  it("acota el relleno a 0-100 en vez de desbordar la barra", () => {
    expect(renderToStaticMarkup(<MiniBar pct={140} color="red" />)).toContain("width:100%");
    expect(renderToStaticMarkup(<MiniBar pct={-20} color="red" />)).toContain("width:0%");
    expect(renderToStaticMarkup(<MiniBar pct={37} color="red" />)).toContain("width:37%");
  });
});

describe("SubScoreTile", () => {
  it("publica etiqueta, valor y pista", () => {
    const html = renderToStaticMarkup(
      <SubScoreTile label="Contenido" value="5 / 12" hint="Temas con contenido propio verificado" delta={null} pct={41} />
    );
    expect(html).toContain("Contenido");
    expect(html).toContain("5 / 12");
    expect(html).toContain("Temas con contenido propio verificado");
  });

  it("no dibuja barra cuando la señal no se ha calculado", () => {
    const withBar = renderToStaticMarkup(<SubScoreTile label="L" value="V" hint="H" delta={null} pct={50} />);
    const withoutBar = renderToStaticMarkup(<SubScoreTile label="L" value="V" hint="H" delta={null} pct={null} />);
    // Se busca el relleno porcentual de la MiniBar, no la subcadena "width:"
    // a secas: el propio azulejo lleva `min-width:0` y la contiene.
    expect(withBar).toMatch(/[^-]width:50%/);
    expect(withoutBar).not.toMatch(/[^-]width:\d/);
  });

  /**
   * Un delta de 0 no es información: enseñarlo como «0 pt» sugiere que hubo
   * medición y movimiento nulo, cuando la convención de la pantalla es no
   * afirmar nada. Un delta ausente tampoco se dibuja.
   */
  it("calla el delta cuando es cero o no existe", () => {
    expect(renderToStaticMarkup(<SubScoreTile label="L" value="V" hint="H" delta={0} pct={null} />)).not.toContain("pt");
    expect(renderToStaticMarkup(<SubScoreTile label="L" value="V" hint="H" delta={null} pct={null} />)).not.toContain("pt");
    expect(renderToStaticMarkup(<SubScoreTile label="L" value="V" hint="H" delta={3} pct={null} />)).toContain("pt");
  });
});

describe("LockedSubScoreTile", () => {
  /**
   * WEB-AUDIT-TECH-ALL-PLANS-1: reutilizar el «—/Sin auditar» de SubScoreTile
   * aquí afirmaría «nunca se ha ejecutado» cuando el hecho real es «no está en
   * tu plan» — una afirmación falsa sobre la cuenta del cliente.
   */
  it("dice que no está en el plan, no que no se haya auditado", () => {
    const html = renderToStaticMarkup(<LockedSubScoreTile label="Contenido" hint="Disponible en Pro" />);
    expect(html).toContain("No está en tu plan");
    expect(html).not.toContain("Sin auditar");
  });
});
