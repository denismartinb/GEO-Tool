import { describe, expect, it } from "vitest";
import { renderNextStep } from "./next-step";

const base = { projectId: "p1", domain: "ejemplo.es", recommendationId: "r1", title: "Crea una página de precios" };

describe("renderNextStep", () => {
  it("names the plan's first action and links to Recomendaciones", () => {
    const r = renderNextStep({ ...base, potentialPoints: 4.6 });
    expect(r.title).toBe("Crea una página de precios");
    expect(r.href).toBe("/dashboard/projects/p1/recommendations");
    expect(r.targetLabel).toBe("ejemplo.es");
    expect(r.body).toContain("acciones prioritarias");
    expect(r.body).toContain("+5 pt");
  });

  it("shows no figure when the action has no quantified points", () => {
    expect(renderNextStep({ ...base, potentialPoints: null }).body).not.toContain("pt");
    expect(renderNextStep({ ...base, potentialPoints: 0.05 }).body).not.toContain("pt");
  });

  it("formats sub-point figures with a comma, like the card", () => {
    expect(renderNextStep({ ...base, potentialPoints: 0.4 }).body).toContain("+0,4 pt");
  });
});
