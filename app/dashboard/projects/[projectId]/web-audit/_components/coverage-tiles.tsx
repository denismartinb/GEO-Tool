/**
 * The history bars of «Historial de comprobaciones». The Contenido /
 * Implementado tiles that also lived here were removed with their card
 * (log §450).
 */

/** 4px progress bar under a hero tile / history row (WEB-AUDIT-R4). */
export function MiniBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div style={{ height: 4, borderRadius: 999, background: "var(--line-soft)", overflow: "hidden" }}>
      <div style={{ width: `${Math.min(100, Math.max(0, pct))}%`, height: "100%", borderRadius: 999, background: color }} />
    </div>
  );
}
