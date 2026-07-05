import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/llm/gemini", () => ({ auditDomainContent: vi.fn() }));
vi.mock("@/lib/scan/citation-resolution", () => ({ resolveGroundingRedirects: vi.fn() }));
vi.mock("@/lib/recommendations/generation-rate-limit", () => ({ checkGenerationRateLimit: vi.fn() }));

import { auditDomainCoverageCore } from "./domain-coverage";
import { auditDomainContent } from "@/lib/llm/gemini";
import { resolveGroundingRedirects } from "@/lib/scan/citation-resolution";
import { checkGenerationRateLimit } from "@/lib/recommendations/generation-rate-limit";

const mockedGemini = vi.mocked(auditDomainContent);
const mockedResolve = vi.mocked(resolveGroundingRedirects);
const mockedRateLimit = vi.mocked(checkGenerationRateLimit);

type Cfg = {
  project?: unknown;
  profile?: unknown;
  latestRun?: unknown;
  prompts?: unknown[];
  cacheRow?: { sanitized_content: string | null; raw_content?: string | null } | null;
  insertError?: { message: string } | null;
  /** Active add_citation_block recommendations for the current run (topic-selection priority). */
  citationRecRows?: unknown[];
  /** scan_prompt_results rows mapping id -> prompt_id for those recommendations' evidence. */
  citationResultRows?: unknown[];
};

function makeSupabase(cfg: Cfg) {
  return {
    from(table: string) {
      const builder: Record<string, unknown> = {};
      const chain = () => builder;
      builder.select = chain;
      builder.eq = chain;
      builder.is = chain;
      builder.in = chain;
      builder.order = chain;
      builder.limit = chain;
      builder.maybeSingle = () => {
        if (table === "projects") return Promise.resolve({ data: cfg.project ?? null, error: null });
        if (table === "profiles") return Promise.resolve({ data: cfg.profile ?? null, error: null });
        if (table === "scan_runs") return Promise.resolve({ data: cfg.latestRun ?? null, error: null });
        return Promise.resolve({ data: null, error: null });
      };
      // project_prompts/recommendations/scan_prompt_results are all awaited
      // directly after their filter chain (list queries).
      builder.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => {
        let data: unknown[] = [];
        if (table === "project_prompts") data = cfg.prompts ?? [];
        else if (table === "recommendations") data = cfg.citationRecRows ?? [];
        else if (table === "scan_prompt_results") data = cfg.citationResultRows ?? [];
        return Promise.resolve({ data, error: null }).then(resolve, reject);
      };
      return builder;
    }
  };
}

function makeService(cfg: Cfg) {
  const inserted: Array<Record<string, unknown>> = [];
  const service = {
    inserted,
    from() {
      const builder: Record<string, unknown> = {};
      const chain = () => builder;
      builder.select = chain;
      builder.eq = chain;
      builder.is = chain;
      builder.order = chain;
      builder.limit = chain;
      builder.maybeSingle = () => Promise.resolve({ data: cfg.cacheRow ?? null, error: null });
      builder.insert = (payload: Record<string, unknown>) => {
        inserted.push(payload);
        return Promise.resolve({ error: cfg.insertError ?? null });
      };
      return builder;
    }
  };
  return service;
}

const USER = { id: "user-1" } as never;

function makeDeps(cfg: Cfg = {}) {
  const merged: Cfg = {
    project: { id: "project-1", brand: "Acme", domain: "acme.com", language: "es", is_archived: false },
    profile: { current_plan: "agency" },
    latestRun: { id: "scan-1" },
    prompts: [{ id: "p1", prompt_text: "mejor crm para pymes" }],
    cacheRow: null,
    insertError: null,
    ...cfg
  };
  const service = makeService(merged);
  return {
    projectId: "project-1",
    supabase: makeSupabase(merged) as never,
    service: service as never,
    user: USER,
    _service: service
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedRateLimit.mockResolvedValue({ allowed: true } as never);
  mockedGemini.mockResolvedValue({
    text: "Tu web cubre esto en profundidad.",
    groundingChunks: [{ uri: "g1", title: "Página CRM" }],
    model: "m"
  });
  mockedResolve.mockImplementation(
    async (uris: string[]) => new Map(uris.map((u) => [u, { resolvedUrl: "https://acme.com/crm" }]))
  );
});

