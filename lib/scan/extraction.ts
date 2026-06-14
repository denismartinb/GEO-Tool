import "server-only";

import { extractGeminiStructuredData } from "@/lib/llm/gemini";
import { EXTRACTION_VERSION, MAX_EXTRACTION_RESULTS } from "@/lib/scan/constants";
import { resolveGroundingRedirects } from "@/lib/scan/citation-resolution";
import { createServiceClient } from "@/lib/supabase/service";
import type { ScanPromptResultRow } from "@/lib/scan/types";
import type { GroundedCitation } from "@/lib/extraction/schema";

/**
 * Best-effort domain extraction from a URL. Never throws — returns null on
 * malformed URLs.
 */
function extractDomain(uri: string): string | null {
  try {
    const hostname = new URL(uri).hostname.toLowerCase();
    return hostname.startsWith("www.") ? hostname.slice("www.".length) : hostname;
  } catch {
    return null;
  }
}

/**
 * Builds the final persisted citations list for a prompt result by merging:
 * - real Google Search grounding sources (source: "grounding") — these are
 *   citations the model actually consulted, per
 *   docs/adr/0004-gemini-search-grounding.md.
 * - inline URLs mentioned in the model's plain-text answer and surfaced by
 *   the LLM-structured extraction step (source: "inline") — heuristic, not
 *   verified by grounding.
 *
 * Only "grounding" citations count toward citations_count / citation_found.
 *
 * Grounding chunk URIs are Google's redirect wrapper
 * (`vertexaisearch.cloud.google.com/grounding-api-redirect/...`), not the
 * real cited page. We resolve them to their final destination so `domain`
 * reflects the actual source (e.g. `www.movistar.es`) — see
 * docs/adr/0006-grounding-redirect-resolution.md. If resolution fails or
 * times out, `domain` is set to `null` and `confidence` is downgraded to
 * "low" rather than showing the Google redirect host.
 */
async function buildGroundedCitations(input: {
  groundingChunks: Array<{ uri?: string; title?: string }> | undefined;
  inlineCitations: Array<{ url: string | null; domain: string | null; label: string | null }>;
}): Promise<GroundedCitation[]> {
  const citations: GroundedCitation[] = [];

  const groundingChunks = (input.groundingChunks ?? []).filter(
    (chunk): chunk is { uri: string; title?: string } => Boolean(chunk.uri)
  );

  const resolvedByUri = await resolveGroundingRedirects(groundingChunks.map((chunk) => chunk.uri));

  for (const chunk of groundingChunks) {
    const resolution = resolvedByUri.get(chunk.uri);
    const resolvedUrl = resolution?.resolvedUrl ?? null;

    if (resolvedUrl) {
      citations.push({
        url: chunk.uri,
        domain: extractDomain(resolvedUrl),
        title: chunk.title ?? null,
        source: "grounding",
        confidence: "high"
      });
    } else {
      // Redirect resolution failed or timed out: never surface the Google
      // redirect host as a domain. Keep the original URL for traceability,
      // drop the domain, and downgrade confidence.
      citations.push({
        url: chunk.uri,
        domain: null,
        title: chunk.title ?? null,
        source: "grounding",
        confidence: "low"
      });
    }
  }

  for (const citation of input.inlineCitations) {
    if (!citation.url && !citation.domain) continue;
    citations.push({
      url: citation.url,
      domain: citation.domain ?? (citation.url ? extractDomain(citation.url) : null),
      title: citation.label,
      source: "inline",
      confidence: "low"
    });
  }

  return citations;
}

export async function runStructuredExtractionForRun(input: {
  service: ReturnType<typeof createServiceClient>;
  projectId: string;
  runId: string;
}) {
  const { data: rows, error } = await input.service
    .from("scan_prompt_results")
    .select(
      "id, raw_response_text, raw_response_json, prompt_text_snapshot, brand_snapshot, competitors_snapshot, provider, status, extraction_version"
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

      const groundingChunks = row.raw_response_json?.grounding_chunks ?? [];
      const citations = await buildGroundedCitations({
        groundingChunks,
        inlineCitations: extracted.data.citations.map((c) => ({
          url: c.url,
          domain: c.domain,
          label: c.label
        }))
      });

      // Anti-fake invariant: citations_count / citation_found only reflect
      // real grounding sources. Inline-only citations never flip
      // citation_found to true, and a real zero-grounding result is still
      // marked with EXTRACTION_VERSION ("grounded-v1"), distinguishing it
      // from an unprocessed row (extraction_version !== EXTRACTION_VERSION).
      const groundingCitations = citations.filter((c) => c.source === "grounding");
      const citationsCount = groundingCitations.length;

      await input.service
        .from("scan_prompt_results")
        .update({
          brand_mentioned: extracted.data.brand.mentioned,
          citation_found: citationsCount > 0,
          mentioned_competitors_count: mentionedCompetitorsCount,
          citations_count: citationsCount,
          sentiment: extracted.data.sentiment,
          extracted_json: { ...extracted.data, citations },
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
