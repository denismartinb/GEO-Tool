/**
 * Pantalla de "escaneo en curso" — basada en el diseño de referencia
 * (`design_handoff_lumira/prototype/states.jsx`, componente `LoadingState`).
 *
 * Adaptación obligatoria respecto al prototipo: el original simula 6 pasos
 * fijos con `setTimeout` (avance ficticio cada 1.1s). Eso es "fake progress",
 * prohibido por CLAUDE.md. Aquí cada contador es real y está medido.
 *
 * Un escaneo tiene dos etapas que tardan lo suyo: preguntar a los motores y
 * analizar lo que contestan. Hasta EXTRACTION-RELIABILITY-1 Fase C esta
 * pantalla sólo medía la primera, lo cual era casi honesto mientras el
 * finalize era instantáneo. La Fase A metió la extracción dentro de esa
 * ventana, así que la barra se quedaba clavada en "100% · 6 de 6" durante un
 * tramo real del escaneo, con toda la sección del proyecto tapada por el
 * overlay — y quien ve un 100% junto a un spinner concluye que se ha colgado.
 *
 * La barra recorre ahora las dos etapas: la primera mitad es la generación, la
 * segunda el análisis. Ese reparto 50/50 es una convención de presentación, no
 * una medida — el análisis puede durar más o menos que la generación. Lo que
 * NO es convención son los dos contadores que la acompañan: ambos salen de
 * filas reales, y la regla que de verdad importa es que la barra no llegue al
 * 100% mientras quede trabajo por hacer.
 *
 * Sobre la unidad del primer contador: SAMPLING-1 (ADR 0030) le quitó el
 * sustantivo "prompts" porque desde entonces `total_prompts` cuenta
 * lanzamientos (prompt x repetición), no prompts, y nombrarlo así sería falso
 * en los escaneos que repiten. Se mantiene sin nombrar la unidad — decir
 * "consultando motores" describe la etapa sin afirmar nada incierto sobre lo
 * que se cuenta.
 */

export type ActiveScanRun = {
  status: string;
  total_prompts: number | null;
  successful_prompts: number | null;
  failed_prompts: number | null;
  started_at: string | null;
  /**
   * Contadores de la etapa de análisis (Fase C), poblados por
   * `withAnalysisProgress`. Opcionales a propósito: un llamador que no los
   * pase degrada a la barra de sólo generación en vez de romperse.
   */
  responses_total?: number | null;
  responses_processed?: number | null;
};

/** Techo mientras el escaneo sigue vivo: el 100% se reserva para un run terminado. */
const MAX_IN_FLIGHT_PCT = 99;

export type ScanStage =
  | { kind: "preparing" }
  | { kind: "generating"; done: number; total: number; pct: number }
  | { kind: "analyzing"; done: number; total: number | null; pct: number };

/**
 * Exportada aparte del render para que la decisión — qué etapa es y qué
 * porcentaje le corresponde — se pueda fijar con tests sin montar el DOM.
 */
export function computeScanStage(run: ActiveScanRun): ScanStage {
  const total = run.total_prompts ?? 0;
  if (total <= 0) return { kind: "preparing" };

  const done = (run.successful_prompts ?? 0) + (run.failed_prompts ?? 0);

  if (done < total) {
    return { kind: "generating", done, total, pct: Math.round((done / total) * 50) };
  }

  // Generación terminada: todo lo que queda es análisis, que es exactamente el
  // tramo que antes se mostraba como "100%".
  const responsesTotal = run.responses_total ?? null;
  const responsesDone = run.responses_processed ?? 0;

  if (responsesTotal === null || responsesTotal <= 0) {
    // Sin contadores todavía. Se dice qué está pasando sin inventar un número.
    return { kind: "analyzing", done: 0, total: null, pct: 50 };
  }

  const pct = Math.min(MAX_IN_FLIGHT_PCT, 50 + Math.round((responsesDone / responsesTotal) * 50));
  return { kind: "analyzing", done: responsesDone, total: responsesTotal, pct };
}

export function ScanInProgress({ activeRun }: { activeRun: ActiveScanRun }) {
  const stage = computeScanStage(activeRun);
  const analyzing = stage.kind === "analyzing";

  return (
    <div className="state-wrap fade-in">
      <div className="state-card">
        <div className="state-ico">
          <div className="spinner" style={{ width: 26, height: 26, borderWidth: 3 }} />
        </div>
        <div className="state-title">{analyzing ? "Analizando las respuestas" : "Escaneo de visibilidad en curso"}</div>
        <div className="state-body">
          {analyzing
            ? "Ya tenemos lo que han contestado los motores; ahora extraemos de cada respuesta las menciones, las posiciones y las citas. Puedes salir de esta página — seguiremos trabajando."
            : "Esto suele tardar un par de minutos. Puedes salir de esta página — seguiremos trabajando."}
        </div>
        <div className="progress-track">
          <div className="progress-fill" style={{ width: (stage.kind === "preparing" ? 0 : stage.pct) + "%" }} />
        </div>
        <div style={{ fontSize: 12, color: "var(--ink-4)", marginTop: 10, fontFamily: "var(--mono)" }}>
          {stage.kind === "preparing" ? (
            <>Preparando el escaneo…</>
          ) : stage.kind === "generating" ? (
            <>
              {stage.pct}% · consultando motores · {stage.done} de {stage.total}
            </>
          ) : stage.total === null ? (
            <>{stage.pct}% · analizando respuestas…</>
          ) : (
            <>
              {stage.pct}% · analizando respuestas · {stage.done} de {stage.total}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
