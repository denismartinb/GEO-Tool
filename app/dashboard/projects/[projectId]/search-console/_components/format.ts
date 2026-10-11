/** es-ES formatting for «Posición en Google» (log §283). */
export function fmtInt(n: number): string {
  return Math.round(n).toLocaleString("es-ES");
}

export function fmtPosition(n: number): string {
  return n.toLocaleString("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

export function fmtPct(fraction: number): string {
  return `${(fraction * 100).toLocaleString("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

export function fmtDeltaPct(pct: number): string {
  const rounded = Math.round(pct);
  return `${rounded > 0 ? "+" : ""}${rounded}%`;
}

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** "2026-10-09" → "9 oct", read as a calendar date (no timezone shift). */
export function fmtDay(iso: string): string {
  const [, m, d] = iso.split("-").map(Number);
  return m && d ? `${d} ${MONTHS[m - 1]}` : iso;
}
