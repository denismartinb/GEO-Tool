import { beforeEach, describe, expect, it, vi } from "vitest";
import type { createServiceClient } from "@/lib/supabase/service";
import type { AuthenticatedContext } from "@/lib/scan/types";
import { MAX_REAL_SCAN_PROMPTS } from "@/lib/scan/constants";

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

function baseTables(overrides: Partial<Record<string, Row[]>> = {}) {
  return {
    projects: [{ id: PROJECT_ID, is_archived: false }],
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

  it("default (no onlyPromptIds) scans every active prompt, capped at MAX_REAL_SCAN_PROMPTS, with no copy-forward", async () => {
    const { createPendingScanRunCore } = await import("@/lib/scan/run-creation");

    const prompts = Array.from({ length: MAX_REAL_SCAN_PROMPTS + 2 }, (_, i) => ({
      id: `prompt-${i}`,
      project_id: PROJECT_ID,
      prompt_text: `Prompt ${i}`,
      is_active: true,
      created_at: `2026-01-01T00:00:0${i}.000Z`
    }));

    const { client, tables } = makeFakeDb(baseTables({ project_prompts: prompts }));

    const runId = await createPendingScanRunCore({
      projectId: PROJECT_ID,
      readClient: client as unknown as SupabaseClient,
      service: client as unknown as ServiceClient,
      triggeredByUserId: "user-1",
      triggerSource: "user"
    });

    expect(runId).toBeTruthy();

    const scanRun = tables.scan_runs.find((r) => r.id === runId);
    expect(scanRun?.total_prompts).toBe(MAX_REAL_SCAN_PROMPTS);

    const promptJobs = tables.jobs.filter((j) => j.job_type === "scan_prompt");
    expect(promptJobs).toHaveLength(MAX_REAL_SCAN_PROMPTS);
    // Oldest-first cap: prompt-0..prompt-(MAX-1) are scanned, not the last two.
    const scannedIds = promptJobs.map((j) => (j.payload_json as Row).prompt_id);
    expect(scannedIds).toEqual(prompts.slice(0, MAX_REAL_SCAN_PROMPTS).map((p) => p.id));

    expect(tables.scan_prompt_results).toHaveLength(0);
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

    const scanRun = tables.scan_runs.find((r) => r.id === runId);
    expect(scanRun?.total_prompts).toBe(1);

    const promptJobs = tables.jobs.filter((j) => j.job_type === "scan_prompt" && j.run_id === runId);
    expect(promptJobs).toHaveLength(1);
    expect((promptJobs[0].payload_json as Row).prompt_id).toBe(p3.id);

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
    expect(promptJobs).toHaveLength(1);
    expect((promptJobs[0].payload_json as Row).prompt_id).toBe(p2.id);
    expect(tables.scan_prompt_results).toHaveLength(0);
  });

  it("caps the scanned set at MAX_REAL_SCAN_PROMPTS even within onlyPromptIds, carrying forward the overflow", async () => {
    const { createPendingScanRunCore } = await import("@/lib/scan/run-creation");

    const newPrompts = Array.from({ length: MAX_REAL_SCAN_PROMPTS + 1 }, (_, i) => ({
      id: `new-${i}`,
      project_id: PROJECT_ID,
      prompt_text: `New prompt ${i}`,
      is_active: true,
      created_at: `2026-02-01T00:00:0${i}.000Z`
    }));

    const priorRun = { id: "run-old", project_id: PROJECT_ID, status: "completed", created_at: "2026-01-01T00:00:00.000Z" };
    // One of the "overflow" new prompts already has a prior result (simulating
    // a retry of an add-prompts batch whose first attempt partially scanned).
    const overflowPromptId = newPrompts[MAX_REAL_SCAN_PROMPTS].id;
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
      baseTables({ project_prompts: newPrompts, scan_runs: [priorRun], scan_prompt_results: priorResults })
    );

    const runId = await createPendingScanRunCore({
      projectId: PROJECT_ID,
      readClient: client as unknown as SupabaseClient,
      service: client as unknown as ServiceClient,
      triggeredByUserId: "user-1",
      triggerSource: "user",
      onlyPromptIds: newPrompts.map((p) => p.id)
    });

    const promptJobs = tables.jobs.filter((j) => j.job_type === "scan_prompt" && j.run_id === runId);
    expect(promptJobs).toHaveLength(MAX_REAL_SCAN_PROMPTS);

    const scannedIds = new Set(promptJobs.map((j) => (j.payload_json as Row).prompt_id as string));
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
