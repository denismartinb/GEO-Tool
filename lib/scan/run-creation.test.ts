import { beforeEach, describe, expect, it, vi } from "vitest";
import type { createServiceClient } from "@/lib/supabase/service";
import type { AuthenticatedContext } from "@/lib/scan/types";
import { MAX_PROMPT_SAMPLES } from "@/lib/scan/sampling";

vi.mock("@/lib/scan/reconciliation", () => ({
  reconcileStuckScanRuns: vi.fn().mockResolvedValue(undefined)
}));

type ServiceClient = ReturnType<typeof createServiceClient>;
type SupabaseClient = AuthenticatedContext["supabase"];

type Row = Record<string, unknown>;

let nextId = 1;
function freshId() {
  return `id-${nextId++}`;
}

/**
 * Minimal in-memory multi-table fake covering exactly the query shapes
 * `createPendingScanRunCore` and `copyForwardLatestResults` issue:
 *   - select(...).eq(...)[.eq(...)][.in(...)][.order(...)][.limit(...)].maybeSingle()
 *   - select(...).eq(...)... (no terminal call, awaited directly)            -> array
 *   - insert(row).select(...).single()                                       -> single inserted row
 *   - insert(rows)                                                           -> { error }
 *   - update(patch).eq(...)...                                               -> { error }
 * Both the RLS-scoped `readClient` and the `service` client in
 * `createPendingScanRunCore` read/write the same backing tables here, mirroring
 * how they're really two connections to the same Postgres database.
 */
function makeFakeDb(initial: Record<string, Row[]>) {
  const tables: Record<string, Row[]> = {};
  for (const [name, rows] of Object.entries(initial)) {
    tables[name] = rows.map((r) => ({ ...r }));
  }

  function table(name: string): Row[] {
    if (!tables[name]) tables[name] = [];
    return tables[name];
  }

  function selectBuilder(rows: Row[]) {
    let data = [...rows];
    const builder = {
      eq(column: string, value: unknown) {
        data = data.filter((row) => row[column] === value);
        return builder;
      },
      in(column: string, values: unknown[]) {
        data = data.filter((row) => values.includes(row[column]));
        return builder;
      },
      order(column: string, opts: { ascending: boolean }) {
        data = [...data].sort((a, b) => {
          const av = String(a[column] ?? "");
          const bv = String(b[column] ?? "");
          const cmp = av < bv ? -1 : av > bv ? 1 : 0;
          return opts.ascending ? cmp : -cmp;
        });
        return builder;
      },
      limit(_n: number) {
        return builder;
      },
      maybeSingle() {
        return Promise.resolve({ data: data[0] ?? null, error: null });
      },
      single() {
        return Promise.resolve({
          data: data[0] ?? null,
          error: data[0] ? null : { message: "not found" }
        });
      },
      then(resolve: (value: { data: Row[]; error: null }) => unknown) {
        return Promise.resolve({ data, error: null }).then(resolve);
      }
    };
    return builder;
  }

  function insertBuilder(rows: Row[], payload: Row | Row[]) {
    const toInsert = (Array.isArray(payload) ? payload : [payload]).map((row) => ({
      id: freshId(),
      created_at: new Date().toISOString(),
      ...row
    }));
    rows.push(...toInsert);
    const builder = {
      select(_cols: string) {
        return {
          single() {
            return Promise.resolve({ data: toInsert[0] ?? null, error: null });
          }
        };
      },
      then(resolve: (value: { error: null }) => unknown) {
        return Promise.resolve({ error: null }).then(resolve);
      }
    };
    return builder;
  }

  function updateBuilder(rows: Row[], patch: Row) {
    const filters: Array<[string, unknown]> = [];
    const builder = {
      eq(column: string, value: unknown) {
        filters.push([column, value]);
        return builder;
      },
      then(resolve: (value: { error: null }) => unknown) {
        const matches = rows.filter((row) => filters.every(([col, val]) => row[col] === val));
        matches.forEach((row) => Object.assign(row, patch));
        return Promise.resolve({ error: null }).then(resolve);
      }
    };
    return builder;
  }

  const client = {
    from(name: string) {
      const rows = table(name);
      return {
        select: (_cols: string) => selectBuilder(rows),
        insert: (payload: Row | Row[]) => insertBuilder(rows, payload),
        update: (patch: Row) => updateBuilder(rows, patch)
      };
    }
  };

  return { client, tables };
}

