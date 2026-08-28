import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { createServiceClient } from "@/lib/supabase/service";
import type { AuthenticatedContext } from "@/lib/auth";
import { FINALIZE_LOCK_LEASE_MS, PROMPT_RETRY_DELAY_MS, SCAN_INVOCATION_WORK_BUDGET_MS } from "@/lib/scan/constants";
import { generateRecommendationsForRun } from "@/lib/recommendations/recommendation-engine";
import { countUnprocessedExtractionRows, runStructuredExtractionForRun } from "@/lib/scan/extraction";

// `after()` schedules work outside the request lifecycle Next.js provides in
// a real deployment; under Vitest there is no such request context, so it
// must be mocked. This fake just records the scheduled callback — tests
// assert whether a continuation was scheduled (SCAN-CHAIN-1's self-chaining)
// and can invoke+await the recorded callback themselves to simulate the next
// batch actually running.
const afterMock = vi.fn();
vi.mock("next/server", () => ({
  after: (callback: () => unknown) => afterMock(callback)
}));

beforeEach(() => {
  afterMock.mockClear();
});

const generateGeminiVisibilityAnswer = vi.fn();
vi.mock("@/lib/llm/gemini", async () => {
  const actual = await vi.importActual<typeof import("@/lib/llm/gemini")>("@/lib/llm/gemini");
  return {
    ...actual,
    generateGeminiVisibilityAnswer: (...args: unknown[]) => generateGeminiVisibilityAnswer(...args)
  };
});

const generateClaudeVisibilityAnswer = vi.fn();
vi.mock("@/lib/llm/claude", async () => {
  const actual = await vi.importActual<typeof import("@/lib/llm/claude")>("@/lib/llm/claude");
  return {
    ...actual,
    generateClaudeVisibilityAnswer: (...args: unknown[]) => generateClaudeVisibilityAnswer(...args)
  };
});

const generateOpenAIVisibilityAnswer = vi.fn();
vi.mock("@/lib/llm/openai", async () => {
  const actual = await vi.importActual<typeof import("@/lib/llm/openai")>("@/lib/llm/openai");
  return {
    ...actual,
    generateOpenAIVisibilityAnswer: (...args: unknown[]) => generateOpenAIVisibilityAnswer(...args)
  };
});

vi.mock("@/lib/scan/extraction", () => ({
  runStructuredExtractionForRun: vi.fn().mockResolvedValue({ attempted: 0, succeeded: 0, failed: 0, remaining: 0 }),
  // EXTRACTION-RELIABILITY-1: the executor asks this before completing a run.
  // Default 0 = "every answer was extracted", which is the precondition every
  // pre-existing test in this file implicitly assumed.
  countUnprocessedExtractionRows: vi.fn().mockResolvedValue(0)
}));

vi.mock("@/lib/recommendations/recommendation-engine", () => ({
  generateRecommendationsForRun: vi.fn().mockReturnValue([])
}));

vi.mock("@/lib/scoring/run-scoring", async () => {
  const actual = await vi.importActual<typeof import("@/lib/scoring/run-scoring")>("@/lib/scoring/run-scoring");
  return actual;
});

// executePendingScan calls createServiceClient() internally. Each test wires
// up its own fake `service` (from buildClients) into this mutable holder
// before importing/calling executePendingScan, so the mocked
// createServiceClient can return the per-test fake.
const serviceClientHolder: { current: unknown } = { current: null };
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => serviceClientHolder.current
}));

type ServiceClient = ReturnType<typeof createServiceClient>;
type SupabaseClient = AuthenticatedContext["supabase"];

const PROJECT_ID = "11111111-1111-1111-1111-111111111111";
const RUN_ID = "22222222-2222-2222-2222-222222222222";
const PROMPT_JOB_ID = "33333333-3333-3333-3333-333333333333";
const PROMPT_ID = "44444444-4444-4444-4444-444444444444";
const OWNER_ID = "55555555-5555-5555-5555-555555555555";

type JobsRow = {
  id: string;
  project_id: string;
  run_id: string;
  job_type: string;
  status: string;
  attempt_count: number;
  max_attempts: number;
  payload_json: Record<string, unknown>;
  last_error: string | null;
  created_at: string;
  /** Lock bookkeeping — read by the finalize lock lease (EXTRACTION-RELIABILITY-1). */
  locked_at?: string | null;
  locked_by?: string | null;
};

/**
 * Records every job update applied via service.from("jobs").update(...).
 * Used to assert attempt_count / status / last_error transitions across the
 * per-prompt retry loop (SCAN-ROBUST-1), and — since SCAN-CHAIN-1 — the
 * atomic batch/finalize claim (`.eq(...).in(...).select(...)` /
 * `.eq(...).select(...).maybeSingle()`). Filtering here is genuine (every
 * `.eq()`/`.in()` call collected is actually applied), unlike a hardcoded
 * shortcut, because the executor now issues several differently-filtered
 * update/count queries against this same table within one invocation.
 */
function makeJobsTable(initialJobs: JobsRow[]) {
  const jobs: JobsRow[] = initialJobs.map((j) => ({ ...j }));
  const updates: Array<Partial<JobsRow> & { __id: string }> = [];

  function rowMatches(
    job: JobsRow,
    filters: Array<[string, unknown]>,
    inFilter: { col: string; vals: unknown[] } | null,
    ltFilters: Array<[string, unknown]> = []
  ) {
    const record = job as unknown as Record<string, unknown>;
    if (!filters.every(([col, val]) => record[col] === val)) return false;
    if (inFilter && !inFilter.vals.includes(record[inFilter.col])) return false;
    // `.lt()` backs the finalize lock lease (EXTRACTION-RELIABILITY-1): a
    // null lock never matches, so a job with no `locked_at` is never taken
    // over by the lease path.
    if (
      !ltFilters.every(([col, val]) => {
        const actual = record[col];
        return actual !== null && actual !== undefined && String(actual) < String(val);
      })
    ) {
      return false;
    }
    return true;
  }

  function updateBuilder(patch: Partial<JobsRow>) {
    const filters: Array<[string, unknown]> = [];
    const ltFilters: Array<[string, unknown]> = [];
    let inFilter: { col: string; vals: unknown[] } | null = null;

    function applyAndCollectMatches(): JobsRow[] {
      const matched = jobs.filter((job) => rowMatches(job, filters, inFilter, ltFilters));
      for (const job of matched) {
        Object.assign(job, patch);
        updates.push({ __id: job.id, ...patch });
      }
      return matched;
    }

    const builder = {
      eq(column: string, value: unknown) {
        filters.push([column, value]);
        return builder;
      },
      in(column: string, values: unknown[]) {
        inFilter = { col: column, vals: values };
        return builder;
      },
      lt(column: string, value: unknown) {
        ltFilters.push([column, value]);
        return builder;
      },
      select(_cols?: string) {
        const matched = applyAndCollectMatches();
        const result = { data: matched.map((j) => ({ ...j })), error: null };
        return {
          ...result,
          maybeSingle: () => Promise.resolve({ data: matched[0] ? { ...matched[0] } : null, error: null }),
          then: (resolve: (value: typeof result) => unknown) => Promise.resolve(result).then(resolve)
        };
      },
      // executor.ts also awaits some jobs updates directly (no `.select()`
      // chained) — e.g. the catch-all "mark running jobs failed" bulk update.
      then(resolve: (value: { error: null }) => unknown) {
        applyAndCollectMatches();
        return Promise.resolve({ error: null }).then(resolve);
      }
    };
    return builder;
  }

  function selectBuilder() {
    const filters: Array<[string, unknown]> = [];
    let inFilter: { col: string; vals: unknown[] } | null = null;
    const builder = {
      eq(column: string, value: unknown) {
        filters.push([column, value]);
        return builder;
      },
      in(column: string, values: unknown[]) {
        inFilter = { col: column, vals: values };
        return builder;
      },
      order(_column: string, _opts: unknown) {
        return Promise.resolve({ data: jobs.map((j) => ({ ...j })), error: null });
      },
      // Count queries (`{ count: "exact", head: true }`) are awaited
      // directly, filtered genuinely by every `.eq()`/`.in()` collected —
      // needed since the executor now issues several distinctly-filtered
      // counts (pending+running/completed/failed) within one invocation.
      then(resolve: (value: { count: number; error: null }) => unknown) {
        const matched = jobs.filter((job) => rowMatches(job, filters, inFilter));
        return Promise.resolve({ count: matched.length, error: null }).then(resolve);
      }
    };
    return builder;
  }

  return {
    jobs,
    updates,
    table: {
      select: () => selectBuilder(),
      update: (patch: Partial<JobsRow>) => updateBuilder(patch)
    }
  };
}

/**
 * Generic no-op table: every method returns a thenable resolving to an empty,
 * error-free response, regardless of the chain shape used.
 */
function noopTable() {
  const result = { data: [], error: null, count: 0 };
  const builder: Record<string, unknown> = {
    eq: () => builder,
    neq: () => builder,
    in: () => builder,
    not: () => builder,
    order: () => builder,
    limit: () => builder,
    gte: () => builder,
    lt: () => builder,
    select: () => builder,
    insert: () => Promise.resolve({ error: null }),
    upsert: () => Promise.resolve({ error: null }),
    delete: () => builder,
    update: () => builder,
    maybeSingle: () => Promise.resolve({ data: null, error: null }),
    single: () => Promise.resolve({ data: null, error: null }),
    then: (resolve: (value: typeof result) => unknown) => Promise.resolve(result).then(resolve)
  };
  return builder;
}

function makeScanRunsTable(previousRunId: string | null = null, completedRunCount?: number) {
  // Distinguishes the pre-existing "update(...).select('id').maybeSingle()"
  // pattern (confirms a status transition applied, keyed by .eq("id", runId))
  // from RECS-3's new read-only "find the immediately preceding completed
  // run" lookup, which always includes a .neq("id", runId) in its chain.
  // Most tests in this file seed only a single run (RUN_ID) -> no previous
  // run to find; tests exercising RECS-3 pass a previousRunId explicitly.
  let sawNeq = false;
  const builder: Record<string, unknown> = {
    eq: () => builder,
    neq: () => {
      sawNeq = true;
      return builder;
    },
    order: () => builder,
    limit: () => builder,
    update: () => builder,
    select: () => builder,
    maybeSingle: () => {
      const wasNeq = sawNeq;
      sawNeq = false;
      if (wasNeq) {
        return Promise.resolve(previousRunId ? { data: { id: previousRunId }, error: null } : { data: null, error: null });
      }
      return Promise.resolve({ data: { id: RUN_ID }, error: null });
    },
    // PROJECT-DEFAULTS-BY-ACCOUNT-1's `completedRunCount` query
    // (`.select("id", {count:"exact",head:true}).eq().eq()`) is the only
    // caller in executor.ts that awaits a `scan_runs` chain directly without
    // ever calling `.maybeSingle()`/`.order()` — so it's safe to fold `count`
    // into this same generic `then` without touching any pre-existing test.
    then: (resolve: (value: { data: unknown[]; error: null; count?: number }) => unknown) =>
      Promise.resolve({ data: [], error: null, count: completedRunCount }).then(resolve)
  };
  return builder;
}

type RecRow = {
  id: string;
  run_id: string;
  project_id: string;
  status: string;
  dedupe_key: string;
  consecutive_runs_open: number;
  resolved_in_run_id: string | null;
  [key: string]: unknown;
};

type RecFilter =
  | { type: "eq"; col: string; val: unknown }
  | { type: "neq"; col: string; val: unknown }
  | { type: "in"; col: string; vals: unknown[] };

/**
 * Minimal in-memory fake for the `recommendations` table covering exactly
 * the select/update/delete/insert shapes lib/scan/executor.ts issues for
 * RECS-3 (previous-run lookup, resolve, supersede, delete+insert of the
 * current run's rows) — real filtering (not just chain-shape passthrough),
 * so tests can assert on actual row transitions.
 */
function makeRecommendationsTable(
  seed: RecRow[] = [],
  // RECS-FINALIZE-DURABILITY-1: lets a test simulate the delete or insert of
  // the current run's own rows failing, independent of each other — the two
  // error paths executor.ts now handles differently (a failed delete skips
  // the insert entirely; a failed insert just logs).
  options: { deleteError?: string; insertError?: string } = {}
) {
  const rows: RecRow[] = seed.map((r) => ({ ...r }));
  const insertedRows: RecRow[] = [];
  let nextId = 1;

  function matches(row: RecRow, filters: RecFilter[]): boolean {
    return filters.every((f) => {
      const val = row[f.col];
      if (f.type === "eq") return val === f.val;
      if (f.type === "neq") return val !== f.val;
      return f.vals.includes(val);
    });
  }

  function chain(mode: "select" | "update" | "delete", patch: Partial<RecRow> | null, filters: RecFilter[]): Record<string, unknown> {
    const builder: Record<string, unknown> = {
      eq: (col: string, val: unknown) => chain(mode, patch, [...filters, { type: "eq", col, val }]),
      neq: (col: string, val: unknown) => chain(mode, patch, [...filters, { type: "neq", col, val }]),
      in: (col: string, vals: unknown[]) => chain(mode, patch, [...filters, { type: "in", col, vals }]),
      then: (resolve: (value: { data: RecRow[] | null; error: { message: string } | null }) => unknown) => {
        if (mode === "select") {
          const data = rows.filter((r) => matches(r, filters));
          return Promise.resolve({ data, error: null }).then(resolve);
        }
        if (mode === "update") {
          for (const row of rows) if (matches(row, filters)) Object.assign(row, patch);
          return Promise.resolve({ data: null, error: null }).then(resolve);
        }
        if (options.deleteError) {
          return Promise.resolve({ data: null, error: { message: options.deleteError } }).then(resolve);
        }
        for (let i = rows.length - 1; i >= 0; i -= 1) if (matches(rows[i], filters)) rows.splice(i, 1);
        return Promise.resolve({ data: null, error: null }).then(resolve);
      }
    };
    return builder;
  }

  const table = {
    select: () => chain("select", null, []),
    update: (patch: Partial<RecRow>) => chain("update", patch, []),
    delete: () => chain("delete", null, []),
    insert: (payload: Partial<RecRow> | Partial<RecRow>[]) => {
      if (options.insertError) {
        return Promise.resolve({ error: { message: options.insertError } });
      }
      const toInsert = (Array.isArray(payload) ? payload : [payload]).map((r) => ({
        id: `rec-${nextId++}`,
        ...r
      })) as RecRow[];
      insertedRows.push(...toInsert);
      rows.push(...toInsert);
      return Promise.resolve({ error: null });
    }
  };

  return { rows, insertedRows, table };
}

