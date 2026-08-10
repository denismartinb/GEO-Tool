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
    "La auditoría automática todavía no se puede configurar por mitades: falta aplicar la migración 0031 en Supabase.",
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
  // WEB-AUDIT-AUTO-SPLIT-1: una clave por mitad. Cada texto dice qué mitad y
  // qué cuesta, porque el fundador las apaga por coste y las dos no cuestan lo
  // mismo: la cobertura son llamadas a Gemini, la técnica no gasta LLM.
  audit_coverage_enabled:
    "Cobertura por IA activada. Tras cada escaneo se consultará a Gemini por cada prompt de este dominio.",
  // Dice "los próximos", no "las auditorías": una mitad ya en vuelo dentro de
  // una invocación viva termina, y prometer lo contrario sería una mentira que
  // el usuario puede cazar en la siguiente carga de página.
  audit_coverage_disabled: "Cobertura por IA desactivada. No se consultará a Gemini en los próximos escaneos.",
  audit_technical_enabled:
    "Auditoría técnica activada. Se revisará la salud técnica de la web tras cada escaneo (no gasta IA).",
  audit_technical_disabled:
    "Auditoría técnica desactivada. Deja de actualizarse su componente del GeoScore en los próximos escaneos."
};
