import { afterEach, describe, expect, it, vi } from "vitest";
import type { createServiceClient } from "@/lib/supabase/service";
import type { AuthenticatedContext } from "@/lib/scan/types";
import { selectCandidateUrls, runTechnicalAuditCore, MAX_AUDIT_PAGES, TECH_AUDIT_TOTAL_BUDGET_MS } from "./technical-audit";
import * as fetchPageModule from "./fetch-page";
import * as robotsModule from "./robots";
import * as rateLimitModule from "./snapshot-rate-limit";
import * as citationResolutionModule from "@/lib/scan/citation-resolution";

vi.mock("./fetch-page", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./fetch-page")>();
  return { ...actual, fetchPageSafely: vi.fn() };
});
vi.mock("./robots", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./robots")>();
  return { ...actual, buildBotAccessReport: vi.fn() };
});
vi.mock("./snapshot-rate-limit", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./snapshot-rate-limit")>();
  return { ...actual, checkSnapshotRateLimit: vi.fn() };
});
vi.mock("@/lib/scan/citation-resolution", () => ({
  resolveGroundingRedirects: vi.fn(async () => new Map())
}));

describe("selectCandidateUrls", () => {
  it("dedupes homepage/coverage/grounding candidates by URL-without-hash/query, keeping priority order", () => {
    const result = selectCandidateUrls({
      homepageUrl: "https://acme.com/",
      coveragePages: [
        { url: "https://acme.com/pricing?utm=x", topic: "pricing" },
        { url: "https://acme.com/blog/a", topic: "blog a" }
      ],
      groundingCitationUrls: [
        { url: "https://acme.com/pricing#top", promptCount: 2 }, // dedupes against coverage page above
        { url: "https://acme.com/blog/b", promptCount: 1 }
      ],
      projectDomainNormalized: "acme.com"
    });

    expect(result.map((c) => c.url)).toEqual([
      "https://acme.com/",
      "https://acme.com/pricing?utm=x",
      "https://acme.com/blog/a",
      "https://acme.com/blog/b"
    ]);
    expect(result[1].source).toBe("coverage_page"); // the earlier (coverage) entry wins the dedupe, not the later grounding one
    expect(result[3].contextLabel).toBe("citada en 1 prompt");
  });

  it("caps at maxPages", () => {
    const coveragePages = Array.from({ length: 20 }, (_, i) => ({ url: `https://acme.com/p${i}`, topic: `t${i}` }));
    const result = selectCandidateUrls({
      homepageUrl: "https://acme.com/",
      coveragePages,
      groundingCitationUrls: [],
      projectDomainNormalized: "acme.com",
      maxPages: 5
    });
    expect(result).toHaveLength(5);
  });

  it("defaults the cap to MAX_AUDIT_PAGES", () => {
    const coveragePages = Array.from({ length: 20 }, (_, i) => ({ url: `https://acme.com/p${i}`, topic: `t${i}` }));
    const result = selectCandidateUrls({
      homepageUrl: "https://acme.com/",
      coveragePages,
      groundingCitationUrls: [],
      projectDomainNormalized: "acme.com"
    });
    expect(result).toHaveLength(MAX_AUDIT_PAGES);
  });

  it("rejects off-domain and lookalike-domain candidates", () => {
    const result = selectCandidateUrls({
      homepageUrl: "https://acme.com/",
      coveragePages: [
        { url: "https://evilacme.com/page", topic: "lookalike" }, // must NOT match acme.com by suffix
        { url: "https://sub.acme.com/page", topic: "real subdomain" }
      ],
      groundingCitationUrls: [{ url: "http://acme.com/insecure", promptCount: 1 }], // http, not https
      projectDomainNormalized: "acme.com"
    });
    expect(result.map((c) => c.url)).toEqual(["https://acme.com/", "https://sub.acme.com/page"]);
  });

  it("drops candidates with an unparseable URL instead of throwing", () => {
    expect(() =>
      selectCandidateUrls({
        homepageUrl: "https://acme.com/",
        coveragePages: [{ url: "not a url", topic: "broken" }],
        groundingCitationUrls: [],
        projectDomainNormalized: "acme.com"
      })
    ).not.toThrow();
  });
});

