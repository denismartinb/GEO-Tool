/**
 * Shared `?success=...&error=...` query-param messages surfaced after
 * project/scan server actions redirect. Used by both the project overview
 * page and the runs (Escaneos) page so redirect targets can vary without
 * duplicating copy.
 */
export const feedbackErrorMessages: Record<string, string> = {
  active_run_exists: "Ya hay un escaneo en curso o pendiente para este dominio.",
  free_plan_scan_limit_reached:
    "Tu plan Free incluye un único escaneo. Sube a Starter o Pro para volver a escanear este dominio.",
  project_archived: "Este dominio está archivado. Reactívalo antes de lanzar un escaneo.",
  project_not_found: "No hemos encontrado el dominio solicitado.",
  project_setup_partial:
    "El dominio se creó, pero no pudimos guardar todos los prompts o competidores iniciales. Revísalos antes de escanear.",
  prompt_limit_reached: "Has alcanzado el límite de prompts monitorizados de tu plan actual. Sube de plan para añadir más.",
  prompts_required: "Añade al menos un prompt activo antes de escanear.",
  recurring_requires_completed_scan:
    "Completa al menos un escaneo manual antes de activar el escaneo automático diario.",
  recurring_update_failed: "No se ha podido actualizar el escaneo automático. Vuelve a intentarlo.",
  auto_audit_update_failed: "No se ha podido actualizar la auditoría automática. Vuelve a intentarlo.",
  // Sin "vuelve a intentarlo" a propósito: reintentar no crea una columna. Dice
  // qué hay que hacer y quién puede hacerlo.
  auto_audit_migration_pending:
    "La auditoría automática todavía no se puede configurar por dominio: falta aplicar la migración 0030 en Supabase.",
  scan_failed: "No se ha podido completar la preparación o ejecución del escaneo.",
  scan_unavailable: "La ejecución automática del escaneo todavía no está disponible en este entorno.",
  unauthorized: "No tienes permisos para realizar esta acción.",
  unexpected_error: "Ha ocurrido un error inesperado. Vuelve a intentarlo."
};

export const feedbackSuccessMessages: Record<string, string> = {
  project_created: "Dominio creado. Revisa los prompts y competidores antes de lanzar el primer escaneo.",
  scan_started: "Dominio creado. Tu primer escaneo se está ejecutando — sigue el progreso aquí.",
  scan_completed: "Escaneo completado. Los resultados ya están disponibles en esta visión general.",
  scan_pending: "Escaneo preparado. La ejecución automática todavía no está activada en este entorno.",
  recurring_enabled: "Escaneo automático diario activado. Este dominio se escaneará cada día.",
  recurring_disabled: "Escaneo automático diario desactivado.",
  auto_audit_enabled: "Auditoría automática activada. Este dominio se auditará tras cada escaneo.",
  // Says "los próximos", not "las auditorías": a job already queued still runs
  // (see setAutoWebAudit) and promising otherwise would be a lie the user could
  // catch on the very next page load.
  auto_audit_disabled: "Auditoría automática desactivada. No se auditarán los próximos escaneos de este dominio."
};
