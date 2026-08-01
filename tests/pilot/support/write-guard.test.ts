import { describe, expect, it } from "vitest";
import { assertSingleManualPromptDraft, buildTestPromptText, PILOT_TEST_PROMPT_MARKER } from "./write-guard";

describe("assertSingleManualPromptDraft", () => {
  it("allows exactly one draft prompt", () => {
    expect(() => assertSingleManualPromptDraft(1)).not.toThrow();
  });

  it("rejects zero drafts", () => {
    expect(() => assertSingleManualPromptDraft(0)).toThrow(/expected exactly 1/i);
  });

  it("rejects more than one draft — this is the entire cost cap for the write journey", () => {
    expect(() => assertSingleManualPromptDraft(2)).toThrow(/expected exactly 1/i);
    expect(() => assertSingleManualPromptDraft(10)).toThrow(/expected exactly 1/i);
  });
});

describe("buildTestPromptText", () => {
  it("always carries the pilot marker, so sweepTestPrompts can find it", () => {
    expect(buildTestPromptText("123")).toContain(PILOT_TEST_PROMPT_MARKER);
  });

  it("embeds the run id, so concurrent/successive runs produce distinguishable text", () => {
    const a = buildTestPromptText("run-a");
    const b = buildTestPromptText("run-b");
    expect(a).toContain("run-a");
    expect(b).toContain("run-b");
    expect(a).not.toBe(b);
  });
});
