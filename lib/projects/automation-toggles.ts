import "server-only";

import type { createServiceClient } from "@/lib/supabase/service";

/**
 * Precondiciones y mapeo de columnas de los interruptores de automatismo,
 * extraídos de `app/dashboard/projects/[projectId]/actions.ts`
 * (`setRecurringScans`/`setAutoAuditHalf`) para que ADMIN-CONSOLE-2b los
 * reutilice en vez de reescribirlos. El operador nunca tiene un atajo que el
 * propio dueño del proyecto no tenga — mismo cheque, misma dirección de
 * fallo, un solo sitio que mantener.
 *
 * Tipado sobre el cliente genérico (no `AuthenticatedContext`) porque lo llama
 * tanto la acción del dueño (cliente con sesión, RLS) como la del operador
 * (`createServiceClient()`), y la consulta en sí no depende de cuál sea.
 */

type SupabaseLike = Pick<ReturnType<typeof createServiceClient>, "from">;

export type RecurringScansPreconditionResult =
  | { ok: true }
  | { ok: false; reason: "unexpected_error" | "recurring_requires_completed_scan" };

/**
 * Activar el recurrente exige un escaneo completado, para que la cadencia
 * arranque siempre de una base conocida (guardrail de geo-strategy). Se
 * comprueba sólo al activar: desactivar nunca necesita esta consulta.
 */
export async function checkRecurringScansPrecondition(
  supabase: SupabaseLike,
  projectId: string
): Promise<RecurringScansPreconditionResult> {
  const { data: completedRun, error } = await supabase
    .from("scan_runs")
    .select("id")
    .eq("project_id", projectId)
    .eq("status", "completed")
    .limit(1)
    .maybeSingle();

  if (error) return { ok: false, reason: "unexpected_error" };
  if (!completedRun) return { ok: false, reason: "recurring_requires_completed_scan" };
  return { ok: true };
}

export type SetRecurringScansResult =
  | { ok: true; enabled: boolean }
  | { ok: false; reason: "unexpected_error" | "recurring_requires_completed_scan" | "recurring_update_failed" };

/**
 * ACTIONS-OBSERVABLE-1 slice 4b.2 (docs/external-audit-2026-08.md, Fase 4,
 * P0-04) — el núcleo de "Activar/desactivar seguimiento diario", extraído de
 * `setRecurringScans` (`app/dashboard/projects/[projectId]/actions.ts`) para
 * que el desenlace se DEVUELVA en vez de decidirse con `redirect()`
 * (`.claude/rules/server-actions.md`). El motivo no es sólo testabilidad: la
 * action original termina en `redirect()` en TODAS sus ramas, incluida la de
 * éxito, y las tres apuntan a `/dashboard/projects/{id}/debug` — correcto
 * para el switch de esa pantalla, pero equivocado para
 * `DataMaturityBanner`, que la llama desde Visión general y con ese destino
 * literalmente saca al usuario de la pantalla en la que estaba para pulsar un
 * botón (docs/specs/actions-observable-1/remaining-slices.md).
 *
 * Este core no sabe nada de `redirect` ni de rutas: la action de `/debug`
 * sigue traduciendo su resultado a la misma redirección de siempre, y la
 * nueva action del banner lo traduce a `{ success, error }` para
 * `useActionFeedback`. Un solo cheque, una sola escritura, dos traducciones.
 */
export async function setRecurringScansCore(
  supabase: SupabaseLike,
  { projectId, ownerUserId, enabled }: { projectId: string; ownerUserId: string; enabled: boolean }
): Promise<SetRecurringScansResult> {
  if (enabled) {
    const check = await checkRecurringScansPrecondition(supabase, projectId);
    if (!check.ok) return { ok: false, reason: check.reason };
  }

  const { data, error } = await supabase
    .from("projects")
    .update({ recurring_scans_enabled: enabled })
    .eq("id", projectId)
    .eq("owner_user_id", ownerUserId)
    .eq("is_archived", false)
    .select("id")
    .maybeSingle();

  if (error || !data) return { ok: false, reason: "recurring_update_failed" };
  return { ok: true, enabled };
}

/** Qué columna escribe cada mitad de la auditoría automática (migración 0031). */
export const AUDIT_HALF_COLUMN = {
  technical: "auto_technical_audit_enabled",
  coverage: "auto_coverage_audit_enabled"
} as const;

export type AuditHalf = keyof typeof AUDIT_HALF_COLUMN;

/**
 * `42703` = undefined_column, `PGRST204` = la columna no está en el caché de
 * esquema de PostgREST. Las dos significan lo mismo para quien está delante:
 * falta aplicar la migración (reportado por el fundador el 2026-08-05).
 */
export function isMissingColumnError(error: { code?: string } | null | undefined): boolean {
  return error?.code === "42703" || error?.code === "PGRST204";
}
