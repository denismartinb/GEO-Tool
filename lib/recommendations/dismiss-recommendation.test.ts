import { describe, expect, it } from "vitest";
import type { AuthenticatedContext } from "@/lib/auth";
import type { createServiceClient } from "@/lib/supabase/service";
import { dismissRecommendationCore } from "./dismiss-recommendation";

type SupabaseClient = AuthenticatedContext["supabase"];
type ServiceClient = ReturnType<typeof createServiceClient>;
type Row = Record<string, unknown>;

function makeFakeSupabase({ project, recommendation }: { project: Row | null; recommendation: Row | null }) {
  const client = {
    from(table: string) {
      if (table === "projects") {
        return {
          select(_cols: string) {
            const filters: Array<[string, unknown]> = [];
            const builder = {
              eq(col: string, val: unknown) {
                filters.push([col, val]);
                return builder;
              },
              maybeSingle() {
                const match = project && filters.every(([col, val]) => project[col] === val) ? project : null;
                return Promise.resolve({ data: match, error: null });
              }
            };
            return builder;
          }
        };
      }

      if (table === "recommendations") {
        return {
          select(_cols: string) {
            const filters: Array<[string, unknown]> = [];
            const builder = {
              eq(col: string, val: unknown) {
                filters.push([col, val]);
                return builder;
              },
              maybeSingle() {
                const match =
                  recommendation && filters.every(([col, val]) => recommendation[col] === val) ? recommendation : null;
                return Promise.resolve({ data: match, error: null });
              }
            };
            return builder;
          }
        };
      }

      throw new Error(`Unexpected table in fake supabase: ${table}`);
    }
  };

  return client as unknown as SupabaseClient;
}

function makeFakeService({ forceUpdateError = false }: { forceUpdateError?: boolean } = {}) {
  const updates: Array<{ id: unknown; project_id: unknown; patch: Row }> = [];

  const client = {
    from(table: string) {
      if (table !== "recommendations") throw new Error(`Unexpected table in fake service: ${table}`);
      return {
        update(patch: Row) {
          const filters: Array<[string, unknown]> = [];
          const builder = {
            eq(col: string, val: unknown) {
              filters.push([col, val]);
              return builder;
            },
            then(resolve: (value: { error: { message: string } | null }) => unknown) {
              if (forceUpdateError) {
                return Promise.resolve({ error: { message: "update failed" } }).then(resolve);
              }
              const idFilter = filters.find(([col]) => col === "id");
              const projectFilter = filters.find(([col]) => col === "project_id");
              updates.push({ id: idFilter?.[1], project_id: projectFilter?.[1], patch });
              return Promise.resolve({ error: null }).then(resolve);
            }
          };
          return builder;
        }
      };
    }
  };

  return { client: client as unknown as ServiceClient, updates };
}

const PROJECT = { id: "project-1", owner_user_id: "user-1" };
const RECOMMENDATION = { id: "rec-1", project_id: "project-1", status: "active" };
const USER = { id: "user-1" } as unknown as AuthenticatedContext["user"];

describe("dismissRecommendationCore", () => {
  it("marks an active recommendation as dismissed via the service-role client", async () => {
    const supabase = makeFakeSupabase({ project: PROJECT, recommendation: RECOMMENDATION });
    const { client: service, updates } = makeFakeService();

    const result = await dismissRecommendationCore({
      projectId: "project-1",
      recommendationId: "rec-1",
      supabase,
      service,
      user: USER
    });

    expect(result).toEqual({ success: true });
    expect(updates).toEqual([{ id: "rec-1", project_id: "project-1", patch: { status: "dismissed" } }]);
  });

  it("is idempotent: an already-dismissed recommendation returns success without a redundant write", async () => {
    const supabase = makeFakeSupabase({
      project: PROJECT,
      recommendation: { ...RECOMMENDATION, status: "dismissed" }
    });
    const { client: service, updates } = makeFakeService();

    const result = await dismissRecommendationCore({
      projectId: "project-1",
      recommendationId: "rec-1",
      supabase,
      service,
      user: USER
    });

    expect(result).toEqual({ success: true });
    expect(updates).toHaveLength(0);
  });

  it("returns success:false when the project is not owned by this user (no service write attempted)", async () => {
    const supabase = makeFakeSupabase({ project: null, recommendation: RECOMMENDATION });
    const { client: service, updates } = makeFakeService();

    const result = await dismissRecommendationCore({
      projectId: "project-1",
      recommendationId: "rec-1",
      supabase,
      service,
      user: USER
    });

    expect(result.success).toBe(false);
    expect(updates).toHaveLength(0);
  });

  it("returns success:false when the recommendation does not belong to this project", async () => {
    const supabase = makeFakeSupabase({ project: PROJECT, recommendation: null });
    const { client: service, updates } = makeFakeService();

    const result = await dismissRecommendationCore({
      projectId: "project-1",
      recommendationId: "rec-1",
      supabase,
      service,
      user: USER
    });

    expect(result.success).toBe(false);
    expect(updates).toHaveLength(0);
  });

  it("returns a sanitized error when the service-role update fails", async () => {
    const supabase = makeFakeSupabase({ project: PROJECT, recommendation: RECOMMENDATION });
    const { client: service } = makeFakeService({ forceUpdateError: true });

    const result = await dismissRecommendationCore({
      projectId: "project-1",
      recommendationId: "rec-1",
      supabase,
      service,
      user: USER
    });

    expect(result).toEqual({
      success: false,
      error: "No se ha podido actualizar la recomendación en este momento. Inténtalo de nuevo en unos minutos."
    });
  });
});
