import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { createServiceClient } from "@/lib/supabase/service";
import * as coverageModule from "@/lib/recommendations/domain-coverage";
import type { DomainCoverageResult } from "@/lib/recommendations/domain-coverage";
import * as technicalModule from "@/lib/web-audit/technical-audit";
import * as emailModule from "@/lib/email/transactional";
import {
  backfillMissingWebAuditJobs,
  claimDueWebAuditJobs,
  enqueueWebAuditJob,
  BACKFILL_GRACE_MS,
  BACKFILL_LOOKBACK_MS,
  MAX_AUDIT_CONTINUATIONS,
  processDueWebAuditJobs,
  runWebAuditJob,
  type WebAuditJobRow
} from "./audit-job-runner";

vi.mock("@/lib/recommendations/domain-coverage", () => ({ auditDomainCoverageCore: vi.fn() }));
// TECH_AUDIT_TOTAL_BUDGET_MS has to be in the mock as well: the runner sizes
// its "does the technical audit still fit?" reserve off it, and a mocked
// module replaces the constant for the module under test too.
vi.mock("@/lib/web-audit/technical-audit", () => ({
  runTechnicalAuditCore: vi.fn(),
  TECH_AUDIT_TOTAL_BUDGET_MS: 25_000
}));
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
  /** Jobs left in 'running' by a killed invocation — reclaimed via locked_at. */
  staleJobs?: WebAuditJobRow[];
  claimWins?: boolean;
  /** Completed `scan_runs` the backfill can see. */
  completedRuns?: Array<{ id: string; project_id: string }>;
  /** `run_id`s that already carry a web_audit job. */
  runsWithJob?: string[];
}) {
  const recorded: Recorded[] = [];
  /** Read-query filters, so tests can assert on the window a query asked for. */
  const queries: Array<{ table: string; filters: Array<{ method: string; args: unknown[] }> }> = [];
  const {
    project = { owner_user_id: "user-1", domain: "acme.com" },
    existingJob = null,
    dueJobs = [],
    staleJobs = [],
    claimWins = true,
    completedRuns = [],
    runsWithJob = []
  } = options;

  function builder(table: string, op: "select" | "update" | "insert", payload?: Record<string, unknown>) {
    if (op !== "select" && payload) recorded.push({ table, op, payload });

    // The claim issues two selects against `jobs` that differ only by their
    // filters, so the fake has to remember which one it is answering.
    const filters: Array<{ method: string; args: unknown[] }> = [];
    const isStaleQuery = () => filters.some((f) => f.method === "lt");
    const wantsRunning = () =>
      filters.some((f) => f.method === "eq" && f.args[0] === "status" && f.args[1] === "running") ||
      filters.some((f) => f.method === "in" && Array.isArray(f.args[1]) && (f.args[1] as string[]).includes("running"));

    /** The backfill's "which of these runs already has a job?" probe. */
    const isBackfillProbe = () =>
      table === "jobs" && op === "select" && filters.some((f) => f.method === "in" && f.args[0] === "run_id");

    const resolve = () => {
      if (table === "projects") return { data: project, error: null };
      if (table === "scan_runs") {
        queries.push({ table, filters: [...filters] });
        return { data: completedRuns, error: null };
      }
      if (isBackfillProbe()) {
        return { data: runsWithJob.map((run_id) => ({ run_id })), error: null };
      }
      if (op === "update") {
        // A stale reclaim must also still satisfy the locked_at filter.
        const won = claimWins && !(wantsRunning() && !isStaleQuery());
        return { data: won ? { id: "job-1" } : null, error: null };
      }
      if (table !== "jobs") return { data: null, error: null };
      if (existingJob) return { data: existingJob, error: null };
      // Draining, not peeking: a real claim flips the row to 'running', so a
      // second claim in the same sweep never sees it again. The fake used to
      // hand the same row back on every call, which would let a one-job-at-a-
      // time sweep loop on a single job forever.
      const pool = isStaleQuery() ? staleJobs : dueJobs;
      const asked = filters.find((f) => f.method === "limit")?.args[0];
      return { data: pool.splice(0, typeof asked === "number" ? asked : pool.length), error: null };
    };

    const track = (method: string) => (...args: unknown[]) => {
      filters.push({ method, args });
      return self;
    };

    const self: Record<string, unknown> = {
      eq: track("eq"),
      in: track("in"),
      lte: track("lte"),
      lt: track("lt"),
      gte: track("gte"),
      order: track("order"),
      limit: track("limit"),
      select: track("select"),
      maybeSingle: () =>
        Promise.resolve(table === "jobs" && op === "select" ? { data: existingJob, error: null } : resolve()),
      then: (onFulfilled: (v: unknown) => unknown) => Promise.resolve(resolve()).then(onFulfilled)
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

  return { service: client as unknown as ServiceClient, recorded, queries };
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

  it("parks instead of starting a technical audit that cannot finish in time", async () => {
    // Coverage is already durable here, so parking costs one cached coverage
    // call on re-entry. Starting a 25s fetch pass with 5s of budget left
    // would instead gamble on a platform kill, which loses the row update and
    // strands the job in 'running' until the stale-lock sweep.
    mockedCoverage.mockResolvedValue(coverageResult("completed"));
    const { service, recorded } = makeService({});

    const outcome = await runWebAuditJob({ service, job: job(), now: NOW, budgetMs: 5_000 });

    expect(mockedTechnical).not.toHaveBeenCalled();
    expect(outcome).toEqual({ result: "continue", continuations: 1 });
    expect(jobUpdates(recorded).at(-1)).toMatchObject({ status: "pending" });
    // A continuation is not a failure: the retry budget must be untouched.
    expect(jobUpdates(recorded).at(-1)).not.toHaveProperty("attempt_count");
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

  it("gives up and alerts when a job has been abandoned until its budget is spent", async () => {
    // The exhaustion check runs before any Gemini call, so the job that
    // cannot survive an invocation stops costing money AND becomes visible.
    mockedCoverage.mockResolvedValue(coverageResult("completed"));
    const { service, recorded } = makeService({});

    const outcome = await runWebAuditJob({
      service,
      job: job({ attempt_count: 6, max_attempts: 6 }),
      now: NOW
    });

    expect(mockedCoverage).not.toHaveBeenCalled();
    expect(outcome).toMatchObject({ result: "failed", lastError: "abandoned_repeatedly" });
    expect(jobUpdates(recorded).at(-1)).toMatchObject({ status: "failed" });
    expect(mockedAlert).toHaveBeenCalledTimes(1);
  });

  it("never writes a raw error into last_error — the owner can read that column", async () => {
    // `jobs` carries RLS jobs_select_owner, so last_error is reachable from
    // PostgREST by the project owner. Stable code in the row; raw text only
    // to the operator's email.
    mockedCoverage.mockRejectedValue(new Error("connect ECONNREFUSED 10.0.0.1:5432"));
    const { service, recorded } = makeService({});

    await runWebAuditJob({ service, job: job({ attempt_count: 5, max_attempts: 6 }), now: NOW });

    expect(jobUpdates(recorded).at(-1)).toMatchObject({ last_error: "unexpected_error" });
    expect(mockedAlert.mock.calls[0][0].lastError).toContain("ECONNREFUSED");
  });

  it("treats a thrown error as a retryable attempt, not a crash", async () => {
    mockedCoverage.mockRejectedValue(new Error("supabase exploded"));
    const { service, recorded } = makeService({});

    const outcome = await runWebAuditJob({ service, job: job(), now: NOW });

    expect(outcome.result).toBe("retrying");
    // Was asserting the raw message here. That is the behaviour data-guardian
    // R2 rules out: last_error is owner-readable through RLS.
    expect(jobUpdates(recorded).at(-1)).toMatchObject({ last_error: "unexpected_error" });
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

describe("backfillMissingWebAuditJobs", () => {
  /**
   * The production incident this exists for (2026-08-04): the inline enqueue
   * shares an invocation with the update that marks the run completed. When
   * that invocation died in between — a deploy recycled it — there was no row,
   * no log and no catch, and because the sweep only walks `jobs`, nothing
   * would ever have looked at that run again.
   */
  it("enqueues a completed run that never got an audit job", async () => {
    const { service, recorded } = makeService({
      completedRuns: [{ id: "run-lost", project_id: "project-1" }],
      runsWithJob: []
    });

    const enqueued = await backfillMissingWebAuditJobs({ service, now: NOW });

    expect(enqueued).toBe(1);
    const inserts = recorded.filter((r) => r.table === "jobs" && r.op === "insert");
    expect(inserts).toHaveLength(1);
    expect(inserts[0].payload).toMatchObject({ run_id: "run-lost", project_id: "project-1" });
  });

  it("leaves runs that already have a job alone", async () => {
    // One project per run on purpose: after the newest-per-project rule, two
    // runs of the SAME project would test the dedupe against a row the
    // backfill no longer even considers.
    const { service, recorded } = makeService({
      completedRuns: [
        { id: "run-ok", project_id: "project-1" },
        { id: "run-lost", project_id: "project-2" }
      ],
      runsWithJob: ["run-ok"]
    });

    const enqueued = await backfillMissingWebAuditJobs({ service, now: NOW });

    expect(enqueued).toBe(1);
    const inserted = recorded
      .filter((r) => r.table === "jobs" && r.op === "insert")
      .map((r) => r.payload.run_id);
    expect(inserted).toEqual(["run-lost"]);
  });

  it("only ever queues the newest run of a project, never its history", async () => {
    // Both cores audit "the latest completed run of THIS project" and ignore
    // the job's run_id, so a job naming an older run audits the newest one
    // anyway. The first version queued nine jobs for one project on its first
    // production sweep, and painted nine historical rows as "En curso" for
    // work that could never produce an audit of their own.
    const { service, recorded } = makeService({
      completedRuns: [
        { id: "run-newest", project_id: "project-1" },
        { id: "run-older", project_id: "project-1" },
        { id: "run-oldest", project_id: "project-1" },
        { id: "run-other-project", project_id: "project-2" }
      ],
      runsWithJob: []
    });

    const enqueued = await backfillMissingWebAuditJobs({ service, now: NOW });

    // One per project, and for project-1 it must be the first row the
    // newest-first query returned.
    expect(enqueued).toBe(2);
    const inserted = recorded
      .filter((r) => r.table === "jobs" && r.op === "insert")
      .map((r) => r.payload.run_id);
    expect(inserted).toEqual(["run-newest", "run-other-project"]);
  });

  it("does nothing when every completed run is already covered", async () => {
    const { service, recorded } = makeService({
      completedRuns: [{ id: "run-ok", project_id: "project-1" }],
      runsWithJob: ["run-ok"]
    });

    expect(await backfillMissingWebAuditJobs({ service, now: NOW })).toBe(0);
    expect(recorded.filter((r) => r.op === "insert")).toEqual([]);
  });

  it("asks only for runs old enough that the inline enqueue cannot still be in flight", async () => {
    // Without the grace window the backfill races the normal path: the
    // executor marks the run completed and inserts the job milliseconds
    // later, and a sweep landing in between would insert a second one — the
    // dedupe is a SELECT-then-INSERT, not a constraint.
    const { service, queries } = makeService({ completedRuns: [] });

    await backfillMissingWebAuditJobs({ service, now: NOW });

    const runsQuery = queries.find((q) => q.table === "scan_runs");
    const lte = runsQuery?.filters.find((f) => f.method === "lte" && f.args[0] === "finished_at");
    const gte = runsQuery?.filters.find((f) => f.method === "gte" && f.args[0] === "finished_at");
    expect(new Date(lte?.args[1] as string).getTime()).toBe(NOW.getTime() - BACKFILL_GRACE_MS);
    expect(new Date(gte?.args[1] as string).getTime()).toBe(NOW.getTime() - BACKFILL_LOOKBACK_MS);
  });
});

describe("claimDueWebAuditJobs", () => {
  it("reclaims a job abandoned in 'running' by a killed invocation", async () => {
    // Without this the queue leaks: an invocation the platform kills mid-batch
    // never writes its row back, so the job sits in 'running' forever and a
    // claim that only looked at pending/retrying would never touch it again.
    // The audit would silently never happen — the exact failure this phase
    // exists to remove, moved one layer down.
    const { service } = makeService({ dueJobs: [], staleJobs: [job({ id: "abandoned" })] });

    const claimed = await claimDueWebAuditJobs({ service, now: NOW });

    expect(claimed.map((j) => j.id)).toEqual(["abandoned"]);
  });

  it("charges an attempt when reclaiming, so repeated abandonment cannot loop forever", async () => {
    // Without this the ordered finishers are the ONLY writers of
    // attempt_count, and an invocation killed mid-batch never reaches them:
    // the job would be re-claimed every 10 minutes indefinitely, burning real
    // Gemini calls, never reaching max_attempts and therefore never alerting.
    const { service, recorded } = makeService({ staleJobs: [job({ attempt_count: 2 })] });

    const claimed = await claimDueWebAuditJobs({ service, now: NOW });

    expect(jobUpdates(recorded)[0]).toMatchObject({ status: "running", attempt_count: 3 });
    // The caller must see the count that actually landed, not the stale one.
    expect(claimed[0].attempt_count).toBe(3);
  });

  it("does not charge an attempt on an ordinary due claim", async () => {
    const { service, recorded } = makeService({ dueJobs: [job({ attempt_count: 2 })] });

    const claimed = await claimDueWebAuditJobs({ service, now: NOW });

    expect(jobUpdates(recorded)[0]).not.toHaveProperty("attempt_count");
    expect(claimed[0].attempt_count).toBe(2);
  });

  it("does not steal a job whose lock is still fresh", async () => {
    // A 'running' row that the stale query did not return must never be
    // claimed — the original invocation is alive and mid-batch.
    const { service } = makeService({ dueJobs: [], staleJobs: [] });

    expect(await claimDueWebAuditJobs({ service, now: NOW })).toEqual([]);
  });

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

  it("never claims a job it has no budget left to run", async () => {
    // The whole point of claiming one at a time: a claim it cannot honour
    // locks the job out of the queue for STALE_LOCK_MS (10 min), so a sweep
    // that ran out of clock must leave the row untouched and chain instead.
    mockedCoverage.mockResolvedValue(coverageResult("completed"));
    const { service, recorded } = makeService({ dueJobs: [job({ id: "a" }), job({ id: "b" })] });

    const { processed, hasMoreWork } = await processDueWebAuditJobs({
      service,
      now: NOW,
      limit: 3,
      budgetMs: 1_000
    });

    expect(processed).toBe(0);
    expect(jobUpdates(recorded)).toEqual([]);
    expect(hasMoreWork).toBe(true);
  });

  it("runs the jobs it does claim, one at a time, up to the batch limit", async () => {
    mockedCoverage.mockResolvedValue(coverageResult("completed"));
    const { service } = makeService({ dueJobs: [job({ id: "a" }), job({ id: "b" })] });

    const { processed, outcomes, hasMoreWork } = await processDueWebAuditJobs({ service, now: NOW, limit: 3 });

    expect(processed).toBe(2);
    expect(outcomes.every((o) => o.result === "completed")).toBe(true);
    // Two jobs under a limit of three, queue drained: nothing to chain for.
    expect(hasMoreWork).toBe(false);
  });
});
