/**
 * Pure helpers for the «Instrumento» Auditoría técnica block cards
 * (CONSOLE-INSTRUMENTO-1 F6a, log §363). Every number comes from
 * `buildAuditBlock`; nothing here estimates a score.
 */

export type ArcGeometry = {
  size: number;
  radius: number;
  center: number;
  /** Full circumference. */
  circumference: number;
  /** Length of the 270 degree track. */
  span: number;
  /** Length that paints the current score. */
  now: number;
  /** Length that paints the ghost up to the projected score. */
  ghost: number;
};

/** 270 degree arc: the score in blue and a ghost segment up to what fixing the scored issues reaches. */
export function arcGeometry(score: number, projected: number, size = 132): ArcGeometry {
  const radius = size / 2 - 8;
  const center = size / 2;
  const circumference = 2 * Math.PI * radius;
  const span = 0.75 * circumference;
  const clamp = (n: number) => Math.max(0, Math.min(100, n));
  const s = clamp(score);
  const p = Math.max(s, clamp(projected));
  return {
    size,
    radius,
    center,
    circumference,
    span,
    now: (span * s) / 100,
    ghost: (span * (p - s)) / 100,
  };
}

/** «2 críticos · 5 problemas» pieces; `null` critical means none to highlight. */
export function blockMeta(critical: number, total: number): { critical: string | null; total: string } {
  return {
    critical: critical > 0 ? `${critical} ${critical === 1 ? "crítico" : "críticos"}` : null,
    total: total === 0 ? "Sin problemas" : `${total} ${total === 1 ? "problema" : "problemas"}`,
  };
}

/** The green line under a block card: «+22 pt si arreglas 4 problemas». */
export function potentialLine(
  score: number | null,
  projected: number | null,
  scoredIssueCount: number,
): { gain: number; text: string } | null {
  if (score === null || projected === null || projected <= score) return null;
  const gain = projected - score;
  return {
    gain,
    text: `si arreglas ${scoredIssueCount === 1 ? "el problema que puntúa" : `los ${scoredIssueCount} problemas que puntúan`}`,
  };
}
