import { describe, expect, it } from "vitest";
import { enginesFromFlags } from "./engine-flags";

describe("enginesFromFlags", () => {
  it("returns undefined (no override) when the core flags could not be read", () => {
    expect(enginesFromFlags(null, { engine_perplexity_enabled: false })).toBeUndefined();
  });

  it("keeps Perplexity on when migration 0040 is not applied yet", () => {
    expect(
      enginesFromFlags({ engine_gemini_enabled: true, engine_claude_enabled: false, engine_openai_enabled: true }, null)
    ).toEqual(["gemini", "openai", "perplexity"]);
  });

  it("drops Perplexity when its switch is off, without touching the others", () => {
    expect(
      enginesFromFlags(
        { engine_gemini_enabled: true, engine_claude_enabled: true, engine_openai_enabled: true },
        { engine_perplexity_enabled: false }
      )
    ).toEqual(["gemini", "claude", "openai"]);
  });
});
