import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { SMALL_SAMPLE_THRESHOLD } from "@/lib/web-audit/sample-confidence";
import { TrendChart, type TrendChartPoint } from "./trend-chart";
import { formatDate } from "./format";

/**
 * PRELAUNCH-HARDENING-1 R7 — tests de render del gráfico de tendencia.
 *
 * Este módulo tiene una razón extra para tener tests, y está medida: **es el
 * único de los seis que ninguna captura del `ux-pilot` enseña**. El gráfico
 * necesita historial de auditorías y la cuenta del piloto sólo tiene una, así
 * que en la pasada de la PR #404 se movió de fichero sin que nadie lo viera
 * renderizado — ni un test ni un ojo. Estos tests son lo único que lo mira.
 */

function point(overrides: Partial<TrendChartPoint> = {}): TrendChartPoint {
  return {
    generatedAt: "2026-08-11T10:00:00Z",
    coveragePct: 40,
    surfacingPct: 20,
    conclusiveCount: 12,
    coveredCount: 5,
    ...overrides
  };
}

describe("TrendChart", () => {
  it("dibuja un punto por auditoría", () => {
    const html = renderToStaticMarkup(
      <TrendChart
        points={[
          point({ generatedAt: "2026-08-01T10:00:00Z" }),
          point({ generatedAt: "2026-08-05T10:00:00Z" }),
          point({ generatedAt: "2026-08-11T10:00:00Z" })
        ]}
      />
    );
    expect(html.match(/<circle/g) ?? []).toHaveLength(6); // dos series × tres puntos
  });

  /**
   * El texto alternativo tiene que contar la misma historia que el dibujo: es
   * lo único que recibe quien no ve el gráfico.
   */
  it("resume la serie en su etiqueta accesible", () => {
    const html = renderToStaticMarkup(
      <TrendChart points={[point({ coveragePct: 10 }), point({ coveragePct: 55 })]} />
    );
    expect(html).toContain("Cobertura 10%");
    expect(html).toContain("55%");
    expect(html).toContain("2 auditorías");
  });

  it("dice «sin dato» en vez de inventar un cero cuando una serie falta", () => {
    const html = renderToStaticMarkup(
      <TrendChart points={[point({ coveragePct: null }), point({ coveragePct: null })]} />
    );
    expect(html).toContain("sin dato");
  });

  /**
   * WEB-AUDIT-R6 fase 1: una muestra pequeña se marca punto a punto con un
   * marcador hueco, para que un salto sobre pocos datos no se lea como
   * movimiento real. Hueco = relleno de superficie, no del color de la serie.
   */
  it("marca en hueco los puntos de muestra pequeña", () => {
    const small = renderToStaticMarkup(
      <TrendChart points={[point({ conclusiveCount: SMALL_SAMPLE_THRESHOLD - 1 }), point({ conclusiveCount: SMALL_SAMPLE_THRESHOLD - 1 })]} />
    );
    const solid = renderToStaticMarkup(
      <TrendChart points={[point({ conclusiveCount: SMALL_SAMPLE_THRESHOLD + 5 }), point({ conclusiveCount: SMALL_SAMPLE_THRESHOLD + 5 })]} />
    );
    expect(small).toContain('fill="var(--surface)"');
    expect(small).not.toEqual(solid);
  });

  it("no repite la misma fecha dos veces en el eje", () => {
    const sameDay = "2026-08-11T10:00:00Z";
    const html = renderToStaticMarkup(
      <TrendChart points={[point({ generatedAt: sameDay }), point({ generatedAt: sameDay })]} />
    );
    const label = formatDate(sameDay);
    expect(html.split(label).length - 1).toBe(1);
  });

  it("sobrevive a un solo punto sin dividir por cero", () => {
    expect(() => renderToStaticMarkup(<TrendChart points={[point()]} />)).not.toThrow();
  });
});

describe("formatDate", () => {
  it("no inventa una fecha cuando no la hay", () => {
    expect(formatDate(null)).toBe("—");
    expect(formatDate(undefined)).toBe("—");
    expect(formatDate("")).toBe("—");
  });

  it("formatea en castellano y en la zona horaria del producto", () => {
    // 23:30 UTC del 10 es ya el 11 en Europe/Madrid: si la zona se cayera,
    // esta fecha se publicaría con un día de menos.
    expect(formatDate("2026-08-10T23:30:00Z")).toBe("11 ago 2026");
  });
});
