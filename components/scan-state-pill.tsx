import { computeScanStage, type ActiveScanRun } from "@/components/scan-in-progress";

/**
 * La decisión de qué texto lleva la pastilla, aparte del render: el proyecto
 * no tiene arnés de DOM en los tests, así que sacarla a una función pura es
 * lo que permite fijarla.
 */
export function scanStatePillLabel(activeRun?: ActiveScanRun | null, lastScanLabel?: string | null): string | null {
  if (activeRun) {
    return computeScanStage(activeRun).kind === "analyzing" ? "Analizando…" : "Escaneando…";
  }
  return lastScanLabel ? `Escaneado ${lastScanLabel}` : null;
}

/**
 * La pastilla de estado del sticky-header de cada pantalla de proyecto
 * (EXTRACTION-RELIABILITY-1 Fase C).
 *
 * Antes mostraba siempre "Escaneado <fecha>", y junto a ella un chip aparte
 * de "Escaneo en curso" — que el CSS oculta bajo el breakpoint móvil
 * (`app/globals.css`, `.scan-status { display: none }`). El resultado, en un
 * proyecto con historial y desde un móvil: durante un escaneo no había
 * absolutamente ninguna señal en pantalla, porque el overlay a pantalla
 * completa sólo se monta cuando todavía no hay datos que enseñar (founder,
 * 2026-08-05: "no veo ningún chip en ninguna cabecera móvil").
 *
 * Y el problema no era sólo que faltara una señal: la que había estaba
 * desactualizada justo cuando importa. "Escaneado 5 ago" afirma que lo que
 * ves es lo último que hay, mientras se están cocinando datos nuevos.
 *
 * Por eso el estado vive AQUÍ y no en la barra de app: BRAND-5b-mobile-header
 * (log §3, 2026-07-24) decidió que la barra móvil no lleva contexto y que
 * "el contexto vive entero en el sticky-header de cada página" — una versión
 * con esa info incrustada en la barra ya se probó y se revirtió por
 * redundante. Esto usa el hueco que aquella decisión designó, en vez de
 * reabrirla.
 *
 * La etiqueta de escaneo activo reutiliza `computeScanStage`, el mismo
 * cálculo que la pantalla completa, para que las dos superficies no puedan
 * discrepar sobre en qué etapa va un escaneo.
 */
export function ScanStatePill({
  activeRun,
  lastScanLabel
}: {
  /** El run pendiente/en curso, si lo hay. */
  activeRun?: ActiveScanRun | null;
  /** Fecha ya formateada del último escaneo completado. */
  lastScanLabel?: string | null;
}) {
  const label = scanStatePillLabel(activeRun, lastScanLabel);
  if (!label) return null;

  if (activeRun) {
    return (
      <span className="badge badge-accent" style={{ fontSize: 11 }} aria-live="polite">
        <span className="dot run" style={{ marginRight: 6 }} />
        {label}
      </span>
    );
  }

  return (
    <span className="badge badge-pos" style={{ fontSize: 11 }}>
      {label}
    </span>
  );
}
