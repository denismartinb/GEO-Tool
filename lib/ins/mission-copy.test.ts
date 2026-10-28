import { describe, expect, it } from "vitest";
import { joinEngineNames, missionCounter, missionLine, phaseIndex } from "./mission-copy";
import type { MissionBeat } from "@/lib/scan/mission-beats";

const run = { status: "running", total_prompts: 20, successful_prompts: 5, failed_prompts: 1, started_at: null };

describe("mission copy", () => {
  it("names the engine count on ignition and never guesses", () => {
    const b = { key: "ignicion", total: 20 } as MissionBeat;
    expect(missionLine(b, 4)).toBe("Los cuatro a la vez. Sí, se puede.");
    expect(missionLine(b, 3)).toBe("Los tres a la vez. Sí, se puede.");
    expect(missionLine(b, null)).toBe("Todos a la vez. Sí, se puede.");
    expect(joinEngineNames(["Gemini", "Claude"])).toBe("Gemini y Claude");
  });

  it("maps the five real beats to the five phases", () => {
    expect(phaseIndex({ key: "rampa" })).toBe(0);
    expect(phaseIndex({ key: "entrega" })).toBe(4);
  });

  it("counts answers received while the engines answer", () => {
    const b = { key: "ascenso", done: 6, total: 20, climb: 0.3 } as MissionBeat;
    expect(missionCounter(b, run, { gemini: 5, claude: 4, openai: 3 }, 3)).toEqual({
      got: 12,
      total: 60,
      unit: "respuestas recibidas"
    });
  });

  it("falls back to launches when engines could not be counted", () => {
    const b = { key: "ascenso", done: 6, total: 20, climb: 0.3 } as MissionBeat;
    expect(missionCounter(b, run, null, 3)).toEqual({ got: 6, total: 20, unit: "lanzamientos" });
  });

  it("counts answers read in orbit from the run's own rows", () => {
    const b = { key: "orbita", done: 10, total: 60, ringFrac: 0.2 } as MissionBeat;
    expect(missionCounter(b, { ...run, responses_total: 60, responses_processed: 10 }, null, 3)).toEqual({
      got: 10,
      total: 60,
      unit: "respuestas leídas"
    });
  });
});
