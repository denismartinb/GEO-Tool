/**
 * Shared colour thresholds for the Auditoría SEO screen: the area bars, the
 * page rows and the score band all read a number the same way (`< 40` red,
 * `< 70` amber). The tiles, gauge and ring that lived here went away with
 * SEARCH-SEO-1 Fase 1b: the coverage tiles moved to Páginas citadas
 * (`citations/_components/coverage-tiles.tsx`) and the page rows draw a bar.
 */

export function scoreColor(score: number | null): string {
  if (score === null) return "var(--ink-4)";
  return score < 40 ? "var(--neg-ink)" : score < 70 ? "var(--warn)" : "var(--pos)";
}
