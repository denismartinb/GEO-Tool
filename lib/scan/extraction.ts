import "server-only";

import { extractGeminiStructuredData, type BusinessProfile } from "@/lib/llm/gemini";
import { extractClaudeStructuredData } from "@/lib/llm/claude";
import { extractOpenAIStructuredData } from "@/lib/llm/openai";
import { parsePersistedBusinessProfile } from "@/lib/projects/business-profile";
import { formatExtractionError } from "@/lib/llm/extraction-errors";
import { EXTRACTION_CONCURRENCY, EXTRACTION_PASS_BUDGET_MS, EXTRACTION_VERSION } from "@/lib/scan/constants";
import { resolveGroundingRedirects } from "@/lib/scan/citation-resolution";
import { createServiceClient } from "@/lib/supabase/service";
import type { ScanPromptResultRow } from "@/lib/scan/types";
import type { ExtractionOutput, GroundedCitation } from "@/lib/extraction/schema";

/**
 * Tolerant name-match key for reconciling a model-returned competitor name
 * against the project's tracked list — mirrors normalizeEntityName in
 * app/dashboard/projects/[projectId]/page.tsx (duplicated rather than
 * shared: that's a Next.js page module, this is a server-only pipeline
 * module with a different bundling boundary).
 */
function normalizeCompetitorName(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Case/diacritic-insensitive, whitespace-collapsed normalization for substring matching against raw response text \u2014 deliberately NOT token-normalized like normalizeCompetitorName above, since this needs to find a phrase inside a larger text, not compare two names for equality. */
function normalizeForSubstringMatch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * True when `claimed` plausibly names the same entity as `realName` \u2014 reuses
 * normalizeCompetitorName's token-normalization (tolerant of accents/case/
 * legal-entity symbols like "\u00ae") and accepts either string containing the
 * other, so "Iberia" plausibly matches "Iberia L\u00edneas A\u00e9reas" in both
 * directions. This is the check that closes the gap a substring-of-raw-text
 * check alone leaves open (MENTION-VERIFY-1 follow-up, docs/adr/0021): a
 * model can claim `display_name_found: "tu marca"` \u2014 a generic phrase that
 * genuinely appears in the response \u2014 for a response that never names the
 * actual brand at all. Requiring the claim to also resemble the real entity
 * name catches that: "tu marca" does not plausibly match "GenScore".
 */
function namesPlausiblyMatch(claimed: string, realName: string): boolean {
  const claimedKey = normalizeCompetitorName(claimed);
  const realKey = normalizeCompetitorName(realName);
  if (!claimedKey || !realKey) return false;
  return claimedKey.includes(realKey) || realKey.includes(claimedKey);
}

type MentionEntity = { mentioned: boolean; display_name_found: string | null; evidence: string[]; position: number | null };

/**
 * Downgrades `mentioned: true` to an explicit non-mention unless the model's
 * own claimed `display_name_found` BOTH (a) plausibly names `realName` (the
 * entity this row is actually supposed to be about \u2014 the project's real
 * brand, or the competitor's own returned name) and (b) is actually a
 * (normalized) substring of the raw response text \u2014 MENTION-VERIFY-1,
 * docs/adr/0021. Root cause this defends against: extraction models across
 * all three providers can mark an entity "mentioned" from topical/semantic
 * similarity rather than its name genuinely appearing in the text. Two
 * distinct failure modes were observed in production for "GenScore" \u2014 a
 * brand whose name reads as a generic description of its own product
 * category \u2014 and both are needed together to close the gap:
 * 1. A response never mentioning the brand at all, with a fabricated
 *    `display_name_found`/evidence that ISN'T in the raw text (caught by
 *    check (b) alone).
 * 2. A response that generically referenced "your brand"/"tu marca" (the
 *    literal category the user asked about, not GenScore itself), where the
 *    model set `display_name_found: "tu marca"` \u2014 genuinely present in the
 *    text, so check (b) alone lets it through. Check (a) catches this: "tu
 *    marca" does not plausibly name "GenScore".
 *
 * `realNames` is a SET, not a single string (GEO-SCORE-BRAND-IDENTITY-1): a
 * brand is not one name. The project "Mozilla" is genuinely mentioned when
 * the AI recommends "Firefox", but check (a) against the tracked string alone
 * rejected it — measured on the founder's real scan, all three engines
 * recommended Firefox and only counted because they happened to also write
 * the parent company's name in passing. The claim only has to plausibly name
 * ONE of the entity's known names; check (b) is unchanged and still applies,
 * so an alias cannot manufacture a mention out of text that isn't there.
 * Competitors pass a single-element set (their own model-returned name) —
 * aliases are a brand-level concept, tracked per project.
 */
