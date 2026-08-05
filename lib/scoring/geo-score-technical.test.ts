import { describe, expect, it } from "vitest";

import {
  resolveTechnicalComponent,
  TECHNICAL_SNAPSHOT_MAX_AGE_DAYS,
  type TechnicalSnapshotCandidate
} from "@/lib/scoring/geo-score-technical";

const RUN_ID = "run-under-test";
const RUN_FINISHED_AT = "2026-08-05T12:00:00.000Z";

function daysBefore(days: number): string {
  return new Date(Date.parse(RUN_FINISHED_AT) - days * 24 * 60 * 60 * 1000).toISOString();
}

function snapshot(overrides: Partial<TechnicalSnapshotCandidate> = {}): TechnicalSnapshotCandidate {
  return {
    id: "snapshot-1",
    scan_id: null,
    readiness_score: 70,
    created_at: daysBefore(1),
    ...overrides
  };
}

describe("resolveTechnicalComponent (GEO-SCORE-V4, docs/adr/0033)", () => {
  it("prefers the audit triggered by this very run, regardless of dates", () => {
    const resolution = resolveTechnicalComponent({
      runId: RUN_ID,
      runFinishedAt: RUN_FINISHED_AT,
      snapshots: [
        snapshot({ id: "newer-other-run", readiness_score: 20, created_at: daysBefore(0) }),
        snapshot({ id: "own", scan_id: RUN_ID, readiness_score: 88, created_at: daysBefore(5) })
      ]
    });

    expect(resolution.component).toMatchObject({ value: 88, snapshot_id: "own", source: "this_run", age_days: 0 });
    expect(resolution.reason).toBeNull();
  });

  it("falls back to the project's most recent earlier snapshot while this run's audit is still pending", () => {
    // The normal case at first scoring: docs/adr/0027 enqueues the audit only
    // after the run completes, so the run's own snapshot does not exist yet.
    const resolution = resolveTechnicalComponent({
      runId: RUN_ID,
      runFinishedAt: RUN_FINISHED_AT,
      snapshots: [snapshot({ id: "older", readiness_score: 55, created_at: daysBefore(9) }), snapshot({ id: "recent", readiness_score: 61, created_at: daysBefore(2) })]
    });

    expect(resolution.component).toMatchObject({
      value: 61,
      snapshot_id: "recent",
      source: "recent_project_snapshot",
      age_days: 2
    });
  });

  it("never scores a run against a LATER run's audit", () => {
    // Accepting these would rewrite a historical run's score every time a new
    // scan audits the site — the objection docs/adr/0026 records against
    // backfilling position data, and something no version bump can express.
    const resolution = resolveTechnicalComponent({
      runId: RUN_ID,
      runFinishedAt: RUN_FINISHED_AT,
      snapshots: [snapshot({ id: "future", scan_id: "some-other-run", created_at: new Date(Date.parse(RUN_FINISHED_AT) + 60_000).toISOString() })]
    });

    expect(resolution.component).toBeNull();
    expect(resolution.reason).toContain("no technical audit within");
  });

  it("refuses a snapshot older than the freshness window", () => {
    const resolution = resolveTechnicalComponent({
      runId: RUN_ID,
      runFinishedAt: RUN_FINISHED_AT,
      snapshots: [snapshot({ created_at: daysBefore(TECHNICAL_SNAPSHOT_MAX_AGE_DAYS + 1) })]
    });

    expect(resolution.component).toBeNull();
  });

  it("accepts a snapshot at the edge of the window", () => {
    const resolution = resolveTechnicalComponent({
      runId: RUN_ID,
      runFinishedAt: RUN_FINISHED_AT,
      snapshots: [snapshot({ created_at: daysBefore(TECHNICAL_SNAPSHOT_MAX_AGE_DAYS) })]
    });

    expect(resolution.component?.value).toBe(70);
  });

  it("drops the component, with a distinguishable reason, when the project has never been audited", () => {
    const resolution = resolveTechnicalComponent({ runId: RUN_ID, runFinishedAt: RUN_FINISHED_AT, snapshots: [] });

    expect(resolution.component).toBeNull();
    expect(resolution.reason).toContain("no technical audit has been recorded");
  });

  it("drops the component when audits exist but none produced a readiness score", () => {
    // A real state: every candidate page was skipped by the fetch budget, so
    // the snapshot persists with readiness_score null (docs/adr/0027).
    const resolution = resolveTechnicalComponent({
      runId: RUN_ID,
      runFinishedAt: RUN_FINISHED_AT,
      snapshots: [snapshot({ readiness_score: null })]
    });

    expect(resolution.component).toBeNull();
    expect(resolution.reason).toContain("no page could be analysed");
  });

  it("rejects out-of-range readiness scores rather than feeding them to the composite", () => {
    const resolution = resolveTechnicalComponent({
      runId: RUN_ID,
      runFinishedAt: RUN_FINISHED_AT,
      snapshots: [snapshot({ readiness_score: 140 }), snapshot({ id: "valid", readiness_score: 0, created_at: daysBefore(3) })]
    });

    expect(resolution.component).toMatchObject({ value: 0, snapshot_id: "valid" });
  });

  it("accepts a readiness score of 0 as a real measurement, not as missing", () => {
    const resolution = resolveTechnicalComponent({
      runId: RUN_ID,
      runFinishedAt: RUN_FINISHED_AT,
      snapshots: [snapshot({ scan_id: RUN_ID, readiness_score: 0 })]
    });

    expect(resolution.component?.value).toBe(0);
  });
});
