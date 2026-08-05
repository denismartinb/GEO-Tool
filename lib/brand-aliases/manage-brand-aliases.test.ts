import { describe, expect, it } from "vitest";
import type { AuthenticatedContext } from "@/lib/scan/types";
import { addBrandAliasCore, removeBrandAliasCore } from "./manage-brand-aliases";

type SupabaseClient = AuthenticatedContext["supabase"];
type Row = Record<string, unknown>;

const USER = { id: "user-1" } as AuthenticatedContext["user"];
const OTHER_USER = { id: "user-2" } as AuthenticatedContext["user"];
const PROJECT_ID = "11111111-1111-1111-1111-111111111111";

/**
 * Same fake-supabase harness shape as lib/competitors/manage-competitors.test.ts
 * — a single `projects` row, `.select().eq().eq().eq().maybeSingle()` for
 * reads and `.update().eq().eq().eq().select().maybeSingle()` for writes, so
 * ownership scoping (owner_user_id + is_archived) is exercised exactly as
 * the real query chains use it.
 */
function makeFakeSupabase(opts: { project?: Row | null; forceUpdateError?: boolean }) {
  const project: Row | null =
    "project" in opts
      ? opts.project ?? null
      : { id: PROJECT_ID, owner_user_id: USER.id, is_archived: false, brand: "Mozilla", brand_aliases: ["Firefox"] };

  const client = {
    from(table: string) {
      if (table !== "projects") {
        throw new Error(`Unexpected table in fake supabase: ${table}`);
      }
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
                  if (opts.forceUpdateError) {
                    return Promise.resolve({ data: null, error: { message: "boom" } });
                  }
                  const match = project && filters.every(([col, val]) => (project as Row)[col] === val) ? project : null;
                  if (!match) return Promise.resolve({ data: null, error: null });
                  Object.assign(match, patch);
                  return Promise.resolve({ data: { brand_aliases: match.brand_aliases }, error: null });
                }
              };
            }
          };
          return builder;
        }
      };
    }
  };

  return { client: client as unknown as SupabaseClient, project };
}

describe("addBrandAliasCore", () => {
  it("1. project not owned by caller → project_not_found, no write attempted", async () => {
    const { client } = makeFakeSupabase({ project: null });
    const result = await addBrandAliasCore({ projectId: PROJECT_ID, alias: "Thunderbird", supabase: client, user: USER });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).toMatch(/proyecto/i);
  });

  it("2. a caller who isn't the project's owner cannot add an alias to it", async () => {
    const { client } = makeFakeSupabase({
      project: { id: PROJECT_ID, owner_user_id: OTHER_USER.id, is_archived: false, brand: "Mozilla", brand_aliases: [] }
    });
    const result = await addBrandAliasCore({ projectId: PROJECT_ID, alias: "Thunderbird", supabase: client, user: USER });
    expect(result.success).toBe(false);
  });

  it("3. an archived project cannot be modified even by its real owner", async () => {
    const { client } = makeFakeSupabase({
      project: { id: PROJECT_ID, owner_user_id: USER.id, is_archived: true, brand: "Mozilla", brand_aliases: [] }
    });
    const result = await addBrandAliasCore({ projectId: PROJECT_ID, alias: "Thunderbird", supabase: client, user: USER });
    expect(result.success).toBe(false);
  });

  it("4. valid alias → appended and persisted", async () => {
    const { client, project } = makeFakeSupabase({});
    const result = await addBrandAliasCore({ projectId: PROJECT_ID, alias: "Thunderbird", supabase: client, user: USER });
    expect(result.success).toBe(true);
    if (result.success) expect(result.aliases).toEqual(["Firefox", "Thunderbird"]);
    expect(project!.brand_aliases).toEqual(["Firefox", "Thunderbird"]);
  });

  it("5. invalid alias (rejected by validateNewAlias) → no write, real validation error surfaced", async () => {
    const { client, project } = makeFakeSupabase({});
    const result = await addBrandAliasCore({ projectId: PROJECT_ID, alias: "FF", supabase: client, user: USER });
    expect(result.success).toBe(false);
    expect(project!.brand_aliases).toEqual(["Firefox"]);
  });

  it("6. duplicate of an existing alias → rejected, never stored twice", async () => {
    const { client, project } = makeFakeSupabase({});
    const result = await addBrandAliasCore({ projectId: PROJECT_ID, alias: "firefox", supabase: client, user: USER });
    expect(result.success).toBe(false);
    expect(project!.brand_aliases).toEqual(["Firefox"]);
  });

  it("7. DB write failure → generic message, not a raw error", async () => {
    const { client } = makeFakeSupabase({ forceUpdateError: true });
    const result = await addBrandAliasCore({ projectId: PROJECT_ID, alias: "Thunderbird", supabase: client, user: USER });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error).not.toMatch(/boom/);
  });
});

describe("removeBrandAliasCore", () => {
  it("1. project not owned → error, no write", async () => {
    const { client } = makeFakeSupabase({ project: null });
    const result = await removeBrandAliasCore({ projectId: PROJECT_ID, alias: "Firefox", supabase: client, user: USER });
    expect(result.success).toBe(false);
  });

  it("2. a caller who isn't the project's owner cannot remove its alias", async () => {
    const { client, project } = makeFakeSupabase({
      project: { id: PROJECT_ID, owner_user_id: OTHER_USER.id, is_archived: false, brand: "Mozilla", brand_aliases: ["Firefox"] }
    });
    const result = await removeBrandAliasCore({ projectId: PROJECT_ID, alias: "Firefox", supabase: client, user: USER });
    expect(result.success).toBe(false);
    expect(project!.brand_aliases).toEqual(["Firefox"]);
  });

  it("3. valid removal → alias dropped and persisted", async () => {
    const { client, project } = makeFakeSupabase({
      project: { id: PROJECT_ID, owner_user_id: USER.id, is_archived: false, brand: "Mozilla", brand_aliases: ["Firefox", "Thunderbird"] }
    });
    const result = await removeBrandAliasCore({ projectId: PROJECT_ID, alias: "Firefox", supabase: client, user: USER });
    expect(result.success).toBe(true);
    if (result.success) expect(result.aliases).toEqual(["Thunderbird"]);
    expect(project!.brand_aliases).toEqual(["Thunderbird"]);
  });

  it("4. removing a non-existent alias is a harmless no-op, not an error", async () => {
    const { client, project } = makeFakeSupabase({});
    const result = await removeBrandAliasCore({ projectId: PROJECT_ID, alias: "Chrome", supabase: client, user: USER });
    expect(result.success).toBe(true);
    if (result.success) expect(result.aliases).toEqual(["Firefox"]);
    expect(project!.brand_aliases).toEqual(["Firefox"]);
  });
});
