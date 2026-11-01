import { describe, expect, it } from "vitest";
import { buildExtPrompts } from "./prompts";

const matrix = {
  hasCoverage: false,
  groups: [
    {
      topic: "Precios",
      rows: [
        {
          promptId: "a",
          promptText: "¿Cuánto cuesta X?",
          cells: [
            { provider: "openai", cell: { kind: "you" as const, position: 1 } },
            { provider: "gemini", cell: { kind: "none" as const } }
          ],
          page: null
        },
        { promptId: "old", promptText: "Retirado", cells: [], page: null }
      ]
    }
  ]
};
const label = (p: string) => ({ openai: "ChatGPT", gemini: "Gemini" })[p] ?? p;

describe("buildExtPrompts (log §428)", () => {
  it("joins the active list with the latest scan; an unscanned prompt is pending, a retired one drops out", () => {
    const out = buildExtPrompts({
      active: [
        { id: "a", text: "¿Cuánto cuesta X?", topic: "Precios" },
        { id: "b", text: "¿Mejor X para pymes?", topic: null }
      ],
      matrix,
      engineLabel: label
    });
    expect(out).toEqual([
      {
        text: "¿Cuánto cuesta X?",
        topic: "Precios",
        engines: [
          { label: "ChatGPT", cell: { kind: "you", position: 1 } },
          { label: "Gemini", cell: { kind: "none" } }
        ]
      },
      { text: "¿Mejor X para pymes?", topic: null, engines: null }
    ]);
  });

  it("without the active list, still shows what the scan asked", () => {
    expect(buildExtPrompts({ active: null, matrix, engineLabel: label }).map((p) => p.text)).toEqual(["¿Cuánto cuesta X?", "Retirado"]);
  });

  it("no scan and no prompts → empty, never invented", () => {
    expect(buildExtPrompts({ active: [], matrix: null, engineLabel: label })).toEqual([]);
  });
});
