import { afterEach, describe, expect, it, vi } from "vitest";
import type { createServiceClient } from "@/lib/supabase/service";

vi.mock("@/lib/supabase/service", () => ({ createServiceClient: vi.fn() }));

import { addPromptsToPool, remainingPoolHint } from "./prompt-pool";

type Service = ReturnType<typeof createServiceClient>;

function serviceReturning(result: { data?: unknown; error?: { code?: string; message?: string; details?: string } | null }) {
  const rpc = vi.fn().mockResolvedValue({ data: result.data ?? null, error: result.error ?? null });
  return { service: { rpc } as unknown as Service, rpc };
}

const rows = [{ prompt_text: "una pregunta de prueba", category: "marca" }];

afterEach(() => vi.restoreAllMocks());

describe("addPromptsToPool", () => {
  it("passes the owner, project, the caller's EFFECTIVE cap and the rows to the function", async () => {
    const { service, rpc } = serviceReturning({ data: { ok: true, inserted: 1, ids: ["id-1"], active: 1 } });

    const result = await addPromptsToPool({ ownerId: "o1", projectId: "p1", cap: 75, rows, service });

    expect(result).toEqual({ ok: true, inserted: 1, ids: ["id-1"] });
    expect(rpc).toHaveBeenCalledWith("add_project_prompts", {
      p_owner: "o1",
      p_project: "p1",
      p_cap: 75,
      p_rows: [{ prompt_text: "una pregunta de prueba", category: "marca", sort_order: 0 }]
    });
  });

  it("reports a full pool with how many are left, and never claims it inserted", async () => {
    const { service } = serviceReturning({ data: { ok: false, reason: "pool_full", active: 74, cap: 75, remaining: 1 } });

    expect(await addPromptsToPool({ ownerId: "o", projectId: "p", cap: 75, rows, service })).toEqual({
      ok: false,
      reason: "pool_full",
      remaining: 1,
      cap: 75
    });
  });

  it("FAILS CLOSED when the function does not exist (migration 0039 not applied): no prompt is written", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { service } = serviceReturning({ error: { code: "PGRST202", message: "function not found" } });

    expect(await addPromptsToPool({ ownerId: "o", projectId: "p", cap: 75, rows, service })).toEqual({
      ok: false,
      reason: "unavailable"
    });
  });

  it("reads the database's own prompt_pool_full (23514) as a full pool, not as an outage", async () => {
    const { service } = serviceReturning({ error: { code: "23514", message: "prompt_pool_full" } });
    expect(await addPromptsToPool({ ownerId: "o", projectId: "p", cap: 75, rows, service })).toEqual({
      ok: false,
      reason: "pool_full",
      remaining: 0,
      cap: 75
    });
  });

  it("reports the cap the database enforced, not the one the app computed", async () => {
    const { service } = serviceReturning({
      error: { code: "23514", message: "prompt_pool_full", details: "active=10 cap=10" }
    });
    expect(await addPromptsToPool({ ownerId: "o", projectId: "p", cap: 75, rows, service })).toEqual({
      ok: false,
      reason: "pool_full",
      remaining: 0,
      cap: 10
    });
  });

  it("does not mistake an unrelated check violation for a full pool", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { service } = serviceReturning({ error: { code: "23514", message: "prompts_text_len_chk" } });
    expect(await addPromptsToPool({ ownerId: "o", projectId: "p", cap: 75, rows, service })).toEqual({
      ok: false,
      reason: "unavailable"
    });
  });

  it("FAILS CLOSED on an unrecognised answer instead of assuming success", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { service } = serviceReturning({ data: { surprise: true } });

    expect(await addPromptsToPool({ ownerId: "o", projectId: "p", cap: 75, rows, service })).toEqual({
      ok: false,
      reason: "unavailable"
    });
  });

  it("FAILS CLOSED when the service client cannot be built (no service key)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { createServiceClient: factory } = await import("@/lib/supabase/service");
    vi.mocked(factory).mockImplementation(() => {
      throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
    });

    expect(await addPromptsToPool({ ownerId: "o", projectId: "p", cap: 75, rows })).toEqual({
      ok: false,
      reason: "unavailable"
    });
  });

  it("surfaces a project the owner doesn't have", async () => {
    const { service } = serviceReturning({ data: { ok: false, reason: "project_not_found" } });
    expect(await addPromptsToPool({ ownerId: "o", projectId: "p", cap: 75, rows, service })).toEqual({
      ok: false,
      reason: "project_not_found"
    });
  });

  it("reports a malformed row as `invalid` (not as an outage) and never calls the database", async () => {
    const { service, rpc } = serviceReturning({});
    const tooShort = [{ prompt_text: "corto", category: null }];
    const badOrder = [{ prompt_text: "una pregunta de prueba", category: null, sort_order: 1.5 }];

    expect(await addPromptsToPool({ ownerId: "o", projectId: "p", cap: 75, rows: tooShort, service })).toEqual({
      ok: false,
      reason: "invalid"
    });
    expect(await addPromptsToPool({ ownerId: "o", projectId: "p", cap: 75, rows: badOrder, service })).toEqual({
      ok: false,
      reason: "invalid"
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("an empty batch does not call the database at all", async () => {
    const { service, rpc } = serviceReturning({});
    expect(await addPromptsToPool({ ownerId: "o", projectId: "p", cap: 75, rows: [], service })).toEqual({
      ok: true,
      inserted: 0,
      ids: []
    });
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("remainingPoolHint", () => {
  const supabaseWithCount = (count: number | null, error: unknown = null) => ({
    from: () => ({ select: () => ({ eq: () => Promise.resolve({ count, error }) }) })
  });

  it("is the cap minus the account's active prompts, never negative", async () => {
    expect(await remainingPoolHint(supabaseWithCount(60), 75)).toBe(15);
    expect(await remainingPoolHint(supabaseWithCount(80), 75)).toBe(0);
  });

  it("is null (unknown) when the read fails, so a caller never trims on a guess", async () => {
    expect(await remainingPoolHint(supabaseWithCount(null, { message: "boom" }), 75)).toBeNull();
  });
});
