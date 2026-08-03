import { describe, expect, it, vi } from "vitest";
import {
  filterSuggestions,
  getSuggestedCompetitorsCore,
  parseCachedSuggestions
} from "./suggest-competitors";
import type { SuggestedCompetitor } from "@/lib/llm/gemini";

vi.mock("server-only", () => ({}));

const resolveAndCacheBusinessProfile = vi.hoisted(() => vi.fn());
vi.mock("@/lib/projects/business-profile", () => ({ resolveAndCacheBusinessProfile }));

const PROFILE = {
  whatItSells: "a web browser",
  sector: "software",
  subSector: "web browsers",
  businessModel: "b2c" as const,
  targetCustomer: "general internet users",
  geographicScope: "global",
  sizeEstimate: "large",
  confidence: "high" as const
};

/**
 * Minimal Supabase double: `projects` resolves a single row (and records
 * update payloads), `project_competitors` resolves the tracked list.
 */
function createSupabaseMock(options: {
  project: Record<string, unknown> | null;
  projectError?: { message: string };
  competitors?: Array<{ name: string | null; domain: string | null }>;
  updates?: Array<Record<string, unknown>>;
  updateError?: { message: string } | null;
}) {
  function builder(result: unknown, table: string) {
    const b: Record<string, unknown> = {};
    for (const m of ["select", "eq", "maybeSingle", "update"]) {
      b[m] = vi.fn((...args: unknown[]) => {
        if (m === "update" && table === "projects") {
          options.updates?.push(args[0] as Record<string, unknown>);
          return { ...b, then: (r: (v: unknown) => unknown) => r({ error: options.updateError ?? null }) };
        }
        return b;
      });
    }
    b.then = (resolve: (value: unknown) => unknown) => resolve(result);
    return b;
  }

  return {
    from: vi.fn((table: string) =>
      table === "projects"
        ? builder({ data: options.project, error: options.projectError ?? null }, "projects")
        : builder({ data: options.competitors ?? [] }, "project_competitors")
    )
  };
}

function run(overrides: {
  project?: Record<string, unknown> | null;
  projectError?: { message: string };
  competitors?: Array<{ name: string | null; domain: string | null }>;
  updates?: Array<Record<string, unknown>>;
  refresh?: boolean;
  suggest?: () => Promise<SuggestedCompetitor[]>;
}) {
  const supabase = createSupabaseMock({
    project:
      overrides.project === undefined
        ? {
            brand: "Mozilla",
            domain: "mozilla.org",
            country: "ES",
            language: "es",
            business_profile: PROFILE,
            suggested_competitors: null
          }
        : overrides.project,
    projectError: overrides.projectError,
    competitors: overrides.competitors,
    updates: overrides.updates
  });

  return getSuggestedCompetitorsCore({
    projectId: "11111111-1111-1111-1111-111111111111",
    refresh: overrides.refresh ?? false,
    supabase: supabase as never,
    user: { id: "user-1" } as never,
    suggest: overrides.suggest ?? (async () => [{ name: "Brave", domain: "brave.com" }])
  });
}

describe("filterSuggestions", () => {
  const base = { projectDomain: "mozilla.org", trackedDomains: [], trackedNames: [] };

  it("1. keeps valid, untracked suggestions and normalizes the domain", () => {
    const out = filterSuggestions({
      ...base,
      items: [{ name: "  Brave  ", domain: "https://www.Brave.com/" }]
    });
    expect(out).toEqual([{ name: "Brave", domain: "brave.com" }]);
  });

  it("2. never suggests the project's own domain back to it", () => {
    const out = filterSuggestions({ ...base, items: [{ name: "Mozilla", domain: "mozilla.org" }] });
    expect(out).toEqual([]);
  });

  it("3. drops competitors already tracked, matched by domain", () => {
    const out = filterSuggestions({
      ...base,
      trackedDomains: ["brave.com"],
      items: [
        { name: "Brave", domain: "brave.com" },
        { name: "Vivaldi", domain: "vivaldi.com" }
      ]
    });
    expect(out).toEqual([{ name: "Vivaldi", domain: "vivaldi.com" }]);
  });

  it("4. drops competitors already tracked under a different domain, matched by name", () => {
    const out = filterSuggestions({
      ...base,
      trackedNames: ["brave"],
      items: [{ name: "Brave", domain: "brave-browser.com" }]
    });
    expect(out).toEqual([]);
  });

  it("5. rejects malformed rows instead of persisting a broken domain", () => {
    const out = filterSuggestions({
      ...base,
      items: [
        { name: "", domain: "ok.com" },
        { name: "No domain", domain: "" },
        { name: "Bad", domain: "not a domain" },
        { name: "Good", domain: "good.com" }
      ] as SuggestedCompetitor[]
    });
    expect(out).toEqual([{ name: "Good", domain: "good.com" }]);
  });

  it("6. de-duplicates repeated domains", () => {
    const out = filterSuggestions({
      ...base,
      items: [
        { name: "Brave", domain: "brave.com" },
        { name: "Brave Software", domain: "www.brave.com" }
      ]
    });
    expect(out).toHaveLength(1);
  });
});

describe("parseCachedSuggestions", () => {
  it("7. returns null for absent or malformed cache rather than throwing", () => {
    expect(parseCachedSuggestions(null)).toBeNull();
    expect(parseCachedSuggestions("nope")).toBeNull();
    expect(parseCachedSuggestions({ items: [{ name: 1 }] })).toBeNull();
  });

  it("8. parses a well-formed cache payload", () => {
    expect(
      parseCachedSuggestions({ computedAt: "2026-08-03T00:00:00Z", items: [{ name: "Brave", domain: "brave.com" }] })
    ).toEqual([{ name: "Brave", domain: "brave.com" }]);
  });
});

