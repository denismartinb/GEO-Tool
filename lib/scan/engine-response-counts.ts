import "server-only";

/**
 * Answers a run already holds, per engine (CONSOLE-INSTRUMENTO-1 F3b, log §355).
 *
 * The first-scan mission shows «N de M» per engine. Every figure is a head-only
 * count of `scan_prompt_results` rows with an answer: nothing is derived from
 * a clock or from `prompts x engines`. A provider that cannot be counted is
 * absent from the result, never filled in.
 */
export async function readEngineResponseCounts(
  // Loosely typed like `withAnalysisProgress`: the generated types instantiate too deeply here.
  supabase: { from: (table: string) => any },
  projectId: string,
  runId: string,
  providers: readonly string[]
): Promise<Record<string, number>> {
  const entries = await Promise.all(
    providers.map(async (provider) => {
      try {
        const { count } = await supabase
          .from("scan_prompt_results")
          .select("id", { count: "exact", head: true })
          .eq("project_id", projectId)
          .eq("run_id", runId)
          .eq("provider", provider)
          .eq("status", "completed")
          .not("raw_response_text", "is", null);
        return typeof count === "number" ? ([provider, count] as const) : null;
      } catch {
        return null;
      }
    })
  );
  return Object.fromEntries(entries.filter((e): e is readonly [string, number] => e !== null));
}