function verifyMention<T extends MentionEntity>(entity: T, realNames: readonly string[], normalizedRawText: string): T {
  if (!entity.mentioned) return entity;
  const claimed = entity.display_name_found?.trim();
  const isPlausibleName =
    Boolean(claimed) && realNames.some((name) => name.trim() && namesPlausiblyMatch(claimed as string, name));
  const isInRawText = Boolean(claimed) && normalizedRawText.includes(normalizeForSubstringMatch(claimed as string));
  if (!isPlausibleName || !isInRawText) {
    return { ...entity, mentioned: false, display_name_found: null, evidence: [], position: null };
  }

  // MENTION-VERIFY-1 follow-up 2 (docs/adr/0021 addendum, 2026-07-30): the
  // mention itself being verified does NOT mean every individual `evidence`
  // quote is real — observed in production: a genuinely mentioned brand
  // (its name really was in the text) whose displayed "evidence" was a
  // fabricated/mismatched sentence that actually described a DIFFERENT
  // entity in the same list (e.g. a competing clinic listed above it).
  // Each quote is checked independently against the raw text; only quotes
  // that are themselves real survive. An entity can end up verified as
  // mentioned with an empty evidence array — the UI already omits the
  // evidence panel entirely when it's empty, which is the honest outcome
  // (no evidence shown) rather than a wrong one (fabricated evidence shown).
  const verifiedEvidence = entity.evidence.filter((quote) => normalizedRawText.includes(normalizeForSubstringMatch(quote)));

  return { ...entity, evidence: verifiedEvidence };
}

/**
 * Applies `verifyMention` to the brand and every competitor in one pass.
 * Must run BEFORE `reconcileExtractedCompetitors` (below) \u2014 that function's
 * position re-densification already treats `mentioned`/`position` as the
 * source of truth for ranking, so a mention downgraded here is automatically
 * re-ranked correctly by the existing reconciliation pass without any
 * duplicated logic. Competitors are checked against their OWN model-returned
 * `name` (not yet reconciled to the tracked canonical spelling \u2014 that
 * happens afterward) since that's the entity this specific row claims to be
 * about; reconciliation separately handles matching that name to the
 * project's tracked list regardless of this function's verdict.
 */
export function verifyExtractedMentions(
  data: ExtractionOutput,
  rawResponseText: string,
  brand: string,
  brandAliases: readonly string[] = []
): ExtractionOutput {
  const normalizedRawText = normalizeForSubstringMatch(rawResponseText);
  // The brand's own name always counts, aliases are additive, and blanks are
  // dropped — an empty alias would make namesPlausiblyMatch trivially true
  // against anything, turning the whole verification off for that project.
  const brandNames = [brand, ...brandAliases].map((name) => name?.trim()).filter((name): name is string => Boolean(name));
  return {
    ...data,
    brand: verifyMention(data.brand, brandNames, normalizedRawText),
    competitors: data.competitors.map((competitor) => verifyMention(competitor, [competitor.name], normalizedRawText))
  };
}

/**
 * Reconciles the model's freeform `competitors[]` output against the
 * project's actual tracked list (competitors_snapshot) before persistence,
 * so `extracted_json.competitors` — and everything scored from it
 * (mentioned_competitors_count, brand_position, standing) — can never
 * contain an entity the user didn't choose to track. See
 * docs/adr/0018-tracked-competitor-set-reconciliation.md for the full
 * rationale (this was root-caused from a real production case: a tracked
 * list of 5 competitors produced a 21-entity position ranking, with
 * untracked entities structurally favored because they skip the
 * not-mentioned penalty tracked-but-unmentioned competitors receive).
 *
 * - A tracked competitor the model returned keeps its mentioned/evidence/
 *   position, but the persisted `name` is the project's own canonical
 *   spelling (not whatever variant the model echoed back), so downstream
 *   exact-name matching against project_competitors.name stays reliable.
 * - A tracked competitor the model omitted is materialized as
 *   `{mentioned: false, evidence: [], position: null}` — defends against
 *   the model spending its attention on other brands instead of reporting
 *   an explicit non-mention for a tracked one.
 * - Any model-returned entity that is NOT in the tracked list is moved into
 *   `other_brands_mentioned` (deduped against what the model already put
 *   there) — never silently dropped. This field is intentionally NOT capped
 *   at the model-facing prompt's "up to 5" limit once merged with spillover;
 *   only the request to the model is capped.
 *
 * Positions are then re-densified (1..k, no gaps) over the entities that
 * actually survive reconciliation (brand + reconciled competitors),
 * preserving their relative order from the model's original ranking.
 * Required because dropping spillover entities from that ranking otherwise
 * leaves gaps (e.g. 1, 3, 9) that corrupt computeBrandPosition's per-entity
 * average (lib/scoring/run-scoring.ts) — a tracked competitor surviving at
 * position 9 out of 6 total entities is an internally inconsistent object,
 * not just a filtered one.
 */