describe("auditDomainCoverageCore", () => {
  it("denies when the project does not exist or is not owned by this user", async () => {
    const deps = makeDeps({ project: null });
    const result = await auditDomainCoverageCore(deps);
    expect(result.success).toBe(false);
    expect(mockedGemini).not.toHaveBeenCalled();
  });

  it("denies an archived project", async () => {
    const deps = makeDeps({ project: { id: "project-1", brand: "Acme", domain: "acme.com", language: "es", is_archived: true } });
    const result = await auditDomainCoverageCore(deps);
    expect(result.success).toBe(false);
    expect(mockedGemini).not.toHaveBeenCalled();
  });

  it("denies a free-plan user at the Pro gate", async () => {
    const deps = makeDeps({ profile: { current_plan: "free" } });
    const result = await auditDomainCoverageCore(deps);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("plan Pro");
    expect(mockedGemini).not.toHaveBeenCalled();
  });

  it("fails closed when the profile row is missing (does not default to allowed)", async () => {
    const deps = makeDeps({ profile: null });
    const result = await auditDomainCoverageCore(deps);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("plan Pro");
    expect(mockedGemini).not.toHaveBeenCalled();
  });

  it("allows agency and pro plans through the gate", async () => {
    for (const plan of ["agency", "pro"]) {
      const deps = makeDeps({ profile: { current_plan: plan } });
      const result = await auditDomainCoverageCore(deps);
      expect(result.success).toBe(true);
    }
  });

  it("requires at least one completed scan", async () => {
    const deps = makeDeps({ latestRun: null });
    const result = await auditDomainCoverageCore(deps);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("escaneo completado");
    expect(mockedGemini).not.toHaveBeenCalled();
  });

  it("requires at least one active prompt", async () => {
    const deps = makeDeps({ prompts: [] });
    const result = await auditDomainCoverageCore(deps);
    expect(result.success).toBe(false);
    expect(mockedGemini).not.toHaveBeenCalled();
  });

  it("keeps a citation that resolves to the project's own domain as a verified page", async () => {
    const deps = makeDeps();
    const result = await auditDomainCoverageCore(deps);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.coverage.topics).toHaveLength(1);
      expect(result.coverage.topics[0].found).toBe(true);
      expect(result.coverage.topics[0].pages[0].url).toBe("https://acme.com/crm");
      expect(result.cached).toBe(false); // fresh run, not a cache hit
    }
  });

  it("persists a coverage row with a NULL recommendation_id and generation_type 'domain_coverage'", async () => {
    const deps = makeDeps();
    await auditDomainCoverageCore(deps);
    expect(deps._service.inserted).toHaveLength(1);
    const row = deps._service.inserted[0];
    expect(row.recommendation_id).toBeNull();
    expect(row.generation_type).toBe("domain_coverage");
    expect(row.is_sanitized).toBe(true);
    expect(row.status).toBe("completed");
    expect((row.evidence_json as { scan_id: string }).scan_id).toBe("scan-1");
  });

  it("discards a citation resolving to an unrelated domain that merely contains the project domain as a substring", async () => {
    mockedResolve.mockImplementation(
      async (uris: string[]) => new Map(uris.map((u) => [u, { resolvedUrl: "https://evilacme.com/crm" }]))
    );
    const deps = makeDeps();
    const result = await auditDomainCoverageCore(deps);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.coverage.topics[0].found).toBe(false);
      expect(result.coverage.topics[0].pages).toHaveLength(0);
      expect(result.coverage.topics[0].note).toContain("No hemos encontrado");
    }
  });

  it("keeps a real subdomain of the project's domain", async () => {
    mockedResolve.mockImplementation(
      async (uris: string[]) => new Map(uris.map((u) => [u, { resolvedUrl: "https://blog.acme.com/crm" }]))
    );
    const deps = makeDeps();
    const result = await auditDomainCoverageCore(deps);
    expect(result.success).toBe(true);
    if (result.success) expect(result.coverage.topics[0].found).toBe(true);
  });

  it("fails closed on an unresolved redirect, never treating it as own-domain", async () => {
    mockedResolve.mockImplementation(async (uris: string[]) => new Map(uris.map((u) => [u, { resolvedUrl: null }])));
    const deps = makeDeps();
    const result = await auditDomainCoverageCore(deps);
    expect(result.success).toBe(true);
    if (result.success) expect(result.coverage.topics[0].found).toBe(false);
  });

  it("uses a fixed non-Gemini note (not the model's own text) when nothing verified is found", async () => {
    mockedGemini.mockResolvedValue({
      text: "¡Confía en mí, tu web cubre esto perfectamente!",
      groundingChunks: [{ uri: "g1", title: "x" }],
      model: "m"
    });
    mockedResolve.mockImplementation(async (uris: string[]) => new Map(uris.map((u) => [u, { resolvedUrl: null }])));
    const deps = makeDeps();
    const result = await auditDomainCoverageCore(deps);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.coverage.topics[0].note).not.toContain("Confía en mí");
      expect(result.coverage.topics[0].note).toContain("No hemos encontrado");
    }
  });

  it("fails soft per topic when a Gemini call throws, still persisting and succeeding", async () => {
    mockedGemini.mockRejectedValueOnce(new Error("gemini down"));
    const deps = makeDeps({
      prompts: [
        { id: "p1", prompt_text: "tema uno" },
        { id: "p2", prompt_text: "tema dos" }
      ]
    });
    const result = await auditDomainCoverageCore(deps);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.coverage.topics).toHaveLength(2);
      expect(result.coverage.topics[0].found).toBe(false);
      expect(result.coverage.topics[0].note).toContain("No hemos podido verificar");
      // Second topic still processed normally.
      expect(result.coverage.topics[1].found).toBe(true);
    }
    expect(deps._service.inserted).toHaveLength(1);
  });

  it("returns success:false and inserts nothing renderable when persistence fails", async () => {
    const deps = makeDeps({ insertError: { message: "db down" } });
    const result = await auditDomainCoverageCore(deps);
    expect(result.success).toBe(false);
  });

  it("returns a cached coverage map (no Gemini call) when it matches the current scan", async () => {
    const cached = {
      scanId: "scan-1",
      generatedAt: "2026-01-01T00:00:00.000Z",
      topics: [{ promptId: "p1", topic: "x", found: true, pages: [{ url: "https://acme.com/a", title: "A" }], note: "n" }]
    };
    const deps = makeDeps({ cacheRow: { sanitized_content: JSON.stringify(cached) } });
    const result = await auditDomainCoverageCore(deps);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.coverage.scanId).toBe("scan-1");
      expect(result.cached).toBe(true);
    }
    expect(mockedGemini).not.toHaveBeenCalled();
  });

  it("regenerates when the cached map is from a different (older) scan", async () => {
    const cached = {
      scanId: "old-scan",
      generatedAt: "2026-01-01T00:00:00.000Z",
      topics: [{ promptId: "p1", topic: "x", found: false, pages: [], note: "n" }]
    };
    const deps = makeDeps({ cacheRow: { sanitized_content: JSON.stringify(cached) } });
    const result = await auditDomainCoverageCore(deps);
    expect(result.success).toBe(true);
    expect(mockedGemini).toHaveBeenCalled();
  });

  it("returns a sanitized rate-limit message and never calls Gemini when over the daily quota", async () => {
    mockedRateLimit.mockResolvedValue({ allowed: false, reason: "rate_limit_exceeded" } as never);
    const deps = makeDeps();
    const result = await auditDomainCoverageCore(deps);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toContain("límite");
    expect(mockedGemini).not.toHaveBeenCalled();
  });

  it("caps the number of audited topics at MAX_COVERAGE_TOPICS", async () => {
    const prompts = Array.from({ length: 9 }, (_, i) => ({ id: `p${i}`, prompt_text: `tema ${i}` }));
    const deps = makeDeps({ prompts });
    const result = await auditDomainCoverageCore(deps);
    expect(result.success).toBe(true);
    if (result.success) expect(result.coverage.topics.length).toBe(6);
    expect(mockedGemini).toHaveBeenCalledTimes(6);
  });

  it("prioritizes prompts backing an active add_citation_block gap this run, even when they'd otherwise fall outside the budget", async () => {
    // 9 active prompts, but only "p8" (last by creation order — would never be
    // reached by a naive first-N selection) backs a real citation-gap card.
    const prompts = Array.from({ length: 9 }, (_, i) => ({ id: `p${i}`, prompt_text: `tema ${i}` }));
    const deps = makeDeps({
      prompts,
      citationRecRows: [{ evidence_json: { affected_prompt_details: [{ id: "result-for-p8" }] } }],
      citationResultRows: [{ id: "result-for-p8", prompt_id: "p8" }]
    });
    const result = await auditDomainCoverageCore(deps);
    expect(result.success).toBe(true);
    if (result.success) {
      const promptIds = result.coverage.topics.map((t) => t.promptId);
      expect(promptIds).toContain("p8");
      expect(promptIds[0]).toBe("p8"); // audited first, ahead of creation order
      expect(result.coverage.topics.length).toBe(6);
    }
  });

  it("falls back to creation order alone when there are no active citation-gap recommendations this run", async () => {
    const prompts = [
      { id: "p1", prompt_text: "tema uno" },
      { id: "p2", prompt_text: "tema dos" }
    ];
    const deps = makeDeps({ prompts, citationRecRows: [] });
    const result = await auditDomainCoverageCore(deps);
    expect(result.success).toBe(true);
    if (result.success) expect(result.coverage.topics.map((t) => t.promptId)).toEqual(["p1", "p2"]);
  });

  // WEB-AUDIT-DQ: the per-topic diagnostic must report where own-domain pages
  // are lost, without changing the coverage result.
  describe("coverage-quality diagnostic (WEB-AUDIT-DQ)", () => {
    function findDiag(spy: ReturnType<typeof vi.spyOn>) {
      return spy.mock.calls.find((c) => typeof c[0] === "string" && c[0].includes(":dq topic_diag"))?.[1] as
        | { chunks: number; resolved: number; own: number; other_domains: string[] }
        | undefined;
    }

    it("reports chunks/resolved/own when a citation resolves to the own domain", async () => {
      const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
      const result = await auditDomainCoverageCore(makeDeps());
      const diag = findDiag(infoSpy);
      infoSpy.mockRestore();
      expect(result.success).toBe(true);
      expect(diag).toMatchObject({ chunks: 1, resolved: 1, own: 1, other_domains: [] });
    });

    it("reports the off-domain sample when a citation resolves elsewhere (own stays 0)", async () => {
      mockedResolve.mockImplementation(
        async (uris: string[]) => new Map(uris.map((u) => [u, { resolvedUrl: "https://evilacme.com/crm" }]))
      );
      const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
      const result = await auditDomainCoverageCore(makeDeps());
      const diag = findDiag(infoSpy);
      infoSpy.mockRestore();
      expect(result.success).toBe(true);
      if (result.success) expect(result.coverage.topics[0].found).toBe(false); // result unchanged
      expect(diag).toMatchObject({ chunks: 1, resolved: 1, own: 0, other_domains: ["evilacme.com"] });
    });

    it("reports resolved:0 when the redirect never resolves", async () => {
      mockedResolve.mockImplementation(async (uris: string[]) => new Map(uris.map((u) => [u, { resolvedUrl: null }])));
      const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
      await auditDomainCoverageCore(makeDeps());
      const diag = findDiag(infoSpy);
      infoSpy.mockRestore();
      expect(diag).toMatchObject({ chunks: 1, resolved: 0, own: 0 });
    });

    it("emits a cached_diag with per-topic chunk counts on a cache hit (no Gemini call)", async () => {
      const cached = {
        scanId: "scan-1",
        generatedAt: "2026-01-01T00:00:00.000Z",
        topics: [{ promptId: "p1", topic: "x", found: false, pages: [], note: "n" }]
      };
      const rawContent = JSON.stringify({ topics: [{ promptId: "p1", text: "t", groundingChunks: [] }] });
      const deps = makeDeps({ cacheRow: { sanitized_content: JSON.stringify(cached), raw_content: rawContent } });
      const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
      const result = await auditDomainCoverageCore(deps);
      const cachedDiag = infoSpy.mock.calls.find(
        (c) => typeof c[0] === "string" && c[0].includes(":dq cached_diag")
      )?.[1] as { chunks: number; found: boolean } | undefined;
      infoSpy.mockRestore();
      expect(result.success).toBe(true);
      expect(mockedGemini).not.toHaveBeenCalled();
      // Ryanair-like signal: a cached "not found" topic whose Gemini call
      // returned zero grounding chunks — points at the query/grounding stage.
      expect(cachedDiag).toMatchObject({ chunks: 0, found: false });
    });
  });
});
