import { describe, expect, it } from "vitest";
import { AUDIT_HALF_COLUMN, checkRecurringScansPrecondition, isMissingColumnError } from "./automation-toggles";

/**
 * Extraído de `app/dashboard/projects/[projectId]/actions.ts` para que
 * ADMIN-CONSOLE-2b lo reutilice — el operador no puede tener un atajo que el
 * propio dueño del proyecto no tiene. Estos tests cubren la lógica compartida
 * una vez; antes vivía sin test propio dentro de la server action.
 */

function fakeService(options: { completedRun?: { id: string } | null; error?: { message: string } | null }) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            limit: () => ({
              maybeSingle: () =>
                Promise.resolve({
                  data: options.error ? null : (options.completedRun ?? null),
                  error: options.error ?? null
                })
            })
          })
        })
      })
    })
  };
}

describe("checkRecurringScansPrecondition", () => {
  it("passes when a completed scan exists", async () => {
    const service = fakeService({ completedRun: { id: "run-1" } });
    expect(await checkRecurringScansPrecondition(service as never, "p1")).toEqual({ ok: true });
  });

  it("blocks with a specific reason when there is no completed scan", async () => {
    const service = fakeService({ completedRun: null });
    expect(await checkRecurringScansPrecondition(service as never, "p1")).toEqual({
      ok: false,
      reason: "recurring_requires_completed_scan"
    });
  });

  it("blocks with a distinct reason on a query error", async () => {
    const service = fakeService({ error: { message: "db down" } });
    expect(await checkRecurringScansPrecondition(service as never, "p1")).toEqual({
      ok: false,
      reason: "unexpected_error"
    });
  });
});

describe("isMissingColumnError", () => {
  it("recognizes the two PostgREST codes for a column not yet migrated", () => {
    expect(isMissingColumnError({ code: "42703" })).toBe(true);
    expect(isMissingColumnError({ code: "PGRST204" })).toBe(true);
  });

  it("rejects any other error code, or none", () => {
    expect(isMissingColumnError({ code: "23505" })).toBe(false);
    expect(isMissingColumnError(null)).toBe(false);
    expect(isMissingColumnError(undefined)).toBe(false);
  });
});

describe("AUDIT_HALF_COLUMN", () => {
  it("maps each half to the real migration-0031 column", () => {
    expect(AUDIT_HALF_COLUMN).toEqual({
      technical: "auto_technical_audit_enabled",
      coverage: "auto_coverage_audit_enabled"
    });
  });
});
