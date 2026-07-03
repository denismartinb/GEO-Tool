import { describe, expect, it, vi } from "vitest";
import type { AuthenticatedContext } from "@/lib/scan/types";
import type { createServiceClient } from "@/lib/supabase/service";

const auditDomainContentMock = vi.fn();
vi.mock("@/lib/llm/gemini", () => ({
  auditDomainContent: (...args: unknown[]) => auditDomainContentMock(...args)
}));

const resolveGroundingRedirectsMock = vi.fn();
vi.mock("@/lib/scan/citation-resolution", () => ({
  resolveGroundingRedirects: (...args: unknown[]) => resolveGroundingRedirectsMock(...args)
}));

type SupabaseClient = AuthenticatedContext["supabase"];
type ServiceClient = ReturnType<typeof createServiceClient>;
type Row = Record<string, unknown>;
type DomainAuditSolution = { found: boolean; pages: { url: string; title: string }[]; note: string };

function makeFakeSupabase({
  project,
  profile,
  recommendation
}: {
  project: Row | null;
  profile: Row | null;
  recommendation: Row | null;
}) {
  function singleRowTable(row: Row | null) {
    return {
      select(_cols: string) {
        const filters: Array<[string, unknown]> = [];
        const builder = {
          eq(col: string, val: unknown) {
            filters.push([col, val]);
            return builder;
          },
          maybeSingle() {
            const match = row && filters.every(([col, val]) => row[col] === val) ? row : null;
            return Promise.resolve({ data: match, error: null });
          }
        };
        return builder;
      }
    };
  }

  const client = {
    from(table: string) {
      if (table === "projects") return singleRowTable(project);
      if (table === "profiles") return singleRowTable(profile);
      if (table === "recommendations") return singleRowTable(recommendation);
      throw new Error(`Unexpected table in fake supabase: ${table}`);
    }
  };

  return { client: client as unknown as SupabaseClient };
}

function makeFakeService({
  existingSolution = null,
  rateCount = 0,
  rateError = null,
  insertError = false
}: {
  existingSolution?: DomainAuditSolution | null;
  rateCount?: number;
  rateError?: { message: string } | null;
  insertError?: boolean;
} = {}) {
  const inserted: Row[] = [];

  const client = {
    from(table: string) {
      if (table !== "generated_solutions") {
        throw new Error(`Unexpected table in fake service client: ${table}`);
      }
      return {
        select(_cols: string, options?: { count?: string; head?: boolean }) {
          if (options?.head) {
            const builder = {
              eq() {
                return builder;
              },
              gte() {
                return builder;
              },
              then(resolve: (value: { count: number | null; error: unknown }) => unknown) {
                return Promise.resolve({ count: rateCount, error: rateError }).then(resolve);
              }
            };
            return builder;
          }
          const builder = {
            eq() {
              return builder;
            },
            order() {
              return builder;
            },
            limit() {
              return builder;
            },
            maybeSingle() {
              return Promise.resolve({
                data: existingSolution ? { sanitized_content: JSON.stringify(existingSolution) } : null,
                error: null
              });
            }
          };
          return builder;
        },
        insert(payload: Row) {
          inserted.push(payload);
          return Promise.resolve({ error: insertError ? { message: "insert failed" } : null });
        }
      };
    }
  };

  return { service: client as unknown as ServiceClient, getInserted: () => inserted };
}

const PROJECT = {
  id: "project-1",
  brand: "Acme",
  domain: "acme.com",
  language: "es",
  is_archived: false,
  owner_user_id: "user-1"
};

const PRO_PROFILE = { id: "user-1", current_plan: "pro" };

const RECOMMENDATION = {
  id: "rec-1",
  project_id: "project-1",
  title: "Refuerza la claridad de tu marca como entidad",
  description: "Las señales de entidad son débiles."
};

const USER = { id: "user-1" } as unknown as AuthenticatedContext["user"];

function groundingResponse(uri: string, title = "Acme — Acerca de") {
  return { text: "Encontramos una página que cubre este tema.", groundingChunks: [{ uri, title }], model: "gemini-2.5-flash" };
}

