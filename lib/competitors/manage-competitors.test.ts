import { describe, expect, it } from "vitest";
import type { AuthenticatedContext } from "@/lib/auth";
import {
  createCompetitorCore,
  deactivateCompetitorCore,
  domainSchemaForTests,
  updateCompetitorCore
} from "./manage-competitors";

type SupabaseClient = AuthenticatedContext["supabase"];
type Row = Record<string, unknown>;

const USER = { id: "user-1" } as AuthenticatedContext["user"];
const PROJECT_ID = "11111111-1111-1111-1111-111111111111";
const COMPETITOR_ID = "22222222-2222-2222-2222-222222222222";

function makeFakeSupabase(opts: {
  project?: Row | null;
  competitors?: Row[];
  forceInsertError?: boolean;
  forceUpdateErrorCode?: string;
}) {
  const project = "project" in opts ? opts.project : { id: PROJECT_ID, owner_user_id: USER.id, is_archived: false };
  const competitors = opts.competitors ? [...opts.competitors] : [];

  const client = {
    from(table: string) {
      if (table === "projects") {
        return {
          select() {
            const filters: Array<[string, unknown]> = [];
            const builder = {
              eq(col: string, val: unknown) {
                filters.push([col, val]);
                return builder;
              },
              maybeSingle() {
                const match = project && filters.every(([col, val]) => (project as Row)[col] === val) ? project : null;
                return Promise.resolve({ data: match, error: null });
              }
            };
            return builder;
          }
        };
      }

      if (table === "project_competitors") {
        return {
          select(_cols: string, opts2?: { count?: string }) {
            void opts2;
            const filters: Array<[string, unknown]> = [];
            const builder = {
              eq(col: string, val: unknown) {
                filters.push([col, val]);
                return builder;
              },
              maybeSingle() {
                const match = competitors.find((c) => filters.every(([col, val]) => c[col] === val)) ?? null;
                return Promise.resolve({ data: match, error: null });
              }
            };
            return builder;
          },
          insert(patch: Row) {
            return {
              select() {
                return {
                  single() {
                    if (opts.forceInsertError) {
                      return Promise.resolve({ data: null, error: { message: "boom", code: "23505" } });
                    }
                    const created: Row = { id: "new-id", ...patch };
                    competitors.push(created);
                    return Promise.resolve({
                      data: { id: created.id as string, name: created.name as string, domain: created.domain as string },
                      error: null
                    });
                  }
                };
              }
            };
          },
          update(patch: Row) {
            const filters: Array<[string, unknown]> = [];
            const builder = {
              eq(col: string, val: unknown) {
                filters.push([col, val]);
                return builder;
              },
              select() {
                return {
                  maybeSingle() {
                    if (opts.forceUpdateErrorCode) {
                      return Promise.resolve({ data: null, error: { message: "boom", code: opts.forceUpdateErrorCode } });
                    }
                    const match = competitors.find((c) => filters.every(([col, val]) => c[col] === val));
                    if (!match) return Promise.resolve({ data: null, error: null });
                    Object.assign(match, patch);
                    return Promise.resolve({ data: { id: match.id, name: match.name, domain: match.domain }, error: null });
                  }
                };
              }
            };
            return builder;
          }
        };
      }

      throw new Error(`Unexpected table in fake supabase: ${table}`);
    }
  };

  return { client: client as unknown as SupabaseClient, competitors };
}

