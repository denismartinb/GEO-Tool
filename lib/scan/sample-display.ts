/**
 * SAMPLING-SURFACE-1 — how repeated samples are named on screen.
 *
 * Pure and client-safe (no `server-only`): the Prompts table and its evidence
 * drawer are client components, and both have to describe the same rows the
 * same way.
 *
 * Background: since SAMPLING-1 (ADR 0030) a run can ask the same prompt of the
 * same engine several times, so `scan_prompt_results` holds R rows per
 * (prompt, engine) instead of one. The drawer's "Por motor" block renders one
 * row per result, which meant a 3-sample run showed "Gemini / Gemini / Gemini
 * / Claude / Claude / Claude" with nothing saying why — three identical-looking
 * rows that are in fact three separate answers to the same question, and whose
 * disagreement is the entire point of sampling.
 *
 * Why this is a module and not two inline helpers: the count and the label
 * have to agree. If the drawer derived "3 samples" one way and the list row
 * derived it another, the product would contradict itself about how many times
 * it asked.
 */

/** The subset of a result row this module needs. */
export type SampledRow = {
  sample_index?: number | null;
  provider?: string | null;
};

/**
 * How many distinct samples these rows represent.
 *
 * Counts DISTINCT `sample_index` values rather than dividing by the engine
 * count: a run where one engine failed on one repetition has an uneven number
 * of rows per engine, and dividing would report a fractional or wrong count
 * precisely when something went wrong. Rows written before migration 0028 have
 * no `sample_index` at all and are sample 0 — exactly what the column's
 * default says.
 */
export function sampleCountOf(rows: readonly SampledRow[]): number {
  if (!rows.length) return 0;
  const indices = new Set(rows.map((row) => Math.max(0, Math.floor(Number(row.sample_index ?? 0)))));
  return indices.size;
}

/**
 * Human label for one sample, or `null` when there is nothing to disambiguate.
 *
 * Returning `null` for a single-sample run is the point: the overwhelming
 * majority of runs (every project at or above 17 prompts) never repeat, and
 * labelling those "muestra 1 de 1" would add noise to every row of every
 * project to serve the minority that repeats.
 *
 * One-based on purpose. `sample_index` is zero-based in the database because
 * it is an index; "muestra 0 de 3" is not something to show a human.
 */
export function sampleLabel(
  sampleIndex: number | null | undefined,
  sampleCount: number
): string | null {
  if (!Number.isFinite(sampleCount) || sampleCount <= 1) return null;
  const index = Math.max(0, Math.floor(Number(sampleIndex ?? 0)));
  return `muestra ${index + 1} de ${sampleCount}`;
}

/**
 * Citation count for a prompt, with its denominator when one is needed.
 *
 * The bare sum is not comparable across runs: the same prompt with the same
 * citation behaviour reports 3x more citations under 3 samples than under 1,
 * so "21 citas" on one scan and "7 citas" on the next can describe identical
 * reality. Naming the number of responses the sum is over is the smallest
 * honest fix — it does not change the figure the user was already reading, it
 * stops that figure from being silently rescaled.
 *
 * Suppressed when there is only one sample, for the same reason `sampleLabel`
 * returns null: nothing to disambiguate, and every existing screen keeps
 * reading exactly as it did.
 */
export function citationsLabel(citations: number, responses: number, sampleCount: number): string {
  const noun = citations === 1 ? "cita" : "citas";
  if (!Number.isFinite(sampleCount) || sampleCount <= 1) return `${citations} ${noun}`;
  return `${citations} ${noun} en ${responses} respuestas`;
}
