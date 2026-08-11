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
  sampling_update_failed: "No se ha podido actualizar el suelo de muestreo. Vuelve a intentarlo.",
  sampling_migration_pending:
    "El suelo de muestreo todavía no se puede desactivar: falta aplicar la migración 0032 en Supabase.",
  engine_toggle_update_failed: "No se ha podido actualizar el motor. Vuelve a intentarlo.",
  engine_toggle_migration_pending:
    "Los motores todavía no se pueden activar/desactivar por separado: falta aplicar la migración 0033 en Supabase.",
  // Sin "vuelve a intentarlo": no es un fallo transitorio, es la única
  // combinación que este control rechaza a propósito — un escaneo sin ningún
  // motor no es más barato, es un escaneo vacío (CLAUDE.md, "no fake scans").
  engine_toggle_requires_one_active:
    "No puedes apagar el último motor activo. Al menos uno tiene que quedar encendido para poder escanear.",
  scan_failed: "No se ha podido completar la preparación o ejecución del escaneo.",
  no_engines_enabled: "Este dominio no tiene ningún motor de IA activado. Activa al menos uno en /debug antes de escanear.",
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
    "Auditoría técnica desactivada. Deja de actualizarse su componente del GeoScore en los próximos escaneos.",
  // SAMPLING-DEBUG-TOGGLE-1: apagarlo deja el próximo escaneo en una sola
  // pasada por su set de prompts, sin intentar llegar a 50 respuestas.
  sampling_enabled: "Suelo de muestreo activado. Los próximos escaneos repetirán su set de prompts hasta llegar a 50 respuestas.",
  sampling_disabled: "Suelo de muestreo desactivado. Los próximos escaneos harán una sola pasada por su set de prompts.",
  // ENGINE-DEBUG-TOGGLE-1: una clave por motor, igual que las dos mitades de
  // auditoría — el fundador necesita saber cuál tocó, no solo que "un motor"
  // cambió.
  engine_gemini_enabled: "Gemini activado. Los próximos escaneos volverán a incluirlo.",
  engine_gemini_disabled: "Gemini desactivado. Los próximos escaneos no lo usarán.",
  engine_claude_enabled: "Claude activado. Los próximos escaneos volverán a incluirlo.",
  engine_claude_disabled: "Claude desactivado. Los próximos escaneos no lo usarán.",
  engine_openai_enabled: "OpenAI activado. Los próximos escaneos volverán a incluirlo.",
  engine_openai_disabled: "OpenAI desactivado. Los próximos escaneos no lo usarán."
};
