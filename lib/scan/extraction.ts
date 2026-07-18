import "server-only";

import { extractGeminiStructuredData } from "@/lib/llm/gemini";
import { extractClaudeStructuredData } from "@/lib/llm/claude";
import { extractOpenAIStructuredData } from "@/lib/llm/openai";
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
 * Gemini's grounding chunk URIs are Google's redirect wrapper
 * (`vertexaisearch.cloud.google.com/grounding-api-redirect/...`), not the
 * real cited page. We resolve them to their final destination so `domain`
 * reflects the actual source (e.g. `www.movistar.es`) — see
 * docs/adr/0006-grounding-redirect-resolution.md. If resolution fails or
 * times out, `domain` is set to `null` and `confidence` is downgraded to
 * "low" rather than showing the Google redirect host.
 *
 * `groundingUrlsAreFinal` short-circuits that resolution for providers whose
 * grounding URLs are already the real destination page (OpenAI's Responses
 * API `url_citation` annotations) — resolving them would add a needless live
 * fetch per citation to an arbitrary third-party host, with nothing to gain.
 */
async function buildGroundedCitations(input: {
  groundingChunks: Array<{ uri?: string; title?: string }> | undefined;
  inlineCitations: Array<{ url: string | null; domain: string | null; label: string | null }>;
  groundingUrlsAreFinal?: boolean;
}): Promise<GroundedCitation[]> {
  const citations: GroundedCitation[] = [];

  const groundingChunks = (input.groundingChunks ?? []).filter(
    (chunk): chunk is { uri: string; title?: string } => Boolean(chunk.uri)
  );

  if (input.groundingUrlsAreFinal) {
    for (const chunk of groundingChunks) {
      const domain = extractDomain(chunk.uri);
      citations.push({
        url: chunk.uri,
        domain,
        title: chunk.title ?? null,
        source: "grounding",
        // A URL we cannot even parse a host from is malformed — downgrade
        // rather than assert high confidence in a domain of `null`.
        confidence: domain ? "high" : "low"
      });
    }
  } else {
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

/**
 * Runs structured extraction for a single eligible row and persists the
 * result (or a sanitized extraction_error) via `update()`. Scoped to
 * `row.id` (plus project/run), so concurrent invocations across different
 * rows never collide.
 */
async function extractAndPersistRow(input: {
  service: ReturnType<typeof createServiceClient>;
  projectId: string;
  runId: string;
  row: ScanPromptResultRow;
}): Promise<void> {
  const { service, projectId, runId, row } = input;
  const rawResponseText = row.raw_response_text;
  if (!rawResponseText) return;

  try {
    const competitors = Array.isArray(row.competitors_snapshot)
      ? row.competitors_snapshot
          .map((item) => (item?.name ? String(item.name) : ""))
          .filter((name) => name.length > 0)
      : [];

    const extractionArgs = {
      brand: row.brand_snapshot,
      competitors,
      rawResponseText,
      promptText: row.prompt_text_snapshot
    };
    const extracted =
      row.provider === "claude"
        ? await extractClaudeStructuredData(extractionArgs)
        : row.provider === "openai"
          ? await extractOpenAIStructuredData(extractionArgs)
          : await extractGeminiStructuredData(extractionArgs);

    const mentionedCompetitorsCount = extracted.data.competitors.filter((c) => c.mentioned).length;

    const groundingChunks = row.raw_response_json?.grounding_chunks ?? [];
    const citations = await buildGroundedCitations({
      groundingChunks,
      inlineCitations: extracted.data.citations.map((c) => ({
        url: c.url,
        domain: c.domain,
        label: c.label
      })),
      // OpenAI's web_search citations are already final destination URLs
      // (unlike Gemini's Google redirect wrappers) — skip live resolution.
      groundingUrlsAreFinal: row.provider === "openai"
    });

    // Anti-fake invariant: citations_count / citation_found only reflect
    // real grounding sources. Inline-only citations never flip
    // citation_found to true, and a real zero-grounding result is still
    // marked with EXTRACTION_VERSION ("grounded-v1"), distinguishing it
    // from an unprocessed row (extraction_version !== EXTRACTION_VERSION).
    const groundingCitations = citations.filter((c) => c.source === "grounding");
    const citationsCount = groundingCitations.length;

    await service
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
      .eq("project_id", projectId)
      .eq("run_id", runId);
  } catch (extractError) {
    await service
      .from("scan_prompt_results")
      .update({
        extraction_error: extractError instanceof Error ? extractError.message : "Extraction failed."
      })
      .eq("id", row.id)
      .eq("project_id", projectId)
      .eq("run_id", runId);
  }
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
    .in("provider", ["gemini", "claude", "openai"])
    .not("raw_response_text", "is", null);

  if (error || !rows?.length) return;

  const eligibleRows = (rows as unknown as ScanPromptResultRow[]).filter(
    (row) => row.extraction_version !== EXTRACTION_VERSION && row.raw_response_text
  );
  const rowsToProcess = eligibleRows.slice(0, MAX_EXTRACTION_RESULTS);

  // Each row's extraction (Gemini structured-extraction call + grounding
  // redirect resolution + a single update() scoped to row.id) is independent
  // of every other row, so run them concurrently (same Promise.allSettled
  // pattern as the per-prompt Gemini calls in executor.ts, SCAN-ROBUST-2
  // phase 1). extractAndPersistRow never throws and never returns a value —
  // it persists either the extracted data or a sanitized extraction_error
  // for its own row — so a failure in one row can never prevent the others
  // from being processed and persisted. allSettled (rather than all) is kept
  // as defense-in-depth in case that invariant is ever broken.
  await Promise.allSettled(
    rowsToProcess.map((row) =>
      extractAndPersistRow({
        service: input.service,
        projectId: input.projectId,
        runId: input.runId,
        row
      })
    )
  );
}
