import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  compareToGroundTruth,
  createEmptyStats,
  estimateCallCostUsd,
  estimateTokensFromChars,
  foldRowOutcome,
  formatStatsTable,
  parseLimitArg
} from "./extraction-bench";

/**
 * EXTRACTION-COST-BENCH-1. Two jobs, kept apart on purpose:
 *
 * 1. The read-only guard is the actual safety property this script promised
 *    in its Task Intake ("no escribe en base de datos") — it must fail loudly
 *    if a future edit adds a write, not rely on a reviewer noticing.
 * 2. Everything else is ordinary unit coverage of the pure helpers the bench
 *    is built from. None of it touches a network or a database — the parts
 *    that do (fetchSampleRows, runCandidateExtraction, main) need live
 *    Supabase/Gemini/OpenAI credentials this repo's test environment does not
 *    have, and are exercised by running `pnpm bench:extraction` directly, not
 *    by this suite.
 */

describe("extraction-bench read-only guard", () => {
  it("never calls a Supabase write method", () => {
    const source = readFileSync(path.resolve(__dirname, "extraction-bench.ts"), "utf8");
    const forbidden = [".update(", ".insert(", ".upsert(", ".delete("];
    for (const pattern of forbidden) {
      expect(source.includes(pattern), `extraction-bench.ts must not call ${pattern} — this script is read-only by design`).toBe(
        false
      );
    }
  });

  it("only queries scan_prompt_results with .select()", () => {
    const source = readFileSync(path.resolve(__dirname, "extraction-bench.ts"), "utf8");
    expect(source).toContain('.select(');
    expect(source).toContain("scan_prompt_results");
  });
});

describe("estimateTokensFromChars", () => {
  it("divides by 4 and rounds up", () => {
    expect(estimateTokensFromChars(0)).toBe(0);
    expect(estimateTokensFromChars(1)).toBe(1);
    expect(estimateTokensFromChars(4)).toBe(1);
    expect(estimateTokensFromChars(5)).toBe(2);
    expect(estimateTokensFromChars(400)).toBe(100);
  });

  it("never goes negative on bad input", () => {
    expect(estimateTokensFromChars(-10)).toBe(0);
  });
});

describe("estimateCallCostUsd", () => {
  it("prices input and output tokens independently", () => {
    const cost = estimateCallCostUsd({
      inputChars: 4_000_000, // 1,000,000 estimated tokens
      outputChars: 400_000, // 100,000 estimated tokens
      pricePerMillionInputUsd: 0.3,
      pricePerMillionOutputUsd: 2.5
    });
    // 1M input tokens * $0.30/1M + 0.1M output tokens * $2.50/1M
    expect(cost).toBeCloseTo(0.3 + 0.25, 6);
  });

  it("is zero for empty input and output", () => {
    expect(estimateCallCostUsd({ inputChars: 0, outputChars: 0, pricePerMillionInputUsd: 1, pricePerMillionOutputUsd: 1 })).toBe(0);
  });
});

describe("compareToGroundTruth", () => {
  const groundTruth = { brandMentioned: true, mentionedCompetitorsCount: 2, sentiment: "positive" };

  it("agrees on every field when the candidate matches exactly", () => {
    expect(compareToGroundTruth(groundTruth, { ...groundTruth })).toEqual({
      brandMentioned: true,
      mentionedCompetitorsCount: true,
      sentiment: true
    });
  });

  it("flags each field independently when the candidate diverges", () => {
    expect(
      compareToGroundTruth(groundTruth, { brandMentioned: false, mentionedCompetitorsCount: 1, sentiment: "neutral" })
    ).toEqual({
      brandMentioned: false,
      mentionedCompetitorsCount: false,
      sentiment: false
    });
  });
});

describe("createEmptyStats / foldRowOutcome", () => {
  it("starts every counter at zero", () => {
    expect(createEmptyStats("test-candidate")).toEqual({
      key: "test-candidate",
      rows: 0,
      errors: 0,
      brandMentionedAgree: 0,
      mentionedCompetitorsCountAgree: 0,
      sentimentAgree: 0,
      totalEstimatedCostUsd: 0
    });
  });

  it("accumulates agreement and cost without mutating the input", () => {
    const initial = createEmptyStats("c");
    const folded = foldRowOutcome(initial, {
      agreement: { brandMentioned: true, mentionedCompetitorsCount: false, sentiment: true },
      estimatedCostUsd: 0.001
    });

    expect(initial.rows).toBe(0); // never mutated
    expect(folded.rows).toBe(1);
    expect(folded.brandMentionedAgree).toBe(1);
    expect(folded.mentionedCompetitorsCountAgree).toBe(0);
    expect(folded.sentimentAgree).toBe(1);
    expect(folded.totalEstimatedCostUsd).toBeCloseTo(0.001, 9);
  });

  it("counts a per-row error as a row without touching agreement counters", () => {
    const folded = foldRowOutcome(createEmptyStats("c"), { error: true });
    expect(folded).toEqual({
      key: "c",
      rows: 1,
      errors: 1,
      brandMentionedAgree: 0,
      mentionedCompetitorsCountAgree: 0,
      sentimentAgree: 0,
      totalEstimatedCostUsd: 0
    });
  });

  it("folds across many rows correctly", () => {
    let stats = createEmptyStats("c");
    for (let i = 0; i < 3; i++) {
      stats = foldRowOutcome(stats, {
        agreement: { brandMentioned: true, mentionedCompetitorsCount: true, sentiment: true },
        estimatedCostUsd: 0.002
      });
    }
    stats = foldRowOutcome(stats, { error: true });

    expect(stats.rows).toBe(4);
    expect(stats.errors).toBe(1);
    expect(stats.brandMentionedAgree).toBe(3);
    expect(stats.totalEstimatedCostUsd).toBeCloseTo(0.006, 9);
  });
});

describe("formatStatsTable", () => {
  it("renders a markdown table with one row per candidate", () => {
    const stats = foldRowOutcome(createEmptyStats("gemini-2.5-flash-lite"), {
      agreement: { brandMentioned: true, mentionedCompetitorsCount: true, sentiment: false },
      estimatedCostUsd: 0.0005
    });
    const table = formatStatsTable([stats]);

    expect(table).toContain("| candidato |");
    expect(table).toContain("gemini-2.5-flash-lite");
    expect(table).toContain("100.0%"); // brand_mentioned and mentioned_competitors_count agreement
    expect(table).toContain("0.0%"); // sentiment disagreement
  });

  it("shows a dash instead of dividing by zero when every row errored", () => {
    const stats = foldRowOutcome(createEmptyStats("c"), { error: true });
    const table = formatStatsTable([stats]);
    expect(table).toContain("—");
  });
});

describe("parseLimitArg", () => {
  it("reads --limit followed by a number", () => {
    expect(parseLimitArg(["--limit", "30"], 60)).toBe(30);
  });

  it("falls back to the default when --limit is absent", () => {
    expect(parseLimitArg([], 60)).toBe(60);
  });

  it("falls back to the default when --limit has no value", () => {
    expect(parseLimitArg(["--limit"], 60)).toBe(60);
  });

  it("falls back to the default when the value is not a positive number", () => {
    expect(parseLimitArg(["--limit", "abc"], 60)).toBe(60);
    expect(parseLimitArg(["--limit", "-5"], 60)).toBe(60);
    expect(parseLimitArg(["--limit", "0"], 60)).toBe(60);
  });
});