/** Captures every row `logJob` writes to `job_logs`, so a test can assert a
 * failure was actually made diagnosable rather than only swallowed. */
function makeJobLogsTable() {
  const inserted: Array<Record<string, unknown>> = [];
  return {
    inserted,
    table: {
      insert: (row: Record<string, unknown>) => {
        inserted.push(row);
        return Promise.resolve({ error: null });
      }
    }
  };
}

/**
 * Captures every row inserted into `scan_prompt_results`, so tests can assert
 * on the persisted `raw_response_json` (e.g. `prompt_version`) without caring
 * about the rest of the no-op table plumbing.
 *
 * `existingProviders` seeds the response for processPromptJob's per-engine
 * idempotency check (the only `select` in this table filtered by
 * `prompt_id`); the later run-level results aggregation `select` (filtered
 * only by `run_id`/`project_id`) always sees `[]`, matching every other test
 * in this file.
 */
function makeScanPromptResultsTable(existingProviders: string[] | Record<number, string[]> = []) {
  // Sample-aware since SAMPLING-1 (ADR 0030): a plain array means "these
  // providers already have a row for sample 0", the historical meaning; a
  // record keyed by sample index lets a test seed different samples
  // differently, which is what proves repetitions are not skipped by an
  // earlier sample's rows.
  const bySample: Record<number, string[]> = Array.isArray(existingProviders)
    ? { 0: existingProviders }
    : existingProviders;

  const inserted: Array<Record<string, unknown>> = [];
  let hasPromptIdFilter = false;
  let sampleFilter = 0;
  const builder: Record<string, unknown> = {
    insert: (row: Record<string, unknown>) => {
      inserted.push(row);
      return Promise.resolve({ error: null });
    },
    eq: (column: string, value?: unknown) => {
      if (column === "prompt_id") hasPromptIdFilter = true;
      if (column === "sample_index") sampleFilter = Number(value ?? 0);
      return builder;
    },
    select: () => builder,
    order: () => builder,
    maybeSingle: () => Promise.resolve({ data: null, error: null }),
    single: () => Promise.resolve({ data: null, error: null }),
    then: (resolve: (value: { data: unknown[]; error: null }) => unknown) => {
      const data = hasPromptIdFilter
        ? (bySample[sampleFilter] ?? []).map((provider) => ({ provider }))
        : [];
      hasPromptIdFilter = false;
      sampleFilter = 0;
      return Promise.resolve({ data, error: null }).then(resolve);
    }
  };
  return { inserted, table: builder };
}

type NotificationCall = {
  owner_user_id: string;
  project_id: string | null;
  type: string;
  severity: string;
  dedupe_key: string;
  payload_json: Record<string, unknown>;
};

/**
 * Fake `notifications` table covering exactly the shape emitNotification
 * issues (`service.from("notifications").upsert(row, options)`), recording
 * every call for assertions. `behavior: "error"/"throws"` lets a test prove
 * emission failures never affect the run's own outcome (NOTIF-SERVER-1a
 * fail-soft requirement) without emitNotification's own unit tests
 * (lib/notifications/emit.test.ts) needing to be duplicated here.
 */
function makeNotificationsTable(behavior: "ok" | "error" | "throws" = "ok") {
  const calls: NotificationCall[] = [];
  const table = {
    upsert: (row: NotificationCall, _options?: Record<string, unknown>) => {
      calls.push({ ...row });
      if (behavior === "throws") throw new Error("connection reset");
      if (behavior === "error") return Promise.resolve({ error: { message: "constraint violation" } });
      return Promise.resolve({ error: null });
    }
  };
  return { calls, table };
}

function buildClients(
  {
    promptJobMaxAttempts,
    previousRunId = null,
    previousRecommendationRows = [],
    ownerPlan,
    notificationsBehavior = "ok",
    promptJobSampleIndex,
    engineFlags,
    recurringScans,
    scoreWindowRows,
    recommendationsDeleteError,
    recommendationsInsertError,
    autoTechnicalAudit
  }: {
    promptJobMaxAttempts: number;
    /** SAMPLING-1: the repetition this prompt job belongs to. Omitted -> no
     *  sample_index in the payload at all, which is exactly what a job created
     *  before ADR 0030 looks like. */
    promptJobSampleIndex?: number;
    previousRunId?: string | null;
    previousRecommendationRows?: RecRow[];
    /** PRICING-TRUTH-1 (PR b): owner's `profiles.current_plan`, read by executePendingScan
     *  to cap the active engine set at `caps.engines`. Undefined -> no profiles row ->
     *  resolvePlan falls back to the default plan ("pro", caps.engines: 2), same as
     *  every test written before this option existed. */
    ownerPlan?: string;
    notificationsBehavior?: "ok" | "error" | "throws";
    /**
     * ENGINE-DEBUG-TOGGLE-1: `projects.engine_{gemini,claude,openai}_enabled`
     * as `executePendingScan`'s own isolated query would read them. Omitted
     * -> `service.from("projects")` falls through to `noopTable()` (data:
     * null), the same "migration not applied / unread" shape every test
     * written before this option existed already exercises without knowing
     * it — resolving to "no project override" (all engines stay enabled).
     */
    engineFlags?: { gemini?: boolean; claude?: boolean; openai?: boolean };
    /**
     * PROJECT-DEFAULTS-BY-ACCOUNT-1: the auto-activation-after-first-scan
     * block's three isolated reads (`projects.recurring_scans_enabled`, the
     * `scan_runs` completed count, and the owner's email via
     * `auth.admin.getUserById`). Omitted -> `service.from("projects")` falls
     * through to `noopTable()` for this query (data: null), the same
     * "migration not applied / unread" shape every pre-existing test
     * exercises without knowing it — the block's outer `if (recurringFlagRow
     * && ...)` guard makes that a no-op, so no test written before this
     * option existed changes behavior.
     */
    recurringScans?: { currentValue?: boolean; completedRunCount?: number; ownerEmail?: string | null };
    /**
     * AUDIT-RUNNABLE-1 (docs/external-audit-2026-08.md, Fase 5): the
     * backfill block's own isolated read (`projects.auto_technical_audit_enabled`)
     * and its owner-email lookup. Omitted -> `service.from("projects")` falls
     * through to `noopTable()` for this query (data: null), same "migration
     * not applied / unread" shape as `recurringScans` above — the block's
     * outer `if (auditFlagRow && ...)` guard makes that a no-op.
     */
    autoTechnicalAudit?: { currentValue?: boolean; ownerEmail?: string | null };
    /**
     * TRUST-METRICS-1: rows the completion notification's windowed-score read
     * (`service.from("run_scores").select(...).order(...).limit(...)`) sees.
     * Omitted -> falls through to `noopTable()` (data: []), which is the
     * "fewer than DEFAULT_SCORE_WINDOW_SIZE rows exist yet" shape every test
     * written before this option existed already exercises: `geoScore` in the
     * emitted payload falls back to `Math.round(scores.visibility_score)`.
     */
    scoreWindowRows?: Array<{ run_id: string; created_at: string; visibility_score: number | null; details_json: unknown }>;
    /** RECS-FINALIZE-DURABILITY-1: simulate the current run's own delete/insert
     *  of `recommendations` failing. Omitted -> both succeed, same as every
     *  test written before this option existed. */
    recommendationsDeleteError?: string;
    recommendationsInsertError?: string;
  },
  existingProviders: string[] | Record<number, string[]> = []
) {
  const jobsTable = makeJobsTable([
    {
      id: "start-job",
      project_id: PROJECT_ID,
      run_id: RUN_ID,
      job_type: "scan_start",
      status: "pending",
      attempt_count: 0,
      max_attempts: 3,
      payload_json: {},
      last_error: null,
      created_at: "2026-06-13T10:00:00.000Z"
    },
    {
      id: PROMPT_JOB_ID,
      project_id: PROJECT_ID,
      run_id: RUN_ID,
      job_type: "scan_prompt",
      status: "pending",
      attempt_count: 0,
      max_attempts: promptJobMaxAttempts,
      payload_json: {
        prompt_id: PROMPT_ID,
        prompt_text: "What is the best CRM?",
        ...(promptJobSampleIndex === undefined ? {} : { sample_index: promptJobSampleIndex })
      },
      last_error: null,
      created_at: "2026-06-13T10:00:01.000Z"
    },
    {
      id: "finalize-job",
      project_id: PROJECT_ID,
      run_id: RUN_ID,
      job_type: "scan_finalize",
      status: "pending",
      attempt_count: 0,
      max_attempts: 3,
      payload_json: {},
      last_error: null,
      created_at: "2026-06-13T10:00:02.000Z"
    }
  ]);

  const scanRunsTable = makeScanRunsTable(previousRunId, recurringScans?.completedRunCount);
  const scanPromptResultsTable = makeScanPromptResultsTable(existingProviders);
  const recommendationsTable = makeRecommendationsTable(previousRecommendationRows, {
    deleteError: recommendationsDeleteError,
    insertError: recommendationsInsertError
  });
  const jobLogsTable = makeJobLogsTable();
  const notificationsTable = makeNotificationsTable(notificationsBehavior);
  // PROJECT-DEFAULTS-BY-ACCOUNT-1: every `projects.update(...)` call the
  // finalize block issues, so tests can assert whether (and to what)
  // `recurring_scans_enabled` was written.
  const projectsUpdates: Array<Record<string, unknown>> = [];

  const service = {
    from(table: string) {
      if (table === "jobs") return jobsTable.table;
      if (table === "scan_runs") return scanRunsTable;
      if (table === "scan_prompt_results") return scanPromptResultsTable.table;
      if (table === "recommendations") return recommendationsTable.table;
      if (table === "job_logs") return jobLogsTable.table;
      if (table === "notifications") return notificationsTable.table;
      if (table === "run_scores" && scoreWindowRows) {
        // Extends noopTable() rather than replacing it: executePendingScan
        // ALSO calls `.from("run_scores").upsert(...)` earlier, to persist
        // this run's own score row — a select-only stub here broke that call
        // (`upsert is not a function`) for every test, not just this one.
        return {
          ...noopTable(),
          select: () => ({
            eq: () => ({
              order: () => ({
                limit: () => Promise.resolve({ data: scoreWindowRows, error: null })
              })
            })
          })
        };
      }
      if (table === "profiles") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: () =>
                Promise.resolve({
                  data: ownerPlan ? { current_plan: ownerPlan } : null,
                  error: null
                })
            })
          })
        };
      }
      if (table === "projects" && (engineFlags || recurringScans || autoTechnicalAudit)) {
        return {
          // Keyed off the requested columns, not merged unconditionally:
          // `executePendingScan` issues three SEPARATE `.select(...)` calls
          // against this table (engine flags, recurring-scans, technical-
          // audit), each its own isolated read. A test that only configures
          // `recurringScans` must not have the technical-audit block see a
          // truthy row with `auto_technical_audit_enabled: undefined` — which
          // reads as "off" by the real fail-closed rule and would flip it,
          // exactly the false positive this branch used to produce before
          // AUDIT-RUNNABLE-1 added its own option here. So an unconfigured
          // concern returns `data: null` for its own query, same "falls
          // through as unread" shape `noopTable()` gives every other table.
          select: (columns: string) => ({
            eq: () => ({
              maybeSingle: () => {
                if (columns.includes("engine_") && engineFlags) {
                  return Promise.resolve({
                    data: {
                      engine_gemini_enabled: engineFlags.gemini,
                      engine_claude_enabled: engineFlags.claude,
                      engine_openai_enabled: engineFlags.openai
                    },
                    error: null
                  });
                }
                if (columns.includes("recurring_scans_enabled") && recurringScans) {
                  return Promise.resolve({
                    data: { recurring_scans_enabled: recurringScans.currentValue },
                    error: null
                  });
                }
                if (columns.includes("auto_technical_audit_enabled") && autoTechnicalAudit) {
                  return Promise.resolve({
                    data: { auto_technical_audit_enabled: autoTechnicalAudit.currentValue },
                    error: null
                  });
                }
                return Promise.resolve({ data: null, error: null });
              }
            })
          }),
          update: (patch: Record<string, unknown>) => {
            projectsUpdates.push(patch);
            return { eq: () => Promise.resolve({ error: null }) };
          }
        };
      }
      return noopTable();
    },
    // PROJECT-DEFAULTS-BY-ACCOUNT-1: the finalize block's owner-email lookup.
    // Omitted `recurringScans`/`autoTechnicalAudit` -> never reached (the
    // outer guards above short-circuit first), so this is safe to always
    // provide.
    auth: {
      admin: {
        getUserById: (_id: string) =>
          Promise.resolve({
            data: { user: { email: recurringScans?.ownerEmail ?? autoTechnicalAudit?.ownerEmail ?? null } },
            error: null
          })
      }
    }
  } as unknown as ServiceClient;

  const supabase = {
    from(table: string) {
      if (table === "scan_runs") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                single: () =>
                  Promise.resolve({
                    data: { id: RUN_ID, project_id: PROJECT_ID, status: "pending", total_prompts: 1 },
                    error: null
                  })
              })
            })
          })
        };
      }
      if (table === "projects") {
        return {
          select: () => ({
            eq: () => ({
              single: () =>
                Promise.resolve({
                  data: {
                    id: PROJECT_ID,
                    domain: "acme.com",
                    brand: "Acme",
                    country: "ES",
                    language: "es",
                    owner_user_id: OWNER_ID
                  },
                  error: null
                })
            })
          })
        };
      }
      if (table === "project_competitors") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                order: () => Promise.resolve({ data: [], error: null })
              })
            })
          })
        };
      }
      return noopTable();
    }
  } as unknown as SupabaseClient;

  return {
    service,
    supabase,
    jobsTable,
    scanRunsTable,
    scanPromptResultsTable,
    recommendationsTable,
    jobLogsTable,
    notificationsTable,
    projectsUpdates
  };
}

