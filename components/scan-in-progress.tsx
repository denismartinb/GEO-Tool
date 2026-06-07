/**
 * Pantalla de "escaneo en curso" — pixel-perfect respecto al diseño Lumira
 * (`design_handoff_lumira/prototype/states.jsx`, componente `LoadingState`).
 *
 * Adaptación obligatoria respecto al prototipo: el original simula 6 pasos
 * fijos con `setTimeout` (avance ficticio cada 1.1s). Eso es "fake progress",
 * prohibido por CLAUDE.md. Aquí el progreso es real, derivado de
 * `scan_runs` (`successful_prompts + failed_prompts` sobre `total_prompts`).
 * No existe información granular de fases en el esquema, así que el checklist
 * de 6 pasos simulados se omite — se mantiene spinner + título + cuerpo +
 * barra de progreso real + contador real ("X de Y prompts").
 */

export type ActiveScanRun = {
  status: string;
  total_prompts: number | null;
  successful_prompts: number | null;
  failed_prompts: number | null;
  started_at: string | null;
};

export function ScanInProgress({ activeRun }: { activeRun: ActiveScanRun }) {
  const total = activeRun.total_prompts ?? 0;
  const completed = (activeRun.successful_prompts ?? 0) + (activeRun.failed_prompts ?? 0);
  const hasProgress = total > 0;
  const pct = hasProgress ? Math.min(100, Math.round((completed / total) * 100)) : null;

  return (
    <div className="state-wrap">
      <div className="state-card">
        <div className="state-ico">
          <div className="spinner" style={{ width: 26, height: 26, borderWidth: 3 }} />
        </div>
        <div className="state-title">Escaneo de visibilidad en curso</div>
        <div className="state-body">
          Esto suele tardar un par de minutos. Puedes salir de esta página — seguiremos
          trabajando.
        </div>
        <div className="progress-track">
          <div className="progress-fill" style={{ width: (pct ?? 0) + "%" }} />
        </div>
        <div style={{ fontSize: 12, color: "var(--ink-4)", marginTop: 10, fontFamily: "var(--mono)" }}>
          {hasProgress ? (
            <>
              {pct}% · {completed} de {total} prompts
            </>
          ) : (
            <>Preparando el escaneo…</>
          )}
        </div>
      </div>
    </div>
  );
}
