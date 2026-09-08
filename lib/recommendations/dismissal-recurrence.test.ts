import { describe, expect, it } from "vitest";
import { computeDismissalRecurrence, type CandidateRun, type DismissedRow } from "./dismissal-recurrence";

function dismissed(overrides: Partial<DismissedRow> = {}): DismissedRow {
  return {
    id: "rec-1",
    dedupeKey: "add_citation_block:p1",
    dismissedAt: "2026-08-10T10:00:00.000Z",
    ...overrides
  };
}

function run(id: string, createdAt: string): CandidateRun {
  return { id, createdAt };
}

describe("computeDismissalRecurrence", () => {
  it("did_not_recur: the anchor run's rows exist but omit this dedupe_key", () => {
    const out = computeDismissalRecurrence({
      dismissedRows: [dismissed()],
      candidateRuns: [run("run-a", "2026-08-15T00:00:00.000Z")],
      dedupeKeysByRunId: new Map([["run-a", new Set(["increase_brand_visibility:p2"])]])
    });

    expect(out.get("rec-1")).toEqual({
      status: "did_not_recur",
      anchorRunId: "run-a",
      anchorRunCreatedAt: "2026-08-15T00:00:00.000Z"
    });
  });

  it("recurred: the anchor run's rows include this dedupe_key", () => {
    const out = computeDismissalRecurrence({
      dismissedRows: [dismissed()],
      candidateRuns: [run("run-a", "2026-08-15T00:00:00.000Z")],
      dedupeKeysByRunId: new Map([["run-a", new Set(["add_citation_block:p1"])]])
    });

    expect(out.get("rec-1")).toEqual({
      status: "recurred",
      anchorRunId: "run-a",
      anchorRunCreatedAt: "2026-08-15T00:00:00.000Z"
    });
  });

  it("no_verdict: no completed run at all yet", () => {
    const out = computeDismissalRecurrence({
      dismissedRows: [dismissed()],
      candidateRuns: [],
      dedupeKeysByRunId: new Map()
    });

    expect(out.get("rec-1")).toEqual({ status: "no_verdict" });
  });

  it("no_verdict: every completed run is BEFORE the dismissal, not after", () => {
    const out = computeDismissalRecurrence({
      dismissedRows: [dismissed({ dismissedAt: "2026-08-10T10:00:00.000Z" })],
      // Only earlier runs exist — the caller is expected to have already
      // filtered to created_at > dismissedAt, but the pure function must not
      // trust that blindly either.
      candidateRuns: [run("run-old", "2026-08-09T00:00:00.000Z")],
      dedupeKeysByRunId: new Map([["run-old", new Set(["add_citation_block:p1"])]])
    });

    expect(out.get("rec-1")).toEqual({ status: "no_verdict" });
  });

  it("no_verdict: dedupe_key is empty (pre-RECS-3 row) regardless of everything else", () => {
    const out = computeDismissalRecurrence({
      dismissedRows: [dismissed({ dedupeKey: "" })],
      candidateRuns: [run("run-a", "2026-08-15T00:00:00.000Z")],
      dedupeKeysByRunId: new Map([["run-a", new Set(["add_citation_block:p1"])]])
    });

    expect(out.get("rec-1")).toEqual({ status: "no_verdict" });
  });

  it("no_verdict: the anchor run has no recommendation rows at all — fails closed rather than reading an empty run as the gap being gone", () => {
    const out = computeDismissalRecurrence({
      dismissedRows: [dismissed()],
      candidateRuns: [run("run-a", "2026-08-15T00:00:00.000Z")],
      // No entry for run-a at all — indistinguishable from an insert failure
      // (RECS-FINALIZE-DURABILITY-1) from this function's point of view.
      dedupeKeysByRunId: new Map()
    });

    expect(out.get("rec-1")).toEqual({ status: "no_verdict" });
  });

  it("no_verdict: the anchor run has an entry but it is an empty set", () => {
    const out = computeDismissalRecurrence({
      dismissedRows: [dismissed()],
      candidateRuns: [run("run-a", "2026-08-15T00:00:00.000Z")],
      dedupeKeysByRunId: new Map([["run-a", new Set()]])
    });

    expect(out.get("rec-1")).toEqual({ status: "no_verdict" });
  });

  it("picks the FIRST completed run after the dismissal, not any later one", () => {
    const out = computeDismissalRecurrence({
      dismissedRows: [dismissed({ dismissedAt: "2026-08-10T00:00:00.000Z" })],
      candidateRuns: [
        // Out of order on purpose — the function must sort, not trust input order.
        run("run-later", "2026-08-20T00:00:00.000Z"),
        run("run-earliest", "2026-08-12T00:00:00.000Z")
      ],
      dedupeKeysByRunId: new Map([
        // The gap is present in the LATER run only — if the function picked
        // run-later as the anchor it would wrongly report "recurred".
        ["run-earliest", new Set(["something-else"])],
        ["run-later", new Set(["add_citation_block:p1"])]
      ])
    });

    expect(out.get("rec-1")).toEqual({
      status: "did_not_recur",
      anchorRunId: "run-earliest",
      anchorRunCreatedAt: "2026-08-12T00:00:00.000Z"
    });
  });

  it("handles multiple dismissed rows independently in one call", () => {
    const out = computeDismissalRecurrence({
      dismissedRows: [
        dismissed({ id: "rec-1", dedupeKey: "gap-a", dismissedAt: "2026-08-01T00:00:00.000Z" }),
        dismissed({ id: "rec-2", dedupeKey: "gap-b", dismissedAt: "2026-08-05T00:00:00.000Z" })
      ],
      candidateRuns: [run("run-a", "2026-08-10T00:00:00.000Z")],
      dedupeKeysByRunId: new Map([["run-a", new Set(["gap-a"])]])
    });

    expect(out.get("rec-1")?.status).toBe("recurred");
    expect(out.get("rec-2")?.status).toBe("did_not_recur");
  });
});
