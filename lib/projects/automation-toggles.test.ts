import { describe, expect, it } from "vitest";
import {
  AUDIT_HALF_COLUMN,
  checkRecurringScansPrecondition,
  isMissingColumnError,
  setRecurringScansCore
} from "./automation-toggles";

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

/**
 * ACTIONS-OBSERVABLE-1 slice 4b.2 (docs/external-audit-2026-08.md, Fase 4).
 * `setRecurringScansCore` es lo único que `setRecurringScans` (la action de
 * `/debug`) y la nueva action del banner de Visión general comparten — ambas
 * traducen el mismo resultado discriminado a un destino distinto
 * (`redirect()` vs. `{ success, error }`), y esto es lo que hoy no tenía ni
 * un test.
 */
function fakeUpdateService(options: {
  completedRun?: { id: string } | null;
  preconditionError?: { message: string } | null;
  updateData?: { id: string } | null;
  updateError?: { message: string } | null;
}) {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            limit: () => ({
              maybeSingle: () =>
                Promise.resolve({
                  data: options.preconditionError ? null : (options.completedRun ?? null),
                  error: options.preconditionError ?? null
                })
            })
          })
        })
      }),
      update: () => ({
        eq: () => ({
          eq: () => ({
            eq: () => ({
              select: () => ({
                maybeSingle: () =>
                  Promise.resolve({
                    data: options.updateError ? null : (options.updateData !== undefined ? options.updateData : { id: "p1" }),
                    error: options.updateError ?? null
                  })
              })
            })
          })
        })
      })
    })
  };
}

describe("setRecurringScansCore", () => {
  it("bloquea activar sin un escaneo completado, sin llegar a escribir", async () => {
    const service = fakeUpdateService({ completedRun: null });
    const result = await setRecurringScansCore(service as never, {
      projectId: "p1",
      ownerUserId: "u1",
      enabled: true
    });
    expect(result).toEqual({ ok: false, reason: "recurring_requires_completed_scan" });
  });

  it("propaga un fallo inesperado de la precondición", async () => {
    const service = fakeUpdateService({ preconditionError: { message: "db down" } });
    const result = await setRecurringScansCore(service as never, {
      projectId: "p1",
      ownerUserId: "u1",
      enabled: true
    });
    expect(result).toEqual({ ok: false, reason: "unexpected_error" });
  });

  it("activa cuando hay un escaneo completado y la escritura funciona", async () => {
    const service = fakeUpdateService({ completedRun: { id: "run-1" }, updateData: { id: "p1" } });
    const result = await setRecurringScansCore(service as never, {
      projectId: "p1",
      ownerUserId: "u1",
      enabled: true
    });
    expect(result).toEqual({ ok: true, enabled: true });
  });

  it("desactivar nunca comprueba la precondición", async () => {
    // Sin `completedRun` en las opciones, cualquier lectura de la
    // precondición fallaría — que el resultado sea `ok` demuestra que
    // desactivar no la consulta en absoluto, como ya documentaba
    // checkRecurringScansPrecondition.
    const service = fakeUpdateService({ updateData: { id: "p1" } });
    const result = await setRecurringScansCore(service as never, {
      projectId: "p1",
      ownerUserId: "u1",
      enabled: false
    });
    expect(result).toEqual({ ok: true, enabled: false });
  });

  it("reporta un fallo de escritura con su propio motivo, distinto del de la precondición", async () => {
    const service = fakeUpdateService({ completedRun: { id: "run-1" }, updateError: { message: "db down" } });
    const result = await setRecurringScansCore(service as never, {
      projectId: "p1",
      ownerUserId: "u1",
      enabled: true
    });
    expect(result).toEqual({ ok: false, reason: "recurring_update_failed" });
  });

  it("también reporta recurring_update_failed cuando la fila no existe o no pertenece al dueño", async () => {
    const service = fakeUpdateService({ completedRun: { id: "run-1" }, updateData: null });
    const result = await setRecurringScansCore(service as never, {
      projectId: "p1",
      ownerUserId: "u1",
      enabled: true
    });
    expect(result).toEqual({ ok: false, reason: "recurring_update_failed" });
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
