import { describe, expect, it } from "vitest";
import { deriveRunAuditStatus, type RunAuditStatus } from "./run-audit-status";

function derive(input: {
  coverage?: string[];
  readiness?: Array<[string, number | null]>;
  jobs?: Array<[string, string]>;
  runId?: string;
}): RunAuditStatus {
  return deriveRunAuditStatus({
    runId: input.runId ?? "run-1",
    coverageScanIds: new Set(input.coverage ?? []),
    readinessByScanId: new Map(input.readiness ?? []),
    jobStatusByRunId: new Map(input.jobs ?? [])
  });
}

describe("deriveRunAuditStatus", () => {
  it("reports audited only when BOTH halves landed", () => {
    expect(derive({ coverage: ["run-1"], readiness: [["run-1", 40]] })).toEqual({
      kind: "audited",
      readinessScore: 40
    });
  });

  it("never calls one half a finished audit", () => {
    // Showing "Auditada" off the coverage half alone would claim technical
    // health was checked when it was not — the kind of false completeness
    // CLAUDE.md rules out.
    expect(derive({ coverage: ["run-1"] }).kind).toBe("partial");
    expect(derive({ readiness: [["run-1", 40]] }).kind).toBe("partial");
  });

  it("shows nothing for a run that was never audited and has no work queued", () => {
    // Runs from before the automatic audit, and projects below the Pro gate.
    expect(derive({})).toEqual({ kind: "none" });
  });

  it("treats an active job as in-progress even when one half already landed", () => {
    // Coverage lands first and the technical half is often parked to the next
    // invocation by design. That run is working, not stalled.
    expect(derive({ coverage: ["run-1"], jobs: [["run-1", "pending"]] })).toEqual({ kind: "in_progress" });
    expect(derive({ jobs: [["run-1", "running"]] })).toEqual({ kind: "in_progress" });
  });

  it("separates a job waiting out its backoff from one actually working", async () => {
    // The backoff is [1, 5, 25, 120, 600] minutes: a job on its fifth attempt
    // sits untouched for ten hours. Calling that "En curso" promises motion
    // that will not come for most of a day, and reads as a frozen table
    // rather than as an audit in trouble — observed exactly that way on
    // 2026-08-05, rows unchanged across four and a half hours.
    expect(derive({ jobs: [["run-1", "retrying"]] })).toEqual({ kind: "retrying" });
    // Half-landed data does not soften it into "Parcial and fine".
    expect(derive({ coverage: ["run-1"], jobs: [["run-1", "retrying"]] })).toEqual({ kind: "retrying" });
  });

  it("stops calling it in-progress once the job reaches a terminal state", () => {
    // The promise of "En curso" is that it will resolve on its own. A
    // cancelled or failed job never will, so it must not keep saying so.
    expect(derive({ jobs: [["run-1", "cancelled"]] })).toEqual({ kind: "none" });
    expect(derive({ jobs: [["run-1", "failed"]] })).toEqual({ kind: "none" });
    expect(derive({ coverage: ["run-1"], jobs: [["run-1", "failed"]] }).kind).toBe("partial");
  });

  it("keeps a null readiness score as audited rather than missing", () => {
    // readiness_score is nullable on a real snapshot (no page could be
    // scored). The audit still happened; only the number is absent.
    expect(derive({ coverage: ["run-1"], readiness: [["run-1", null]] })).toEqual({
      kind: "audited",
      readinessScore: null
    });
  });

  it("does not leak another run's audit into this row", () => {
    expect(derive({ runId: "run-1", coverage: ["run-2"], readiness: [["run-2", 90]] })).toEqual({
      kind: "none"
    });
  });
});

describe("deriveRunAuditStatus — planes sin cobertura (WEB-AUDIT-TECH-ALL-PLANS-1)", () => {
  const base = {
    runId: "run-1",
    coverageScanIds: new Set<string>(),
    readinessByScanId: new Map<string, number | null>([["run-1", 62]]),
    jobStatusByRunId: new Map<string, string>()
  };

  it("calls a technical-only run AUDITED when the plan has no coverage half", () => {
    // "Parcial" means work stopped halfway and something is still missing. On
    // a plan without coverage nothing is missing, and the label would invite
    // the user to wait for something that is never coming.
    const status = deriveRunAuditStatus({ ...base, coverageIncludedInPlan: false });

    expect(status.kind).toBe("audited");
    expect(status.kind === "audited" && status.readinessScore).toBe(62);
  });

  it("still calls it PARTIAL when the plan does include coverage", () => {
    // Same data, different plan: here the coverage half really is missing.
    const status = deriveRunAuditStatus({ ...base, coverageIncludedInPlan: true });

    expect(status.kind).toBe("partial");
  });

  it("defaults to the pre-existing meaning when the flag is omitted", () => {
    expect(deriveRunAuditStatus(base).kind).toBe("partial");
  });

  it("does not invent an audit for a run that has neither half", () => {
    const status = deriveRunAuditStatus({
      ...base,
      readinessByScanId: new Map(),
      coverageIncludedInPlan: false
    });

    expect(status.kind).toBe("none");
  });

  it("lets an active job win over the plan shortcut", () => {
    const status = deriveRunAuditStatus({
      ...base,
      jobStatusByRunId: new Map([["run-1", "running"]]),
      coverageIncludedInPlan: false
    });

    expect(status.kind).toBe("in_progress");
  });
});
