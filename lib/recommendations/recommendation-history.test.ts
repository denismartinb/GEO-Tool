import { describe, expect, it } from "vitest";
import { computeRecommendationTransition, type PreviousRecommendationRow } from "./recommendation-history";

function prevRow(overrides: Partial<PreviousRecommendationRow> & { dedupe_key: string }): PreviousRecommendationRow {
  return { status: "active", consecutive_runs_open: 1, ...overrides };
}

describe("computeRecommendationTransition", () => {
  it("marks a previously-active dedupe_key as resolved when it does not recur this run", () => {
    const { resolvedDedupeKeys } = computeRecommendationTransition({
      previousRows: [prevRow({ dedupe_key: "increase_brand_visibility:p1" })],
      currentDedupeKeys: []
    });

    expect(resolvedDedupeKeys).toEqual(["increase_brand_visibility:p1"]);
  });

  it("does not mark a recurring dedupe_key as resolved", () => {
    const { resolvedDedupeKeys } = computeRecommendationTransition({
      previousRows: [prevRow({ dedupe_key: "increase_brand_visibility:p1" })],
      currentDedupeKeys: ["increase_brand_visibility:p1"]
    });

    expect(resolvedDedupeKeys).toEqual([]);
  });

  it("does not mark a dismissed dedupe_key as resolved (the user already acted, it is not a win)", () => {
    const { resolvedDedupeKeys } = computeRecommendationTransition({
      previousRows: [prevRow({ dedupe_key: "close_competitor_gap:ikea", status: "dismissed" })],
      currentDedupeKeys: []
    });

    expect(resolvedDedupeKeys).toEqual([]);
  });

  it("ignores previous rows with an empty dedupe_key (pre-migration/backfilled data) instead of flagging every current gap as resolved", () => {
    const { resolvedDedupeKeys } = computeRecommendationTransition({
      previousRows: [prevRow({ dedupe_key: "" }), prevRow({ dedupe_key: "" })],
      currentDedupeKeys: ["add_citation_block:p9"]
    });

    expect(resolvedDedupeKeys).toEqual([]);
  });

  it("carries forward and increments consecutive_runs_open for a recurring dedupe_key", () => {
    const { consecutiveRunsByDedupeKey } = computeRecommendationTransition({
      previousRows: [prevRow({ dedupe_key: "add_citation_block:p1", consecutive_runs_open: 3 })],
      currentDedupeKeys: ["add_citation_block:p1"]
    });

    expect(consecutiveRunsByDedupeKey.get("add_citation_block:p1")).toBe(4);
  });

  it("starts a brand-new dedupe_key at consecutive_runs_open = 1", () => {
    const { consecutiveRunsByDedupeKey } = computeRecommendationTransition({
      previousRows: [],
      currentDedupeKeys: ["update_stale_content"]
    });

    expect(consecutiveRunsByDedupeKey.get("update_stale_content")).toBe(1);
  });

  it("restarts the streak at 1 when a dedupe_key reappears after being dismissed", () => {
    const { consecutiveRunsByDedupeKey } = computeRecommendationTransition({
      previousRows: [prevRow({ dedupe_key: "create_faq_section", status: "dismissed", consecutive_runs_open: 5 })],
      currentDedupeKeys: ["create_faq_section"]
    });

    expect(consecutiveRunsByDedupeKey.get("create_faq_section")).toBe(1);
  });

  it("is deterministic across repeated calls with the same fixed previous-run snapshot (idempotency requirement)", () => {
    const previousRows = [prevRow({ dedupe_key: "pursue_citation_sources", consecutive_runs_open: 2 })];
    const currentDedupeKeys = ["pursue_citation_sources", "increase_brand_prominence:vueling"];

    const first = computeRecommendationTransition({ previousRows, currentDedupeKeys });
    const second = computeRecommendationTransition({ previousRows, currentDedupeKeys });

    expect(second.resolvedDedupeKeys).toEqual(first.resolvedDedupeKeys);
    expect(Array.from(second.consecutiveRunsByDedupeKey.entries())).toEqual(
      Array.from(first.consecutiveRunsByDedupeKey.entries())
    );
  });
});
