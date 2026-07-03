import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { createServiceClient } from "@/lib/supabase/service";
import type { AuthenticatedContext } from "@/lib/scan/types";
import { PROMPT_RETRY_DELAY_MS } from "@/lib/scan/constants";
import { generateRecommendationsForRun } from "@/lib/recommendations/recommendation-engine";

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

vi.mock("@/lib/scan/extraction", () => ({
  runStructuredExtractionForRun: vi.fn().mockResolvedValue(undefined)
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

type JobsRow = {
  id: string;
  job_type: string;
  status: string;
  attempt_count: number;
  max_attempts: number;
  payload_json: Record<string, unknown>;
  last_error: string | null;
  created_at: string;
};

/**
 * Records every job update applied via service.from("jobs").update(...).
 * Used to assert attempt_count / status / last_error transitions across the
 * per-prompt retry loop (SCAN-ROBUST-1).
 */
function makeJobsTable(initialJobs: JobsRow[]) {
  const jobs: JobsRow[] = initialJobs.map((j) => ({ ...j }));
  const updates: Array<Partial<JobsRow> & { __id: string }> = [];

  function updateBuilder(patch: Partial<JobsRow>) {
    const filters: Array<[string, unknown]> = [];
    const builder = {
      eq(column: string, value: unknown) {
        filters.push([column, value]);
        return builder;
      },
      // executor.ts never awaits with `.then` chaining beyond the final
      // `.eq(...)` for jobs updates — make the builder itself thenable so a
      // bare `await service.from("jobs").update(...).eq(...).eq(...).eq(...)`
      // resolves once all three .eq() calls have been applied.
      then(resolve: (value: { error: null }) => unknown) {
        const idFilter = filters.find(([col]) => col === "id");
        if (idFilter) {
          const job = jobs.find((j) => j.id === idFilter[1]);
          if (job) {
            Object.assign(job, patch);
            updates.push({ __id: job.id, ...patch });
          }
        } else {
          // bulk update without an id filter (the catch-all "mark running jobs failed")
          for (const job of jobs) {
            if (job.status === "running") {
              Object.assign(job, patch);
              updates.push({ __id: job.id, ...patch });
            }
          }
        }
        return Promise.resolve({ error: null }).then(resolve);
      }
    };
    return builder;
  }

  function selectBuilder() {
    const builder = {
      eq(_column: string, _value: unknown) {
        return builder;
      },
      order(_column: string, _opts: unknown) {
        return Promise.resolve({ data: jobs, error: null });
      },
      then(resolve: (value: { count: number; error: null }) => unknown) {
        const failedCount = jobs.filter((j) => j.job_type === "scan_prompt" && j.status === "failed").length;
        return Promise.resolve({ count: failedCount, error: null }).then(resolve);
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

function makeScanRunsTable(previousRunId: string | null = null) {
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
    then: (resolve: (value: { data: unknown[]; error: null }) => unknown) =>
      Promise.resolve({ data: [], error: null }).then(resolve)
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
function makeRecommendationsTable(seed: RecRow[] = []) {
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
      then: (resolve: (value: { data: RecRow[] | null; error: null }) => unknown) => {
        if (mode === "select") {
          const data = rows.filter((r) => matches(r, filters));
          return Promise.resolve({ data, error: null }).then(resolve);
        }
        if (mode === "update") {
          for (const row of rows) if (matches(row, filters)) Object.assign(row, patch);
          return Promise.resolve({ data: null, error: null }).then(resolve);
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
function makeScanPromptResultsTable(existingProviders: string[] = []) {
  const inserted: Array<Record<string, unknown>> = [];
  let hasPromptIdFilter = false;
  const builder: Record<string, unknown> = {
    insert: (row: Record<string, unknown>) => {
      inserted.push(row);
      return Promise.resolve({ error: null });
    },
    eq: (column: string) => {
      if (column === "prompt_id") hasPromptIdFilter = true;
      return builder;
    },
    select: () => builder,
    order: () => builder,
    maybeSingle: () => Promise.resolve({ data: null, error: null }),
    single: () => Promise.resolve({ data: null, error: null }),
    then: (resolve: (value: { data: unknown[]; error: null }) => unknown) => {
      const data = hasPromptIdFilter ? existingProviders.map((provider) => ({ provider })) : [];
      hasPromptIdFilter = false;
      return Promise.resolve({ data, error: null }).then(resolve);
    }
  };
  return { inserted, table: builder };
}

function buildClients(
  {
    promptJobMaxAttempts,
    previousRunId = null,
    previousRecommendationRows = []
  }: { promptJobMaxAttempts: number; previousRunId?: string | null; previousRecommendationRows?: RecRow[] },
  existingProviders: string[] = []
) {
  const jobsTable = makeJobsTable([
    {
      id: "start-job",
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
      job_type: "scan_prompt",
      status: "pending",
      attempt_count: 0,
      max_attempts: promptJobMaxAttempts,
      payload_json: { prompt_id: PROMPT_ID, prompt_text: "What is the best CRM?" },
      last_error: null,
      created_at: "2026-06-13T10:00:01.000Z"
    },
    {
      id: "finalize-job",
      job_type: "scan_finalize",
      status: "pending",
      attempt_count: 0,
      max_attempts: 3,
      payload_json: {},
      last_error: null,
      created_at: "2026-06-13T10:00:02.000Z"
    }
  ]);

  const scanRunsTable = makeScanRunsTable(previousRunId);
  const scanPromptResultsTable = makeScanPromptResultsTable(existingProviders);
  const recommendationsTable = makeRecommendationsTable(previousRecommendationRows);

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

  return { service, supabase, jobsTable, scanRunsTable, scanPromptResultsTable, recommendationsTable };
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
});
