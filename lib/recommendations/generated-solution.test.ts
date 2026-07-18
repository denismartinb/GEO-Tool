import { describe, expect, it } from "vitest";
import { parseGeneratedSolution } from "@/lib/recommendations/generated-solution";

describe("parseGeneratedSolution", () => {
  it("parses a well-formed solution with the new examples array", () => {
    const raw = JSON.stringify({
      title: "Título",
      summary: "Resumen",
      steps: ["Paso 1", "Paso 2"],
      examples: [{ label: "Antes", content: "texto antes" }]
    });
    expect(parseGeneratedSolution(raw)).toEqual({
      title: "Título",
      summary: "Resumen",
      steps: ["Paso 1", "Paso 2"],
      examples: [{ label: "Antes", content: "texto antes" }]
    });
  });

  it("falls back to the legacy single example object", () => {
    const raw = JSON.stringify({
      title: "Título",
      summary: "Resumen",
      steps: [],
      example: { label: "Legado", content: "texto legado" }
    });
    const result = parseGeneratedSolution(raw);
    expect(result?.examples).toEqual([{ label: "Legado", content: "texto legado" }]);
  });

  it("returns null when title or summary is missing", () => {
    expect(parseGeneratedSolution(JSON.stringify({ summary: "x", steps: [] }))).toBeNull();
    expect(parseGeneratedSolution(JSON.stringify({ title: "x", steps: [] }))).toBeNull();
  });

  it("returns null on malformed JSON instead of throwing", () => {
    expect(() => parseGeneratedSolution("{not valid json")).not.toThrow();
    expect(parseGeneratedSolution("{not valid json")).toBeNull();
  });

  it("drops non-string steps and malformed examples instead of throwing", () => {
    const raw = JSON.stringify({
      title: "Título",
      summary: "Resumen",
      steps: ["ok", 42, null],
      examples: [{ label: "ok", content: "ok" }, { label: "sin content" }, "not an object"]
    });
    const result = parseGeneratedSolution(raw);
    expect(result?.steps).toEqual(["ok"]);
    expect(result?.examples).toEqual([{ label: "ok", content: "ok" }]);
  });

  it("defaults steps/examples to empty arrays when absent", () => {
    const raw = JSON.stringify({ title: "Título", summary: "Resumen" });
    expect(parseGeneratedSolution(raw)).toEqual({ title: "Título", summary: "Resumen", steps: [], examples: [] });
  });
});