const PROJECT_ID = "project-1";
const OWNER_ID = "user-1";

function baseTables(overrides: Partial<Record<string, Row[]>> = {}) {
  return {
    projects: [{ id: PROJECT_ID, is_archived: false, owner_user_id: OWNER_ID }],
    profiles: [{ id: OWNER_ID, current_plan: "pro" }],
    scan_runs: [],
    project_prompts: [],
    jobs: [],
    scan_prompt_results: [],
    ...overrides
  };
}

describe("createPendingScanRunCore", () => {
  beforeEach(() => {
    nextId = 1;
  });

  it("default (no onlyPromptIds) creates a real job for every active prompt up to the owner's plan cap (SCAN-CHAIN-1), not MAX_REAL_SCAN_PROMPTS, with no copy-forward", async () => {
    const { createPendingScanRunCore } = await import("@/lib/scan/run-creation");

    // Starter plan caps at 25 prompts (app/pricing/plans-data.ts) — well above
    // MAX_REAL_SCAN_PROMPTS (10), proving job creation is no longer capped at
    // the per-batch execution size. Batching across multiple executePendingScan
    // invocations is covered separately in executor.test.ts.
    const PROMPT_COUNT = 30;
    const prompts = Array.from({ length: PROMPT_COUNT }, (_, i) => ({
      id: `prompt-${i}`,
      project_id: PROJECT_ID,
      prompt_text: `Prompt ${i}`,
      is_active: true,
      created_at: `2026-01-01T00:00:${String(i).padStart(2, "0")}.000Z`
    }));

    const { client, tables } = makeFakeDb(
      baseTables({
        project_prompts: prompts,
        profiles: [{ id: OWNER_ID, current_plan: "starter" }]
      })
    );

    const runId = await createPendingScanRunCore({
      projectId: PROJECT_ID,
      readClient: client as unknown as SupabaseClient,
      service: client as unknown as ServiceClient,
      triggeredByUserId: "user-1",
      triggerSource: "user"
    });

    expect(runId).toBeTruthy();

    const STARTER_PROMPT_CAP = 25;
    // SAMPLING-1 (ADR 0027): no LLM_SCAN_PROVIDERS is set in tests, so the
    // engine set is Gemini alone. 25 prompts x 1 engine = 25 responses, under
    // the floor of 50, so the run repeats its prompt set twice (50 >= 50).
    // total_prompts counts JOBS, which is why it is 50 and not 25.
    const SAMPLES = 2;
    const scanRun = tables.scan_runs.find((r) => r.id === runId);
    expect(scanRun?.total_prompts).toBe(STARTER_PROMPT_CAP * SAMPLES);
    expect(scanRun?.sample_count).toBe(SAMPLES);

    const promptJobs = tables.jobs.filter((j) => j.job_type === "scan_prompt");
    expect(promptJobs).toHaveLength(STARTER_PROMPT_CAP * SAMPLES);
    // Oldest-first cap: prompt-0..prompt-24 get a job, the 5 newest do not.
    // Sample-major order, so the id sequence is the capped set repeated once
    // per sample.
    const scannedIds = promptJobs.map((j) => (j.payload_json as Row).prompt_id);
    const cappedIds = prompts.slice(0, STARTER_PROMPT_CAP).map((p) => p.id);
    expect(scannedIds).toEqual([...cappedIds, ...cappedIds]);
    // Every job carries the sample it belongs to, and each prompt is asked
    // exactly `SAMPLES` times — never twice with the same index, which the
    // (run, prompt, provider, sample_index) unique index would reject.
    expect(promptJobs.map((j) => (j.payload_json as Row).sample_index)).toEqual([
      ...cappedIds.map(() => 0),
      ...cappedIds.map(() => 1)
    ]);

    expect(tables.scan_prompt_results).toHaveLength(0);
  });

  it("falls back to the default plan's cap when the owner has no profile row", async () => {
    const { createPendingScanRunCore } = await import("@/lib/scan/run-creation");

    const prompts = Array.from({ length: 5 }, (_, i) => ({
      id: `prompt-${i}`,
      project_id: PROJECT_ID,
      prompt_text: `Prompt ${i}`,
      is_active: true,
      created_at: `2026-01-01T00:00:0${i}.000Z`
    }));

    const { client, tables } = makeFakeDb(baseTables({ project_prompts: prompts, profiles: [] }));

    const runId = await createPendingScanRunCore({
      projectId: PROJECT_ID,
      readClient: client as unknown as SupabaseClient,
      service: client as unknown as ServiceClient,
      triggeredByUserId: "user-1",
      triggerSource: "user"
    });

    // Every prompt fits well under any plan's cap, so this just proves the
    // lookup doesn't throw/block scanning when there's no profiles row yet.
    // 5 prompts x 1 engine = 5 responses, so SAMPLING-1 repeats the set to
    // its cap of MAX_PROMPT_SAMPLES (5 x 5 = 25, still under the floor — this
    // is the "capped" case, which publishes anyway per decision E2).
    const promptJobs = tables.jobs.filter((j) => j.job_type === "scan_prompt" && j.run_id === runId);
    expect(promptJobs).toHaveLength(5 * MAX_PROMPT_SAMPLES);
    expect(new Set(promptJobs.map((j) => (j.payload_json as Row).prompt_id)).size).toBe(5);
  });

  it("onlyPromptIds scans only the given prompts and copies forward the latest results for every other active prompt", async () => {
    const { createPendingScanRunCore } = await import("@/lib/scan/run-creation");

    const p1 = { id: "p1", project_id: PROJECT_ID, prompt_text: "Existing prompt 1", is_active: true, created_at: "2026-01-01T00:00:00.000Z" };
    const p2 = { id: "p2", project_id: PROJECT_ID, prompt_text: "Existing prompt 2", is_active: true, created_at: "2026-01-01T00:00:01.000Z" };
    const p3 = { id: "p3", project_id: PROJECT_ID, prompt_text: "Newly added prompt", is_active: true, created_at: "2026-01-02T00:00:00.000Z" };

    const priorRun = { id: "run-old", project_id: PROJECT_ID, status: "completed", created_at: "2026-01-01T00:00:00.000Z" };

    const priorResults: Row[] = [
      {
        id: "spr-1",
        run_id: priorRun.id,
        project_id: PROJECT_ID,
        prompt_id: p1.id,
        prompt_text_snapshot: p1.prompt_text,
        brand_snapshot: "Acme",
        competitors_snapshot: [{ name: "Rival" }],
        country_snapshot: "ES",
        language_snapshot: "es",
        provider: "gemini",
        model: "gemini-2.5-flash",
        status: "completed",
        raw_response_text: "Acme is great.",
        raw_response_json: { text: "Acme is great." },
        tokens_in: 10,
        tokens_out: 20,
        cost_usd: null,
        llm_latency_ms: 500,
        brand_mentioned: true,
        citation_found: false,
        mentioned_competitors_count: 0,
        citations_count: 0,
        sentiment: "positive",
        extraction_version: "grounded-position-v1",
        extracted_json: { brand: { mentioned: true } },
        extraction_error: null
      },
      {
        id: "spr-2",
        run_id: priorRun.id,
        project_id: PROJECT_ID,
        prompt_id: p2.id,
        prompt_text_snapshot: p2.prompt_text,
        brand_snapshot: "Acme",
        competitors_snapshot: [],
        country_snapshot: "ES",
        language_snapshot: "es",
        provider: "claude",
        model: "claude-x",
        status: "completed",
        raw_response_text: "Acme is fine.",
        raw_response_json: { text: "Acme is fine." },
        tokens_in: 5,
        tokens_out: 8,
        cost_usd: null,
        llm_latency_ms: 300,
        brand_mentioned: true,
        citation_found: true,
        mentioned_competitors_count: 1,
        citations_count: 2,
        sentiment: "neutral",
        extraction_version: "grounded-position-v1",
        extracted_json: { brand: { mentioned: true } },
        extraction_error: null
      }
    ];

    const { client, tables } = makeFakeDb(
      baseTables({
        project_prompts: [p1, p2, p3],
        scan_runs: [priorRun],
        scan_prompt_results: priorResults
      })
    );

    const runId = await createPendingScanRunCore({
      projectId: PROJECT_ID,
      readClient: client as unknown as SupabaseClient,
      service: client as unknown as ServiceClient,
      triggeredByUserId: "user-1",
      triggerSource: "user",
      onlyPromptIds: [p3.id]
    });

    // A partial rescan of 1 prompt on 1 engine is the smallest possible
    // sample, so SAMPLING-1 repeats it up to MAX_PROMPT_SAMPLES.
    const scanRun = tables.scan_runs.find((r) => r.id === runId);
    expect(scanRun?.total_prompts).toBe(MAX_PROMPT_SAMPLES);
    expect(scanRun?.sample_count).toBe(MAX_PROMPT_SAMPLES);

    const promptJobs = tables.jobs.filter((j) => j.job_type === "scan_prompt" && j.run_id === runId);
    expect(promptJobs).toHaveLength(MAX_PROMPT_SAMPLES);
    // Only the requested prompt is rescanned — repetitions never widen the
    // set of prompts a partial rescan touches.
    expect(new Set(promptJobs.map((j) => (j.payload_json as Row).prompt_id))).toEqual(new Set([p3.id]));

    const newRunResults = tables.scan_prompt_results.filter((r) => r.run_id === runId);
    expect(newRunResults).toHaveLength(2);

    const byPrompt = new Map(newRunResults.map((r) => [r.prompt_id as string, r]));
    expect(byPrompt.get(p1.id)).toMatchObject({
      provider: "gemini",
      brand_mentioned: true,
      raw_response_text: "Acme is great.",
      extraction_version: "grounded-position-v1"
    });
    expect(byPrompt.get(p2.id)).toMatchObject({
      provider: "claude",
      citation_found: true,
      citations_count: 2,
      raw_response_text: "Acme is fine."
    });
    // p3 (the newly scanned prompt) is not copy-forwarded — its row will be
    // created later by the executor once the scan_prompt job actually runs.
    expect(byPrompt.has(p3.id)).toBe(false);

    // The prior completed run's own rows must be untouched (still scoped to
    // run-old), so the previous snapshot is never mutated by the copy.
    expect(tables.scan_prompt_results.filter((r) => r.run_id === priorRun.id)).toHaveLength(2);
  });

  it("falls back gracefully (no crash, nothing copied) when onlyPromptIds is given but no completed run exists yet", async () => {
    const { createPendingScanRunCore } = await import("@/lib/scan/run-creation");

    const p1 = { id: "p1", project_id: PROJECT_ID, prompt_text: "Existing prompt", is_active: true, created_at: "2026-01-01T00:00:00.000Z" };
    const p2 = { id: "p2", project_id: PROJECT_ID, prompt_text: "New prompt", is_active: true, created_at: "2026-01-02T00:00:00.000Z" };

    const { client, tables } = makeFakeDb(baseTables({ project_prompts: [p1, p2] }));

    const runId = await createPendingScanRunCore({
      projectId: PROJECT_ID,
      readClient: client as unknown as SupabaseClient,
      service: client as unknown as ServiceClient,
      triggeredByUserId: "user-1",
      triggerSource: "user",
      onlyPromptIds: [p2.id]
    });

    expect(runId).toBeTruthy();
    const promptJobs = tables.jobs.filter((j) => j.job_type === "scan_prompt" && j.run_id === runId);
    expect(promptJobs).toHaveLength(MAX_PROMPT_SAMPLES);
    expect(new Set(promptJobs.map((j) => (j.payload_json as Row).prompt_id))).toEqual(new Set([p2.id]));
    expect(tables.scan_prompt_results).toHaveLength(0);
  });

  it("caps onlyPromptIds at the owner's plan cap (not MAX_REAL_SCAN_PROMPTS), carrying forward the overflow", async () => {
    const { createPendingScanRunCore } = await import("@/lib/scan/run-creation");

    // SCAN-CHAIN-1: onlyPromptIds (the add-prompts flow) is no longer
    // defensively truncated at MAX_REAL_SCAN_PROMPTS — its real callers
    // (addPromptsCore) already bound it small, and execution now batches
    // any size. The only remaining cap here is the owner's plan, so use a
    // count above Starter's cap (25) to prove that cap still applies.
    // Deliberately not the Free plan here: PRICING-TRUTH-1 (PR b) added a
    // separate one-completed-scan-ever limit for Free (see the dedicated
    // "free plan" describe block below), which this fixture's prior
    // completed run would otherwise trip — this test is about the prompts
    // cap, not that limit.
    const STARTER_PLAN_CAP = 25;
    const newPrompts = Array.from({ length: STARTER_PLAN_CAP + 1 }, (_, i) => ({
      id: `new-${i}`,
      project_id: PROJECT_ID,
      prompt_text: `New prompt ${i}`,
      is_active: true,
      created_at: `2026-02-01T00:00:${String(i).padStart(2, "0")}.000Z`
    }));

    const priorRun = { id: "run-old", project_id: PROJECT_ID, status: "completed", created_at: "2026-01-01T00:00:00.000Z" };
    // One of the "overflow" new prompts already has a prior result (simulating
    // a retry of an add-prompts batch whose first attempt partially scanned).
    const overflowPromptId = newPrompts[STARTER_PLAN_CAP].id;
    const priorResults: Row[] = [
      {
        id: "spr-overflow",
        run_id: priorRun.id,
        project_id: PROJECT_ID,
        prompt_id: overflowPromptId,
        prompt_text_snapshot: "New prompt overflow",
        brand_snapshot: "Acme",
        competitors_snapshot: [],
        country_snapshot: "ES",
        language_snapshot: "es",
        provider: "gemini",
        model: "gemini-2.5-flash",
        status: "completed",
        raw_response_text: "Prior overflow answer.",
        raw_response_json: {},
        tokens_in: 1,
        tokens_out: 1,
        cost_usd: null,
        llm_latency_ms: 100,
        brand_mentioned: false,
        citation_found: false,
        mentioned_competitors_count: 0,
        citations_count: 0,
        sentiment: "unknown",
        extraction_version: "grounded-position-v1",
        extracted_json: null,
        extraction_error: null
      }
    ];

    const { client, tables } = makeFakeDb(
      baseTables({
        project_prompts: newPrompts,
        scan_runs: [priorRun],
        scan_prompt_results: priorResults,
        profiles: [{ id: OWNER_ID, current_plan: "starter" }]
      })
    );

    const runId = await createPendingScanRunCore({
      projectId: PROJECT_ID,
      readClient: client as unknown as SupabaseClient,
      service: client as unknown as ServiceClient,
      triggeredByUserId: "user-1",
      triggerSource: "user",
      onlyPromptIds: newPrompts.map((p) => p.id)
    });

    // 25 prompts x 1 engine = 25 responses -> 2 samples (SAMPLING-1), so the
    // job count is the plan cap doubled. What this test is about is which
    // prompts got in, asserted on the distinct set below.
    const promptJobs = tables.jobs.filter((j) => j.job_type === "scan_prompt" && j.run_id === runId);
    expect(promptJobs).toHaveLength(STARTER_PLAN_CAP * 2);

    const scannedIds = new Set(promptJobs.map((j) => (j.payload_json as Row).prompt_id as string));
    expect(scannedIds.size).toBe(STARTER_PLAN_CAP);
    expect(scannedIds.has(overflowPromptId)).toBe(false);

    // The overflow prompt didn't get a job this run, but it does have a row
    // in the new run (copied forward from its own prior result).
    const newRunResults = tables.scan_prompt_results.filter((r) => r.run_id === runId);
    expect(newRunResults).toHaveLength(1);
    expect(newRunResults[0].prompt_id).toBe(overflowPromptId);
  });

  it("throws prompts_required when onlyPromptIds matches no active prompt", async () => {
    const { createPendingScanRunCore } = await import("@/lib/scan/run-creation");

    const p1 = { id: "p1", project_id: PROJECT_ID, prompt_text: "Existing prompt", is_active: true, created_at: "2026-01-01T00:00:00.000Z" };
    const { client } = makeFakeDb(baseTables({ project_prompts: [p1] }));

    await expect(
      createPendingScanRunCore({
        projectId: PROJECT_ID,
        readClient: client as unknown as SupabaseClient,
        service: client as unknown as ServiceClient,
        triggeredByUserId: "user-1",
        triggerSource: "user",
        onlyPromptIds: ["does-not-exist"]
      })
    ).rejects.toMatchObject({ code: "prompts_required" });
  });
});

