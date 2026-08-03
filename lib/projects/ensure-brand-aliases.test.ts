import { beforeEach, describe, expect, it, vi } from "vitest";

const deriveBrandAliases = vi.fn();
const updates: Array<Record<string, unknown>> = [];
let projectRow: Record<string, unknown> | null = null;
let deriveCalls = 0;

vi.mock("@/lib/projects/business-profile", () => ({
  deriveBrandAliases: (...args: unknown[]) => {
    deriveCalls += 1;
    return deriveBrandAliases(...args);
  }
}));

vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: projectRow }) })
      }),
      update: (payload: Record<string, unknown>) => {
        updates.push(payload);
        return { eq: async () => ({ error: null }) };
      }
    })
  })
}));

const { ensureBrandAliasesDerived } = await import("@/lib/projects/ensure-brand-aliases");

const MOZILLA = {
  id: "p1",
  brand: "Mozilla",
  domain: "mozilla.org",
  brand_aliases_derived_at: null
};

beforeEach(() => {
  updates.length = 0;
  deriveCalls = 0;
  deriveBrandAliases.mockReset();
  projectRow = { ...MOZILLA };
});

describe("ensureBrandAliasesDerived", () => {
  it("derives and persists for a project that never had aliases", async () => {
    deriveBrandAliases.mockResolvedValue(["Firefox", "Thunderbird"]);

    await ensureBrandAliasesDerived("p1");

    expect(deriveCalls).toBe(1);
    expect(updates).toHaveLength(1);
    expect(updates[0].brand_aliases).toEqual(["Firefox", "Thunderbird"]);
    expect(typeof updates[0].brand_aliases_derived_at).toBe("string");
  });

  it("stamps derived_at even when the brand genuinely has no aliases", async () => {
    // The common case. Without the stamp this would re-fetch the homepage and
    // re-call Gemini on every single scan, forever, to rediscover nothing.
    deriveBrandAliases.mockResolvedValue([]);

    await ensureBrandAliasesDerived("p1");

    expect(updates[0].brand_aliases).toEqual([]);
    expect(updates[0].brand_aliases_derived_at).toBeTruthy();
  });

  it("does nothing when aliases were already derived", async () => {
    projectRow = { ...MOZILLA, brand_aliases_derived_at: "2026-08-01T10:00:00Z" };

    await ensureBrandAliasesDerived("p1");

    expect(deriveCalls).toBe(0);
    expect(updates).toEqual([]);
  });

  it("skips a project with no brand or no domain instead of deriving from nothing", async () => {
    projectRow = { ...MOZILLA, brand: "   " };
    await ensureBrandAliasesDerived("p1");

    projectRow = { ...MOZILLA, domain: "" };
    await ensureBrandAliasesDerived("p1");

    expect(deriveCalls).toBe(0);
    expect(updates).toEqual([]);
  });

  it("never throws when derivation fails — the scan must still run", async () => {
    deriveBrandAliases.mockRejectedValue(new Error("gemini down"));

    await expect(ensureBrandAliasesDerived("p1")).resolves.toBeUndefined();
    // derived_at stays null, so the next scan retries rather than caching a
    // failure as "there are no aliases".
    expect(updates).toEqual([]);
  });

  it("never throws when the project cannot be read", async () => {
    projectRow = null;

    await expect(ensureBrandAliasesDerived("nope")).resolves.toBeUndefined();
    expect(deriveCalls).toBe(0);
  });
});