type ServiceClient = ReturnType<typeof createServiceClient>;
type Supabase = AuthenticatedContext["supabase"];

type Result = { data: unknown; error: unknown };

/**
 * `listResult` is what awaiting the builder resolves to, `result` what
 * `.maybeSingle()` does. The same table is read both ways now — the
 * regression-alert pass (WEB-AUDIT-ALERTS-1) reads coverage-map HISTORY off
 * `generated_solutions`, which the candidate-selection path above reads a
 * single row from — so one shared shape could no longer serve both.
 */
function makeBuilder(result: Result, listResult: Result) {
  const builder: Record<string, unknown> = {
    eq: () => builder,
    is: () => builder,
    in: () => builder,
    gte: () => builder,
    order: () => builder,
    limit: () => builder,
    maybeSingle: () => Promise.resolve(result),
    then: (resolve: (v: Result) => unknown) => Promise.resolve(listResult).then(resolve)
  };
  return builder;
}

type TableConfig = {
  select?: Result;
  selectList?: Result;
  insertError?: unknown;
  /** Row handed back by `insert(...).select("id").maybeSingle()`. */
  insertedRow?: unknown;
  onInsert?: (payload: unknown) => void;
  onUpsert?: (payload: unknown) => void;
};

function makeClient(tables: Record<string, TableConfig>) {
  return {
    from(table: string) {
      const config = tables[table] ?? {};
      return {
        select: vi.fn(() =>
          makeBuilder(config.select ?? { data: null, error: null }, config.selectList ?? config.select ?? { data: [], error: null })
        ),
        insert: vi.fn((payload: unknown) => {
          config.onInsert?.(payload);
          const error = config.insertError ?? null;
          // Both shapes: awaited directly (older callers) and
          // `.select(...).maybeSingle()` (the snapshot insert, which needs
          // the new row's id to key its regression notices).
          return Object.assign(Promise.resolve({ error }), {
            select: () => ({
              maybeSingle: () => Promise.resolve({ data: error ? null : (config.insertedRow ?? { id: "snapshot-new" }), error })
            })
          });
        }),
        // lib/notifications/emit.ts writes through upsert. Present so a test
        // client never makes emission throw for a reason production wouldn't.
        upsert: vi.fn((payload: unknown) => {
          config.onUpsert?.(payload);
          return Promise.resolve({ error: null });
        })
      };
    }
  };
}

function baseTables(overrides: Record<string, TableConfig> = {}): Record<string, TableConfig> {
  return {
    projects: { select: { data: { id: "project-1", domain: "acme.com", is_archived: false }, error: null } },
    profiles: { select: { data: { current_plan: "pro" }, error: null } },
    scan_runs: { select: { data: { id: "scan-1" }, error: null } },
    web_audit_snapshots: { select: { data: null, error: null } },
    generated_solutions: { select: { data: null, error: null }, selectList: { data: [], error: null } },
    scan_prompt_results: { select: { data: [], error: null } },
    notifications: {},
    ...overrides
  };
}

const mockedFetchPageSafely = vi.mocked(fetchPageModule.fetchPageSafely);
const mockedBuildBotAccessReport = vi.mocked(robotsModule.buildBotAccessReport);
const mockedCheckSnapshotRateLimit = vi.mocked(rateLimitModule.checkSnapshotRateLimit);
const mockedResolveGroundingRedirects = vi.mocked(citationResolutionModule.resolveGroundingRedirects);