export function reconcileExtractedCompetitors(
  data: ExtractionOutput,
  trackedCompetitorNames: readonly string[]
): ExtractionOutput {
  const trackedKeys = trackedCompetitorNames.map(normalizeCompetitorName);
  const modelByKey = new Map(data.competitors.map((c) => [normalizeCompetitorName(c.name), c] as const));

  const reconciledCompetitors = trackedCompetitorNames.map((name, i) => {
    const match = modelByKey.get(trackedKeys[i]);
    return match ? { ...match, name } : { name, mentioned: false, display_name_found: null, evidence: [], position: null };
  });

  const trackedKeySet = new Set(trackedKeys);
  const spillover = data.competitors
    .filter((c) => !trackedKeySet.has(normalizeCompetitorName(c.name)))
    .map((c) => c.name);
  const otherBrandsMentioned = Array.from(new Set([...data.other_brands_mentioned, ...spillover]));

  const mentionedRefs: Array<{ ref: "brand" | number; originalPosition: number }> = [];
  if (data.brand.mentioned && data.brand.position !== null) {
    mentionedRefs.push({ ref: "brand", originalPosition: data.brand.position });
  }
  reconciledCompetitors.forEach((c, i) => {
    if (c.mentioned && c.position !== null) mentionedRefs.push({ ref: i, originalPosition: c.position });
  });
  mentionedRefs.sort((a, b) => a.originalPosition - b.originalPosition);

  let brandPosition: number | null = data.brand.mentioned ? data.brand.position : null;
  const competitorPositions = reconciledCompetitors.map((c) => (c.mentioned ? c.position : null));
  mentionedRefs.forEach((entry, index) => {
    const denseRank = index + 1;
    if (entry.ref === "brand") brandPosition = denseRank;
    else competitorPositions[entry.ref] = denseRank;
  });

  return {
    ...data,
    brand: { ...data.brand, position: brandPosition },
    competitors: reconciledCompetitors.map((c, i) => ({ ...c, position: competitorPositions[i] })),
    other_brands_mentioned: otherBrandsMentioned
  };
}

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
  profile?: BusinessProfile;
  /** Absolute epoch-ms budget for this pass, threaded down to the provider's retry loop. */
  deadlineAt?: number;
}): Promise<boolean> {
  const { service, projectId, runId, row, profile, deadlineAt } = input;
  const rawResponseText = row.raw_response_text;
  if (!rawResponseText) return false;

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
      promptText: row.prompt_text_snapshot,
      profile,
      deadlineAt
    };
    const extracted =
      row.provider === "claude"
        ? await extractClaudeStructuredData(extractionArgs)
        : row.provider === "openai"
          ? await extractOpenAIStructuredData(extractionArgs)
          : await extractGeminiStructuredData(extractionArgs);

    // MENTION-VERIFY-1: downgrade any "mentioned: true" the model can't back
    // up with a display_name_found that both plausibly names the brand AND
    // is actually in the raw response text — see verifyExtractedMentions
    // above. Must run BEFORE reconciliation so reconcileExtractedCompetitors'
    // position re-densification sees the verified mentioned/position values,
    // not the model's raw (possibly hallucinated) ones.
    const verifiedData = verifyExtractedMentions(
      extracted.data,
      rawResponseText,
      row.brand_snapshot,
      row.brand_aliases_snapshot ?? []
    );

    // SCAN-TRACKED-SET-1: never persist an entity in `competitors` that the
    // user didn't choose to track — see reconcileExtractedCompetitors above.
    const reconciledData = reconcileExtractedCompetitors(verifiedData, competitors);

    const mentionedCompetitorsCount = reconciledData.competitors.filter((c) => c.mentioned).length;

    const groundingChunks = row.raw_response_json?.grounding_chunks ?? [];
    const citations = await buildGroundedCitations({
      groundingChunks,
      inlineCitations: reconciledData.citations.map((c) => ({
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
        brand_mentioned: reconciledData.brand.mentioned,
        citation_found: citationsCount > 0,
        mentioned_competitors_count: mentionedCompetitorsCount,
        citations_count: citationsCount,
        sentiment: reconciledData.sentiment,
        extracted_json: { ...reconciledData, citations },
        extraction_version: EXTRACTION_VERSION,
        extraction_error: null
      })
      .eq("id", row.id)
      .eq("project_id", projectId)
      .eq("run_id", runId);

    return true;
  } catch (extractError) {
    // EXTRACTION-RELIABILITY-1: persist a categorized, sanitized reason
    // (`quota: …`, `timeout: …`, `schema: …`) instead of whatever message the
    // thrown value happened to carry. The category is what makes "the
    // account is out of credit" distinguishable from "the model ignored the
    // schema" in SQL and, in Fase B, in an alert — see
    // lib/llm/extraction-errors.ts for why that distinction was expensive to
    // lack. The real message is logged server-side, never persisted.
    console.error("[geo:scan:extraction] row extraction failed", {
      projectId,
      runId,
      rowId: row.id,
      provider: row.provider,
      message: extractError instanceof Error ? extractError.message : String(extractError)
    });

    await service
      .from("scan_prompt_results")
      .update({ extraction_error: formatExtractionError(extractError) })
      .eq("id", row.id)
      .eq("project_id", projectId)
      .eq("run_id", runId);

    return false;
  }
}

/**
 * Runs `worker` over `items` with at most `limit` in flight at once.
 *
 * Replaces the unbounded `Promise.allSettled(rows.map(...))` this module used
 * before EXTRACTION-RELIABILITY-1, which dispatched every eligible row's
 * extraction call simultaneously — the heaviest requests in the pipeline,
 * all at once, which is a reliable way to manufacture the provider 429s that
 * then failed every one of them.
 */
async function mapWithConcurrency<T, R>(items: readonly T[], limit: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;

  async function runLane(): Promise<void> {
    for (;;) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      results[index] = await worker(items[index]);
    }
  }

  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, runLane));
  return results;
}

