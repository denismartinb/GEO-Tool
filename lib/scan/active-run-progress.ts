import "server-only";

/**
 * Adds the analysis-stage counters to an in-flight run
 * (EXTRACTION-RELIABILITY-1 Fase C, docs/adr/0029).
 *
 * A scan has two stages that take comparable time: asking the engines
 * (generation) and turning their answers into data (extraction). Until this
 * phase the progress bar only measured the first one — `successful_prompts +
 * failed_prompts` over `total_prompts` — which was near enough to honest while
 * finalize was instant. Fase A moved extraction inside that window, so the bar
 * now sits at "100% · 6 de 6 prompts" for a real stretch of the scan while the
 * whole project section is covered by the overlay. Measured on a real run:
 * 103s total, a meaningful part of it pinned at 100%.
 *
 * The denominator is counted from the rows that exist rather than derived from
 * `prompts × engines × samples`. That arithmetic changed under this code once
 * already (SAMPLING-1, ADR 0030, made `total_prompts` count jobs rather than
 * distinct prompts), and counting what is actually there cannot drift when it
 * changes again. It is only meaningful once generation is done — which is
 * exactly when the analysis stage is displayed.
 *
 * Deliberately one extra pair of `head`-only counts, both served by the
 * existing `(project_id, run_id)` index: this runs on a page render and on
 * every 3s poll, so it must stay cheap.
 */
export type AnalysisProgress = {
  /** Answers this run holds. Only meaningful once generation is done. */
  responses_total?: number | null;
  /** Of those, the ones that reached a terminal extraction outcome — extracted, or failed with a categorized error. */
  responses_processed?: number | null;
};

export async function withAnalysisProgress<T extends { id: string }>(
  // Loosely typed on purpose: the Supabase generated types make this generic
  // chain instantiate too deeply for tsc, and this helper only ever touches
  // one table with head-only counts.
  supabase: { from: (table: string) => any },
  projectId: string,
  run: T
): Promise<T & AnalysisProgress> {
  try {
    const base = () =>
      supabase
        .from("scan_prompt_results")
        .select("id", { count: "exact", head: true })
        .eq("project_id", projectId)
        .eq("run_id", run.id)
        .eq("status", "completed");

    const [{ count: total }, { count: processed }] = await Promise.all([
      base().not("raw_response_text", "is", null),
      // "Processed" means the row reached a terminal outcome, not that it
      // succeeded: a row with a categorized `extraction_error` is finished
      // work and must count, or the bar would stall short of the end on a run
      // that is genuinely done (Fase A's "no mute rows" invariant means every
      // row ends up in one of these two states).
      base().or("extracted_json.not.is.null,extraction_error.not.is.null")
    ]);

    return { ...run, responses_total: total ?? 0, responses_processed: processed ?? 0 };
  } catch {
    // Best-effort: the progress screen degrades to the generation-only bar
    // rather than failing a page render over a counter.
    return run;
  }
}
