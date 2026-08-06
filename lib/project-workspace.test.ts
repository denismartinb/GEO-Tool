import { describe, expect, it } from "vitest";
import { DATA_MATURITY_TARGET_SCANS, computeDataMaturity } from "./project-workspace";

describe("computeDataMaturity", () => {
  it("hides while a run is pending or running, regardless of plan/history", () => {
    for (const latestStatus of ["pending", "running"]) {
      expect(
        computeDataMaturity({ completedScans: 2, latestStatus, recurringEnabled: true, planId: "pro" })
      ).toEqual({ kind: "hidden" });
    }
  });

  it("hides when there is no completed scan yet, even on a paid plan with tracking on", () => {
    expect(
      computeDataMaturity({ completedScans: 0, latestStatus: "failed", recurringEnabled: true, planId: "pro" })
    ).toEqual({ kind: "hidden" });
    expect(
      computeDataMaturity({ completedScans: 0, latestStatus: undefined, recurringEnabled: true, planId: "pro" })
    ).toEqual({ kind: "hidden" });
  });

  it("hides once the history target is reached, and never re-shows past it", () => {
    expect(
      computeDataMaturity({
        completedScans: DATA_MATURITY_TARGET_SCANS,
        latestStatus: "completed",
        recurringEnabled: true,
        planId: "pro"
      })
    ).toEqual({ kind: "hidden" });
    expect(
      computeDataMaturity({
        completedScans: DATA_MATURITY_TARGET_SCANS + 3,
        latestStatus: "completed",
        recurringEnabled: true,
        planId: "pro"
      })
    ).toEqual({ kind: "hidden" });
  });

  it("shows the free-plan variant regardless of tracking state", () => {
    expect(
      computeDataMaturity({ completedScans: 1, latestStatus: "completed", recurringEnabled: false, planId: "free" })
    ).toEqual({ kind: "free" });
  });

  it("shows the no-tracking CTA for a non-free plan with recurring scans off", () => {
    expect(
      computeDataMaturity({ completedScans: 1, latestStatus: "completed", recurringEnabled: false, planId: "pro" })
    ).toEqual({ kind: "no_tracking" });
  });

  it("computes daily cadence for pro/agency and derives the correct ETA", () => {
    expect(
      computeDataMaturity({ completedScans: 2, latestStatus: "completed", recurringEnabled: true, planId: "pro" })
    ).toEqual({ kind: "accumulating", completed: 2, target: 5, cadenceUnit: "días", etaCount: 3 });
    expect(
      computeDataMaturity({ completedScans: 4, latestStatus: "completed", recurringEnabled: true, planId: "agency" })
    ).toEqual({ kind: "accumulating", completed: 4, target: 5, cadenceUnit: "días", etaCount: 1 });
  });

  it("computes weekly cadence for starter", () => {
    expect(
      computeDataMaturity({ completedScans: 3, latestStatus: "completed", recurringEnabled: true, planId: "starter" })
    ).toEqual({ kind: "accumulating", completed: 3, target: 5, cadenceUnit: "semanas", etaCount: 2 });
  });
});

/**
 * Guarda estática sobre el `select` de `requireActiveProject`.
 *
 * Esa función carga SEIS pantallas (Prompts, Competidores, Páginas citadas,
 * Recomendaciones, Auditoría web y /debug) y hace `notFound()` cuando la
 * consulta no devuelve fila. Las migraciones de este repo se aplican a mano en
 * el editor SQL de Supabase, así que entre que se mergea el código y alguien
 * pega el SQL hay una ventana en la que una columna recién añadida NO existe —
 * y en esa ventana PostgREST devuelve error, `data` queda `null`, y las seis
 * pantallas dan 404 a la vez.
 *
 * No es una precaución de manual: pasó en el preview de la PR #345
 * (DOMAINS-REDESIGN-1, 2026-08-05) al añadir `auto_web_audit_enabled` al select
 * compartido, y lo cazó el piloto agéntico, no la suite ni mi propia revisión.
 * `pnpm test` y `pnpm run validate` estaban en verde: nada en este proyecto
 * comprueba el esquema real, así que el fallo era invisible hasta el navegador.
 *
 * Por eso la lista va cerrada. Añadir una columna aquí obliga a editar este
 * test, y editarlo obliga a leer esto — que es justo el momento de decidir si
 * esa columna puede tumbar seis pantallas mientras la migración espera. Si la
 * respuesta es "sí", la columna se lee donde se usa y tolerando que todavía no
 * exista (así lo hace /debug con `auto_web_audit_enabled`).
 *
 * Mismo espíritu que `supabase/migrations/migrations.test.ts`: estático,
 * estrecho, y cada regla corresponde a un fallo que llegó de verdad a un
 * despliegue.
 */
describe("requireActiveProject", () => {
  const ALLOWED_COLUMNS = [
    "id",
    "name",
    "brand",
    "domain",
    "country",
    "language",
    "recurring_scans_enabled"
  ];

  it("sólo selecciona columnas del esquema ya aplicado", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const source = readFileSync(join(process.cwd(), "lib", "project-workspace.ts"), "utf8");

    const body = source.slice(source.indexOf("export async function requireActiveProject"));
    const select = body.match(/\.select\("([^"]+)"\)/)?.[1];

    expect(select, "no se encontró el .select() de requireActiveProject").toBeDefined();
    expect(select!.split(",").map((column) => column.trim())).toEqual(ALLOWED_COLUMNS);
  });
});
