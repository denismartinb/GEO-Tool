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
