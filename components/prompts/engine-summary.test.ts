import { describe, expect, it } from "vitest";
import {
  mentionLine,
  ownCitationLine,
  sourceFrequency,
  summarizeEngines,
  type SummaryExtraction,
  type SummaryRow
} from "./engine-summary";

/** PROMPT-DRAWER-ENGINES-1 (log §280): one summary per engine, not per answer. */

function row(id: string, provider: string, sample: number, mentioned: boolean, sentiment: string | null = null): SummaryRow {
  return { id, provider, sample_index: sample, brand_mentioned: mentioned, sentiment };
}

function ext(domains: string[]): SummaryExtraction {
  return { brand: { mentioned: true }, citations: domains.map((d) => ({ domain: d, url: `https://${d}/x` })) };
}

describe("summarizeEngines", () => {
  const rows = [
    row("g2", "gemini", 2, true, "positive"),
    row("g0", "gemini", 0, true, "positive"),
    row("g1", "gemini", 1, false, "negative"),
    row("c0", "claude", 0, true, "neutral")
  ];
  const extractions = [
    ext(["fibrox.es", "xataka.com"]),
    ext(["xataka.com", "xataka.com", "ocu.org"]),
    ext(["www.fibrox.es"]),
    ext([])
  ];
  const [claude, gemini] = summarizeEngines(rows, extractions, "fibrox.es");

  it("groups by engine and orders answers by sample", () => {
    expect(claude.provider).toBe("claude");
    expect(gemini.rowIds).toEqual(["g0", "g1", "g2"]);
    expect(gemini.answers).toBe(3);
    expect(gemini.mentioned).toBe(2);
  });

  it("counts sentiment only over answers that name the brand", () => {
    expect(gemini.sentiment).toBe("positive");
  });

  it("counts a source once per answer and puts the own site first", () => {
    expect(gemini.sources.map((s) => [s.citation.domain, s.answers, s.isOwn])).toEqual([
      ["www.fibrox.es", 1, true],
      ["fibrox.es", 1, true],
      ["xataka.com", 2, false],
      ["ocu.org", 1, false]
    ]);
    expect(gemini.ownCited).toBe(2);
    expect(claude.sources).toEqual([]);
    expect(claude.ownCited).toBe(0);
  });
});

describe("lines", () => {
  it("says the full sentence with the denominator", () => {
    expect(mentionLine({ answers: 5, mentioned: 3 })).toBe("Te nombra en 3 de 5 respuestas");
    expect(mentionLine({ answers: 5, mentioned: 0 })).toBe("No te nombra en ninguna de sus 5 respuestas");
    expect(ownCitationLine({ answers: 5, ownCited: 3 })).toBe("Cita tu web en 3 de 5 respuestas");
    expect(ownCitationLine({ answers: 5, ownCited: 0 })).toBe("No cita tu web");
    expect(sourceFrequency(4, 5)).toBe("en 4 de 5 respuestas");
  });

  it("drops the fraction when the engine answered once", () => {
    expect(mentionLine({ answers: 1, mentioned: 1 })).toBe("Te nombra");
    expect(mentionLine({ answers: 1, mentioned: 0 })).toBe("No te nombra");
    expect(ownCitationLine({ answers: 1, ownCited: 1 })).toBe("Cita tu web");
    expect(sourceFrequency(1, 1)).toBeNull();
  });
});
