import { describe, expect, it } from "vitest";
import { buildPurchaseQuestions } from "./purchase-questions";
import { agentPath, findLine } from "./visibility-model";

describe("agentPath", () => {
  it("without a review, the four audit steps wait for it and the first has no colour", () => {
    const steps = agentPath(null, null);
    expect(steps.map((s) => s.title)).toEqual(["Te encuentra", "Entra", "Entiende", "Se fía", "Compra"]);
    expect(steps[0].tone).toBe("neutral");
    expect(steps.slice(1).every((s) => s.tone === "na" && s.line === "Pendiente de la auditoría agéntica")).toBe(true);
  });
});

describe("findLine", () => {
  it("says why there is no share", () => {
    expect(findLine(null)).toBe("Aparecerá tras tu primer escaneo");
    expect(findLine(buildPurchaseQuestions([], { domain: "x.es", totalQuestions: 5 }))).toBe(
      "Ninguna de tus preguntas es de compra todavía"
    );
  });
});