/**
 * A row is "unprocessed" when it holds a real provider answer that nothing
 * has ever tried to extract: extraction never ran on it, and it carries no
 * error explaining why. This is the exact shape of the silent data loss this
 * phase fixes, and it is the predicate the executor asserts on before a run
 * may be marked `completed` (docs/scan-lifecycle.md, "No mute rows").
 *
 * A row whose extraction failed is NOT unprocessed — it has an
 * `extraction_error` on record, which is a truthful terminal outcome rather
 * than a silent gap.
 */
export async function countUnprocessedExtractionRows(input: {
  service: ReturnType<typeof createServiceClient>;
  projectId: string;
  runId: string;
}): Promise<number> {
  const { count } = await input.service
    .from("scan_prompt_results")
    .select("id", { count: "exact", head: true })
    .eq("project_id", input.projectId)
    .eq("run_id", input.runId)
    .eq("status", "completed")
    .is("extraction_error", null)
    .neq("extraction_version", EXTRACTION_VERSION)
    .not("raw_response_text", "is", null);

  return count ?? 0;
}

export type ExtractionPassSummary = {
  /** Rows this pass actually attempted. */
  attempted: number;
  /** Rows persisted with extracted data. */
  succeeded: number;
  /** Rows persisted with a categorized `extraction_error`. */
  failed: number;
  /** Eligible rows this pass did not reach before its budget ran out. Never dropped — the next pass picks them up. */
  remaining: number;
};

