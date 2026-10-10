import { describe, expect, it } from "vitest";
import { COMPARISON_ROWS, FAQ_ITEMS, GENSCORE_NOTE, PAGE, SOURCES, VENDORS } from "./profound-vs-peec-ai-vs-otterly";

/**
 * GEO-SELF-1 Fase 2 (log §258). La comparativa a tres es NEUTRAL: GenScore no
 * compite en la tabla, sólo aparece en una nota etiquetada y con sus límites.
 */
describe("profound-vs-peec-ai-vs-otterly", () => {
  it("cubre las tres herramientas", () => {
    expect(VENDORS.map((v) => v.id)).toEqual(["profound", "peec", "otterly"]);
  });

  it("GenScore no aparece en la tabla", () => {
    for (const row of COMPARISON_ROWS) {
      const text = [row.label, row.profound, row.peec, row.otterly, row.takeaway].join(" ");
      expect(text, `${row.label}: GenScore no compite en la tabla`).not.toMatch(/GenScore/i);
    }
  });

  it("toda fila tiene las tres columnas, su lectura y al menos una fuente", () => {
    for (const row of COMPARISON_ROWS) {
      expect(row.profound.length).toBeGreaterThan(0);
      expect(row.peec.length).toBeGreaterThan(0);
      expect(row.otterly.length).toBeGreaterThan(0);
      expect(row.takeaway.length, `${row.label}: sin lectura`).toBeGreaterThan(20);
      expect(row.sources.length, `${row.label}: sin fuente`).toBeGreaterThan(0);
    }
  });

  it("todo importe de un tercero se presenta como orientativo y con la fuente nombrada", () => {
    const priceRow = COMPARISON_ROWS.find((r) => r.label.startsWith("Precio"))!;
    expect(priceRow.peec).toMatch(/orientativo/i);
    expect(priceRow.peec).toMatch(/PricingSaaS/);
    expect(priceRow.profound).toMatch(/orientativo/i);
    expect(priceRow.profound).toMatch(/GEO Toolbox/);
    expect(priceRow.sources.some((s) => !s.primary)).toBe(true);
  });

  it("la nota de GenScore se declara como nuestra y nombra sus límites reales", () => {
    expect(GENSCORE_NOTE.body).toMatch(/nuestra herramienta/i);
    expect(GENSCORE_NOTE.limits).toMatch(/Perplexity/);
    expect(GENSCORE_NOTE.limits).toMatch(/pa[íi]s/i);
  });

  it("la metadata no nombra motores", () => {
    const meta = `${PAGE.metaTitle} ${PAGE.metaDescription}`;
    expect(meta).not.toMatch(/ChatGPT|Gemini|Claude|Perplexity|Copilot|AI Overviews|AI Mode/);
  });

  it("no afirma que ninguna de las tres carezca de interfaz en castellano", () => {
    const text = JSON.stringify({ COMPARISON_ROWS, FAQ_ITEMS, VENDORS });
    expect(text).not.toMatch(/no tiene (interfaz|versión) en (castellano|español)/i);
  });

  it("toda fuente lleva URL https y fecha ISO", () => {
    for (const s of Object.values(SOURCES)) {
      expect(s.url).toMatch(/^https:\/\//);
      expect(s.consulted).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});
