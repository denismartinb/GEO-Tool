import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BarChart, ColumnChart, EngineChart } from "./charts";

/**
 * STUDY-HOME-1 (log §250). La barra acompaña a la cifra, nunca la sustituye:
 * cada valor tiene que estar escrito en el HTML, y una marca a 0% en un motor
 * tiene que decir «0%», no desaparecer.
 */
describe("gráficos del artículo", () => {
  it("BarChart escribe cada cifra y su variación", () => {
    const html = renderToStaticMarkup(
      BarChart({ title: "T", rows: [{ label: "IA", value: 33, delta: "+15 pts", highlight: true }, { label: "B", value: 85 }] })
    );
    expect(html).toContain("33%");
    expect(html).toContain("+15 pts");
    expect(html).toContain("85%");
    expect(html).toContain("is-hl");
  });

  it("ColumnChart escribe cada cifra aunque la columna sea mínima", () => {
    const html = renderToStaticMarkup(ColumnChart({ title: "T", columns: [{ label: "A", value: 1 }, { label: "B", value: 15 }] }));
    expect(html).toContain("1%");
    expect(html).toContain("15%");
  });

  it("EngineChart nombra los tres motores sin versión y escribe el 0%", () => {
    const html = renderToStaticMarkup(
      EngineChart({ title: "T", rows: [{ brand: "Debitoor", gemini: 0, chatgpt: 0, claude: 74 }] })
    );
    for (const name of ["Gemini", "ChatGPT", "Claude"]) expect(html).toContain(name);
    expect(html).toContain("0%");
    expect(html).toContain("74%");
    expect(html).not.toMatch(/gpt-|gemini-\d|claude-\w+-\d/i);
  });
});
