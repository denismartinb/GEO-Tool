/** es-ES formatting for «Posición en Google» (log §284). */
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

/** A share as a whole percentage: 0.081 → "8%". */
export function fmtShare(fraction: number): string {
  return `${Math.round(fraction * 100)}%`;
}

/** Tier colours of «Tu posición en Google» (log §287), also used by the tables. */
export const TIER_COLORS = {
  top3: "#0f6b41",
  page1: "#3fbf86",
  page2: "#2563eb",
  beyond: "#c4cbd6"
} as const;