const SUCCESS_RESPONSE = {
  text: "Acme is a great CRM.",
  model: "gemini-2.0-flash",
  tokensIn: 10,
  tokensOut: 20,
  totalTokens: 30
};

describe("executePendingScan — per-prompt retry (SCAN-ROBUST-1)", () => {
  beforeEach(() => {
    generateGeminiVisibilityAnswer.mockReset();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("retries once after a recoverable failure and succeeds on the second attempt", async () => {
    generateGeminiVisibilityAnswer
      .mockRejectedValueOnce(new Error("Gemini API request failed with status 500."))
      .mockResolvedValueOnce(SUCCESS_RESPONSE);

    const { service, supabase, jobsTable } = buildClients({ promptJobMaxAttempts: 3 });
    serviceClientHolder.current = service;

    const { executePendingScan } = await import("./executor");

    const runPromise = executePendingScan({ projectId: PROJECT_ID, runId: RUN_ID, supabase });

    // Allow the PROMPT_RETRY_DELAY_MS delay between attempts to elapse.
    await vi.advanceTimersByTimeAsync(PROMPT_RETRY_DELAY_MS);
    await runPromise;

    expect(generateGeminiVisibilityAnswer).toHaveBeenCalledTimes(2);

    const promptJob = jobsTable.jobs.find((j) => j.id === PROMPT_JOB_ID)!;
    // attempt_count bumped twice: once for the first attempt, once for the retry.
    expect(promptJob.attempt_count).toBe(2);
    // Final state is "completed" — the retry succeeded.
    expect(promptJob.status).toBe("completed");
    expect(promptJob.last_error).toBeNull();
  });

  it("fails the job after exhausting PROMPT_RETRY_MAX_TOTAL_ATTEMPTS (2 total attempts)", async () => {
    generateGeminiVisibilityAnswer.mockRejectedValue(new Error("Gemini API request failed with status 500."));

    const { service, supabase, jobsTable, scanRunsTable } = buildClients({ promptJobMaxAttempts: 3 });
    serviceClientHolder.current = service;

    const { executePendingScan } = await import("./executor");

    const runPromise = executePendingScan({ projectId: PROJECT_ID, runId: RUN_ID, supabase }).catch(
      (e) => e
    );

    await vi.advanceTimersByTimeAsync(PROMPT_RETRY_DELAY_MS);
    await runPromise;

    // 2 attempts total (1 initial + 1 retry), bounded by PROMPT_RETRY_MAX_TOTAL_ATTEMPTS=2
    // even though job.max_attempts=3.
    expect(generateGeminiVisibilityAnswer).toHaveBeenCalledTimes(2);

    const promptJob = jobsTable.jobs.find((j) => j.id === PROMPT_JOB_ID)!;
    expect(promptJob.attempt_count).toBe(2);
    expect(promptJob.status).toBe("failed");
    expect(promptJob.last_error).toBe("No se pudo completar la ejecución del escaneo.");
  });

  it("respects job.max_attempts=1 by not retrying at all", async () => {
    generateGeminiVisibilityAnswer.mockRejectedValue(new Error("Gemini API request failed with status 500."));

    const { service, supabase, jobsTable } = buildClients({ promptJobMaxAttempts: 1 });
    serviceClientHolder.current = service;

    const { executePendingScan } = await import("./executor");

    await executePendingScan({ projectId: PROJECT_ID, runId: RUN_ID, supabase }).catch((e) => e);

    expect(generateGeminiVisibilityAnswer).toHaveBeenCalledTimes(1);

    const promptJob = jobsTable.jobs.find((j) => j.id === PROMPT_JOB_ID)!;
    expect(promptJob.attempt_count).toBe(1);
    expect(promptJob.status).toBe("failed");
  });

  it("calls generateGeminiVisibilityAnswer without brand/competitors and persists PROMPT_VERSION (docs/adr/0007)", async () => {
    generateGeminiVisibilityAnswer.mockResolvedValue(SUCCESS_RESPONSE);

    const { service, supabase, scanPromptResultsTable } = buildClients({ promptJobMaxAttempts: 3 });
    serviceClientHolder.current = service;

    const { executePendingScan } = await import("./executor");
    const { PROMPT_VERSION } = await import("./constants");

    await executePendingScan({ projectId: PROJECT_ID, runId: RUN_ID, supabase });

    expect(generateGeminiVisibilityAnswer).toHaveBeenCalledTimes(1);
    const [callArgs] = generateGeminiVisibilityAnswer.mock.calls[0];
    expect(callArgs).not.toHaveProperty("brand");
    expect(callArgs).not.toHaveProperty("competitors");
    expect(callArgs).toEqual({
      prompt: "What is the best CRM?",
      country: "ES",
      language: "es"
    });

    expect(scanPromptResultsTable.inserted).toHaveLength(1);
    const insertedRow = scanPromptResultsTable.inserted[0];
    expect((insertedRow.raw_response_json as Record<string, unknown>).prompt_version).toBe(PROMPT_VERSION);
    // The extraction pass (runStructuredExtractionForRun, mocked above) is the
    // one that receives brand/competitors via brand_snapshot/competitors_snapshot.
    expect(insertedRow.brand_snapshot).toBe("Acme");
    expect(insertedRow.competitors_snapshot).toEqual([]);
  });

  it("does not retry on GeminiConfigError (terminal, run-level failure)", async () => {
    const { GeminiConfigError } = await vi.importActual<typeof import("@/lib/llm/gemini")>("@/lib/llm/gemini");
    generateGeminiVisibilityAnswer.mockRejectedValue(new GeminiConfigError("Missing GEMINI_API_KEY"));

    const { service, supabase } = buildClients({ promptJobMaxAttempts: 3 });
    serviceClientHolder.current = service;

    const { executePendingScan } = await import("./executor");

    await expect(executePendingScan({ projectId: PROJECT_ID, runId: RUN_ID, supabase })).rejects.toThrow();

    expect(generateGeminiVisibilityAnswer).toHaveBeenCalledTimes(1);
  });
});

describe("executePendingScan — multi-engine execution", () => {
  const ORIGINAL_LLM_SCAN_PROVIDERS = process.env.LLM_SCAN_PROVIDERS;

  beforeEach(() => {
    generateGeminiVisibilityAnswer.mockReset();
    generateClaudeVisibilityAnswer.mockReset();
    generateOpenAIVisibilityAnswer.mockReset();
    process.env.LLM_SCAN_PROVIDERS = "gemini,claude";
  });

  afterEach(() => {
    if (ORIGINAL_LLM_SCAN_PROVIDERS === undefined) {
      delete process.env.LLM_SCAN_PROVIDERS;
    } else {
      process.env.LLM_SCAN_PROVIDERS = ORIGINAL_LLM_SCAN_PROVIDERS;
    }
  });

  const CLAUDE_SUCCESS_RESPONSE = {
    text: "Acme is also a great CRM.",
    model: "claude-haiku-4-5-20251001",
    tokensIn: 12,
    tokensOut: 22,
    totalTokens: 34
  };

  it("inserts one result row per engine when both succeed, and completes the job", async () => {
    generateGeminiVisibilityAnswer.mockResolvedValue(SUCCESS_RESPONSE);
    generateClaudeVisibilityAnswer.mockResolvedValue(CLAUDE_SUCCESS_RESPONSE);

    const { service, supabase, scanPromptResultsTable, jobsTable } = buildClients({ promptJobMaxAttempts: 3 });
    serviceClientHolder.current = service;

    const { executePendingScan } = await import("./executor");
    await executePendingScan({ projectId: PROJECT_ID, runId: RUN_ID, supabase });

    expect(generateGeminiVisibilityAnswer).toHaveBeenCalledTimes(1);
    expect(generateClaudeVisibilityAnswer).toHaveBeenCalledTimes(1);
    expect(scanPromptResultsTable.inserted).toHaveLength(2);
    expect(scanPromptResultsTable.inserted.map((row) => row.provider).sort()).toEqual(["claude", "gemini"]);

    const promptJob = jobsTable.jobs.find((j) => j.id === PROMPT_JOB_ID)!;
    expect(promptJob.status).toBe("completed");
  });

  it("ENGINES-2a: a paid plan (pro, caps.engines=3) runs all three engines when LLM_SCAN_PROVIDERS lists them", async () => {
    // Founder decision 2026-07-18 after the real-world validation (real
    // grounding citations, fastest engine, negligible cost): every paid
    // plan gets 3 engines. Free (caps.engines=1) remains the plan that
    // exercises the slice — covered by the Free-plan test above.
    process.env.LLM_SCAN_PROVIDERS = "gemini,claude,openai";
    generateGeminiVisibilityAnswer.mockResolvedValue(SUCCESS_RESPONSE);
    generateClaudeVisibilityAnswer.mockResolvedValue(CLAUDE_SUCCESS_RESPONSE);
    generateOpenAIVisibilityAnswer.mockResolvedValue(SUCCESS_RESPONSE);

    const { service, supabase, scanPromptResultsTable } = buildClients({ promptJobMaxAttempts: 3 });
    serviceClientHolder.current = service;

    const { executePendingScan } = await import("./executor");
    await executePendingScan({ projectId: PROJECT_ID, runId: RUN_ID, supabase });

    expect(generateOpenAIVisibilityAnswer).toHaveBeenCalledTimes(1);
    expect(scanPromptResultsTable.inserted.map((row) => row.provider).sort()).toEqual(["claude", "gemini", "openai"]);
  });

  it("ENGINE-DEBUG-TOGGLE-1: narrows execution to just the enabled engine when the others are disabled", async () => {
    process.env.LLM_SCAN_PROVIDERS = "gemini,claude,openai";
    generateGeminiVisibilityAnswer.mockResolvedValue(SUCCESS_RESPONSE);
    generateClaudeVisibilityAnswer.mockResolvedValue(CLAUDE_SUCCESS_RESPONSE);
    generateOpenAIVisibilityAnswer.mockResolvedValue(SUCCESS_RESPONSE);

    const { service, supabase, scanPromptResultsTable } = buildClients({
      promptJobMaxAttempts: 3,
      engineFlags: { gemini: true, claude: false, openai: false }
    });
    serviceClientHolder.current = service;

    const { executePendingScan } = await import("./executor");
    await executePendingScan({ projectId: PROJECT_ID, runId: RUN_ID, supabase });

    expect(generateGeminiVisibilityAnswer).toHaveBeenCalledTimes(1);
    expect(generateClaudeVisibilityAnswer).not.toHaveBeenCalled();
    expect(generateOpenAIVisibilityAnswer).not.toHaveBeenCalled();
    expect(scanPromptResultsTable.inserted.map((row) => row.provider)).toEqual(["gemini"]);
  });

  it("ENGINE-DEBUG-TOGGLE-1: runs every configured engine when the columns are missing (pre-migration / unread)", async () => {
    process.env.LLM_SCAN_PROVIDERS = "gemini,claude,openai";
    generateGeminiVisibilityAnswer.mockResolvedValue(SUCCESS_RESPONSE);
    generateClaudeVisibilityAnswer.mockResolvedValue(CLAUDE_SUCCESS_RESPONSE);
    generateOpenAIVisibilityAnswer.mockResolvedValue(SUCCESS_RESPONSE);

    // No `engineFlags` passed -> service.from("projects") falls through to
    // noopTable() -> the isolated read resolves to no project override.
    const { service, supabase, scanPromptResultsTable } = buildClients({ promptJobMaxAttempts: 3 });
    serviceClientHolder.current = service;

    const { executePendingScan } = await import("./executor");
    await executePendingScan({ projectId: PROJECT_ID, runId: RUN_ID, supabase });

    expect(scanPromptResultsTable.inserted.map((row) => row.provider).sort()).toEqual(["claude", "gemini", "openai"]);
  });

  it("ENGINE-DEBUG-TOGGLE-1: fails the run with no_engines_enabled instead of executing with zero engines", async () => {
    const { service, supabase } = buildClients({
      promptJobMaxAttempts: 3,
      engineFlags: { gemini: false, claude: false, openai: false }
    });
    serviceClientHolder.current = service;

    const { executePendingScan } = await import("./executor");
    // Same run-level-abort shape as "aborts the run when every active engine
    // is config-errored" above: thrown from inside the `try`, caught by the
    // same block that marks scan_runs failed with a real error_summary.
    await expect(executePendingScan({ projectId: PROJECT_ID, runId: RUN_ID, supabase })).rejects.toThrow();

    expect(generateGeminiVisibilityAnswer).not.toHaveBeenCalled();
    expect(generateClaudeVisibilityAnswer).not.toHaveBeenCalled();
  });

  it("completes the run even when recommendation generation throws (fail-soft)", async () => {
    generateGeminiVisibilityAnswer.mockResolvedValue(SUCCESS_RESPONSE);
    generateClaudeVisibilityAnswer.mockResolvedValue(CLAUDE_SUCCESS_RESPONSE);
    vi.mocked(generateRecommendationsForRun).mockImplementationOnce(() => {
      throw new Error("recommendation engine boom");
    });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const { service, supabase, jobsTable } = buildClients({ promptJobMaxAttempts: 3 });
    serviceClientHolder.current = service;

    const { executePendingScan } = await import("./executor");
    // The derived recommendations failing must NOT sink the scan — otherwise the
    // launch surfaces as "No se pudo lanzar el escaneo".
    await expect(executePendingScan({ projectId: PROJECT_ID, runId: RUN_ID, supabase })).resolves.toBeUndefined();

    const promptJob = jobsTable.jobs.find((j) => j.id === PROMPT_JOB_ID)!;
    expect(promptJob.status).toBe("completed");

    errorSpy.mockRestore();
  });

  it("does not abort the run when only one engine is config-errored", async () => {
    const { ClaudeConfigError } = await vi.importActual<typeof import("@/lib/llm/claude")>("@/lib/llm/claude");
    generateGeminiVisibilityAnswer.mockResolvedValue(SUCCESS_RESPONSE);
    generateClaudeVisibilityAnswer.mockRejectedValue(new ClaudeConfigError("Missing ANTHROPIC_API_KEY"));

    const { service, supabase, scanPromptResultsTable, jobsTable } = buildClients({ promptJobMaxAttempts: 3 });
    serviceClientHolder.current = service;

    const { executePendingScan } = await import("./executor");
    await executePendingScan({ projectId: PROJECT_ID, runId: RUN_ID, supabase });

    expect(scanPromptResultsTable.inserted).toHaveLength(1);
    expect(scanPromptResultsTable.inserted[0].provider).toBe("gemini");

    const promptJob = jobsTable.jobs.find((j) => j.id === PROMPT_JOB_ID)!;
    expect(promptJob.status).toBe("completed");
  });

  it("aborts the run when every active engine is config-errored", async () => {
    const { GeminiConfigError } = await vi.importActual<typeof import("@/lib/llm/gemini")>("@/lib/llm/gemini");
    const { ClaudeConfigError } = await vi.importActual<typeof import("@/lib/llm/claude")>("@/lib/llm/claude");
    generateGeminiVisibilityAnswer.mockRejectedValue(new GeminiConfigError("Missing GEMINI_API_KEY"));
    generateClaudeVisibilityAnswer.mockRejectedValue(new ClaudeConfigError("Missing ANTHROPIC_API_KEY"));

    const { service, supabase } = buildClients({ promptJobMaxAttempts: 3 });
    serviceClientHolder.current = service;

    const { executePendingScan } = await import("./executor");
    await expect(executePendingScan({ projectId: PROJECT_ID, runId: RUN_ID, supabase })).rejects.toThrow();
  });

  it("skips engines that already have a result for this prompt (idempotent retry)", async () => {
    generateGeminiVisibilityAnswer.mockResolvedValue(SUCCESS_RESPONSE);
    generateClaudeVisibilityAnswer.mockResolvedValue(CLAUDE_SUCCESS_RESPONSE);

    const { service, supabase, scanPromptResultsTable } = buildClients({ promptJobMaxAttempts: 3 }, ["gemini"]);
    serviceClientHolder.current = service;

    const { executePendingScan } = await import("./executor");
    await executePendingScan({ projectId: PROJECT_ID, runId: RUN_ID, supabase });

    expect(generateGeminiVisibilityAnswer).not.toHaveBeenCalled();
    expect(generateClaudeVisibilityAnswer).toHaveBeenCalledTimes(1);
    expect(scanPromptResultsTable.inserted).toHaveLength(1);
    expect(scanPromptResultsTable.inserted[0].provider).toBe("claude");
  });

  it("SAMPLING-1: persists the sample_index its job carries", async () => {
    generateGeminiVisibilityAnswer.mockResolvedValue(SUCCESS_RESPONSE);
    generateClaudeVisibilityAnswer.mockResolvedValue(CLAUDE_SUCCESS_RESPONSE);

    const { service, supabase, scanPromptResultsTable } = buildClients({
      promptJobMaxAttempts: 3,
      promptJobSampleIndex: 2
    });
    serviceClientHolder.current = service;

    const { executePendingScan } = await import("./executor");
    await executePendingScan({ projectId: PROJECT_ID, runId: RUN_ID, supabase });

    expect(scanPromptResultsTable.inserted).toHaveLength(2);
    expect(scanPromptResultsTable.inserted.map((row) => row.sample_index)).toEqual([2, 2]);
  });

  it("SAMPLING-1: a job with no sample_index in its payload writes sample 0", async () => {
    // Jobs created before ADR 0030 have no sample_index. They are sample 0 —
    // the same value migration 0028 defaults their rows to — and must not
    // become NaN and break the insert.
    generateGeminiVisibilityAnswer.mockResolvedValue(SUCCESS_RESPONSE);
    generateClaudeVisibilityAnswer.mockResolvedValue(CLAUDE_SUCCESS_RESPONSE);

    const { service, supabase, scanPromptResultsTable } = buildClients({ promptJobMaxAttempts: 3 });
    serviceClientHolder.current = service;

    const { executePendingScan } = await import("./executor");
    await executePendingScan({ projectId: PROJECT_ID, runId: RUN_ID, supabase });

    expect(scanPromptResultsTable.inserted.map((row) => row.sample_index)).toEqual([0, 0]);
  });

  it("SAMPLING-1: an earlier sample's rows never make a later sample skip its calls", async () => {
    // The failure this pins down is silent and total: if the per-engine
    // idempotency check is not scoped to the sample, every repetition after
    // the first sees sample 0's rows, concludes there is nothing to do, and
    // completes without one LLM call. The run would report full success and
    // hold a third of the responses it claims — sampling would cost nothing
    // and do nothing, which is the worst possible way for this to break.
    generateGeminiVisibilityAnswer.mockResolvedValue(SUCCESS_RESPONSE);
    generateClaudeVisibilityAnswer.mockResolvedValue(CLAUDE_SUCCESS_RESPONSE);

    const { service, supabase, scanPromptResultsTable } = buildClients(
      { promptJobMaxAttempts: 3, promptJobSampleIndex: 1 },
      // Both engines already answered sample 0. Sample 1 has nothing.
      { 0: ["gemini", "claude"] }
    );
    serviceClientHolder.current = service;

    const { executePendingScan } = await import("./executor");
    await executePendingScan({ projectId: PROJECT_ID, runId: RUN_ID, supabase });

    expect(generateGeminiVisibilityAnswer).toHaveBeenCalledTimes(1);
    expect(generateClaudeVisibilityAnswer).toHaveBeenCalledTimes(1);
    expect(scanPromptResultsTable.inserted).toHaveLength(2);
    expect(scanPromptResultsTable.inserted.map((row) => row.sample_index)).toEqual([1, 1]);
  });

  it("SAMPLING-1: the idempotent-retry skip still applies within the same sample", async () => {
    // The other half of the invariant: scoping to the sample must not lose
    // the original guarantee that re-running a job never double-writes a row.
    generateGeminiVisibilityAnswer.mockResolvedValue(SUCCESS_RESPONSE);
    generateClaudeVisibilityAnswer.mockResolvedValue(CLAUDE_SUCCESS_RESPONSE);

    const { service, supabase, scanPromptResultsTable } = buildClients(
      { promptJobMaxAttempts: 3, promptJobSampleIndex: 1 },
      { 1: ["gemini"] }
    );
    serviceClientHolder.current = service;

    const { executePendingScan } = await import("./executor");
    await executePendingScan({ projectId: PROJECT_ID, runId: RUN_ID, supabase });

    expect(generateGeminiVisibilityAnswer).not.toHaveBeenCalled();
    expect(generateClaudeVisibilityAnswer).toHaveBeenCalledTimes(1);
    expect(scanPromptResultsTable.inserted).toHaveLength(1);
    expect(scanPromptResultsTable.inserted[0]).toMatchObject({ provider: "claude", sample_index: 1 });
  });

  it("PRICING-TRUTH-1 (PR b): caps a Free-plan project to 1 engine even with 2 configured", async () => {
    generateGeminiVisibilityAnswer.mockResolvedValue(SUCCESS_RESPONSE);
    generateClaudeVisibilityAnswer.mockResolvedValue(CLAUDE_SUCCESS_RESPONSE);

    const { service, supabase, scanPromptResultsTable } = buildClients({ promptJobMaxAttempts: 3, ownerPlan: "free" });
    serviceClientHolder.current = service;

    const { executePendingScan } = await import("./executor");
    await executePendingScan({ projectId: PROJECT_ID, runId: RUN_ID, supabase });

    // LLM_SCAN_PROVIDERS="gemini,claude" preserves that order; Free's
    // caps.engines (1) keeps only the first — Gemini, never called for
    // Claude, and only one result row.
    expect(generateGeminiVisibilityAnswer).toHaveBeenCalledTimes(1);
    expect(generateClaudeVisibilityAnswer).not.toHaveBeenCalled();
    expect(scanPromptResultsTable.inserted).toHaveLength(1);
    expect(scanPromptResultsTable.inserted[0].provider).toBe("gemini");
  });

  it("PRICING-TRUTH-1 (PR b): keeps both engines for a Starter-plan project", async () => {
    generateGeminiVisibilityAnswer.mockResolvedValue(SUCCESS_RESPONSE);
    generateClaudeVisibilityAnswer.mockResolvedValue(CLAUDE_SUCCESS_RESPONSE);

    const { service, supabase, scanPromptResultsTable } = buildClients({
      promptJobMaxAttempts: 3,
      ownerPlan: "starter"
    });
    serviceClientHolder.current = service;

    const { executePendingScan } = await import("./executor");
    await executePendingScan({ projectId: PROJECT_ID, runId: RUN_ID, supabase });

    expect(generateGeminiVisibilityAnswer).toHaveBeenCalledTimes(1);
    expect(generateClaudeVisibilityAnswer).toHaveBeenCalledTimes(1);
    expect(scanPromptResultsTable.inserted).toHaveLength(2);
  });

  it("ENGINES-2a real-world test: a Starter-plan project picks up openai once LLM_SCAN_PROVIDERS lists it (caps.engines=3)", async () => {
    process.env.LLM_SCAN_PROVIDERS = "gemini,claude,openai";
    generateGeminiVisibilityAnswer.mockResolvedValue(SUCCESS_RESPONSE);
    generateClaudeVisibilityAnswer.mockResolvedValue(CLAUDE_SUCCESS_RESPONSE);
    generateOpenAIVisibilityAnswer.mockResolvedValue({
      ...SUCCESS_RESPONSE,
      groundingChunks: [{ uri: "https://example.com/page", title: "Example" }]
    });

    const { service, supabase, scanPromptResultsTable } = buildClients({
      promptJobMaxAttempts: 3,
      ownerPlan: "starter"
    });
    serviceClientHolder.current = service;

    const { executePendingScan } = await import("./executor");
    await executePendingScan({ projectId: PROJECT_ID, runId: RUN_ID, supabase });

    expect(generateOpenAIVisibilityAnswer).toHaveBeenCalledTimes(1);
    expect(scanPromptResultsTable.inserted.map((row) => row.provider).sort()).toEqual(["claude", "gemini", "openai"]);
  });
});

describe("executePendingScan — recommendation history across runs (RECS-3)", () => {
  beforeEach(() => {
    generateGeminiVisibilityAnswer.mockReset();
    generateGeminiVisibilityAnswer.mockResolvedValue(SUCCESS_RESPONSE);
  });

  const PREVIOUS_RUN_ID = "55555555-5555-5555-5555-555555555555";

  it("marks a gap that did not recur as 'resolved' (not 'superseded'), and carries forward + increments consecutive_runs_open for a recurring gap", async () => {
    vi.mocked(generateRecommendationsForRun).mockReturnValueOnce([
      {
        priority_rank: 1,
        title: "Te mencionan pero no citan tu dominio",
        description: "desc",
        rule_id: "rule_citations_001",
        recommendation_type: "add_citation_block",
        impact: "medium",
        effort: "low",
        confidence: "high",
        source_type: "rule",
        evidence_json: {},
        dedupe_key: "add_citation_block:p1"
      } as unknown as ReturnType<typeof generateRecommendationsForRun>[number]
    ]);

    const { service, supabase, recommendationsTable } = buildClients({
      promptJobMaxAttempts: 3,
      previousRunId: PREVIOUS_RUN_ID,
      previousRecommendationRows: [
        {
          id: "old-recurring",
          run_id: PREVIOUS_RUN_ID,
          project_id: PROJECT_ID,
          status: "active",
          dedupe_key: "add_citation_block:p1",
          consecutive_runs_open: 2,
          resolved_in_run_id: null
        },
        {
          id: "old-resolved",
          run_id: PREVIOUS_RUN_ID,
          project_id: PROJECT_ID,
          status: "active",
          dedupe_key: "increase_brand_visibility:p2",
          consecutive_runs_open: 1,
          resolved_in_run_id: null
        }
      ]
    });
    serviceClientHolder.current = service;

    const { executePendingScan } = await import("./executor");
    await executePendingScan({ projectId: PROJECT_ID, runId: RUN_ID, supabase });

    const resolvedRow = recommendationsTable.rows.find((r) => r.id === "old-resolved")!;
    expect(resolvedRow.status).toBe("resolved");
    expect(resolvedRow.resolved_in_run_id).toBe(RUN_ID);

    const supersededRow = recommendationsTable.rows.find((r) => r.id === "old-recurring")!;
    expect(supersededRow.status).toBe("superseded");

    expect(recommendationsTable.insertedRows).toHaveLength(1);
    const newRow = recommendationsTable.insertedRows[0];
    expect(newRow.dedupe_key).toBe("add_citation_block:p1");
    expect(newRow.run_id).toBe(RUN_ID);
    expect(newRow.status).toBe("active");
    expect(newRow.consecutive_runs_open).toBe(3);
  });

  it("starts a brand-new gap (no previous run) at consecutive_runs_open = 1 and resolves nothing", async () => {
    vi.mocked(generateRecommendationsForRun).mockReturnValueOnce([
      {
        priority_rank: 1,
        title: "Nuevo gap",
        description: "desc",
        rule_id: "rule_visibility_001",
        recommendation_type: "increase_brand_visibility",
        impact: "medium",
        effort: "medium",
        confidence: "high",
        source_type: "rule",
        evidence_json: {},
        dedupe_key: "increase_brand_visibility:p1"
      } as unknown as ReturnType<typeof generateRecommendationsForRun>[number]
    ]);

    const { service, supabase, recommendationsTable } = buildClients({ promptJobMaxAttempts: 3 });
    serviceClientHolder.current = service;

    const { executePendingScan } = await import("./executor");
    await executePendingScan({ projectId: PROJECT_ID, runId: RUN_ID, supabase });

    expect(recommendationsTable.rows.filter((r) => r.status === "resolved")).toHaveLength(0);
    expect(recommendationsTable.insertedRows).toHaveLength(1);
    expect(recommendationsTable.insertedRows[0].consecutive_runs_open).toBe(1);
  });

  it("persists every recommendation the engine returns with no separate cap here, and never resolves a gap still present this run (RECS-CAP-REMOVE regression)", async () => {
    // 15 rows — more than the old recommendation-engine.ts cap of 10 — to prove
    // executor.ts has no cap of its own hiding in the insert/transition path.
    // One dedupe_key (gap-000) also existed last run: it must be superseded
    // (carried forward), never falsely 'resolved', now that it's guaranteed to
    // still be present in a run this large.
    const currentRecs = Array.from({ length: 15 }, (_, i) => ({
      priority_rank: i + 1,
      title: `Gap ${i}`,
      description: "desc",
      rule_id: "rule_visibility_001",
      recommendation_type: "increase_brand_visibility",
      impact: "medium",
      effort: "medium",
      confidence: "high",
      source_type: "rule",
      evidence_json: {},
      dedupe_key: `gap-${String(i).padStart(3, "0")}`
    })) as unknown as ReturnType<typeof generateRecommendationsForRun>;
    vi.mocked(generateRecommendationsForRun).mockReturnValueOnce(currentRecs);

    const { service, supabase, recommendationsTable } = buildClients({
      promptJobMaxAttempts: 3,
      previousRunId: PREVIOUS_RUN_ID,
      previousRecommendationRows: [
        {
          id: "old-still-open",
          run_id: PREVIOUS_RUN_ID,
          project_id: PROJECT_ID,
          status: "active",
          dedupe_key: "gap-000",
          consecutive_runs_open: 1,
          resolved_in_run_id: null
        },
        {
          id: "old-genuinely-fixed",
          run_id: PREVIOUS_RUN_ID,
          project_id: PROJECT_ID,
          status: "active",
          dedupe_key: "gap-not-recurring",
          consecutive_runs_open: 1,
          resolved_in_run_id: null
        }
      ]
    });
    serviceClientHolder.current = service;

    const { executePendingScan } = await import("./executor");
    await executePendingScan({ projectId: PROJECT_ID, runId: RUN_ID, supabase });

    expect(recommendationsTable.insertedRows).toHaveLength(15);

    const stillOpenRow = recommendationsTable.rows.find((r) => r.id === "old-still-open")!;
    expect(stillOpenRow.status).toBe("superseded");

    const genuinelyFixedRow = recommendationsTable.rows.find((r) => r.id === "old-genuinely-fixed")!;
    expect(genuinelyFixedRow.status).toBe("resolved");
    expect(genuinelyFixedRow.resolved_in_run_id).toBe(RUN_ID);
  });
});

describe("executePendingScan — recommendation delete/insert durability (RECS-FINALIZE-DURABILITY-1)", () => {
  beforeEach(() => {
    generateGeminiVisibilityAnswer.mockReset();
    generateGeminiVisibilityAnswer.mockResolvedValue(SUCCESS_RESPONSE);
    vi.mocked(generateRecommendationsForRun).mockReturnValueOnce([
      {
        priority_rank: 1,
        title: "Te mencionan pero no citan tu dominio",
        description: "desc",
        rule_id: "rule_citations_001",
        recommendation_type: "add_citation_block",
        impact: "medium",
        effort: "low",
        confidence: "high",
        source_type: "rule",
        evidence_json: {},
        dedupe_key: "add_citation_block:p1"
      } as unknown as ReturnType<typeof generateRecommendationsForRun>[number]
    ]);
  });

  it("logs and skips the insert when clearing this run's prior recommendations fails, instead of duplicating the backlog", async () => {
    const { service, supabase, recommendationsTable, jobLogsTable } = buildClients({
      promptJobMaxAttempts: 3,
      recommendationsDeleteError: "connection reset"
    });
    serviceClientHolder.current = service;

    const { executePendingScan } = await import("./executor");
    // Fail-soft: a delete failure must not sink the scan.
    await expect(executePendingScan({ projectId: PROJECT_ID, runId: RUN_ID, supabase })).resolves.not.toThrow();

    // Nothing inserted on top of the rows the failed delete left untouched —
    // this is the whole point: a naive "insert regardless" would duplicate
    // the backlog instead.
    expect(recommendationsTable.insertedRows).toHaveLength(0);

    const errorLog = jobLogsTable.inserted.find(
      (row) => row.level === "error" && String(row.message).includes("clear this run's prior active recommendation")
    );
    expect(errorLog).toBeDefined();
    expect(errorLog?.run_id).toBe(RUN_ID);
    expect((errorLog?.context_json as Record<string, unknown>)?.message).toBe("connection reset");
  });

  it("logs when inserting this run's fresh recommendations fails, leaving the run with zero recommendations rather than a silent gap", async () => {
    const { service, supabase, recommendationsTable, jobLogsTable } = buildClients({
      promptJobMaxAttempts: 3,
      recommendationsInsertError: "constraint violation"
    });
    serviceClientHolder.current = service;

    const { executePendingScan } = await import("./executor");
    await expect(executePendingScan({ projectId: PROJECT_ID, runId: RUN_ID, supabase })).resolves.not.toThrow();

    // The delete succeeded (no prior rows existed to fail on); the insert did
    // not, so nothing landed for this run.
    expect(recommendationsTable.insertedRows).toHaveLength(0);
    expect(recommendationsTable.rows.find((r) => r.run_id === RUN_ID)).toBeUndefined();

    const errorLog = jobLogsTable.inserted.find(
      (row) => row.level === "error" && String(row.message).includes("insert this run's recommendation rows")
    );
    expect(errorLog).toBeDefined();
    expect(errorLog?.run_id).toBe(RUN_ID);
    expect((errorLog?.context_json as Record<string, unknown>)?.message).toBe("constraint violation");
    expect((errorLog?.context_json as Record<string, unknown>)?.attempted).toBe(1);
  });
});

describe("executePendingScan — notifications (NOTIF-SERVER-1a)", () => {
  beforeEach(() => {
    generateGeminiVisibilityAnswer.mockReset();
    generateGeminiVisibilityAnswer.mockResolvedValue(SUCCESS_RESPONSE);
    vi.mocked(generateRecommendationsForRun).mockClear().mockReturnValue([]);
  });

  const PREVIOUS_RUN_ID = "77777777-7777-7777-7777-777777777777";

  it("emits scan_completed, keyed to this run's own id, once the run is marked completed", async () => {
    const { service, supabase, notificationsTable } = buildClients({ promptJobMaxAttempts: 3 });
    serviceClientHolder.current = service;

    const { executePendingScan } = await import("./executor");
    await executePendingScan({ projectId: PROJECT_ID, runId: RUN_ID, supabase });

    const scanCompleted = notificationsTable.calls.filter((c) => c.type === "scan_completed");
    expect(scanCompleted).toHaveLength(1);
    expect(scanCompleted[0]).toMatchObject({
      owner_user_id: OWNER_ID,
      project_id: PROJECT_ID,
      severity: "success",
      dedupe_key: `scan_completed:${RUN_ID}`
    });
    expect(scanCompleted[0].payload_json).toMatchObject({ runId: RUN_ID, promptsProcessed: 1 });
  });

  /**
   * TRUST-METRICS-1 (docs/external-audit-2026-08.md, Fase 1) — the audit's
   * exact P0-01 divergence, reproduced and closed: a windowed median (8) that
   * differs from this run's own raw visibility_score (2) must reach the
   * notification payload as `geoScore`, never silently collapsed to the raw
   * value under a "Puntuación GEO" label.
   */
  it("resolves geoScore from the windowed median across comparable runs, not the raw visibility_score", async () => {
    const { service, supabase, notificationsTable } = buildClients({
      promptJobMaxAttempts: 3,
      scoreWindowRows: [
        {
          run_id: RUN_ID,
          created_at: "2026-08-27T00:00:00.000Z",
          visibility_score: 2,
          details_json: { total_results: 45, geo_score: { score: 10, composite_version: "v4", inputs_used: ["visibility"] } }
        },
        {
          run_id: PREVIOUS_RUN_ID,
          created_at: "2026-08-26T00:00:00.000Z",
          visibility_score: 2,
          details_json: { total_results: 45, geo_score: { score: 6, composite_version: "v4", inputs_used: ["visibility"] } }
        }
      ]
    });
    serviceClientHolder.current = service;

    const { executePendingScan } = await import("./executor");
    await executePendingScan({ projectId: PROJECT_ID, runId: RUN_ID, supabase });

    const scanCompleted = notificationsTable.calls.filter((c) => c.type === "scan_completed");
    expect(scanCompleted[0].payload_json).toMatchObject({ geoScore: 8 }); // median(10, 6)
    expect((scanCompleted[0].payload_json as { geoScore: number }).geoScore).not.toBe(2);
  });

  it("falls back to this run's own composite when fewer than two comparable runs exist (no run_scores rows seeded)", async () => {
    const { service, supabase, notificationsTable } = buildClients({ promptJobMaxAttempts: 3 });
    serviceClientHolder.current = service;

    const { executePendingScan } = await import("./executor");
    await executePendingScan({ projectId: PROJECT_ID, runId: RUN_ID, supabase });

    const scanCompleted = notificationsTable.calls.filter((c) => c.type === "scan_completed");
    const payload = scanCompleted[0].payload_json as { geoScore: number; visibilityScore: number };
    expect(payload.geoScore).toBe(Math.round(payload.visibilityScore));
  });

  it("emits scan_failed when no jobs exist for the run (the non-catch-block failure path)", async () => {
    const { supabase } = buildClients({ promptJobMaxAttempts: 3 });
    const notificationsTable = makeNotificationsTable();
    const service = {
      from(table: string) {
        if (table === "jobs") {
          return {
            select: () => ({
              eq: () => ({ eq: () => ({ order: () => Promise.resolve({ data: [], error: null }) }) })
            })
          };
        }
        if (table === "notifications") return notificationsTable.table;
        return noopTable();
      }
    } as unknown as ServiceClient;
    serviceClientHolder.current = service;

    const { executePendingScan } = await import("./executor");
    await expect(executePendingScan({ projectId: PROJECT_ID, runId: RUN_ID, supabase })).rejects.toThrow();

    expect(notificationsTable.calls).toHaveLength(1);
    expect(notificationsTable.calls[0]).toMatchObject({
      type: "scan_failed",
      owner_user_id: OWNER_ID,
      dedupe_key: `scan_failed:${RUN_ID}`
    });
    expect(notificationsTable.calls[0].payload_json.errorSummary).toBe("No se han encontrado jobs para el escaneo.");
  });

  it("emits scan_failed via the generic catch-all path (e.g. a terminal GeminiConfigError)", async () => {
    const { GeminiConfigError } = await vi.importActual<typeof import("@/lib/llm/gemini")>("@/lib/llm/gemini");
    generateGeminiVisibilityAnswer.mockRejectedValue(new GeminiConfigError("Missing GEMINI_API_KEY"));

    const { service, supabase, notificationsTable } = buildClients({ promptJobMaxAttempts: 3 });
    serviceClientHolder.current = service;

    const { executePendingScan } = await import("./executor");
    await expect(executePendingScan({ projectId: PROJECT_ID, runId: RUN_ID, supabase })).rejects.toThrow();

    const scanFailed = notificationsTable.calls.filter((c) => c.type === "scan_failed");
    expect(scanFailed).toHaveLength(1);
    expect(scanFailed[0].dedupe_key).toBe(`scan_failed:${RUN_ID}`);
  });

  it("aggregates every gap resolved this run into a single gap_resolved notification, not one per gap", async () => {
    // Current run's engine output no longer contains any of the 3
    // previously-open gaps, so all 3 resolve in the same run.
    vi.mocked(generateRecommendationsForRun).mockReturnValueOnce([]);

    const { service, supabase, notificationsTable } = buildClients({
      promptJobMaxAttempts: 3,
      previousRunId: PREVIOUS_RUN_ID,
      previousRecommendationRows: [
        {
          id: "r1",
          run_id: PREVIOUS_RUN_ID,
          project_id: PROJECT_ID,
          status: "active",
          dedupe_key: "gap-a",
          consecutive_runs_open: 1,
          resolved_in_run_id: null,
          title: "Cierra brecha A"
        },
        {
          id: "r2",
          run_id: PREVIOUS_RUN_ID,
          project_id: PROJECT_ID,
          status: "active",
          dedupe_key: "gap-b",
          consecutive_runs_open: 1,
          resolved_in_run_id: null,
          title: "Cierra brecha B"
        },
        {
          id: "r3",
          run_id: PREVIOUS_RUN_ID,
          project_id: PROJECT_ID,
          status: "active",
          dedupe_key: "gap-c",
          consecutive_runs_open: 1,
          resolved_in_run_id: null,
          title: "Cierra brecha C"
        }
      ]
    });
    serviceClientHolder.current = service;

    const { executePendingScan } = await import("./executor");
    await executePendingScan({ projectId: PROJECT_ID, runId: RUN_ID, supabase });

    const resolved = notificationsTable.calls.filter((c) => c.type === "gap_resolved");
    expect(resolved).toHaveLength(1);
    expect(resolved[0].dedupe_key).toBe(`gap_resolved:${RUN_ID}`);
    expect(resolved[0].payload_json).toMatchObject({ runId: RUN_ID, count: 3 });
    expect((resolved[0].payload_json.sampleTitles as string[]).length).toBeLessThanOrEqual(3);
  });

  it("emits gap_pending exactly when a gap crosses 3 consecutive open runs", async () => {
    vi.mocked(generateRecommendationsForRun).mockReturnValueOnce([
      {
        priority_rank: 1,
        title: "Recupera terreno frente a Orange",
        description: "desc",
        rule_id: "rule_competitor_gap_001",
        recommendation_type: "close_competitor_gap",
        impact: "high",
        effort: "medium",
        confidence: "high",
        source_type: "rule",
        evidence_json: {},
        dedupe_key: "close_competitor_gap:orange"
      } as unknown as ReturnType<typeof generateRecommendationsForRun>[number]
    ]);

    const { service, supabase, notificationsTable } = buildClients({
      promptJobMaxAttempts: 3,
      previousRunId: PREVIOUS_RUN_ID,
      previousRecommendationRows: [
        {
          id: "r1",
          run_id: PREVIOUS_RUN_ID,
          project_id: PROJECT_ID,
          status: "active",
          dedupe_key: "close_competitor_gap:orange",
          consecutive_runs_open: 2,
          resolved_in_run_id: null,
          title: "Recupera terreno frente a Orange"
        }
      ]
    });
    serviceClientHolder.current = service;

    const { executePendingScan } = await import("./executor");
    await executePendingScan({ projectId: PROJECT_ID, runId: RUN_ID, supabase });

    const pending = notificationsTable.calls.filter((c) => c.type === "gap_pending");
    expect(pending).toHaveLength(1);
    expect(pending[0].dedupe_key).toBe(`gap_pending:${PROJECT_ID}:close_competitor_gap:orange`);
    expect(pending[0].payload_json).toMatchObject({ consecutiveRuns: 3, impact: "high" });
  });

  it("does not re-emit gap_pending once a gap is already past the crossing run (consecutive_runs_open going 3 -> 4)", async () => {
    vi.mocked(generateRecommendationsForRun).mockReturnValueOnce([
      {
        priority_rank: 1,
        title: "Recupera terreno frente a Orange",
        description: "desc",
        rule_id: "rule_competitor_gap_001",
        recommendation_type: "close_competitor_gap",
        impact: "high",
        effort: "medium",
        confidence: "high",
        source_type: "rule",
        evidence_json: {},
        dedupe_key: "close_competitor_gap:orange"
      } as unknown as ReturnType<typeof generateRecommendationsForRun>[number]
    ]);

    const { service, supabase, notificationsTable } = buildClients({
      promptJobMaxAttempts: 3,
      previousRunId: PREVIOUS_RUN_ID,
      previousRecommendationRows: [
        {
          id: "r1",
          run_id: PREVIOUS_RUN_ID,
          project_id: PROJECT_ID,
          status: "active",
          dedupe_key: "close_competitor_gap:orange",
          consecutive_runs_open: 3,
          resolved_in_run_id: null,
          title: "Recupera terreno frente a Orange"
        }
      ]
    });
    serviceClientHolder.current = service;

    const { executePendingScan } = await import("./executor");
    await executePendingScan({ projectId: PROJECT_ID, runId: RUN_ID, supabase });

    expect(notificationsTable.calls.filter((c) => c.type === "gap_pending")).toHaveLength(0);
  });

  it("emits at most one gap_pending when two gaps cross the threshold together, preferring the higher-impact one", async () => {
    vi.mocked(generateRecommendationsForRun).mockReturnValueOnce([
      {
        priority_rank: 1,
        title: "Gap de impacto medio",
        description: "desc",
        rule_id: "rule_visibility_001",
        recommendation_type: "increase_brand_visibility",
        impact: "medium",
        effort: "medium",
        confidence: "high",
        source_type: "rule",
        evidence_json: {},
        dedupe_key: "gap-medium"
      } as unknown as ReturnType<typeof generateRecommendationsForRun>[number],
      {
        priority_rank: 2,
        title: "Gap de impacto alto",
        description: "desc",
        rule_id: "rule_competitor_gap_001",
        recommendation_type: "close_competitor_gap",
        impact: "high",
        effort: "medium",
        confidence: "high",
        source_type: "rule",
        evidence_json: {},
        dedupe_key: "gap-high"
      } as unknown as ReturnType<typeof generateRecommendationsForRun>[number]
    ]);

    const { service, supabase, notificationsTable } = buildClients({
      promptJobMaxAttempts: 3,
      previousRunId: PREVIOUS_RUN_ID,
      previousRecommendationRows: [
        {
          id: "r1",
          run_id: PREVIOUS_RUN_ID,
          project_id: PROJECT_ID,
          status: "active",
          dedupe_key: "gap-medium",
          consecutive_runs_open: 2,
          resolved_in_run_id: null,
          title: "Gap de impacto medio"
        },
        {
          id: "r2",
          run_id: PREVIOUS_RUN_ID,
          project_id: PROJECT_ID,
          status: "active",
          dedupe_key: "gap-high",
          consecutive_runs_open: 2,
          resolved_in_run_id: null,
          title: "Gap de impacto alto"
        }
      ]
    });
    serviceClientHolder.current = service;

    const { executePendingScan } = await import("./executor");
    await executePendingScan({ projectId: PROJECT_ID, runId: RUN_ID, supabase });

    const pending = notificationsTable.calls.filter((c) => c.type === "gap_pending");
    expect(pending).toHaveLength(1);
    expect(pending[0].dedupe_key).toBe(`gap_pending:${PROJECT_ID}:gap-high`);
  });

  it("resolves the notification owner from the project, never from the run — the field the cron path leaves null", async () => {
    // buildClients' scan_runs fake never returns triggered_by_user_id at all
    // (only id/project_id/status/total_prompts), which is structurally
    // identical to a cron-triggered run, where that column is genuinely null
    // (0008_recurring_scans.sql). If emission ever started reading it, this
    // test would have nothing to read and would fail loudly instead of
    // silently dropping the notification the way the real cron path would.
    const { service, supabase, notificationsTable } = buildClients({ promptJobMaxAttempts: 3 });
    serviceClientHolder.current = service;

    const { executePendingScan } = await import("./executor");
    await executePendingScan({ projectId: PROJECT_ID, runId: RUN_ID, supabase });

    expect(notificationsTable.calls.length).toBeGreaterThan(0);
    for (const call of notificationsTable.calls) {
      expect(call.owner_user_id).toBe(OWNER_ID);
    }
  });

  it("a notification emission failure never changes the run's own completed outcome", async () => {
    const { service, supabase, jobsTable } = buildClients({
      promptJobMaxAttempts: 3,
      notificationsBehavior: "throws"
    });
    serviceClientHolder.current = service;

    const { executePendingScan } = await import("./executor");
    await executePendingScan({ projectId: PROJECT_ID, runId: RUN_ID, supabase });

    const finalizeJob = jobsTable.jobs.find((j) => j.id === "finalize-job")!;
    expect(finalizeJob.status).toBe("completed");
  });
});

describe("executePendingScan — multi-batch campaigns (SCAN-CHAIN-1)", () => {
  const ORIGINAL_SCAN_CONTINUE_SECRET = process.env.SCAN_CONTINUE_SECRET;
  const CAMPAIGN_RUN_ID = "66666666-6666-6666-6666-666666666666";

  type CampaignRunState = {
    id: string;
    project_id: string;
    status: string;
    total_prompts: number;
    successful_prompts: number;
    failed_prompts: number;
  };

  /**
   * A genuinely stateful `scan_runs` single-row fake (unlike `makeScanRunsTable`,
   * which always reports a hardcoded "pending" run — fine for the single-batch
   * tests above, which only ever call `executePendingScan` once, but wrong here
   * since these tests call it multiple times in sequence against the *same*
   * campaign and must see its real status/counters evolve between calls.
   */
  function makeCampaignScanRunsTable(state: CampaignRunState) {
    let sawNeq = false;
    const builder: Record<string, unknown> = {
      eq: () => builder,
      neq: () => {
        sawNeq = true;
        return builder;
      },
      order: () => builder,
      limit: () => builder,
      update: (patch: Partial<CampaignRunState>) => {
        Object.assign(state, patch);
        return builder;
      },
      select: () => builder,
      maybeSingle: () => {
        const wasNeq = sawNeq;
        sawNeq = false;
        // wasNeq => RECS-3's "find the immediately preceding completed run"
        // lookup; there is none in these tests (first campaign for the project).
        return Promise.resolve(wasNeq ? { data: null, error: null } : { data: { id: state.id }, error: null });
      },
      then: (resolve: (value: { data: unknown[]; error: null }) => unknown) =>
        Promise.resolve({ data: [], error: null }).then(resolve)
    };
    return builder;
  }

  function buildCampaignClients({ promptCount }: { promptCount: number }) {
    const state: CampaignRunState = {
      id: CAMPAIGN_RUN_ID,
      project_id: PROJECT_ID,
      status: "pending",
      total_prompts: promptCount,
      successful_prompts: 0,
      failed_prompts: 0
    };

    const promptJobs = Array.from({ length: promptCount }, (_, i) => ({
      id: `campaign-prompt-job-${i}`,
      project_id: PROJECT_ID,
      run_id: CAMPAIGN_RUN_ID,
      job_type: "scan_prompt",
      status: "pending",
      attempt_count: 0,
      max_attempts: 3,
      payload_json: { prompt_id: `campaign-prompt-${i}`, prompt_text: `Prompt número ${i}` },
      last_error: null,
      created_at: `2026-06-13T10:00:${String(i).padStart(2, "0")}.000Z`
    }));

    const jobsTable = makeJobsTable([
      {
        id: "campaign-start-job",
        project_id: PROJECT_ID,
        run_id: CAMPAIGN_RUN_ID,
        job_type: "scan_start",
        status: "pending",
        attempt_count: 0,
        max_attempts: 3,
        payload_json: {},
        last_error: null,
        created_at: "2026-06-13T09:59:59.000Z"
      },
      ...promptJobs,
      {
        id: "campaign-finalize-job",
        project_id: PROJECT_ID,
        run_id: CAMPAIGN_RUN_ID,
        job_type: "scan_finalize",
        status: "pending",
        attempt_count: 0,
        max_attempts: 3,
        payload_json: {},
        last_error: null,
        created_at: "2026-06-13T10:59:59.000Z"
      }
    ]);

    const scanRunsTable = makeCampaignScanRunsTable(state);
    const scanPromptResultsTable = makeScanPromptResultsTable();
    const recommendationsTable = makeRecommendationsTable();

    const service = {
      from(table: string) {
        if (table === "jobs") return jobsTable.table;
        if (table === "scan_runs") return scanRunsTable;
        if (table === "scan_prompt_results") return scanPromptResultsTable.table;
        if (table === "recommendations") return recommendationsTable.table;
        return noopTable();
      }
    } as unknown as ServiceClient;

    const supabase = {
      from(table: string) {
        if (table === "scan_runs") {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  single: () =>
                    Promise.resolve({
                      data: {
                        id: state.id,
                        project_id: state.project_id,
                        status: state.status,
                        total_prompts: state.total_prompts
                      },
                      error: null
                    })
                })
              })
            })
          };
        }
        if (table === "projects") {
          return {
            select: () => ({
              eq: () => ({
                single: () =>
                  Promise.resolve({
                    data: { id: PROJECT_ID, domain: "acme.com", brand: "Acme", country: "ES", language: "es" },
                    error: null
                  })
              })
            })
          };
        }
        if (table === "project_competitors") {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  order: () => Promise.resolve({ data: [], error: null })
                })
              })
            })
          };
        }
        return noopTable();
      }
    } as unknown as SupabaseClient;

    return { state, service, supabase, jobsTable, scanPromptResultsTable };
  }

  beforeEach(() => {
    generateGeminiVisibilityAnswer.mockReset();
    generateGeminiVisibilityAnswer.mockResolvedValue(SUCCESS_RESPONSE);
    vi.mocked(runStructuredExtractionForRun).mockClear();
    vi.mocked(generateRecommendationsForRun).mockClear().mockReturnValue([]);
    process.env.SCAN_CONTINUE_SECRET = "test-continue-secret";
  });

  afterEach(() => {
    if (ORIGINAL_SCAN_CONTINUE_SECRET === undefined) {
      delete process.env.SCAN_CONTINUE_SECRET;
    } else {
      process.env.SCAN_CONTINUE_SECRET = ORIGINAL_SCAN_CONTINUE_SECRET;
    }
    vi.unstubAllGlobals();
  });

  it("processes only MAX_REAL_SCAN_PROMPTS jobs per invocation and schedules a continuation via after() when more remain", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const { service, supabase, state, jobsTable } = buildCampaignClients({ promptCount: 12 });
    serviceClientHolder.current = service;

    const { MAX_REAL_SCAN_PROMPTS } = await import("./constants");
    const { executePendingScan } = await import("./executor");
    await executePendingScan({ projectId: PROJECT_ID, runId: CAMPAIGN_RUN_ID, supabase });

    const promptJobs = jobsTable.jobs.filter((j) => j.job_type === "scan_prompt");
    const completed = promptJobs.filter((j) => j.status === "completed");
    const stillPending = promptJobs.filter((j) => j.status === "pending");

    expect(completed).toHaveLength(MAX_REAL_SCAN_PROMPTS);
    expect(stillPending).toHaveLength(12 - MAX_REAL_SCAN_PROMPTS);
    expect(generateGeminiVisibilityAnswer).toHaveBeenCalledTimes(MAX_REAL_SCAN_PROMPTS);

    // Campaign is not finalized yet — scoring/recommendations and the
    // scan_finalize job must wait for the batch that clears the queue.
    expect(state.status).toBe("running");
    // EXTRACTION-RELIABILITY-1: extraction, on the other hand, now runs on
    // every batch, against the rows that batch just produced. Deferring all
    // of it to the finalize pass is what forced the old 20-row cap and made
    // a third of a 30-row run's answers unreachable (docs/adr/0029).
    expect(vi.mocked(runStructuredExtractionForRun)).toHaveBeenCalledTimes(1);
    const finalizeJob = jobsTable.jobs.find((j) => j.id === "campaign-finalize-job")!;
    expect(finalizeJob.status).toBe("pending");

    // The next batch was scheduled without the caller (this test's own
    // `await executePendingScan(...)`) having to wait for it.
    expect(afterMock).toHaveBeenCalledTimes(1);
    await afterMock.mock.calls[0][0]();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain("/api/scan/continue");
    expect(JSON.parse(init.body as string)).toEqual({ projectId: PROJECT_ID, runId: CAMPAIGN_RUN_ID });
    expect(init.headers.Authorization).toBe("Bearer test-continue-secret");
  });

  it("a second invocation finishes the remaining batch and finalizes exactly once, with campaign-wide (not per-batch) counters", async () => {
    const { service, supabase, state, jobsTable } = buildCampaignClients({ promptCount: 12 });
    serviceClientHolder.current = service;

    const { executePendingScan } = await import("./executor");

    // First batch (10 of 12), mirroring the manual "Lanzar escaneo" action.
    await executePendingScan({ projectId: PROJECT_ID, runId: CAMPAIGN_RUN_ID, supabase });
    afterMock.mockClear();
    // Second batch (the remaining 2), mirroring /api/scan/continue's own call.
    await executePendingScan({ projectId: PROJECT_ID, runId: CAMPAIGN_RUN_ID, supabase });

    const promptJobs = jobsTable.jobs.filter((j) => j.job_type === "scan_prompt");
    expect(promptJobs.every((j) => j.status === "completed")).toBe(true);
    expect(generateGeminiVisibilityAnswer).toHaveBeenCalledTimes(12);

    expect(state.status).toBe("completed");
    expect(state.successful_prompts).toBe(12);
    expect(state.failed_prompts).toBe(0);

    const finalizeJob = jobsTable.jobs.find((j) => j.id === "campaign-finalize-job")!;
    expect(finalizeJob.status).toBe("completed");

    // Scoring/recommendations run exactly once for the whole campaign, on the
    // final batch — not once per batch. Extraction runs three times across
    // this two-invocation campaign (EXTRACTION-RELIABILITY-1): once per batch
    // for the rows that batch produced, plus the finalize sweep that catches
    // anything an earlier batch's pass could not reach.
    expect(vi.mocked(runStructuredExtractionForRun)).toHaveBeenCalledTimes(3);
    expect(vi.mocked(generateRecommendationsForRun)).toHaveBeenCalledTimes(1);

    // The second invocation had nothing left to batch, so it must not have
    // scheduled a further continuation.
    expect(afterMock).not.toHaveBeenCalled();
  });

  it("a racing duplicate invocation over the same batch is a no-op (claim is exclusive)", async () => {
    const { service, supabase, state, jobsTable } = buildCampaignClients({ promptCount: 3 });
    serviceClientHolder.current = service;

    // Simulate another invocation already having started this campaign
    // (pending -> running, scan_start completed) and having claimed every
    // scan_prompt job an instant before this invocation's own claim attempt
    // — the realistic shape of the race, since a run only ever reaches
    // "prompt jobs claimed" after its own pending -> running transition.
    state.status = "running";
    for (const job of jobsTable.jobs) {
      if (job.job_type === "scan_start") job.status = "completed";
      if (job.job_type === "scan_prompt") job.status = "running";
    }

    const { executePendingScan } = await import("./executor");
    await executePendingScan({ projectId: PROJECT_ID, runId: CAMPAIGN_RUN_ID, supabase });

    // This invocation claimed nothing (every candidate was already `running`,
    // not `pending`), and the campaign still has unfinished work in flight
    // elsewhere, so it must not have called the LLM, must not have
    // scheduled a redundant continuation, and must not have finalized.
    expect(generateGeminiVisibilityAnswer).not.toHaveBeenCalled();
    expect(afterMock).not.toHaveBeenCalled();
    expect(state.status).toBe("running");
    expect(vi.mocked(runStructuredExtractionForRun)).not.toHaveBeenCalled();
    const finalizeJob = jobsTable.jobs.find((j) => j.id === "campaign-finalize-job")!;
    expect(finalizeJob.status).toBe("pending");
  });

  /**
   * Regression: the 2026-08-07 genscore.es failure (docs/adr/0037). Two runs
   * of 31 prompts, 50 real answers generated, both `Fallido` — and every
   * unfinished job left `pending`, not `running`. Nothing had crashed; nobody
   * had asked for the next batch. The only driver was the foreground loop in
   * a phone's browser, and the phone locked its screen.
   *
   * So the hand-off must not be conditional on who is driving: an invocation
   * that claims work and leaves work behind always schedules the background
   * continuation too.
   */
  it("always schedules a background continuation when work remains, whoever is driving", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const { service, supabase, state, jobsTable } = buildCampaignClients({ promptCount: 12 });
    serviceClientHolder.current = service;

    const { MAX_REAL_SCAN_PROMPTS } = await import("./constants");
    const { executePendingScan } = await import("./executor");
    await executePendingScan({ projectId: PROJECT_ID, runId: CAMPAIGN_RUN_ID, supabase });

    const completed = jobsTable.jobs.filter((j) => j.job_type === "scan_prompt" && j.status === "completed");
    expect(completed).toHaveLength(MAX_REAL_SCAN_PROMPTS);
    expect(state.status).toBe("running");

    // The campaign can now finish without the browser: the next batch is
    // dispatched server-side regardless of the foreground driver.
    expect(afterMock).toHaveBeenCalledTimes(1);
    await afterMock.mock.calls[0][0]();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain("/api/scan/continue");
  });
});

