import { describe, expect, it } from "vitest";

import { buildExportPlanMarkdown, exportPlanFileName, type ExportPlanRecommendation } from "./export-plan";

const rec = (over: Partial<ExportPlanRecommendation>): ExportPlanRecommendation => ({
  title: "Título",
  description: "Descripción",
  recommendation_type: "add_citation_block",
  ...over,
});

describe("buildExportPlanMarkdown", () => {
  it("incluye el dominio y la fecha en la cabecera", () => {
    const md = buildExportPlanMarkdown({
      domain: "acme.com",
      plan: [],
      rest: [],
      now: new Date("2026-09-08T10:00:00Z"),
    });
    expect(md).toContain("# Plan de acción GEO — acme.com");
    expect(md).toMatch(/Generado por GenScore/);
  });

  it("numera las acciones prioritarias y las del resto por separado", () => {
    const md = buildExportPlanMarkdown({
      domain: "acme.com",
      plan: [rec({ title: "Prioritaria A" }), rec({ title: "Prioritaria B" })],
      rest: [rec({ title: "Resto A" })],
      now: new Date("2026-09-08T10:00:00Z"),
    });
    expect(md).toContain("## Prioritarias (2)");
    expect(md).toContain("1. **Prioritaria A**");
    expect(md).toContain("2. **Prioritaria B**");
    expect(md).toContain("## Resto (1)");
    expect(md).toContain("1. **Resto A**");
  });

  it("omite la sección de Resto cuando está vacía", () => {
    const md = buildExportPlanMarkdown({
      domain: "acme.com",
      plan: [rec({ title: "Única" })],
      rest: [],
      now: new Date("2026-09-08T10:00:00Z"),
    });
    expect(md).not.toContain("## Resto");
  });

  it("muestra los puntos potenciales sólo por encima del umbral visible", () => {
    const md = buildExportPlanMarkdown({
      domain: "acme.com",
      plan: [rec({ title: "Con puntos", potentialPoints: 5 }), rec({ title: "Sin puntos", potentialPoints: 0.01 })],
      rest: [],
      now: new Date("2026-09-08T10:00:00Z"),
    });
    expect(md).toContain("**Con puntos** (+5 pt potenciales)");
    expect(md).toContain("**Sin puntos**");
    expect(md).not.toContain("**Sin puntos** (+");
  });

  it("etiqueta los puntos de una acción de terceros como condicionados", () => {
    const md = buildExportPlanMarkdown({
      domain: "acme.com",
      plan: [rec({ title: "Externa", recommendation_type: "pursue_media_sources", potentialPoints: 11 })],
      rest: [],
      now: new Date("2026-09-08T10:00:00Z"),
    });
    expect(md).toContain("(+11 pt si te citan)");
  });

  it("incluye el primer paso cuando existe evidencia", () => {
    const md = buildExportPlanMarkdown({
      domain: "acme.com",
      plan: [rec({ title: "Con paso", evidence_json: { first_step: "Publica una FAQ" } })],
      rest: [],
      now: new Date("2026-09-08T10:00:00Z"),
    });
    expect(md).toContain("Empieza por aquí: Publica una FAQ");
  });

  it("no inventa un primer paso cuando no hay evidencia", () => {
    const md = buildExportPlanMarkdown({
      domain: "acme.com",
      plan: [rec({ title: "Sin paso" })],
      rest: [],
      now: new Date("2026-09-08T10:00:00Z"),
    });
    expect(md).not.toContain("Empieza por aquí");
  });
});

describe("exportPlanFileName", () => {
  it("usa el dominio en el nombre del fichero", () => {
    expect(exportPlanFileName("acme.com")).toBe("plan-geo-acme.com.md");
  });

  it("cae a 'genscore' cuando no hay dominio", () => {
    expect(exportPlanFileName("")).toBe("plan-geo-genscore.md");
  });
});
