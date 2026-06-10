/**
 * Shared `?success=...&error=...` query-param messages surfaced after
 * project/scan server actions redirect. Used by both the project overview
 * page and the runs (Escaneos) page so redirect targets can vary without
 * duplicating copy.
 */
export const feedbackErrorMessages: Record<string, string> = {
  active_run_exists: "Ya hay un escaneo en curso o pendiente para este proyecto.",
  project_archived: "Este proyecto está archivado. Reactívalo antes de lanzar un escaneo.",
  project_not_found: "No hemos encontrado el proyecto solicitado.",
  project_setup_partial:
    "El proyecto se creó, pero no pudimos guardar todos los prompts o competidores iniciales. Revísalos antes de escanear.",
  prompts_required: "Añade al menos un prompt activo antes de escanear.",
  recurring_requires_completed_scan:
    "Completa al menos un escaneo manual antes de activar el escaneo automático semanal.",
  recurring_update_failed: "No se ha podido actualizar el escaneo automático. Vuelve a intentarlo.",
  scan_failed: "No se ha podido completar la preparación o ejecución del escaneo.",
  scan_unavailable: "La ejecución automática del escaneo todavía no está disponible en este entorno.",
  too_many_prompts: "El escaneo está limitado a 10 prompts activos. Desactiva algunos antes de continuar.",
  unauthorized: "No tienes permisos para realizar esta acción.",
  unexpected_error: "Ha ocurrido un error inesperado. Vuelve a intentarlo."
};

export const feedbackSuccessMessages: Record<string, string> = {
  project_created: "Proyecto creado. Revisa los prompts y competidores antes de lanzar el primer escaneo.",
  scan_started: "Dominio creado. Tu primer escaneo se está ejecutando — sigue el progreso aquí.",
  scan_completed: "Escaneo completado. Los resultados ya están disponibles en esta visión general.",
  scan_pending: "Escaneo preparado. La ejecución automática todavía no está activada en este entorno.",
  recurring_enabled: "Escaneo automático semanal activado. Este dominio se escaneará cada semana.",
  recurring_disabled: "Escaneo automático semanal desactivado."
};