/**
 * Regression, second half of the 2026-08-07 failure (docs/adr/0037): a prompt
 * batch is long enough to be killed mid-flight, and a killed invocation cannot
 * release the jobs it claimed. `reconcileStuckScanRuns` never touches `jobs`,
 * so without a lease those rows stay `running` forever, the campaign can never
 * see every prompt job terminal, and finalize is unreachable — the same corpse
 * problem `scan_finalize` already had a lease for (docs/adr/0029).
 */
describe("executePendingScan — an abandoned prompt claim is recoverable", () => {
  const LEASED_RUN_ID = "77777777-7777-7777-7777-777777777777";

  function buildLeaseClients({ lockedAt, attemptCount }: { lockedAt: string | null; attemptCount: number }) {
    const state = {
      id: LEASED_RUN_ID,
      project_id: PROJECT_ID,
      status: "running",
      total_prompts: 1,
      successful_prompts: 0,
      failed_prompts: 0
    };

    const jobsTable = makeJobsTable([
      {
        id: "lease-start-job",
        project_id: PROJECT_ID,
        run_id: LEASED_RUN_ID,
        job_type: "scan_start",
        status: "completed",
        attempt_count: 1,
        max_attempts: 3,
        payload_json: {},
        last_error: null,
        created_at: "2026-08-07T09:59:59.000Z"
      },
      {
        // The corpse: claimed by an invocation that never came back.
        id: "lease-prompt-job",
        project_id: PROJECT_ID,
        run_id: LEASED_RUN_ID,
        job_type: "scan_prompt",
        status: "running",
        attempt_count: attemptCount,
        max_attempts: 3,
        payload_json: { prompt_id: PROMPT_ID, prompt_text: "¿Cuál es la mejor herramienta GEO?" },
        last_error: null,
        created_at: "2026-08-07T10:00:00.000Z",
        locked_at: lockedAt,
        locked_by: "gemini-executor"
      },
      {
        id: "lease-finalize-job",
        project_id: PROJECT_ID,
        run_id: LEASED_RUN_ID,
        job_type: "scan_finalize",
        status: "pending",
        attempt_count: 0,
        max_attempts: 3,
        payload_json: {},
        last_error: null,
        created_at: "2026-08-07T10:59:59.000Z"
      }
    ]);

    const scanRunsTable = makeCampaignScanRunsTableForLease(state);
    const scanPromptResultsTable = makeScanPromptResultsTable();

    const service = {
      from(table: string) {
        if (table === "jobs") return jobsTable.table;
        if (table === "scan_runs") return scanRunsTable;
        if (table === "scan_prompt_results") return scanPromptResultsTable.table;
        if (table === "recommendations") return makeRecommendationsTable().table;
        return noopTable();
      }
    } as unknown as ServiceClient;

    const supabase = {
      from(table: string) {
        if (table === "scan_runs") {
          return {
            select: () => ({
              eq: () => ({
                eq: () => ({
                  single: () => Promise.resolve({ data: { ...state }, error: null })
                })
              })
            })
          };
        }
        if (table === "projects") {
          return {
            select: () => ({
              eq: () => ({
                single: () =>
                  Promise.resolve({
                    data: { id: PROJECT_ID, domain: "genscore.es", brand: "GenScore", country: "ES", language: "es" },
                    error: null
                  })
              })
            })
          };
        }
        if (table === "project_competitors") {
          return {
            select: () => ({ eq: () => ({ eq: () => ({ order: () => Promise.resolve({ data: [], error: null }) }) }) })
          };
        }
        return noopTable();
      }
    } as unknown as SupabaseClient;

    return { service, supabase, jobsTable };
  }

  // Minimal stateful scan_runs fake — the lease tests only need the run to
  // read back as `running` and to accept status writes.
  function makeCampaignScanRunsTableForLease(state: Record<string, unknown>) {
    let sawNeq = false;
    const builder: Record<string, unknown> = {
      eq: () => builder,
      neq: () => {
        sawNeq = true;
        return builder;
      },
      order: () => builder,
      limit: () => builder,
      update: (patch: Record<string, unknown>) => {
        Object.assign(state, patch);
        return builder;
      },
      select: () => builder,
      maybeSingle: () => {
        const wasNeq = sawNeq;
        sawNeq = false;
        return Promise.resolve(wasNeq ? { data: null, error: null } : { data: { id: state.id }, error: null });
      },
      then: (resolve: (value: { data: unknown[]; error: null }) => unknown) =>
        Promise.resolve({ data: [], error: null }).then(resolve)
    };
    return builder;
  }

  beforeEach(() => {
    generateGeminiVisibilityAnswer.mockReset();
    generateGeminiVisibilityAnswer.mockResolvedValue(SUCCESS_RESPONSE);
    vi.mocked(countUnprocessedExtractionRows).mockResolvedValue(0);
    vi.mocked(generateRecommendationsForRun).mockClear().mockReturnValue([]);
  });

  it("reclaims a prompt job whose lock lease has expired, and the campaign finishes", async () => {
    const { PROMPT_LOCK_LEASE_MS } = await import("./constants");
    const staleLock = new Date(Date.now() - PROMPT_LOCK_LEASE_MS - 60_000).toISOString();
    const { service, supabase, jobsTable } = buildLeaseClients({ lockedAt: staleLock, attemptCount: 1 });
    serviceClientHolder.current = service;

    const { executePendingScan } = await import("./executor");
    await executePendingScan({ projectId: PROJECT_ID, runId: LEASED_RUN_ID, supabase });

    // The job was re-run rather than left as an unreachable corpse...
    expect(generateGeminiVisibilityAnswer).toHaveBeenCalledTimes(1);
    expect(jobsTable.jobs.find((j) => j.id === "lease-prompt-job")!.status).toBe("completed");
    // ...and with every prompt job terminal, finalize is reachable again.
    expect(jobsTable.jobs.find((j) => j.id === "lease-finalize-job")!.status).toBe("completed");
  });

  it("leaves a prompt job alone while a live invocation still holds it", async () => {
    const freshLock = new Date(Date.now() - 5_000).toISOString();
    const { service, supabase, jobsTable } = buildLeaseClients({ lockedAt: freshLock, attemptCount: 1 });
    serviceClientHolder.current = service;

    const { executePendingScan } = await import("./executor");
    await executePendingScan({ projectId: PROJECT_ID, runId: LEASED_RUN_ID, supabase });

    // Stealing it would double-call the provider and write a duplicate row.
    expect(generateGeminiVisibilityAnswer).not.toHaveBeenCalled();
    expect(jobsTable.jobs.find((j) => j.id === "lease-prompt-job")!.status).toBe("running");
    expect(jobsTable.jobs.find((j) => j.id === "lease-finalize-job")!.status).toBe("pending");
  });

  it("fails — rather than endlessly reclaiming — a stale job with no attempts left", async () => {
    const { PROMPT_LOCK_LEASE_MS } = await import("./constants");
    const staleLock = new Date(Date.now() - PROMPT_LOCK_LEASE_MS - 60_000).toISOString();
    const { service, supabase, jobsTable } = buildLeaseClients({ lockedAt: staleLock, attemptCount: 3 });
    serviceClientHolder.current = service;

    const { executePendingScan } = await import("./executor");
    await executePendingScan({ projectId: PROJECT_ID, runId: LEASED_RUN_ID, supabase }).catch(() => {});

    // A job that reliably kills its invocation must not be retried forever:
    // it becomes terminal so the campaign can move on with a truthful count.
    expect(generateGeminiVisibilityAnswer).not.toHaveBeenCalled();
    const promptJob = jobsTable.jobs.find((j) => j.id === "lease-prompt-job")!;
    expect(promptJob.status).toBe("failed");
    expect(promptJob.last_error).toBeTruthy();
  });
});

