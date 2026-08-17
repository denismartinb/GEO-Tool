import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { LockedSubScoreTile, MiniBar, ScoreGauge, ScoreRing, SubScoreTile, scoreColor } from "./score-tiles";

/**
 * PRELAUNCH-HARDENING-1 R7 — tests de render de los azulejos de puntuación.
 * Ver la cabecera de `issue-rows.test.tsx` para por qué se renderiza de verdad
 * con `react-dom/server` y qué se asegura (contenido) y qué no (aspecto).
 *
 * Lo que estos tests protegen en concreto es el invariante de la zona «ningún
 * número de relleno» (`.claude/rules/web-audit.md`): que un dato ausente se
 * vea como ausente y que un plan sin la mitad de cobertura NO se lea como
 * «todavía no auditado».
 */

describe("scoreColor", () => {
  it("corta en 40 y en 70, no en otros sitios", () => {
    expect(scoreColor(39)).toBe(scoreColor(0));
    expect(scoreColor(40)).not.toBe(scoreColor(39));
    expect(scoreColor(69)).toBe(scoreColor(40));
    expect(scoreColor(70)).not.toBe(scoreColor(69));
    expect(scoreColor(100)).toBe(scoreColor(70));
  });

  it("un score ausente no se pinta como uno malo", () => {
    expect(scoreColor(null)).not.toBe(scoreColor(0));
  });
});

describe("ScoreGauge", () => {
  it("publica el número cuando lo hay", () => {
    expect(renderToStaticMarkup(<ScoreGauge score={76} />)).toContain("76");
  });

  /**
   * Sin datos NO se dibuja un cero: un cero es una afirmación sobre la web del
   * cliente y «no lo hemos medido» no lo es.
   */
  it("sin datos no inventa un cero", () => {
    const html = renderToStaticMarkup(<ScoreGauge score={null} />);
    expect(html).not.toContain(">0<");
    expect(html).toContain("sin datos");
  });
});

describe("ScoreRing", () => {
  it("publica el número y lo etiqueta para lectores de pantalla", () => {
    const html = renderToStaticMarkup(<ScoreRing score={42} label="portada" />);
    expect(html).toContain("42");
    expect(html).toContain("portada");
  });
});

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
