import { describe, expect, it } from "vitest";
import { joinEngineNames, jokeFor, subtitleFor } from "./scan-mission-rocket";
import type { MissionBeat } from "@/lib/scan/mission-beats";

const ignition = { key: "ignicion" } as MissionBeat;

describe("mission ignition copy names the run's real engines (log §285)", () => {
  it("names Perplexity on a four-engine run", () => {
    const names = ["Gemini", "Claude", "ChatGPT", "Perplexity"];
    expect(subtitleFor(ignition, names)).toBe("Gemini, Claude, ChatGPT y Perplexity, preguntados a la vez.");
    expect(jokeFor(ignition, names)).toBe("Los cuatro a la vez. Sí, se puede.");
  });

  it("keeps three engines on a Starter run", () => {
    const names = ["Gemini", "Claude", "ChatGPT"];
    expect(subtitleFor(ignition, names)).not.toContain("Perplexity");
    expect(jokeFor(ignition, names)).toBe("Los tres a la vez. Sí, se puede.");
  });

  it("never guesses a list when the engine set is unknown", () => {
    expect(subtitleFor(ignition, null)).toBe("Tus motores de IA, preguntados a la vez.");
    expect(joinEngineNames(["Gemini"])).toBe("Gemini");
    expect(jokeFor(ignition, ["Gemini"])).toBe("");
  });
});