describe("createPendingScanRunCore — free plan scan limit (PRICING-TRUTH-1)", () => {
  beforeEach(() => {
    nextId = 1;
  });

  const p1 = { id: "p1", project_id: PROJECT_ID, prompt_text: "Existing prompt", is_active: true, created_at: "2026-01-01T00:00:00.000Z" };

  it("blocks a second scan for a free-plan project that already has a completed run", async () => {
    const { createPendingScanRunCore } = await import("@/lib/scan/run-creation");

    const priorRun = { id: "run-old", project_id: PROJECT_ID, status: "completed", created_at: "2026-01-01T00:00:00.000Z" };
    const { client } = makeFakeDb(
      baseTables({
        project_prompts: [p1],
        scan_runs: [priorRun],
        profiles: [{ id: OWNER_ID, current_plan: "free" }]
      })
    );

    await expect(
      createPendingScanRunCore({
        projectId: PROJECT_ID,
        readClient: client as unknown as SupabaseClient,
        service: client as unknown as ServiceClient,
        triggeredByUserId: "user-1",
        triggerSource: "user"
      })
    ).rejects.toMatchObject({ code: "free_plan_scan_limit_reached" });
  });

  it("allows a free-plan project's first scan (no completed run yet)", async () => {
    const { createPendingScanRunCore } = await import("@/lib/scan/run-creation");

    const { client, tables } = makeFakeDb(
      baseTables({
        project_prompts: [p1],
        profiles: [{ id: OWNER_ID, current_plan: "free" }]
      })
    );

    const runId = await createPendingScanRunCore({
      projectId: PROJECT_ID,
      readClient: client as unknown as SupabaseClient,
      service: client as unknown as ServiceClient,
      triggeredByUserId: "user-1",
      triggerSource: "user"
    });

    expect(runId).toBeTruthy();
    expect(tables.scan_runs.some((r) => r.id === runId)).toBe(true);
  });

  it("does not block a free-plan project whose only prior run failed (SCAN-ROBUST-1 auto-retry must still get its one real scan)", async () => {
    const { createPendingScanRunCore } = await import("@/lib/scan/run-creation");

    const failedRun = { id: "run-failed", project_id: PROJECT_ID, status: "failed", created_at: "2026-01-01T00:00:00.000Z" };
    const { client, tables } = makeFakeDb(
      baseTables({
        project_prompts: [p1],
        scan_runs: [failedRun],
        profiles: [{ id: OWNER_ID, current_plan: "free" }]
      })
    );

    // Mirrors reconcileStuckScanRuns' internal auto-retry call shape:
    // no authenticated user, trigger_source='cron'.
    const runId = await createPendingScanRunCore({
      projectId: PROJECT_ID,
      readClient: client as unknown as SupabaseClient,
      service: client as unknown as ServiceClient,
      triggeredByUserId: null,
      triggerSource: "cron"
    });

    expect(runId).toBeTruthy();
    expect(tables.scan_runs.some((r) => r.id === runId)).toBe(true);
  });

  it("does not apply the free-plan limit to paid plans", async () => {
    const { createPendingScanRunCore } = await import("@/lib/scan/run-creation");

    const priorRun = { id: "run-old", project_id: PROJECT_ID, status: "completed", created_at: "2026-01-01T00:00:00.000Z" };
    const { client, tables } = makeFakeDb(
      baseTables({
        project_prompts: [p1],
        scan_runs: [priorRun],
        profiles: [{ id: OWNER_ID, current_plan: "starter" }]
      })
    );

    const runId = await createPendingScanRunCore({
      projectId: PROJECT_ID,
      readClient: client as unknown as SupabaseClient,
      service: client as unknown as ServiceClient,
      triggeredByUserId: "user-1",
      triggerSource: "user"
    });

    expect(runId).toBeTruthy();
    expect(tables.scan_runs.some((r) => r.id === runId)).toBe(true);
  });
});