describe("getSuggestedCompetitorsCore", () => {
  it("9. computes, caches and returns suggestions when nothing is cached", async () => {
    resolveAndCacheBusinessProfile.mockResolvedValue(PROFILE);
    const updates: Array<Record<string, unknown>> = [];
    const result = await run({ updates });

    expect(result).toEqual({ success: true, suggestions: [{ name: "Brave", domain: "brave.com" }], cached: false });
    expect(updates).toHaveLength(1);
    expect(updates[0].suggested_competitors).toMatchObject({ items: [{ name: "Brave", domain: "brave.com" }] });
  });

  it("10. serves the cache without calling Gemini again", async () => {
    resolveAndCacheBusinessProfile.mockResolvedValue(PROFILE);
    const suggest = vi.fn(async () => [{ name: "Should not run", domain: "nope.com" }]);
    const result = await run({
      project: {
        brand: "Mozilla",
        domain: "mozilla.org",
        country: "ES",
        language: "es",
        business_profile: PROFILE,
        suggested_competitors: { computedAt: "2026-08-03T00:00:00Z", items: [{ name: "Brave", domain: "brave.com" }] }
      },
      suggest
    });

    expect(result).toEqual({ success: true, suggestions: [{ name: "Brave", domain: "brave.com" }], cached: true });
    expect(suggest).not.toHaveBeenCalled();
  });

  it("11. refresh: true bypasses the cache and recomputes", async () => {
    resolveAndCacheBusinessProfile.mockResolvedValue(PROFILE);
    const suggest = vi.fn(async () => [{ name: "Vivaldi", domain: "vivaldi.com" }]);
    const result = await run({
      refresh: true,
      project: {
        brand: "Mozilla",
        domain: "mozilla.org",
        country: "ES",
        language: "es",
        business_profile: PROFILE,
        suggested_competitors: { computedAt: "2026-08-03T00:00:00Z", items: [{ name: "Brave", domain: "brave.com" }] }
      },
      suggest
    });

    expect(suggest).toHaveBeenCalledOnce();
    expect(result).toMatchObject({ success: true, suggestions: [{ name: "Vivaldi", domain: "vivaldi.com" }] });
  });

  it("12. filters already-followed competitors out of a cached list, so following one removes it with no invalidation", async () => {
    resolveAndCacheBusinessProfile.mockResolvedValue(PROFILE);
    const result = await run({
      competitors: [{ name: "Brave", domain: "brave.com" }],
      project: {
        brand: "Mozilla",
        domain: "mozilla.org",
        country: "ES",
        language: "es",
        business_profile: PROFILE,
        suggested_competitors: {
          computedAt: "2026-08-03T00:00:00Z",
          items: [
            { name: "Brave", domain: "brave.com" },
            { name: "Vivaldi", domain: "vivaldi.com" }
          ]
        }
      }
    });

    expect(result).toEqual({ success: true, suggestions: [{ name: "Vivaldi", domain: "vivaldi.com" }], cached: true });
  });

  it("13. an inactive (deactivated) competitor is never re-suggested", async () => {
    resolveAndCacheBusinessProfile.mockResolvedValue(PROFILE);
    // The tracked query is deliberately NOT filtered by is_active, so a
    // deactivated rival still counts as blocked.
    const result = await run({
      competitors: [{ name: "Brave", domain: "brave.com" }],
      suggest: async () => [{ name: "Brave", domain: "brave.com" }]
    });

    expect(result).toMatchObject({ success: true, suggestions: [] });
  });

  it("14. is honest when the business profile cannot be resolved — never guesses", async () => {
    resolveAndCacheBusinessProfile.mockResolvedValue(null);
    const suggest = vi.fn();
    const result = await run({ suggest: suggest as never });

    expect(result.success).toBe(false);
    expect(suggest).not.toHaveBeenCalled();
  });

  it("15. sanitizes a provider failure instead of throwing", async () => {
    resolveAndCacheBusinessProfile.mockResolvedValue(PROFILE);
    const result = await run({
      suggest: async () => {
        throw new Error("gemini 503 with a raw stack trace");
      }
    });

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).not.toContain("503");
  });

  it("16. distinguishes a failed lookup from a missing project — an unapplied migration must not read as \"project not found\"", async () => {
    resolveAndCacheBusinessProfile.mockResolvedValue(PROFILE);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const suggest = vi.fn();

    const result = await run({
      project: null,
      projectError: { message: 'column projects.suggested_competitors does not exist' },
      suggest: suggest as never
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).not.toBe("No se ha encontrado el proyecto.");
      // The real cause is logged server-side, never leaked to the UI.
      expect(result.error).not.toContain("column");
    }
    expect(warn).toHaveBeenCalled();
    expect(suggest).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it("17. refuses a project the user does not own", async () => {
    resolveAndCacheBusinessProfile.mockResolvedValue(PROFILE);
    const suggest = vi.fn();
    const result = await run({ project: null, suggest: suggest as never });

    expect(result).toEqual({ success: false, error: "No se ha encontrado el proyecto." });
    // Ownership is checked before any paid work happens.
    expect(suggest).not.toHaveBeenCalled();
  });
});
