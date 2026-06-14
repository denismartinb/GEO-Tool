import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { createServiceClient } from "@/lib/supabase/service";
import type { AuthenticatedContext } from "@/lib/scan/types";
import { PROMPT_RETRY_DELAY_MS } from "@/lib/scan/constants";

const generateGeminiVisibilityAnswer = vi.fn();
vi.mock("@/lib/llm/gemini", async () => {
  const actual = await vi.importActual<typeof import("@/lib/llm/gemini")>("@/lib/llm/gemini");
  return {
    ...actual,
    generateGeminiVisibilityAnswer: (...args: unknown[]) => generateGeminiVisibilityAnswer(...args)
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

function makeScanRunsTable() {
  const builder: Record<string, unknown> = {
    eq: () => builder,
    update: () => builder,
    select: () => builder,
    maybeSingle: () => Promise.resolve({ data: { id: RUN_ID }, error: null }),
    then: (resolve: (value: { data: unknown[]; error: null }) => unknown) =>
      Promise.resolve({ data: [], error: null }).then(resolve)
  };
  return builder;
}

function buildClients({ promptJobMaxAttempts }: { promptJobMaxAttempts: number }) {
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

  const scanRunsTable = makeScanRunsTable();

  const service = {
    from(table: string) {
      if (table === "jobs") return jobsTable.table;
      if (table === "scan_runs") return scanRunsTable;
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

  return { service, supabase, jobsTable, scanRunsTable };
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
