import { describe, expect, it } from "vitest";
import { LANE_MAX_AGE_MS, LANE_NOTIFICATION_TYPES, laneForType, selectLaneNotifications } from "./lanes";

const NOW = Date.parse("2026-10-11T12:00:00Z");
const ago = (hours: number) => new Date(NOW - hours * 3600_000).toISOString();

describe("laneForType", () => {
  it("drops the recurring and minor types from every lane", () => {
    for (const type of ["scan_completed", "scan_failed", "gap_resolved", "coverage_dropped", "llms_txt_lost", "sitemap_lost", "audit_completed", "trial_ending"]) {
      expect(laneForType(type)).toBeNull();
    }
  });

  it("maps the kept types to their lane", () => {
    expect(laneForType("gap_pending")).toBe("next_step");
    expect(laneForType("ai_bot_blocked")).toBe("alert");
    expect(laneForType("surfacing_dropped")).toBe("alert");
    expect(LANE_NOTIFICATION_TYPES.every((t) => laneForType(t) !== null)).toBe(true);
  });
});

describe("selectLaneNotifications", () => {
  it("never returns more than one per lane", () => {
    const rows = [
      { id: "a", type: "gap_pending", createdAt: ago(1) },
      { id: "b", type: "gap_pending", createdAt: ago(5) },
      { id: "c", type: "surfacing_dropped", createdAt: ago(2) },
      { id: "d", type: "page_unreachable", createdAt: ago(3) },
      { id: "e", type: "scan_completed", createdAt: ago(0) }
    ];
    expect(selectLaneNotifications(rows, NOW).map((r) => r.id)).toEqual(["a", "d"]);
  });

  it("picks the most serious alert, not the newest", () => {
    const rows = [
      { id: "new", type: "surfacing_dropped", createdAt: ago(1) },
      { id: "bot", type: "ai_bot_blocked", createdAt: ago(48) }
    ];
    expect(selectLaneNotifications(rows, NOW).map((r) => r.id)).toEqual(["bot"]);
  });

  it("ignores anything older than the lane window", () => {
    const rows = [{ id: "old", type: "ai_bot_blocked", createdAt: new Date(NOW - LANE_MAX_AGE_MS - 1).toISOString() }];
    expect(selectLaneNotifications(rows, NOW)).toEqual([]);
  });
});
