import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { markGoogleRecCore, readRecStates, undoGoogleRecCore } from "@/lib/search-console/rec-states";
import { googleRecKey } from "@/lib/search-console/recommendations";

/** A chainable stand-in for the Supabase query builder that records each call. */
function builder(result: unknown, calls: Array<[string, unknown[]]>) {
  const b: Record<string, unknown> = {};
  for (const m of ["from", "select", "eq", "delete", "upsert", "maybeSingle"]) {
    b[m] = (...args: unknown[]) => {
      calls.push([m, args]);
      return b;
    };
  }
  b.then = (resolve: (v: unknown) => void) => resolve(result);
  return b;
}

const user = { id: "u1" } as never;
const PROJECT = "11111111-1111-4111-8111-111111111111";

function deps(owns: boolean, writeError: unknown = null) {
  const userCalls: Array<[string, unknown[]]> = [];
  const serviceCalls: Array<[string, unknown[]]> = [];
  return {
    userCalls,
    serviceCalls,
    deps: {
      supabase: builder({ data: owns ? { id: PROJECT } : null, error: null }, userCalls) as never,
      service: builder({ error: writeError }, serviceCalls) as never,
      user
    }
  };
}

const markInput = {
  projectId: PROJECT,
  kind: "push_page_one" as const,
  query: "aparecer en chatgpt",
  status: "done" as const,
  position: 12.4,
  impressions: 2210,
  ctr: null
};

describe("readRecStates (log §294)", () => {
  it("returns the handled cards as keys, scoped to project and owner", async () => {
    const calls: Array<[string, unknown[]]> = [];
    const supabase = builder(
      { data: [{ kind: "push_page_one", query: "a" }, { kind: "bogus", query: "b" }], error: null },
      calls
    );
    const read = await readRecStates(supabase as never, PROJECT, "u1");
    expect(read).toEqual({ available: true, hidden: new Set([googleRecKey("push_page_one", "a")]) });
    expect(calls).toContainEqual(["eq", ["project_id", PROJECT]]);
    expect(calls).toContainEqual(["eq", ["owner_user_id", "u1"]]);
  });

  it("reports unavailable while migration 0042 is not applied", async () => {
    const supabase = builder({ data: null, error: { code: "42P01" } }, []);
    expect(await readRecStates(supabase as never, PROJECT, "u1")).toEqual({ available: false });
  });
});

describe("markGoogleRecCore", () => {
  it("refuses a project the user does not own, without writing", async () => {
    const d = deps(false);
    const result = await markGoogleRecCore(markInput, d.deps);
    expect(result.success).toBe(false);
    expect(d.serviceCalls).toEqual([]);
  });

  it("upserts one row per project, kind and query with the owner and the Google figures", async () => {
    const d = deps(true);
    expect(await markGoogleRecCore(markInput, d.deps)).toEqual({ success: true });
    expect(d.userCalls).toContainEqual(["eq", ["owner_user_id", "u1"]]);
    const upsert = d.serviceCalls.find(([m]) => m === "upsert");
    expect(upsert?.[1]).toEqual([
      {
        project_id: PROJECT,
        owner_user_id: "u1",
        kind: "push_page_one",
        query: "aparecer en chatgpt",
        status: "done",
        position_at: 12.4,
        impressions_at: 2210,
        ctr_at: null
      },
      { onConflict: "project_id,kind,query" }
    ]);
  });

  it("returns a safe message, never the database error", async () => {
    const d = deps(true, { code: "23514", message: "violates check constraint secret_detail" });
    const result = await markGoogleRecCore(markInput, d.deps);
    expect(result).toEqual({ success: false, error: expect.not.stringContaining("secret_detail") });
  });
});

describe("undoGoogleRecCore", () => {
  it("deletes only that card of that owner's project", async () => {
    const d = deps(true);
    expect(await undoGoogleRecCore({ projectId: PROJECT, kind: "watch_in_ai", query: "q" }, d.deps)).toEqual({
      success: true
    });
    expect(d.serviceCalls).toEqual(
      expect.arrayContaining([
        ["delete", []],
        ["eq", ["project_id", PROJECT]],
        ["eq", ["owner_user_id", "u1"]],
        ["eq", ["kind", "watch_in_ai"]],
        ["eq", ["query", "q"]]
      ])
    );
  });
});