/**
 * EXTRACTION-RELIABILITY-1 (docs/adr/0029) — the invariant that makes the
 * silent data loss impossible rather than merely unlikely.
 *
 * Scoring reads `extracted_json`, so completing a run whose answers were
 * never extracted publishes a score computed from a fraction of the run's own
 * data and calls it done. That is exactly what shipped before this phase: on
 * production data, 30-row runs completed with 20 rows extracted and 10 never
 * touched, and nothing anywhere said so.
 */
describe("executePendingScan — a run cannot complete with unextracted answers", () => {
  beforeEach(() => {
    generateGeminiVisibilityAnswer.mockReset();
    vi.mocked(countUnprocessedExtractionRows).mockReset();
    vi.mocked(generateRecommendationsForRun).mockClear();
    afterMock.mockClear();
  });

  afterEach(() => {
    vi.mocked(countUnprocessedExtractionRows).mockResolvedValue(0);
  });

  it("defers finalize back to pending instead of completing when rows are still unextracted", async () => {
    generateGeminiVisibilityAnswer.mockResolvedValue(SUCCESS_RESPONSE);
    vi.mocked(countUnprocessedExtractionRows).mockResolvedValue(3);

    const { service, supabase, jobsTable } = buildClients({ promptJobMaxAttempts: 3 });
    serviceClientHolder.current = service;

    const { executePendingScan } = await import("./executor");
    await executePendingScan({ projectId: PROJECT_ID, runId: RUN_ID, supabase });

    // The finalize job is released so a fresh invocation — with a fresh
    // budget — can finish the extraction work, rather than the run being
    // completed over a hole in its own data.
    const finalizeJob = jobsTable.jobs.find((j) => j.id === "finalize-job")!;
    expect(finalizeJob.status).toBe("pending");

    // Nothing downstream of extraction may run on incomplete data.
    expect(vi.mocked(generateRecommendationsForRun)).not.toHaveBeenCalled();

    // And the campaign hands off so it actually gets finished.
    expect(afterMock).toHaveBeenCalledTimes(1);
  });

  it("completes normally once every answer is extracted", async () => {
    generateGeminiVisibilityAnswer.mockResolvedValue(SUCCESS_RESPONSE);
    vi.mocked(countUnprocessedExtractionRows).mockResolvedValue(0);

    const { service, supabase, jobsTable } = buildClients({ promptJobMaxAttempts: 3 });
    serviceClientHolder.current = service;

    const { executePendingScan } = await import("./executor");
    await executePendingScan({ projectId: PROJECT_ID, runId: RUN_ID, supabase });

    const finalizeJob = jobsTable.jobs.find((j) => j.id === "finalize-job")!;
    expect(finalizeJob.status).toBe("completed");
    expect(vi.mocked(generateRecommendationsForRun)).toHaveBeenCalledTimes(1);
  });
});

