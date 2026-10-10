import { describe, expect, it } from "vitest";

import {
  COULD_NOT_VERIFY_NOTE,
  COVERAGE_REFRESH_INTERVAL_MS,
  carryForwardCoverage,
  parseCoverageMap,
  type DomainCoverageMap
} from "./coverage-map";

const DAY = 24 * 60 * 60_000;
const NOW = Date.parse("2026-10-10T08:00:00.000Z");

function map(overrides: Partial<DomainCoverageMap> = {}): DomainCoverageMap {
  return {
    scanId: "scan-old",
    generatedAt: new Date(NOW - 2 * DAY).toISOString(),
    topics: [
      { promptId: "p1", topic: "t1", found: true, pages: [{ url: "https://acme.com/a", title: "A" }], note: "n" },
      { promptId: "p2", topic: "t2", found: false, pages: [], note: "no" }
    ],
    ...overrides
  };
}

describe("carryForwardCoverage (COVERAGE-WEEKLY-1)", () => {
  it("re-attaches a recent map to the new scan, stamped now, keeping when it was verified", () => {
    const original = map();
    const carried = carryForwardCoverage({ map: original, activePromptIds: ["p1", "p2"], scanId: "scan-new", now: NOW });
    expect(carried).not.toBeNull();
    expect(carried!.scanId).toBe("scan-new");
    expect(carried!.generatedAt).toBe(new Date(NOW).toISOString());
    expect(carried!.verifiedAt).toBe(original.generatedAt);
    expect(carried!.topics.map((t) => t.promptId)).toEqual(["p1", "p2"]);
  });

  it("keeps the ORIGINAL verification date across several carries, so the weekly refresh still comes", () => {
    const verifiedAt = new Date(NOW - 6 * DAY).toISOString();
    const alreadyCarried = map({ generatedAt: new Date(NOW - DAY).toISOString(), verifiedAt });
    const carried = carryForwardCoverage({ map: alreadyCarried, activePromptIds: ["p1", "p2"], scanId: "s", now: NOW });
    expect(carried!.verifiedAt).toBe(verifiedAt);

    const weekOld = map({ generatedAt: new Date(NOW - DAY).toISOString(), verifiedAt: new Date(NOW - 7 * DAY).toISOString() });
    expect(carryForwardCoverage({ map: weekOld, activePromptIds: ["p1", "p2"], scanId: "s", now: NOW })).toBeNull();
  });

  it("refreshes on day 7 of the daily cron even when it fires a few hours early", () => {
    const sevenCronDaysAgo = map({ generatedAt: new Date(NOW - 7 * DAY + 3 * 60 * 60_000).toISOString() });
    expect(carryForwardCoverage({ map: sevenCronDaysAgo, activePromptIds: ["p1", "p2"], scanId: "s", now: NOW })).toBeNull();
    expect(COVERAGE_REFRESH_INTERVAL_MS).toBeLessThan(7 * DAY);
    expect(COVERAGE_REFRESH_INTERVAL_MS).toBeGreaterThan(6 * DAY);
  });

  it("refuses when an active prompt has no topic (a prompt added since)", () => {
    expect(carryForwardCoverage({ map: map(), activePromptIds: ["p1", "p2", "p3"], scanId: "s", now: NOW })).toBeNull();
  });

  it("refuses when a topic is inconclusive, so a failed check is retried instead of hidden for a week", () => {
    const withFailure = map({
      topics: [{ promptId: "p1", topic: "t1", found: false, pages: [], note: COULD_NOT_VERIFY_NOTE }]
    });
    expect(carryForwardCoverage({ map: withFailure, activePromptIds: ["p1"], scanId: "s", now: NOW })).toBeNull();
  });

  it("drops topics of prompts that are no longer active", () => {
    const carried = carryForwardCoverage({ map: map(), activePromptIds: ["p2"], scanId: "s", now: NOW });
    expect(carried!.topics.map((t) => t.promptId)).toEqual(["p2"]);
  });

  it("refuses an unparseable date or an empty prompt set", () => {
    expect(carryForwardCoverage({ map: map({ generatedAt: "nope" }), activePromptIds: ["p1"], scanId: "s", now: NOW })).toBeNull();
    expect(carryForwardCoverage({ map: map(), activePromptIds: [], scanId: "s", now: NOW })).toBeNull();
  });
});

describe("parseCoverageMap", () => {
  it("round-trips verifiedAt and leaves it absent on maps that never had it", () => {
    const carried = carryForwardCoverage({ map: map(), activePromptIds: ["p1", "p2"], scanId: "s", now: NOW })!;
    expect(parseCoverageMap(JSON.stringify(carried))?.verifiedAt).toBe(carried.verifiedAt);
    expect("verifiedAt" in (parseCoverageMap(JSON.stringify(map())) ?? {})).toBe(false);
  });
});