describe("createCompetitorCore", () => {
  it("1. project not owned by caller → project_not_found error, no write attempted", async () => {
    const { client } = makeFakeSupabase({ project: null });
    const result = await createCompetitorCore({
      projectId: PROJECT_ID,
      name: "Leroy Merlin",
      domain: "leroymerlin.es",
      supabase: client,
      user: USER
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toMatch(/proyecto/i);
  });

  it("2. brand-new domain → inserted, reactivated: false", async () => {
    const { client, competitors } = makeFakeSupabase({});
    const result = await createCompetitorCore({
      projectId: PROJECT_ID,
      name: "Leroy Merlin",
      domain: "leroymerlin.es",
      supabase: client,
      user: USER
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.reactivated).toBe(false);
      expect(result.competitor.domain).toBe("leroymerlin.es");
    }
    expect(competitors).toHaveLength(1);
  });

  it("3. domain already active → rejected without a duplicate write", async () => {
    const { client, competitors } = makeFakeSupabase({
      competitors: [{ id: COMPETITOR_ID, project_id: PROJECT_ID, domain: "leroymerlin.es", is_active: true, name: "Leroy Merlin" }]
    });
    const result = await createCompetitorCore({
      projectId: PROJECT_ID,
      name: "Leroy Merlin",
      domain: "leroymerlin.es",
      supabase: client,
      user: USER
    });
    expect(result.success).toBe(false);
    expect(competitors).toHaveLength(1);
  });

  it("4. domain exists but inactive (previously deactivated) → reactivated, not a fresh insert", async () => {
    const { client, competitors } = makeFakeSupabase({
      competitors: [{ id: COMPETITOR_ID, project_id: PROJECT_ID, domain: "leroymerlin.es", is_active: false, name: "Leroy Merlin (old)" }]
    });
    const result = await createCompetitorCore({
      projectId: PROJECT_ID,
      name: "Leroy Merlin",
      domain: "leroymerlin.es",
      supabase: client,
      user: USER
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.reactivated).toBe(true);
    expect(competitors).toHaveLength(1); // still one row, updated not duplicated
    expect(competitors[0].is_active).toBe(true);
  });

  it("5. a generic AI assistant is refused, no write attempted (ENTITY-HYGIENE-1)", async () => {
    const { client, competitors } = makeFakeSupabase({});
    const result = await createCompetitorCore({
      projectId: PROJECT_ID,
      name: "ChatGPT",
      domain: "chatgpt.com",
      supabase: client,
      user: USER
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toMatch(/no un competidor real/i);
    expect(competitors).toHaveLength(0);
  });

  it("6. a real competitor whose domain matches a known AI tool's is refused (ENTITY-HYGIENE-1)", async () => {
    const { client, competitors } = makeFakeSupabase({});
    const result = await createCompetitorCore({
      projectId: PROJECT_ID,
      name: "Bing AI",
      domain: "bing.com",
      supabase: client,
      user: USER
    });
    expect(result.success).toBe(false);
    expect(competitors).toHaveLength(0);
  });
});

describe("updateCompetitorCore", () => {
  it("1. project not owned → error", async () => {
    const { client } = makeFakeSupabase({ project: null });
    const result = await updateCompetitorCore({
      projectId: PROJECT_ID,
      competitorId: COMPETITOR_ID,
      name: "New Name",
      domain: "new.com",
      supabase: client,
      user: USER
    });
    expect(result.success).toBe(false);
  });

  it("2. unique violation on domain change → friendly duplicate-domain message, not a raw DB error", async () => {
    const { client } = makeFakeSupabase({ forceUpdateErrorCode: "23505" });
    const result = await updateCompetitorCore({
      projectId: PROJECT_ID,
      competitorId: COMPETITOR_ID,
      name: "Leroy Merlin",
      domain: "conforama.es",
      supabase: client,
      user: USER
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toMatch(/dominio/i);
  });

  it("3. competitor not found under this project → not a fake success", async () => {
    const { client } = makeFakeSupabase({ competitors: [] });
    const result = await updateCompetitorCore({
      projectId: PROJECT_ID,
      competitorId: COMPETITOR_ID,
      name: "Leroy Merlin",
      domain: "leroymerlin.es",
      supabase: client,
      user: USER
    });
    expect(result.success).toBe(false);
  });

  it("4. valid update → persisted fields returned", async () => {
    const { client } = makeFakeSupabase({
      competitors: [{ id: COMPETITOR_ID, project_id: PROJECT_ID, domain: "old.com", is_active: true, name: "Old Name" }]
    });
    const result = await updateCompetitorCore({
      projectId: PROJECT_ID,
      competitorId: COMPETITOR_ID,
      name: "New Name",
      domain: "old.com",
      supabase: client,
      user: USER
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.competitor.name).toBe("New Name");
  });

  it("5. renaming a tracked competitor to a generic AI assistant is refused (ENTITY-HYGIENE-1)", async () => {
    const { client, competitors } = makeFakeSupabase({
      competitors: [{ id: COMPETITOR_ID, project_id: PROJECT_ID, domain: "old.com", is_active: true, name: "Old Name" }]
    });
    const result = await updateCompetitorCore({
      projectId: PROJECT_ID,
      competitorId: COMPETITOR_ID,
      name: "ChatGPT",
      domain: "old.com",
      supabase: client,
      user: USER
    });
    expect(result.success).toBe(false);
    expect(competitors[0].name).toBe("Old Name"); // untouched
  });
});

describe("deactivateCompetitorCore", () => {
  it("1. project not owned → error, no write", async () => {
    const { client } = makeFakeSupabase({ project: null });
    const result = await deactivateCompetitorCore({
      projectId: PROJECT_ID,
      competitorId: COMPETITOR_ID,
      supabase: client,
      user: USER
    });
    expect(result.success).toBe(false);
  });

  it("2. competitor belongs to another project → not found, not silently ignored as success", async () => {
    const { client } = makeFakeSupabase({
      competitors: [{ id: COMPETITOR_ID, project_id: "other-project", domain: "x.com", is_active: true, name: "X" }]
    });
    const result = await deactivateCompetitorCore({
      projectId: PROJECT_ID,
      competitorId: COMPETITOR_ID,
      supabase: client,
      user: USER
    });
    expect(result.success).toBe(false);
  });

  it("3. valid deactivation → is_active flips to false, row preserved (soft delete)", async () => {
    const { client, competitors } = makeFakeSupabase({
      competitors: [{ id: COMPETITOR_ID, project_id: PROJECT_ID, domain: "x.com", is_active: true, name: "X" }]
    });
    const result = await deactivateCompetitorCore({
      projectId: PROJECT_ID,
      competitorId: COMPETITOR_ID,
      supabase: client,
      user: USER
    });
    expect(result.success).toBe(true);
    expect(competitors[0].is_active).toBe(false);
    expect(competitors).toHaveLength(1);
  });
});

describe("domain input normalization", () => {
  it("1. strips protocol, www, and trailing path before validating", () => {
    const parsed = domainSchemaForTests.safeParse("https://www.Leroymerlin.es/some/path");
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data).toBe("leroymerlin.es");
  });

  it("2. rejects an obviously malformed domain", () => {
    const parsed = domainSchemaForTests.safeParse("not a domain");
    expect(parsed.success).toBe(false);
  });
});