/**
 * Regression: the 2026-08-04 IKEA failure (run 9608d861, `scan_timeout` after
 * 190.9s with all 26 prompts generated cleanly).
 *
 * Since extraction moved inside the finalize step, that step is long enough to
 * be killed by Vercel's maxDuration mid-flight — and a killed invocation
 * cannot release the finalize job it claimed. `reconcileStuckScanRuns` only
 * touches `scan_runs`, never `jobs`, so the abandoned `running` job was
 * unrecoverable: every later invocation failed the `status = 'pending'` claim,
 * returned immediately, and nothing wrote progress again until the run was
 * failed as stuck. Recovering cost a full re-scan.
 */
describe("executePendingScan — an abandoned finalize claim is recoverable", () => {
  beforeEach(() => {
    generateGeminiVisibilityAnswer.mockReset();
    generateGeminiVisibilityAnswer.mockResolvedValue(SUCCESS_RESPONSE);
    vi.mocked(countUnprocessedExtractionRows).mockResolvedValue(0);
    vi.mocked(generateRecommendationsForRun).mockClear();
  });

  async function runWithFinalizeHeldSince(lockedAt: string | null) {
    const { service, supabase, jobsTable } = buildClients({ promptJobMaxAttempts: 3 });
    serviceClientHolder.current = service;

    // Simulate the corpse: finalize claimed as `running`, never released.
    const finalizeJob = jobsTable.jobs.find((j) => j.id === "finalize-job")!;
    finalizeJob.status = "running";
    finalizeJob.locked_at = lockedAt;
    finalizeJob.locked_by = "gemini-executor";

    const { executePendingScan } = await import("./executor");
    await executePendingScan({ projectId: PROJECT_ID, runId: RUN_ID, supabase });

    return jobsTable.jobs.find((j) => j.id === "finalize-job")!;
  }

  it("takes over a finalize job whose lock lease has expired", async () => {
    const staleLock = new Date(Date.now() - FINALIZE_LOCK_LEASE_MS - 60_000).toISOString();

    const finalizeJob = await runWithFinalizeHeldSince(staleLock);

    // The campaign finishes instead of stalling forever.
    expect(finalizeJob.status).toBe("completed");
    expect(vi.mocked(generateRecommendationsForRun)).toHaveBeenCalledTimes(1);
  });

  it("leaves a finalize job alone while a live invocation still holds it", async () => {
    const freshLock = new Date(Date.now() - 5_000).toISOString();

    const finalizeJob = await runWithFinalizeHeldSince(freshLock);

    // Still held by whoever is genuinely working on it — taking it over here
    // would run scoring and recommendations twice for the same campaign.
    expect(finalizeJob.status).toBe("running");
    expect(vi.mocked(generateRecommendationsForRun)).not.toHaveBeenCalled();
  });
});

