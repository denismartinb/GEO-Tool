import { describe, expect, it } from "vitest";
import { adviceSignal, dataSignal, enginesList, scopeLine } from "./card-signals";

describe("card signals (RECS-SHORT-CARD-1)", () => {
  it("names engines by label, deduplicated", () => {
    expect(enginesList(["gemini"])).toBe("Gemini");
    expect(enginesList(["gemini", "openai", "gemini"])).toBe("Gemini y ChatGPT");
    expect(enginesList([])).toBe("");
  });

  it("builds the scope line from distinct questions and engines, or nothing", () => {
    expect(scopeLine(2, ["gemini", "openai"])).toBe("2 preguntas · Gemini y ChatGPT");
    expect(scopeLine(1, [])).toBe("1 pregunta");
    expect(scopeLine(0, [])).toBeNull();
  });

  it("reads data strength from the run confidence, never from the advice", () => {
    expect(dataSignal({ confidence: "high", questionCount: 2, providers: ["gemini"], runsOpen: 1 })).toEqual({
      label: "Dato sólido",
      tone: "strong",
      note: "Visto en 2 preguntas de Gemini."
    });
    const low = dataSignal({ confidence: "low", questionCount: 0, providers: [], runsOpen: 3 });
    expect(low.label).toBe("Dato escaso");
    expect(low.note).toContain("Sigue abierta tras 3 escaneos seguidos");
    expect(low.note).toContain("pista");
    expect(dataSignal({ confidence: "unknown", questionCount: 0, providers: [], runsOpen: 1 })).toEqual({
      label: "Dato medio",
      tone: "medium",
      note: null
    });
  });

  it("reads advice from who controls the move, and says nothing without a control", () => {
    expect(adviceSignal("own_site")?.label).toBe("Lo controlas tú");
    expect(adviceSignal("third_party")?.label).toBe("Depende de terceros");
    expect(adviceSignal("in_app")?.label).toBe("Lo haces aquí");
    expect(adviceSignal(null)).toBeNull();
    expect(adviceSignal("own_site", "definition")?.label).toBe("Con límite");
  });
});
