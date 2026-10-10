import { describe, expect, it } from "vitest";
import { loadReportInput, type ReportProject } from "./report-data";
import { COULD_NOT_VERIFY_NOTE, NOT_COVERED_NOTE } from "@/lib/web-audit/coverage-map";

const PROJECT: ReportProject = { id: "p-1", name: "Acme", brand: "Acme", domain: "acme.es" };
const RUN = { id: "run-1", created_at: "2026-10-08T10:00:00Z", finished_at: "2026-10-09T08:00:00Z" };

type TableResult = { data: unknown };

/** Same PostgREST double as page-data.test.ts: chainable, resolved per table. */
function fakeSupabase(byTable: Record<string, TableResult>) {
  const builder = (table: string) => {
    const chain: Record<string, unknown> = {};
    const self = () => chain;
    for (const method of ["select", "eq", "is", "in", "order", "limit"]) chain[method] = self;
    chain.maybeSingle = async () => byTable[table] ?? { data: null };
    chain.then = (resolve: (value: TableResult) => unknown) => resolve(byTable[table] ?? { data: null });
    return chain;
  };
  return { from: (table: string) => builder(table) };
}

function result(id: string, promptId: string, provider: string, over: Record<string, unknown> = {}) {
  return {
    id,
    prompt_id: promptId,
    prompt_text_snapshot: `Pregunta ${promptId}`,
    provider,
    raw_response_text: "Texto",
    brand_mentioned: false,
    citation_found: false,
    mentioned_competitors_count: 0,
    citations_count: 0,
    sentiment: "unknown",
    extracted_json: { brand: { mentioned: false, position: null }, competitors: [], citations: [] },
    extraction_error: null,
    brand_snapshot: "Acme",
    extraction_version: "v2",
    ...over
  };
}

const coverageContent = JSON.stringify({
  scanId: RUN.id,
  generatedAt: "2026-10-09T09:00:00Z",
  topics: [
    { promptId: "q1", topic: "t", found: true, pages: [], note: "" },
    { promptId: "q2", topic: "t", found: false, pages: [], note: NOT_COVERED_NOTE },
    { promptId: "q3", topic: "t", found: false, pages: [], note: COULD_NOT_VERIFY_NOTE }
  ]
});

function base(): Record<string, TableResult> {
  return {
    scan_runs: { data: RUN },
    scan_prompt_results: {
      data: [
        result("r1", "q1", "gemini"),
        result("r2", "q2", "openai"),
        result("r3", "q3", "gemini", { extracted_json: null, extraction_error: "timeout: x" })
      ]
    },
    project_prompts: { data: [{ id: "q1", category: "Local" }, { id: "q2", category: null }] },
    project_competitors: { data: [{ name: "Rival", domain: "rival.es" }] },
    projects: { data: { brand_aliases: ["Acme Studio", 3] } },
    run_scores: { data: [] },
    generated_solutions: { data: [{ sanitized_content: coverageContent }] },
    web_audit_snapshots: { data: null },
    recommendations: {
      data: [
        {
          id: "rec-1",
          title: "Publica una FAQ",
          description: "D",
          recommendation_type: "increase_brand_visibility",
          impact: "high",
          effort: "low",
          priority_rank: 1,
          evidence_json: {
            first_step: "Empieza por la portada",
            affected_prompt_ids: ["r1"],
            affected_prompt_details: [{ provider: "gemini" }, { provider: null }]
          }
        }
      ]
    }
  };
}

describe("loadReportInput", () => {
  it("returns null without a completed scan", async () => {
    const tables = base();
    tables.scan_runs = { data: null };
    expect(await loadReportInput({ supabase: fakeSupabase(tables), project: PROJECT })).toBeNull();
  });

  it("returns null when no answer could be extracted", async () => {
    const tables = base();
    tables.scan_prompt_results = { data: [result("r3", "q3", "gemini", { extracted_json: null, extraction_error: "x" })] };
    expect(await loadReportInput({ supabase: fakeSupabase(tables), project: PROJECT })).toBeNull();
  });

  it("keeps only extracted answers and resolves each one's topic", async () => {
    const input = (await loadReportInput({ supabase: fakeSupabase(base()), project: PROJECT }))!;
    expect(input.answers.map((a) => [a.promptId, a.topic])).toEqual([
      ["q1", "Local"],
      ["q2", null]
    ]);
    expect(input.scanDate).toBe(RUN.finished_at);
    expect(input.brandAliases).toEqual(["Acme Studio"]);
    expect(input.competitors).toEqual([{ name: "Rival", domain: "rival.es" }]);
  });

  it("reads coverage only from the map of this scan, keeping inconclusive apart", async () => {
    const input = (await loadReportInput({ supabase: fakeSupabase(base()), project: PROJECT }))!;
    expect(input.coverage).toEqual({ q1: "yes", q2: "no", q3: "unknown" });

    const other = base();
    other.generated_solutions = { data: [{ sanitized_content: coverageContent.replace(RUN.id, "older-run") }] };
    expect((await loadReportInput({ supabase: fakeSupabase(other), project: PROJECT }))!.coverage).toBeNull();
  });

  it("leaves the technical page out without an audit and the score null without run scores", async () => {
    const input = (await loadReportInput({ supabase: fakeSupabase(base()), project: PROJECT }))!;
    expect(input.technical).toBeNull();
    expect(input.geoScore).toBeNull();
  });

  it("maps the plan with its first step, engines and topics", async () => {
    const input = (await loadReportInput({ supabase: fakeSupabase(base()), project: PROJECT }))!;
    expect(input.plan).toEqual([
      { title: "Publica una FAQ", description: "D", firstStep: "Empieza por la portada", providers: ["gemini"], topics: ["Local"] }
    ]);
  });
});