describe("runTechnicalAuditCore", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("serves a fresh cache hit WITHOUT calling the rate limiter", async () => {
    const tables = baseTables({
      web_audit_snapshots: {
        select: {
          data: {
            scan_id: "scan-1",
            readiness_score: 80,
            pages: [],
            bots: { robotsFound: true, bots: [], llmsTxtFound: false, llmsTxtBytes: null },
            created_at: new Date().toISOString()
          },
          error: null
        }
      }
    });
    const supabase = makeClient(tables) as unknown as Supabase;
    const service = makeClient(tables) as unknown as ServiceClient;

    const result = await runTechnicalAuditCore({
      projectId: "project-1",
      supabase,
      service,
      user: { id: "user-1" } as AuthenticatedContext["user"]
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.cached).toBe(true);
    expect(result.snapshot.readinessScore).toBe(80);

    // Cache-before-rate-limit ordering (data-guardian R4): a cache hit must
    // never consume rate-limit budget.
    expect(mockedCheckSnapshotRateLimit).not.toHaveBeenCalled();
    expect(mockedFetchPageSafely).not.toHaveBeenCalled();
  });

  it("does not serve a snapshot from a different (stale) scan as a cache hit", async () => {
    mockedCheckSnapshotRateLimit.mockResolvedValue({
      allowed: true,
      count: 0,
      limit: 5,
      remaining: 5,
      windowStart: new Date().toISOString()
    });
    mockedFetchPageSafely.mockResolvedValue({ status: "skipped_offsite" });
    mockedBuildBotAccessReport.mockResolvedValue({ robotsFound: false, bots: [], llmsTxtFound: false, llmsTxtBytes: null, sitemapFound: false });

    const tables = baseTables({
      web_audit_snapshots: {
        select: {
          data: { scan_id: "scan-OLD", readiness_score: 50, pages: [], bots: {}, created_at: new Date().toISOString() },
          error: null
        }
      }
    });
    const supabase = makeClient(tables) as unknown as Supabase;
    const service = makeClient(tables) as unknown as ServiceClient;

    const result = await runTechnicalAuditCore({
      projectId: "project-1",
      supabase,
      service,
      user: { id: "user-1" } as AuthenticatedContext["user"]
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.cached).toBe(false);
    expect(mockedCheckSnapshotRateLimit).toHaveBeenCalledTimes(1);
  });

  it("marks pages as skipped_budget once the total time budget is exceeded, and still persists", async () => {
    mockedCheckSnapshotRateLimit.mockResolvedValue({
      allowed: true,
      count: 0,
      limit: 5,
      remaining: 5,
      windowStart: new Date().toISOString()
    });
    mockedBuildBotAccessReport.mockResolvedValue({ robotsFound: false, bots: [], llmsTxtFound: false, llmsTxtBytes: null, sitemapFound: false });

    mockedFetchPageSafely.mockResolvedValue({ status: "analyzed", html: "<html></html>", finalUrl: "https://acme.com/" });

    // Simulate wall-clock elapse without real waiting: startedAt reads 0,
    // the first budget check (before the homepage fetch) reads 0 (under
    // budget), the second budget check (before the second candidate) reads
    // past TECH_AUDIT_TOTAL_BUDGET_MS.
    const dateNowSpy = vi
      .spyOn(Date, "now")
      .mockReturnValueOnce(0) // startedAt
      .mockReturnValueOnce(0) // budget check before candidate 1 (homepage)
      .mockReturnValue(TECH_AUDIT_TOTAL_BUDGET_MS + 1); // every check after that is over budget

    const tables = baseTables({
      generated_solutions: {
        select: {
          data: {
            sanitized_content: JSON.stringify({
              scanId: "scan-1",
              generatedAt: new Date().toISOString(),
              topics: [{ promptId: "p1", topic: "t1", found: true, pages: [{ url: "https://acme.com/other", title: "Other" }], note: "" }]
            })
          },
          error: null
        },
        selectList: { data: [], error: null }
      }
    });
    let insertedPayload: unknown = null;
    tables.web_audit_snapshots.onInsert = (payload) => {
      insertedPayload = payload;
    };
    const supabase = makeClient(tables) as unknown as Supabase;
    const service = makeClient(tables) as unknown as ServiceClient;

    const result = await runTechnicalAuditCore({
      projectId: "project-1",
      supabase,
      service,
      user: { id: "user-1" } as AuthenticatedContext["user"]
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    const statuses = result.snapshot.pages.map((p) => p.status);
    expect(statuses).toContain("skipped_budget");
    expect(insertedPayload).not.toBeNull();
    expect((insertedPayload as { pages: unknown[] }).pages.length).toBe(result.snapshot.pages.length);

    dateNowSpy.mockRestore();
  });

  it("audits a non-Pro plan instead of refusing it (docs/adr/0035)", async () => {
    // The technical half costs no LLM calls, and its score is a component of
    // the GEO Score (docs/adr/0033). Gating it made the headline metric
    // measure a different number of components per plan.
    const tables = baseTables({ profiles: { select: { data: { current_plan: "starter" }, error: null } } });
    const supabase = makeClient(tables) as unknown as Supabase;
    const service = makeClient(tables) as unknown as ServiceClient;

    const result = await runTechnicalAuditCore({
      projectId: "project-1",
      supabase,
      service,
      user: { id: "user-1" } as AuthenticatedContext["user"]
    });

    expect(result.success).toBe(true);
  });

  it("audits a free plan too — the floor, not just the tier below Pro", async () => {
    const tables = baseTables({ profiles: { select: { data: { current_plan: "free" }, error: null } } });
    const supabase = makeClient(tables) as unknown as Supabase;
    const service = makeClient(tables) as unknown as ServiceClient;

    const result = await runTechnicalAuditCore({
      projectId: "project-1",
      supabase,
      service,
      user: { id: "user-1" } as AuthenticatedContext["user"]
    });

    expect(result.success).toBe(true);
  });

  it("returns a blocking message and persists nothing when the rate limit is exceeded", async () => {
    mockedCheckSnapshotRateLimit.mockResolvedValue({
      allowed: false,
      reason: "rate_limit_exceeded",
      count: 5,
      limit: 5,
      remaining: 0,
      windowStart: new Date().toISOString()
    });

    const tables = baseTables();
    let insertCalled = false;
    tables.web_audit_snapshots.onInsert = () => {
      insertCalled = true;
    };
    const supabase = makeClient(tables) as unknown as Supabase;
    const service = makeClient(tables) as unknown as ServiceClient;

    const result = await runTechnicalAuditCore({
      projectId: "project-1",
      supabase,
      service,
      user: { id: "user-1" } as AuthenticatedContext["user"]
    });

    expect(result.success).toBe(false);
    expect(insertCalled).toBe(false);
    expect(mockedFetchPageSafely).not.toHaveBeenCalled();
  });

  it("never fetches an own-domain grounding citation whose redirect fails to resolve", async () => {
    mockedCheckSnapshotRateLimit.mockResolvedValue({
      allowed: true,
      count: 0,
      limit: 5,
      remaining: 5,
      windowStart: new Date().toISOString()
    });
    mockedBuildBotAccessReport.mockResolvedValue({ robotsFound: false, bots: [], llmsTxtFound: false, llmsTxtBytes: null, sitemapFound: false });
    mockedFetchPageSafely.mockResolvedValue({ status: "analyzed", html: "<html></html>", finalUrl: "https://acme.com/" });
    mockedResolveGroundingRedirects.mockResolvedValue(new Map([["https://vertexaisearch.example/redirect1", { resolvedUrl: null }]]));

    const tables = baseTables({
      scan_prompt_results: {
        select: {
          data: [
            {
              prompt_id: "p1",
              extracted_json: {
                citations: [{ url: "https://vertexaisearch.example/redirect1", domain: "acme.com", source: "grounding" }]
              }
            }
          ],
          error: null
        }
      }
    });
    const supabase = makeClient(tables) as unknown as Supabase;
    const service = makeClient(tables) as unknown as ServiceClient;

    const result = await runTechnicalAuditCore({
      projectId: "project-1",
      supabase,
      service,
      user: { id: "user-1" } as AuthenticatedContext["user"]
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    // Only the homepage should have been fetched — the unresolved grounding
    // citation never becomes a candidate.
    expect(mockedFetchPageSafely).toHaveBeenCalledTimes(1);
    expect(mockedFetchPageSafely).toHaveBeenCalledWith("https://acme.com/", "acme.com");
  });
});
