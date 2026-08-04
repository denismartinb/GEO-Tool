import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { createServiceClient } from "@/lib/supabase/service";
import * as coverageModule from "@/lib/recommendations/domain-coverage";
import type { DomainCoverageResult } from "@/lib/recommendations/domain-coverage";
import * as technicalModule from "@/lib/web-audit/technical-audit";
import * as emailModule from "@/lib/email/transactional";
import {
  claimDueWebAuditJobs,
  enqueueWebAuditJob,
  MAX_AUDIT_CONTINUATIONS,
  processDueWebAuditJobs,
  runWebAuditJob,
  type WebAuditJobRow
} from "./audit-job-runner";

vi.mock("@/lib/recommendations/domain-coverage", () => ({ auditDomainCoverageCore: vi.fn() }));
vi.mock("@/lib/web-audit/technical-audit", () => ({ runTechnicalAuditCore: vi.fn() }));
vi.mock("@/lib/email/transactional", () => ({ sendWebAuditFailedAlertEmail: vi.fn(async () => undefined) }));

const mockedCoverage = vi.mocked(coverageModule.auditDomainCoverageCore);
const mockedTechnical = vi.mocked(technicalModule.runTechnicalAuditCore);
const mockedAlert = vi.mocked(emailModule.sendWebAuditFailedAlertEmail);

const NOW = new Date("2026-08-04T10:00:00.000Z");

type ServiceClient = ReturnType<typeof createServiceClient>;

type Recorded = { table: string; op: "update" | "insert"; payload: Record<string, unknown> };

/**
 * Minimal fake service client. Every builder method returns `this` so the
 * runner's chained `.eq().in().select().maybeSingle()` calls work, and the
 * writes are recorded so assertions are about what actually landed in the
 * `jobs` row — not about which internal helper was called.
 */
function makeService(options: {
  project?: { owner_user_id: string; domain: string } | null;
  existingJob?: { id: string } | null;
  dueJobs?: WebAuditJobRow[];
  claimWins?: boolean;
}) {
  const recorded: Recorded[] = [];
  const { project = { owner_user_id: "user-1", domain: "acme.com" }, existingJob = null, dueJobs = [], claimWins = true } = options;

  function builder(table: string, op: "select" | "update" | "insert", payload?: Record<string, unknown>) {
    if (op !== "select" && payload) recorded.push({ table, op, payload });

    const result =
      table === "projects"
        ? { data: project, error: null }
        : op === "update"
          ? { data: claimWins ? { id: "job-1" } : null, error: null }
          : { data: existingJob ?? (dueJobs.length ? dueJobs : null), error: null };

    const self: Record<string, unknown> = {
      eq: () => self,
      in: () => self,
      lte: () => self,
      order: () => self,
      limit: () => self,
      select: () => self,
      maybeSingle: () => Promise.resolve(table === "jobs" && op === "select" ? { data: existingJob, error: null } : result),
      then: (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve)
    };
    return self;
  }

  const client = {
    from(table: string) {
      return {
        select: () => builder(table, "select"),
        update: (payload: Record<string, unknown>) => builder(table, "update", payload),
        insert: (payload: Record<string, unknown>) => {
          recorded.push({ table, op: "insert", payload });
          return Promise.resolve({ error: null });
        }
      };
    }
  };

  return { service: client as unknown as ServiceClient, recorded };
}

function jobUpdates(recorded: Recorded[]) {
  return recorded.filter((r) => r.table === "jobs" && r.op === "update").map((r) => r.payload);
}

function job(overrides: Partial<WebAuditJobRow> = {}): WebAuditJobRow {
  return {
    id: "job-1",
    project_id: "project-1",
    run_id: "run-1",
    attempt_count: 0,
    max_attempts: 6,
    payload_json: { continuations: 0 },
    ...overrides
  };
}

/**
 * A successful coverage batch. `topicCount` matters: the runner uses a rising
 * topic count as its "this batch made progress" signal, so a test that wants
 * a second batch in the same invocation has to grow it.
 */
function coverageResult(status: "running" | "completed", topicCount = 0): DomainCoverageResult {
  return {
    success: true,
    cached: false,
    status,
    totalPrompts: 4,
    coverage: {
      scanId: "run-1",
      generatedAt: NOW.toISOString(),
      topics: Array.from({ length: topicCount }, (_, i) => ({
        promptId: `prompt-${i}`,
        topic: `topic ${i}`,
        found: false,
        pages: [],
        note: ""
      }))
    }
  };
}