describe("auditDomainContentCore", () => {
  beforeEachReset();

  function beforeEachReset() {
    // Local helper instead of a top-level beforeEach import churn — reset
    // mocks at the start of each test body instead, since every test needs
    // fresh call-count assertions anyway.
  }

  it("returns success:false when the project does not exist or is not owned by this user", async () => {
    auditDomainContentMock.mockReset();
    const { auditDomainContentCore } = await import("@/lib/recommendations/domain-audit");
    const { client } = makeFakeSupabase({ project: null, profile: PRO_PROFILE, recommendation: RECOMMENDATION });
    const { service } = makeFakeService();

    const result = await auditDomainContentCore({
      projectId: "missing-project",
      recommendationId: RECOMMENDATION.id,
      supabase: client,
      service,
      user: USER
    });

    expect(result.success).toBe(false);
    expect(auditDomainContentMock).not.toHaveBeenCalled();
  });

  it("returns success:false when the project is archived", async () => {
    auditDomainContentMock.mockReset();
    const { auditDomainContentCore } = await import("@/lib/recommendations/domain-audit");
    const { client } = makeFakeSupabase({
      project: { ...PROJECT, is_archived: true },
      profile: PRO_PROFILE,
      recommendation: RECOMMENDATION
    });
    const { service } = makeFakeService();

    const result = await auditDomainContentCore({
      projectId: PROJECT.id,
      recommendationId: RECOMMENDATION.id,
      supabase: client,
      service,
      user: USER
    });

    expect(result.success).toBe(false);
    expect(auditDomainContentMock).not.toHaveBeenCalled();
  });

  it("denies a free-plan user with a clear upgrade message, never calling Gemini (blocker: plan gate)", async () => {
    auditDomainContentMock.mockReset();
    const { auditDomainContentCore } = await import("@/lib/recommendations/domain-audit");
    const { client } = makeFakeSupabase({
      project: PROJECT,
      profile: { id: "user-1", current_plan: "free" },
      recommendation: RECOMMENDATION
    });
    const { service, getInserted } = makeFakeService();

    const result = await auditDomainContentCore({
      projectId: PROJECT.id,
      recommendationId: RECOMMENDATION.id,
      supabase: client,
      service,
      user: USER
    });

    expect(result.success).toBe(false);
    if (result.success) throw new Error("expected failure");
    expect(result.error).toContain("Pro");
    expect(auditDomainContentMock).not.toHaveBeenCalled();
    expect(getInserted()).toHaveLength(0);
  });

  it("denies access when the profile row is missing, instead of defaulting to allowed (blocker: fail-closed gate)", async () => {
    auditDomainContentMock.mockReset();
    const { auditDomainContentCore } = await import("@/lib/recommendations/domain-audit");
    const { client } = makeFakeSupabase({ project: PROJECT, profile: null, recommendation: RECOMMENDATION });
    const { service } = makeFakeService();

    const result = await auditDomainContentCore({
      projectId: PROJECT.id,
      recommendationId: RECOMMENDATION.id,
      supabase: client,
      service,
      user: USER
    });

    expect(result.success).toBe(false);
    expect(auditDomainContentMock).not.toHaveBeenCalled();
  });

  it("allows an agency-plan user through the gate", async () => {
    auditDomainContentMock.mockReset();
    auditDomainContentMock.mockResolvedValue(groundingResponse("https://redirect.example/1"));
    resolveGroundingRedirectsMock.mockReset();
    resolveGroundingRedirectsMock.mockResolvedValue(new Map([["https://redirect.example/1", { resolvedUrl: null }]]));
    const { auditDomainContentCore } = await import("@/lib/recommendations/domain-audit");
    const { client } = makeFakeSupabase({
      project: PROJECT,
      profile: { id: "user-1", current_plan: "agency" },
      recommendation: RECOMMENDATION
    });
    const { service } = makeFakeService();

    const result = await auditDomainContentCore({
      projectId: PROJECT.id,
      recommendationId: RECOMMENDATION.id,
      supabase: client,
      service,
      user: USER
    });

    expect(result.success).toBe(true);
    expect(auditDomainContentMock).toHaveBeenCalledTimes(1);
  });

  it("returns success:false when the recommendation does not exist for this project", async () => {
    auditDomainContentMock.mockReset();
    const { auditDomainContentCore } = await import("@/lib/recommendations/domain-audit");
    const { client } = makeFakeSupabase({ project: PROJECT, profile: PRO_PROFILE, recommendation: null });
    const { service } = makeFakeService();

    const result = await auditDomainContentCore({
      projectId: PROJECT.id,
      recommendationId: "missing-rec",
      supabase: client,
      service,
      user: USER
    });

    expect(result.success).toBe(false);
    expect(auditDomainContentMock).not.toHaveBeenCalled();
  });

  it("is idempotent: returns the stored audit with no Gemini call when one already exists", async () => {
    auditDomainContentMock.mockReset();
    const existing: DomainAuditSolution = { found: true, pages: [{ url: "https://acme.com/about", title: "Acerca de" }], note: "Nota" };
    const { auditDomainContentCore } = await import("@/lib/recommendations/domain-audit");
    const { client } = makeFakeSupabase({ project: PROJECT, profile: PRO_PROFILE, recommendation: RECOMMENDATION });
    const { service, getInserted } = makeFakeService({ existingSolution: existing });

    const result = await auditDomainContentCore({
      projectId: PROJECT.id,
      recommendationId: RECOMMENDATION.id,
      supabase: client,
      service,
      user: USER
    });

    expect(result).toEqual({ success: true, solution: existing });
    expect(auditDomainContentMock).not.toHaveBeenCalled();
    expect(getInserted()).toHaveLength(0);
  });

  it("returns a sanitized rate-limit message and never calls Gemini when the project is over its (separate, stricter) daily quota", async () => {
    auditDomainContentMock.mockReset();
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { auditDomainContentCore } = await import("@/lib/recommendations/domain-audit");
    const { client } = makeFakeSupabase({ project: PROJECT, profile: PRO_PROFILE, recommendation: RECOMMENDATION });
    const { service, getInserted } = makeFakeService({ rateCount: 999 });

    const result = await auditDomainContentCore({
      projectId: PROJECT.id,
      recommendationId: RECOMMENDATION.id,
      supabase: client,
      service,
      user: USER
    });

    expect(result.success).toBe(false);
    if (result.success) throw new Error("expected failure");
    expect(result.error).toContain("límite");
    expect(auditDomainContentMock).not.toHaveBeenCalled();
    expect(getInserted()).toHaveLength(0);

    warnSpy.mockRestore();
  });

  it("falls back to a sanitized error, inserting nothing, when Gemini throws", async () => {
    auditDomainContentMock.mockReset();
    auditDomainContentMock.mockRejectedValue(new Error("raw provider failure with secrets"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { auditDomainContentCore } = await import("@/lib/recommendations/domain-audit");
    const { client } = makeFakeSupabase({ project: PROJECT, profile: PRO_PROFILE, recommendation: RECOMMENDATION });
    const { service, getInserted } = makeFakeService();

    const result = await auditDomainContentCore({
      projectId: PROJECT.id,
      recommendationId: RECOMMENDATION.id,
      supabase: client,
      service,
      user: USER
    });

    expect(result.success).toBe(false);
    if (result.success) throw new Error("expected failure");
    expect(result.error).not.toContain("raw provider failure with secrets");
    expect(getInserted()).toHaveLength(0);

    errorSpy.mockRestore();
  });

  it("keeps a citation that resolves to the project's own domain as a verified page (blocker: only citations are verified fact)", async () => {
    auditDomainContentMock.mockReset();
    auditDomainContentMock.mockResolvedValue(groundingResponse("https://redirect.example/1", "Sobre Acme"));
    resolveGroundingRedirectsMock.mockReset();
    resolveGroundingRedirectsMock.mockResolvedValue(new Map([["https://redirect.example/1", { resolvedUrl: "https://www.acme.com/sobre-nosotros" }]]));
    const { auditDomainContentCore } = await import("@/lib/recommendations/domain-audit");
    const { client } = makeFakeSupabase({ project: PROJECT, profile: PRO_PROFILE, recommendation: RECOMMENDATION });
    const { service, getInserted } = makeFakeService();

    const result = await auditDomainContentCore({
      projectId: PROJECT.id,
      recommendationId: RECOMMENDATION.id,
      supabase: client,
      service,
      user: USER
    });

    expect(result.success).toBe(true);
    if (!result.success) throw new Error("expected success");
    expect(result.solution.found).toBe(true);
    expect(result.solution.pages).toEqual([{ url: "https://www.acme.com/sobre-nosotros", title: "Sobre Acme" }]);
    expect(result.solution.note).toContain("Encontramos una página");

    expect(getInserted()).toHaveLength(1);
    expect(getInserted()[0]).toMatchObject({ generation_type: "domain_audit", status: "completed", is_sanitized: true });
  });

  it("keeps a citation that resolves to a real subdomain of the project's domain", async () => {
    auditDomainContentMock.mockReset();
    auditDomainContentMock.mockResolvedValue(groundingResponse("https://redirect.example/1"));
    resolveGroundingRedirectsMock.mockReset();
    resolveGroundingRedirectsMock.mockResolvedValue(new Map([["https://redirect.example/1", { resolvedUrl: "https://blog.acme.com/post" }]]));
    const { auditDomainContentCore } = await import("@/lib/recommendations/domain-audit");
    const { client } = makeFakeSupabase({ project: PROJECT, profile: PRO_PROFILE, recommendation: RECOMMENDATION });
    const { service } = makeFakeService();

    const result = await auditDomainContentCore({
      projectId: PROJECT.id,
      recommendationId: RECOMMENDATION.id,
      supabase: client,
      service,
      user: USER
    });

    expect(result.success).toBe(true);
    if (!result.success) throw new Error("expected success");
    expect(result.solution.found).toBe(true);
  });

  it("discards a citation resolving to an unrelated domain, even one containing the project domain as a substring (blocker: label-boundary match)", async () => {
    auditDomainContentMock.mockReset();
    auditDomainContentMock.mockResolvedValue(groundingResponse("https://redirect.example/1"));
    resolveGroundingRedirectsMock.mockReset();
    // "evilacme.com" contains "acme.com" as a raw substring but is a
    // completely different domain — endsWith(".acme.com") correctly rejects it.
    resolveGroundingRedirectsMock.mockResolvedValue(new Map([["https://redirect.example/1", { resolvedUrl: "https://evilacme.com/page" }]]));
    const { auditDomainContentCore } = await import("@/lib/recommendations/domain-audit");
    const { client } = makeFakeSupabase({ project: PROJECT, profile: PRO_PROFILE, recommendation: RECOMMENDATION });
    const { service, getInserted } = makeFakeService();

    const result = await auditDomainContentCore({
      projectId: PROJECT.id,
      recommendationId: RECOMMENDATION.id,
      supabase: client,
      service,
      user: USER
    });

    expect(result.success).toBe(true);
    if (!result.success) throw new Error("expected success");
    expect(result.solution.found).toBe(false);
    expect(result.solution.pages).toEqual([]);
    // A discarded/off-domain result is still a legitimate, persisted outcome
    // (so the rate limit reflects real spend) — never silently dropped.
    expect(getInserted()).toHaveLength(1);
  });

  it("discards a citation whose redirect could not be resolved, never treating it as own-domain (blocker: fail-closed)", async () => {
    auditDomainContentMock.mockReset();
    auditDomainContentMock.mockResolvedValue(groundingResponse("https://redirect.example/1"));
    resolveGroundingRedirectsMock.mockReset();
    resolveGroundingRedirectsMock.mockResolvedValue(new Map([["https://redirect.example/1", { resolvedUrl: null }]]));
    const { auditDomainContentCore } = await import("@/lib/recommendations/domain-audit");
    const { client } = makeFakeSupabase({ project: PROJECT, profile: PRO_PROFILE, recommendation: RECOMMENDATION });
    const { service } = makeFakeService();

    const result = await auditDomainContentCore({
      projectId: PROJECT.id,
      recommendationId: RECOMMENDATION.id,
      supabase: client,
      service,
      user: USER
    });

    expect(result.success).toBe(true);
    if (!result.success) throw new Error("expected success");
    expect(result.solution.found).toBe(false);
  });

  it("returns a fixed, non-Gemini-authored note (not the model's own text) when nothing verified is found", async () => {
    auditDomainContentMock.mockReset();
    auditDomainContentMock.mockResolvedValue({
      text: "Trust me, your site definitely covers this in depth!",
      groundingChunks: [],
      model: "gemini-2.5-flash"
    });
    resolveGroundingRedirectsMock.mockReset();
    resolveGroundingRedirectsMock.mockResolvedValue(new Map());
    const { auditDomainContentCore } = await import("@/lib/recommendations/domain-audit");
    const { client } = makeFakeSupabase({ project: PROJECT, profile: PRO_PROFILE, recommendation: RECOMMENDATION });
    const { service } = makeFakeService();

    const result = await auditDomainContentCore({
      projectId: PROJECT.id,
      recommendationId: RECOMMENDATION.id,
      supabase: client,
      service,
      user: USER
    });

    expect(result.success).toBe(true);
    if (!result.success) throw new Error("expected success");
    expect(result.solution.found).toBe(false);
    expect(result.solution.note).not.toContain("Trust me");
    expect(result.solution.note).toContain("No hemos encontrado");
  });

  it("sanitizes HTML/control characters out of the narrative note before persisting", async () => {
    auditDomainContentMock.mockReset();
    auditDomainContentMock.mockResolvedValue({
      text: "Cubre <b>bien</b> el tema.",
      groundingChunks: [{ uri: "https://redirect.example/1", title: "<script>alert(1)</script>Sobre" }],
      model: "gemini-2.5-flash"
    });
    resolveGroundingRedirectsMock.mockReset();
    resolveGroundingRedirectsMock.mockResolvedValue(new Map([["https://redirect.example/1", { resolvedUrl: "https://acme.com/sobre" }]]));
    const { auditDomainContentCore } = await import("@/lib/recommendations/domain-audit");
    const { client } = makeFakeSupabase({ project: PROJECT, profile: PRO_PROFILE, recommendation: RECOMMENDATION });
    const { service } = makeFakeService();

    const result = await auditDomainContentCore({
      projectId: PROJECT.id,
      recommendationId: RECOMMENDATION.id,
      supabase: client,
      service,
      user: USER
    });

    expect(result.success).toBe(true);
    if (!result.success) throw new Error("expected success");
    expect(result.solution.note).not.toContain("<b>");
    expect(result.solution.pages[0].title).not.toContain("<script>");
  });

  it("returns success:false when persisting the audit fails", async () => {
    auditDomainContentMock.mockReset();
    auditDomainContentMock.mockResolvedValue(groundingResponse("https://redirect.example/1"));
    resolveGroundingRedirectsMock.mockReset();
    resolveGroundingRedirectsMock.mockResolvedValue(new Map([["https://redirect.example/1", { resolvedUrl: "https://acme.com/sobre" }]]));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { auditDomainContentCore } = await import("@/lib/recommendations/domain-audit");
    const { client } = makeFakeSupabase({ project: PROJECT, profile: PRO_PROFILE, recommendation: RECOMMENDATION });
    const { service } = makeFakeService({ insertError: true });

    const result = await auditDomainContentCore({
      projectId: PROJECT.id,
      recommendationId: RECOMMENDATION.id,
      supabase: client,
      service,
      user: USER
    });

    expect(result.success).toBe(false);

    errorSpy.mockRestore();
  });
});