/**
 * Extracts every eligible row of a run, in bounded-concurrency waves, within
 * a wall-clock budget (EXTRACTION-RELIABILITY-1, docs/adr/0027).
 *
 * Called once per batch by the executor and again on the finalize batch, so
 * a campaign's extraction work is spread across the same invocations that
 * generate it instead of being crammed into a single pass at the end. What
 * this function no longer does is cap the row count: the previous
 * `.slice(0, MAX_EXTRACTION_RESULTS)` silently discarded every eligible row
 * past the 20th, with no error, no log and no trace — on a 30-row run that
 * was a third of the answers, and on a 300-row Pro run it was 93%.
 *
 * Budget exhaustion is not data loss: rows this pass could not reach stay
 * eligible, and the run cannot be marked `completed` while any of them
 * remain (see `countUnprocessedExtractionRows`).
 */
export async function runStructuredExtractionForRun(input: {
  service: ReturnType<typeof createServiceClient>;
  projectId: string;
  runId: string;
  /** Overrides the default pass budget. Absolute epoch ms. */
  deadlineAt?: number;
}): Promise<ExtractionPassSummary> {
  const deadlineAt = input.deadlineAt ?? Date.now() + EXTRACTION_PASS_BUDGET_MS;
  const empty: ExtractionPassSummary = { attempted: 0, succeeded: 0, failed: 0, remaining: 0 };
  const { data: rows, error } = await input.service
    .from("scan_prompt_results")
    .select(
      "id, raw_response_text, raw_response_json, prompt_text_snapshot, brand_snapshot, brand_aliases_snapshot, competitors_snapshot, provider, status, extraction_version, extraction_error"
    )
    .eq("project_id", input.projectId)
    .eq("run_id", input.runId)
    .eq("status", "completed")
    .in("provider", ["gemini", "claude", "openai"])
    .not("raw_response_text", "is", null);

  if (error || !rows?.length) return empty;

  // A row that already failed extraction is deliberately NOT re-queued here:
  // it has exhausted its bounded in-call retries (EXTRACTION_MAX_ATTEMPTS
  // with backoff), and re-attempting it every pass would let one systematic
  // failure — an exhausted provider account, say — consume the whole budget
  // and starve rows nothing has looked at yet. It carries a truthful
  // `extraction_error` instead.
  const rowsToProcess = (rows as unknown as ScanPromptResultRow[]).filter(
    (row) => row.extraction_version !== EXTRACTION_VERSION && row.raw_response_text && !row.extraction_error
  );
  if (rowsToProcess.length === 0) return empty;

  // EMERGING-BRANDS-GROUNDING-1: read-only, best-effort lookup of the
  // already-cached profile (never resolved/computed here — that would add a
  // homepage fetch + Gemini call to the extraction path, which
  // .claude/rules/gemini.md's "scans must complete or fail safely" rules
  // out). A project with no cached profile yet (undefined here) or a query
  // error both fall back silently to unfiltered other_brands_mentioned,
  // identical to behavior before this phase.
  const { data: projectRow } = await input.service
    .from("projects")
    .select("business_profile")
    .eq("id", input.projectId)
    .maybeSingle();
  const profile = parsePersistedBusinessProfile(projectRow?.business_profile) ?? undefined;

  // Each row's extraction (provider call + grounding redirect resolution + a
  // single update() scoped to row.id) is independent of every other row, so
  // they run concurrently — but at most EXTRACTION_CONCURRENCY at a time, and
  // only while the pass still has budget. extractAndPersistRow never throws:
  // it persists either the extracted data or a categorized extraction_error
  // for its own row, so a failure in one row can never prevent the others
  // from being processed.
  let attempted = 0;
  let succeeded = 0;
  let failed = 0;

  const outcomes = await mapWithConcurrency(rowsToProcess, EXTRACTION_CONCURRENCY, async (row) => {
    if (Date.now() >= deadlineAt) return null;
    attempted += 1;
    return extractAndPersistRow({
      service: input.service,
      projectId: input.projectId,
      runId: input.runId,
      row,
      profile,
      deadlineAt
    });
  });

  for (const outcome of outcomes) {
    if (outcome === true) succeeded += 1;
    else if (outcome === false) failed += 1;
  }

  const remaining = rowsToProcess.length - attempted;
  if (remaining > 0) {
    // Loud on purpose: budget exhaustion means the run is not finishable in
    // this invocation, and a silent version of exactly this is what shipped
    // the original defect.
    console.warn("[geo:scan:extraction] pass ran out of budget with rows left", {
      projectId: input.projectId,
      runId: input.runId,
      attempted,
      remaining
    });
  }

  return { attempted, succeeded, failed, remaining };
}
