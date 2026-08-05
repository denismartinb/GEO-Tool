import { describe, expect, it } from "vitest";

import { citationsLabel, sampleCountOf, sampleLabel } from "@/lib/scan/sample-display";

describe("sampleCountOf", () => {
  it("counts a single-sample run as 1", () => {
    expect(sampleCountOf([{ sample_index: 0 }, { sample_index: 0 }, { sample_index: 0 }])).toBe(1);
  });

  it("counts distinct samples, not rows", () => {
    // 3 engines x 3 samples = 9 rows, 3 samples.
    const rows = [0, 1, 2].flatMap((sample_index) =>
      ["gemini", "claude", "openai"].map((provider) => ({ sample_index, provider }))
    );
    expect(rows).toHaveLength(9);
    expect(sampleCountOf(rows)).toBe(3);
  });

  it("stays correct when one engine failed on one repetition", () => {
    // This is why it counts distinct indices instead of rows/engines: an
    // uneven run must not report a fractional or inflated sample count
    // exactly when something went wrong.
    const rows = [
      { sample_index: 0, provider: "gemini" },
      { sample_index: 0, provider: "claude" },
      { sample_index: 1, provider: "gemini" }
    ];
    expect(sampleCountOf(rows)).toBe(2);
  });

  it("treats rows written before migration 0028 as sample 0", () => {
    expect(sampleCountOf([{ provider: "gemini" }, { sample_index: null }])).toBe(1);
  });

  it("returns 0 for no rows", () => {
    expect(sampleCountOf([])).toBe(0);
  });
});

describe("sampleLabel", () => {
  it("says nothing when there is only one sample", () => {
    // The majority of runs never repeat; labelling them "muestra 1 de 1" would
    // add noise to every row of every project.
    expect(sampleLabel(0, 1)).toBeNull();
    expect(sampleLabel(0, 0)).toBeNull();
  });

  it("is one-based, because zero-based is an index and not a label", () => {
    expect(sampleLabel(0, 3)).toBe("muestra 1 de 3");
    expect(sampleLabel(2, 3)).toBe("muestra 3 de 3");
  });

  it("treats a missing index as the first sample", () => {
    expect(sampleLabel(null, 2)).toBe("muestra 1 de 2");
    expect(sampleLabel(undefined, 2)).toBe("muestra 1 de 2");
  });
});

describe("citationsLabel", () => {
  it("reads exactly as before when a run did not repeat", () => {
    // Regression guard: every existing screen must be untouched for the
    // single-sample case, which is almost all of them.
    expect(citationsLabel(7, 3, 1)).toBe("7 citas");
    expect(citationsLabel(1, 3, 1)).toBe("1 cita");
    expect(citationsLabel(0, 3, 1)).toBe("0 citas");
  });

  it("names the denominator once the sum spans several samples", () => {
    // Without this, the same prompt with identical citation behaviour reports
    // 21 under 3 samples and 7 under 1 — two numbers describing one reality.
    expect(citationsLabel(21, 9, 3)).toBe("21 citas en 9 respuestas");
  });

  it("keeps the singular noun even with a denominator", () => {
    expect(citationsLabel(1, 6, 2)).toBe("1 cita en 6 respuestas");
  });
});
