import { beforeEach, describe, expect, it, vi } from "vitest";

const scheduleScanContinuation = vi.fn(async () => undefined);
vi.mock("@/lib/scan/continuation", () => ({
  scheduleScanContinuation: (...args: unknown[]) => scheduleScanContinuation(...(args as []))
}));

import { SCAN_RESUME_CAP, SCAN_RESUME_LOG_MESSAGE } from "@/lib/scan/constants";
import { decideResume, tryResumeStalledRun } from "@/lib/scan/resume";

/**
 * SCAN-RELAY-1 (log §228). A run whose chain died used to be failed and
 * replaced from zero; it is now resumed where it stopped, a bounded number of
 * times. These pin when that happens and, as importantly, when it does not.
 */

const NOW = Date.parse("2026-09-28T06:10:00.000Z");
const created = "2026-09-28T06:00:31.000Z";

describe("decideResume", () => {
  it("resumes a run with finalize still pending — the 24/25/27/28 Sept shape", () => {
    expect(
      decideResume({
        runCreatedAt: created,
        now: NOW,
        priorResumes: 0,
        jobs: [
          { job_type: "scan_prompt", status: "completed" },
          { job_type: "scan_finalize", status: "pending" }
        ]
      })
    ).toBe("resume");
  });

  it("resumes a run with prompt jobs never started — the 22/26 Sept shape", () => {
    expect(
      decideResume({ runCreatedAt: created, now: NOW, priorResumes: 0, jobs: [{ job_type: "scan_prompt", status: "pending" }] })
    ).toBe("resume");
  });

  it("resumes a finalize left running by a killed invocation — the 23 Sept shape", () => {
    expect(
      decideResume({ runCreatedAt: created, now: NOW, priorResumes: 1, jobs: [{ job_type: "scan_finalize", status: "running" }] })
    ).toBe("resume");
  });

  it("stops after the cap, so a run that always dies is failed, not resumed forever", () => {
    expect(
      decideResume({
        runCreatedAt: created,
        now: NOW,
        priorResumes: SCAN_RESUME_CAP,
        jobs: [{ job_type: "scan_finalize", status: "pending" }]
      })
    ).toBe("cap_reached");
  });

  it("does not resume a run older than the age limit", () => {
    expect(
      decideResume({
        runCreatedAt: "2026-09-27T06:00:31.000Z",
        now: NOW,
        priorResumes: 0,
        jobs: [{ job_type: "scan_finalize", status: "pending" }]
      })
    ).toBe("too_old");
  });

  it("does not resume a run with nothing left to claim", () => {
    expect(
      decideResume({
        runCreatedAt: created,
        now: NOW,
        priorResumes: 0,
        jobs: [
          { job_type: "scan_prompt", status: "completed" },
          { job_type: "scan_finalize", status: "completed" }
        ]
      })
    ).toBe("nothing_left");
  });
});

type Filters = Record<string, unknown>;
function fakeService(opts: { jobs: unknown[]; priorResumes: number; lastResumeAgoMs?: number; insertError?: unknown }) {
  const inserts: unknown[] = [];
  const updates: unknown[] = [];
  const service = {
    from(table: string) {
      const filters: Filters = {};
      let op = "select";
      const builder: Record<string, unknown> = {};
      for (const name of ["eq", "in"]) {
        builder[name] = (column: string, value: unknown) => {
          filters[`${name}:${column}`] = value;
          return builder;
        };
      }
      builder.select = () => builder;
      builder.insert = (row: unknown) => {
        op = "insert";
        inserts.push(row);
        return builder;
      };
      builder.update = (patch: unknown) => {
        op = "update";
        updates.push({ table, patch });
        return builder;
      };
      builder.then = (resolve: (value: unknown) => unknown) => {
        if (op === "insert") return Promise.resolve({ error: opts.insertError ?? null }).then(resolve);
        if (op === "update") return Promise.resolve({ error: null }).then(resolve);
        if (table === "jobs") return Promise.resolve({ data: opts.jobs, error: null }).then(resolve);
        if (table === "job_logs") {
          const markers = Array.from({ length: opts.priorResumes }, () => ({
            created_at: new Date(Date.now() - (opts.lastResumeAgoMs ?? 60 * 60 * 1000)).toISOString()
          }));
          return Promise.resolve({ data: markers, error: null }).then(resolve);
        }
        return Promise.resolve({ data: null, error: null }).then(resolve);
      };
      return builder;
    }
  };
  return { service: service as never, inserts, updates };
}

describe("tryResumeStalledRun", () => {
  beforeEach(() => {
    scheduleScanContinuation.mockClear();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
  });

  const jobs = [
    { id: "job-prompt", job_type: "scan_prompt", status: "completed" },
    { id: "job-finalize", job_type: "scan_finalize", status: "pending" }
  ];

  it("records the resume, bumps the run and re-dispatches it", async () => {
    const { service, inserts, updates } = fakeService({ jobs, priorResumes: 0 });

    const resumed = await tryResumeStalledRun({ service, projectId: "proj-1", run: { id: "run-9", created_at: created } });

    expect(resumed).toBe(true);
    expect(inserts).toEqual([
      expect.objectContaining({ job_id: "job-finalize", run_id: "run-9", message: SCAN_RESUME_LOG_MESSAGE })
    ]);
    expect(updates).toEqual([expect.objectContaining({ table: "scan_runs" })]);
    expect(scheduleScanContinuation).toHaveBeenCalledWith({ projectId: "proj-1", runId: "run-9" });
    vi.useRealTimers();
  });

  // QA finding on #540: a `pending` run stays created_at-stale until the
  // dispatched continuation lands, so two quick page views could both resume.
  it("does not resume again while a resume from moments ago is still landing", async () => {
    const { service, inserts } = fakeService({ jobs, priorResumes: 1, lastResumeAgoMs: 20_000 });

    expect(await tryResumeStalledRun({ service, projectId: "proj-1", run: { id: "run-9", created_at: created } })).toBe(true);
    expect(inserts).toEqual([]);
    expect(scheduleScanContinuation).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("falls back (returns false) without dispatching once the cap is reached", async () => {
    const { service, inserts } = fakeService({ jobs, priorResumes: SCAN_RESUME_CAP });

    expect(await tryResumeStalledRun({ service, projectId: "proj-1", run: { id: "run-9", created_at: created } })).toBe(false);
    expect(inserts).toEqual([]);
    expect(scheduleScanContinuation).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("falls back when the counter cannot be written, so the cap can never be bypassed", async () => {
    const { service } = fakeService({ jobs, priorResumes: 0, insertError: { message: "boom" } });

    expect(await tryResumeStalledRun({ service, projectId: "proj-1", run: { id: "run-9", created_at: created } })).toBe(false);
    expect(scheduleScanContinuation).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});
