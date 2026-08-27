/**
 * La máquina de estados de la banda de madurez de datos, y nada más.
 *
 * **Por qué vive aquí y no en `lib/project-workspace.ts`, donde nació**
 * (MATURITY-BANNER-HIDE-ALL-1, 2026-08-27, log §174). `DataMaturityBanner` es
 * un componente cliente, y mientras sólo importaba el TIPO daba igual dónde
 * estuviera: `import type` se borra al compilar. En cuanto tuvo que importar
 * una FUNCIÓN, el build se rompió — `project-workspace.ts` abre el cliente de
 * servicio de Supabase, y ese módulo entero se iba detrás al paquete del
 * navegador.
 *
 * Es el mismo argumento que `.claude/rules/scan.md` da para `lib/scan/`: si un
 * símbolo lo importa alguien que no hace lo que hace ese módulo, casi siempre
 * es que está en el sitio equivocado. Aquí hay dos cosas distintas metidas en
 * un fichero — una máquina de estados pura y una capa de acceso a datos — y
 * sólo la primera puede cruzar al cliente. `project-workspace.ts` la
 * reexporta, así que ningún consumidor de servidor cambia.
 *
 * Todo lo de este fichero es puro: sin `async`, sin red, sin `window`.
 */

/**
 * DATA-MATURITY-1: how many completed scans a project needs before its
 * trend/comparison surfaces (sparkline, delta, competitor trend) are treated
 * as done — matches the "Escaneo N de 5" banner shown until then. Not tied
 * to `run-scoring.ts`'s per-run `confidence` (that's about sample size
 * *within* one run's results, already high on day one for a healthy scan);
 * this is about *cross-run* history, which needs multiple completed runs no
 * matter how confident any single one is.
 */
export const DATA_MATURITY_TARGET_SCANS = 5;

export type DataMaturityState =
  | { kind: "hidden" }
  | { kind: "free" }
  | { kind: "no_tracking" }
  | { kind: "accumulating"; completed: number; target: number; cadenceUnit: "días" | "semanas"; etaCount: number };

/**
 * Pure decision function behind the data-maturity banner (`components/
 * data-maturity-banner.tsx`). Kept side-effect-free and separate from the
 * Supabase fetch in `getWorkspaceCounters` so every branch is unit-testable
 * without mocking a client — the DB/plan inputs are already computed there.
 *
 * Order matters: an active run and a full 5-scan history both fully hide the
 * banner (checked first) before the plan/tracking branches, which only ever
 * apply to a project with a real, terminal, partial history.
 */
export function computeDataMaturity({
  completedScans,
  latestStatus,
  recurringEnabled,
  planId
}: {
  completedScans: number;
  latestStatus: string | null | undefined;
  recurringEnabled: boolean;
  planId: string;
}): DataMaturityState {
  const hasActiveRun = latestStatus === "pending" || latestStatus === "running";
  if (hasActiveRun) return { kind: "hidden" };

  // No completed scan yet (project brand-new, or every attempt so far
  // failed): nothing real to report, and `setRecurringScans` itself refuses
  // to enable tracking without a completed run — showing the "no_tracking"
  // CTA here would offer an action that fails.
  if (completedScans <= 0) return { kind: "hidden" };

  if (completedScans >= DATA_MATURITY_TARGET_SCANS) return { kind: "hidden" };

  if (planId === "free") return { kind: "free" };

  if (!recurringEnabled) return { kind: "no_tracking" };

  return {
    kind: "accumulating",
    completed: completedScans,
    target: DATA_MATURITY_TARGET_SCANS,
    // Starter is the only weekly-cadence plan (lib/scan/cron.ts,
    // RECURRING_INTERVAL_MS_BY_PLAN) — free never reaches this branch
    // (returned above), so every other plan id scans daily.
    cadenceUnit: planId === "starter" ? "semanas" : "días",
    etaCount: DATA_MATURITY_TARGET_SCANS - completedScans
  };
}
/** Los estados que de verdad pintan algo. `hidden` queda fuera por definición. */
export type VisibleDataMaturityState = Exclude<DataMaturityState, { kind: "hidden" }>;

/**
 * MATURITY-BANNER-HIDE-ALL-1 (2026-08-27, log §174) — qué banda toca pintar,
 * si es que toca alguna. Es la ÚNICA puerta: el componente pregunta una vez y
 * pinta lo que salga.
 *
 * **Por qué es una función y no tres `if` en el componente.** El switch de
 * `/debug` nació silenciando sólo `no_tracking`, y el fundador pidió que
 * silenciara "ese y el de histórico construyendo y cualquier similar que
 * haya" (2026-08-27). Ese "cualquier similar" es lo que decide la forma: con
 * la comprobación repartida entre las ramas de `kind`, cubrir un estado nuevo
 * depende de que alguien se acuerde de añadir la condición en el sitio nuevo
 * — y si no se acuerda no falla nada, simplemente el aviso reaparece y el
 * switch pasa a mentir en silencio. Aquí `hidden` se resuelve ANTES de mirar
 * `kind`, así que un `kind` futuro queda cubierto por no hacer nada.
 *
 * Las dos preferencias son distintas a propósito: `dismissed` es el descarte
 * de la X (por proyecto, un aviso), `hidden` es el switch de `/debug` (por
 * proyecto, todos). Se leen las dos de `localStorage`, así que en el servidor
 * ambas llegan `false` y la banda se pinta hasta que el efecto del cliente
 * dice otra cosa — el mismo parpadeo que ya tenía, no uno nuevo.
 */
export function visibleDataMaturityState({
  state,
  dismissed,
  hidden
}: {
  state: DataMaturityState | null | undefined;
  dismissed: boolean;
  hidden: boolean;
}): VisibleDataMaturityState | null {
  if (hidden) return null;
  if (!state || state.kind === "hidden") return null;
  if (dismissed) return null;
  return state;
}