/**
 * Regression, other half of the 2026-08-04 IKEA failure (docs/adr/0029,
 * Addendum): the extraction budget must belong to the invocation, not to each
 * pass.
 *
 * The invocation that processes the last batch runs generation, then that
 * batch's extraction pass, then the finalize sweep. With a per-pass budget
 * those two passes each started a fresh 25s clock, so the invocation could
 * queue ~70s of work inside a 60s maxDuration and get killed mid-sweep.
 */
describe("executePendingScan — extraction shares one invocation-wide deadline", () => {
  beforeEach(() => {
    generateGeminiVisibilityAnswer.mockReset();
    generateGeminiVisibilityAnswer.mockResolvedValue(SUCCESS_RESPONSE);
    vi.mocked(countUnprocessedExtractionRows).mockResolvedValue(0);
    vi.mocked(runStructuredExtractionForRun).mockClear();
  });

  it("passes the same absolute deadline to the batch pass and the finalize sweep", async () => {
    const { service, supabase } = buildClients({ promptJobMaxAttempts: 3 });
    serviceClientHolder.current = service;

    const before = Date.now();
    const { executePendingScan } = await import("./executor");
    await executePendingScan({ projectId: PROJECT_ID, runId: RUN_ID, supabase });
    const after = Date.now();

    const calls = vi.mocked(runStructuredExtractionForRun).mock.calls;
    // Batch pass + finalize sweep, both in this one invocation.
    expect(calls).toHaveLength(2);

    const deadlines = calls.map(([args]) => args.deadlineAt);
    expect(deadlines.every((d) => typeof d === "number")).toBe(true);

    // The crux: the second pass does NOT get a fresh clock. Both draw from the
    // same absolute deadline, so whatever generation and the first pass spent
    // is already gone when the sweep starts.
    expect(deadlines[0]).toBe(deadlines[1]);

    // And that deadline is anchored to when the invocation began, not to when
    // each pass began.
    expect(deadlines[0]).toBeGreaterThanOrEqual(before + SCAN_INVOCATION_WORK_BUDGET_MS);
    expect(deadlines[0]).toBeLessThanOrEqual(after + SCAN_INVOCATION_WORK_BUDGET_MS);
  });
});