beforeEach(() => {
  mockedTechnical.mockResolvedValue({
    success: true,
    cached: false,
    snapshot: { scanId: "run-1", generatedAt: NOW.toISOString(), readinessScore: 70, pages: [], bots: {} as never }
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("runWebAuditJob", () => {
  it("completes the job when coverage finishes and the technical audit succeeds", async () => {
    mockedCoverage.mockResolvedValue(coverageResult("completed"));
    const { service, recorded } = makeService({});

    const outcome = await runWebAuditJob({ service, job: job(), now: NOW });

    expect(outcome).toEqual({ result: "completed" });
    expect(jobUpdates(recorded).at(-1)).toMatchObject({ status: "completed", locked_by: null });
    expect(mockedAlert).not.toHaveBeenCalled();
  });

  it("runs the technical audit only AFTER coverage completes", async () => {
    // The technical audit's candidate selection reads the coverage map, so
    // running it against a half-finished campaign would audit the previous
    // run's pages.
    mockedCoverage.mockResolvedValue(coverageResult("running"));
    const { service } = makeService({});

    await runWebAuditJob({ service, job: job(), now: NOW });

    expect(mockedCoverage).toHaveBeenCalled();
    expect(mockedTechnical).not.toHaveBeenCalled();
  });

  it("bypasses the manual 5/day rate limits on both cores", async () => {
    mockedCoverage.mockResolvedValue(coverageResult("completed"));
    const { service } = makeService({});

    await runWebAuditJob({ service, job: job(), now: NOW });

    expect(mockedCoverage.mock.calls[0][0]).toMatchObject({ trigger: "automatic" });
    expect(mockedTechnical.mock.calls[0][0]).toMatchObject({ trigger: "automatic" });
  });

  it("proves ownership with the project's real owner, never a caller-supplied id", async () => {
    mockedCoverage.mockResolvedValue(coverageResult("completed"));
    const { service } = makeService({ project: { owner_user_id: "owner-42", domain: "acme.com" } });

    await runWebAuditJob({ service, job: job(), now: NOW });

    expect(mockedCoverage.mock.calls[0][0].user.id).toBe("owner-42");
  });

  it("parks an unfinished campaign as a continuation — pending, due now, NO attempt consumed", async () => {
    // The critical distinction in this phase: a multi-batch campaign making
    // normal progress must not eat the retry budget meant for real errors.
    mockedCoverage.mockResolvedValue(coverageResult("running"));
    const { service, recorded } = makeService({});

    const outcome = await runWebAuditJob({ service, job: job({ payload_json: { continuations: 3 } }), now: NOW });

    expect(outcome).toEqual({ result: "continue", continuations: 4 });
    const update = jobUpdates(recorded).at(-1)!;
    expect(update).toMatchObject({ status: "pending", next_attempt_at: NOW.toISOString() });
    expect(update.payload_json).toEqual({ continuations: 4 });
    expect(update).not.toHaveProperty("attempt_count");
  });

  it("runs several coverage batches in one invocation while each makes progress", async () => {
    // The campaign is inherently multi-batch; an invocation that only ever
    // ran one would need ~75 dispatches for a 300-prompt project.
    mockedCoverage
      .mockResolvedValueOnce(coverageResult("running", 4))
      .mockResolvedValueOnce(coverageResult("running", 8))
      .mockResolvedValueOnce(coverageResult("completed", 12));
    const { service } = makeService({});

    const outcome = await runWebAuditJob({ service, job: job(), now: NOW });

    expect(mockedCoverage).toHaveBeenCalledTimes(3);
    expect(outcome).toEqual({ result: "completed" });
  });

  it("stops looping when a batch covers no new topic instead of spinning", async () => {
    // A batch that returns "running" instantly having achieved nothing would
    // otherwise be retried as fast as the event loop allows until the time
    // cutoff, hammering Supabase for no gain.
    mockedCoverage
      .mockResolvedValueOnce(coverageResult("running", 4))
      .mockResolvedValue(coverageResult("running", 4));
    const { service } = makeService({});

    const outcome = await runWebAuditJob({ service, job: job(), now: NOW });

    expect(mockedCoverage).toHaveBeenCalledTimes(2);
    expect(outcome).toMatchObject({ result: "continue" });
  });

  it("fails and alerts when the continuation cap is hit, rather than chaining forever", async () => {
    mockedCoverage.mockResolvedValue(coverageResult("running"));
    const { service, recorded } = makeService({});

    const outcome = await runWebAuditJob({
      service,
      job: job({ payload_json: { continuations: MAX_AUDIT_CONTINUATIONS } }),
      now: NOW
    });

    expect(outcome.result).toBe("failed");
    expect(jobUpdates(recorded).at(-1)).toMatchObject({ status: "failed" });
    expect(mockedAlert).toHaveBeenCalledOnce();
    // Never even attempted the audit — the cap is checked first.
    expect(mockedCoverage).not.toHaveBeenCalled();
  });

  it("cancels without alerting on a terminal failure — nothing is broken", async () => {
    mockedCoverage.mockResolvedValue({ success: false, error: "plan", reason: "plan_required" });
    const { service, recorded } = makeService({});

    const outcome = await runWebAuditJob({ service, job: job(), now: NOW });

    expect(outcome).toEqual({ result: "cancelled", reason: "plan_required" });
    expect(jobUpdates(recorded).at(-1)).toMatchObject({ status: "cancelled", last_error: "plan_required" });
    expect(mockedAlert).not.toHaveBeenCalled();
  });

  it("retries a transient failure with the documented backoff", async () => {
    mockedCoverage.mockResolvedValue({ success: false, error: "boom", reason: "generic" });
    const { service, recorded } = makeService({});

    const outcome = await runWebAuditJob({ service, job: job({ attempt_count: 1 }), now: NOW });

    expect(outcome.result).toBe("retrying");
    const update = jobUpdates(recorded).at(-1)!;
    expect(update).toMatchObject({ status: "retrying", attempt_count: 2 });
    // Second failure → 5 minutes (audit-job.ts BACKOFF_MINUTES).
    expect(update.next_attempt_at).toBe(new Date(NOW.getTime() + 5 * 60_000).toISOString());
    expect(mockedAlert).not.toHaveBeenCalled();
  });

  it("alerts the operator with the real error once the retry budget is spent", async () => {
    mockedCoverage.mockResolvedValue({ success: false, error: "user copy", reason: "generic" });
    const { service, recorded } = makeService({ project: { owner_user_id: "user-1", domain: "acme.com" } });

    const outcome = await runWebAuditJob({ service, job: job({ attempt_count: 5, max_attempts: 6 }), now: NOW });

    expect(outcome).toMatchObject({ result: "failed", attemptCount: 6 });
    expect(jobUpdates(recorded).at(-1)).toMatchObject({ status: "failed", attempt_count: 6 });
    expect(mockedAlert).toHaveBeenCalledOnce();
    expect(mockedAlert.mock.calls[0][0]).toMatchObject({
      domain: "acme.com",
      projectId: "project-1",
      runId: "run-1",
      attempts: 6,
      lastError: "coverage: generic"
    });
  });

  it("treats a thrown error as a retryable attempt, not a crash", async () => {
    mockedCoverage.mockRejectedValue(new Error("supabase exploded"));
    const { service, recorded } = makeService({});

    const outcome = await runWebAuditJob({ service, job: job(), now: NOW });

    expect(outcome.result).toBe("retrying");
    expect(jobUpdates(recorded).at(-1)).toMatchObject({ last_error: "supabase exploded" });
  });

  it("cancels when the project no longer exists", async () => {
    const { service } = makeService({ project: null });

    const outcome = await runWebAuditJob({ service, job: job(), now: NOW });

    expect(outcome).toEqual({ result: "cancelled", reason: "project_not_found" });
    expect(mockedCoverage).not.toHaveBeenCalled();
  });
});

describe("enqueueWebAuditJob", () => {
  it("inserts one pending job carrying the retry budget", async () => {
    const { service, recorded } = makeService({ existingJob: null });

    const result = await enqueueWebAuditJob({ service, projectId: "project-1", runId: "run-1" });

    expect(result).toBe("enqueued");
    expect(recorded.find((r) => r.op === "insert")?.payload).toMatchObject({
      project_id: "project-1",
      run_id: "run-1",
      job_type: "web_audit",
      status: "pending",
      max_attempts: 6
    });
  });

  it("is idempotent per run — a re-finalized scan must not double-spend Gemini calls", async () => {
    const { service, recorded } = makeService({ existingJob: { id: "job-existing" } });

    const result = await enqueueWebAuditJob({ service, projectId: "project-1", runId: "run-1" });

    expect(result).toBe("already_queued");
    expect(recorded.some((r) => r.op === "insert")).toBe(false);
  });
});

describe("claimDueWebAuditJobs", () => {
  it("returns only the jobs whose claim UPDATE actually matched", async () => {
    // Losing the race must yield nothing, so two concurrent sweeps can never
    // both run the same audit.
    const { service } = makeService({ dueJobs: [job()], claimWins: false });

    expect(await claimDueWebAuditJobs({ service, now: NOW })).toEqual([]);
  });
});

describe("processDueWebAuditJobs", () => {
  it("asks for another invocation when a campaign was parked mid-flight", async () => {
    mockedCoverage.mockResolvedValue(coverageResult("running"));
    const { service } = makeService({ dueJobs: [job()] });

    const { processed, hasMoreWork } = await processDueWebAuditJobs({ service, now: NOW, limit: 3 });

    expect(processed).toBe(1);
    expect(hasMoreWork).toBe(true);
  });

  it("asks for another invocation when the claim filled the batch limit", async () => {
    // Otherwise the daily-sweep safety net would drain a backlog at `limit`
    // jobs per DAY.
    mockedCoverage.mockResolvedValue(coverageResult("completed"));
    const { service } = makeService({ dueJobs: [job({ id: "a" })] });

    const { hasMoreWork } = await processDueWebAuditJobs({ service, now: NOW, limit: 1 });

    expect(hasMoreWork).toBe(true);
  });

  it("stops chaining when there is nothing left to do", async () => {
    const { service } = makeService({ dueJobs: [] });

    const { processed, hasMoreWork } = await processDueWebAuditJobs({ service, now: NOW, limit: 3 });

    expect(processed).toBe(0);
    expect(hasMoreWork).toBe(false);
  });
});
