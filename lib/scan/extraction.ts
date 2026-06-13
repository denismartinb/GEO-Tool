import "server-only";

import { extractGeminiStructuredData } from "@/lib/llm/gemini";
import { EXTRACTION_VERSION, MAX_EXTRACTION_RESULTS } from "@/lib/scan/constants";
import { createServiceClient } from "@/lib/supabase/service";
import type { ScanPromptResultRow } from "@/lib/scan/types";

export async function runStructuredExtractionForRun(input: {
  service: ReturnType<typeof createServiceClient>;
  projectId: string;
  runId: string;
}) {
  const { data: rows, error } = await input.service
    .from("scan_prompt_results")
    .select(
      "id, raw_response_text, prompt_text_snapshot, brand_snapshot, competitors_snapshot, provider, status, extraction_version"
    )
    .eq("project_id", input.projectId)
    .eq("run_id", input.runId)
    .eq("status", "completed")
    .eq("provider", "gemini")
    .not("raw_response_text", "is", null);

  if (error || !rows?.length) return;

  const eligibleRows = (rows as unknown as ScanPromptResultRow[]).filter(
    (row) => row.extraction_version !== EXTRACTION_VERSION && row.raw_response_text
  );
  const rowsToProcess = eligibleRows.slice(0, MAX_EXTRACTION_RESULTS);

  for (const row of rowsToProcess) {
    const rawResponseText = row.raw_response_text;
    if (!rawResponseText) continue;

    try {
      const competitors = Array.isArray(row.competitors_snapshot)
        ? row.competitors_snapshot
            .map((item) => (item?.name ? String(item.name) : ""))
            .filter((name) => name.length > 0)
        : [];

      const extracted = await extractGeminiStructuredData({
        brand: row.brand_snapshot,
        competitors,
        rawResponseText,
        promptText: row.prompt_text_snapshot
      });

      const mentionedCompetitorsCount = extracted.data.competitors.filter((c) => c.mentioned).length;
      const citationsCount = extracted.data.citations.length;

      await input.service
        .from("scan_prompt_results")
        .update({
          brand_mentioned: extracted.data.brand.mentioned,
          citation_found: citationsCount > 0,
          mentioned_competitors_count: mentionedCompetitorsCount,
          citations_count: citationsCount,
          sentiment: extracted.data.sentiment,
          extracted_json: extracted.data,
          extraction_version: EXTRACTION_VERSION,
          extraction_error: null
        })
        .eq("id", row.id)
        .eq("project_id", input.projectId)
        .eq("run_id", input.runId);
    } catch (extractError) {
      await input.service
        .from("scan_prompt_results")
        .update({
          extraction_error: extractError instanceof Error ? extractError.message : "Extraction failed."
        })
        .eq("id", row.id)
        .eq("project_id", input.projectId)
        .eq("run_id", input.runId);
    }
  }
}