/**
 * PROJECT-DEFAULTS-BY-ACCOUNT-1 (founder-approved 2026-08-25, log §167).
 * `recurring_scans_enabled` cannot be set at project creation — its own
 * `/debug` precondition requires a completed scan to already exist — so a
 * real customer account gets it turned on here, the first moment that
 * precondition is met. The `ux-pilot` agent flagged this exact path as
 * structurally invisible to the always-on read-only pilot (it lives behind
 * `/debug`, never captured by the default journey set, and behind a write
 * path the pilot cannot exercise) and recommended these unit tests carry the
 * verification instead.
 */
describe("executePendingScan — auto-enables recurring scans after the first completed run (PROJECT-DEFAULTS-BY-ACCOUNT-1)", () => {
  const ORIGINAL_INTERNAL_TEST_EMAILS = process.env.INTERNAL_TEST_ACCOUNT_EMAILS;

  beforeEach(() => {
    generateGeminiVisibilityAnswer.mockReset();
    generateGeminiVisibilityAnswer.mockResolvedValue(SUCCESS_RESPONSE);
    vi.mocked(generateRecommendationsForRun).mockClear().mockReturnValue([]);
    delete process.env.INTERNAL_TEST_ACCOUNT_EMAILS;
  });

  afterEach(() => {
    if (ORIGINAL_INTERNAL_TEST_EMAILS === undefined) delete process.env.INTERNAL_TEST_ACCOUNT_EMAILS;
    else process.env.INTERNAL_TEST_ACCOUNT_EMAILS = ORIGINAL_INTERNAL_TEST_EMAILS;
  });

  it("turns recurring_scans_enabled on when this is the project's first completed run and the owner is not an internal test account", async () => {
    const { service, supabase, projectsUpdates } = buildClients({
      promptJobMaxAttempts: 3,
      recurringScans: { currentValue: false, completedRunCount: 1, ownerEmail: "customer@example.com" }
    });
    serviceClientHolder.current = service;

    const { executePendingScan } = await import("./executor");
    await executePendingScan({ projectId: PROJECT_ID, runId: RUN_ID, supabase });

    expect(projectsUpdates).toContainEqual({ recurring_scans_enabled: true });
  });

  it("leaves recurring_scans_enabled off for an internal test account, even on the first completed run", async () => {
    process.env.INTERNAL_TEST_ACCOUNT_EMAILS = "founder@example.com";
    const { service, supabase, projectsUpdates } = buildClients({
      promptJobMaxAttempts: 3,
      recurringScans: { currentValue: false, completedRunCount: 1, ownerEmail: "founder@example.com" }
    });
    serviceClientHolder.current = service;

    const { executePendingScan } = await import("./executor");
    await executePendingScan({ projectId: PROJECT_ID, runId: RUN_ID, supabase });

    expect(projectsUpdates).toEqual([]);
  });

  it("does not touch recurring_scans_enabled once this is the project's second (or later) completed run", async () => {
    const { service, supabase, projectsUpdates } = buildClients({
      promptJobMaxAttempts: 3,
      recurringScans: { currentValue: false, completedRunCount: 2, ownerEmail: "customer@example.com" }
    });
    serviceClientHolder.current = service;

    const { executePendingScan } = await import("./executor");
    await executePendingScan({ projectId: PROJECT_ID, runId: RUN_ID, supabase });

    expect(projectsUpdates).toEqual([]);
  });

  it("never re-writes recurring_scans_enabled once it is already on — a customer who turned it off manually is not silently re-enabled by a later scan", async () => {
    const { service, supabase, projectsUpdates } = buildClients({
      promptJobMaxAttempts: 3,
      recurringScans: { currentValue: true, completedRunCount: 1, ownerEmail: "customer@example.com" }
    });
    serviceClientHolder.current = service;

    const { executePendingScan } = await import("./executor");
    await executePendingScan({ projectId: PROJECT_ID, runId: RUN_ID, supabase });

    expect(projectsUpdates).toEqual([]);
  });

  it("fails soft: a broken owner-email lookup never stops the run from completing", async () => {
    const { service, supabase, notificationsTable } = buildClients({
      promptJobMaxAttempts: 3,
      recurringScans: { currentValue: false, completedRunCount: 1, ownerEmail: "customer@example.com" }
    });
    // Break only the owner-email lookup this block depends on — proving this
    // one side effect can't sink an otherwise-successful scan, the same
    // fail-soft contract the web-audit enqueue and scan-health-alert calls
    // right around it in executor.ts already carry.
    (service as unknown as { auth: { admin: { getUserById: () => Promise<never> } } }).auth.admin.getUserById = () =>
      Promise.reject(new Error("network"));
    serviceClientHolder.current = service;

    const { executePendingScan } = await import("./executor");
    await executePendingScan({ projectId: PROJECT_ID, runId: RUN_ID, supabase });

    expect(notificationsTable.calls.some((c) => c.type === "scan_completed")).toBe(true);
  });
});

/**
 * AUDIT-RUNNABLE-1 (docs/external-audit-2026-08.md, Fase 5). Every project
 * created before PROJECT-DEFAULTS-BY-ACCOUNT-1 (2026-08-25) still has
 * `auto_technical_audit_enabled = false` from the migration 0031 default, and
 * nothing has ever flipped it — the switch lives behind `/debug`, and no
 * automatic path ever set it for a project created before that date. This
 * block closes that gap the same place PROJECT-DEFAULTS-BY-ACCOUNT-1 closes
 * the analogous one for `recurring_scans_enabled`. Unlike that block, there
 * is no "first completed run only" gate: this isn't a precondition newly
 * met, it's a stale default that stays stale until something touches it.
 */
describe("executePendingScan — auto-enables the technical audit for a project that predates PROJECT-DEFAULTS-BY-ACCOUNT-1 (AUDIT-RUNNABLE-1)", () => {
  const ORIGINAL_INTERNAL_TEST_EMAILS = process.env.INTERNAL_TEST_ACCOUNT_EMAILS;

  beforeEach(() => {
    generateGeminiVisibilityAnswer.mockReset();
    generateGeminiVisibilityAnswer.mockResolvedValue(SUCCESS_RESPONSE);
    vi.mocked(generateRecommendationsForRun).mockClear().mockReturnValue([]);
    delete process.env.INTERNAL_TEST_ACCOUNT_EMAILS;
  });

  afterEach(() => {
    if (ORIGINAL_INTERNAL_TEST_EMAILS === undefined) delete process.env.INTERNAL_TEST_ACCOUNT_EMAILS;
    else process.env.INTERNAL_TEST_ACCOUNT_EMAILS = ORIGINAL_INTERNAL_TEST_EMAILS;
  });

  it("turns auto_technical_audit_enabled on for a real account whose project still has it off", async () => {
    const { service, supabase, projectsUpdates } = buildClients({
      promptJobMaxAttempts: 3,
      autoTechnicalAudit: { currentValue: false, ownerEmail: "customer@example.com" }
    });
    serviceClientHolder.current = service;

    const { executePendingScan } = await import("./executor");
    await executePendingScan({ projectId: PROJECT_ID, runId: RUN_ID, supabase });

    expect(projectsUpdates).toContainEqual({ auto_technical_audit_enabled: true });
  });

  it("leaves auto_technical_audit_enabled off for an internal test account", async () => {
    process.env.INTERNAL_TEST_ACCOUNT_EMAILS = "founder@example.com";
    const { service, supabase, projectsUpdates } = buildClients({
      promptJobMaxAttempts: 3,
      autoTechnicalAudit: { currentValue: false, ownerEmail: "founder@example.com" }
    });
    serviceClientHolder.current = service;

    const { executePendingScan } = await import("./executor");
    await executePendingScan({ projectId: PROJECT_ID, runId: RUN_ID, supabase });

    expect(projectsUpdates).toEqual([]);
  });

  it("never re-writes auto_technical_audit_enabled once it is already on — a customer who turned it off manually is not silently re-enabled by a later scan", async () => {
    const { service, supabase, projectsUpdates } = buildClients({
      promptJobMaxAttempts: 3,
      autoTechnicalAudit: { currentValue: true, ownerEmail: "customer@example.com" }
    });
    serviceClientHolder.current = service;

    const { executePendingScan } = await import("./executor");
    await executePendingScan({ projectId: PROJECT_ID, runId: RUN_ID, supabase });

    expect(projectsUpdates).toEqual([]);
  });

  it("fails soft: a broken owner-email lookup never stops the run from completing", async () => {
    const { service, supabase, notificationsTable } = buildClients({
      promptJobMaxAttempts: 3,
      autoTechnicalAudit: { currentValue: false, ownerEmail: "customer@example.com" }
    });
    (service as unknown as { auth: { admin: { getUserById: () => Promise<never> } } }).auth.admin.getUserById = () =>
      Promise.reject(new Error("network"));
    serviceClientHolder.current = service;

    const { executePendingScan } = await import("./executor");
    await executePendingScan({ projectId: PROJECT_ID, runId: RUN_ID, supabase });

    expect(notificationsTable.calls.some((c) => c.type === "scan_completed")).toBe(true);
  });
});
