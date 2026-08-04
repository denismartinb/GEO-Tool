# ADR 0006 — Resolving Gemini Grounding Redirect URIs to Real Domains

**Date:** 2026-06-14
**Status:** Accepted
**Deciders:** Founder + Director

---

## Context

ADR 0004 enabled Google Search grounding and started persisting
`groundingMetadata.groundingChunks[].web.{uri,title}` as
`raw_response_json.grounding_chunks`, then surfacing them as
`extracted_json.citations` with `source: "grounding"`.

In practice, `chunk.uri` is **not** the real cited page — it is a Google
redirect wrapper:

```
https://vertexaisearch.cloud.google.com/grounding-api-redirect/<opaque-id>
```

`buildGroundedCitations()` in `lib/scan/extraction.ts` was running
`extractDomain()` directly on this wrapper URI, so the "Páginas fuente más
citadas" dashboard card showed `vertexaisearch.cloud.google.com` for every
grounding citation instead of the real destination (e.g.
`www.movistar.es`). This made the card useless — every row looked the same
and gave the founder no information about which real sites Gemini actually
cited.

`chunk.title` (e.g. `"Movistar - Fibra y Móvil"`) was available from Gemini
but unused for this purpose.

---

## Decision

### 1. Resolve the redirect at extraction time

`lib/scan/citation-resolution.ts` adds `resolveGroundingRedirect(uri)` and
`resolveGroundingRedirects(uris[])`:

- For each grounding chunk URI, attempt `fetch(uri, { method: "HEAD",
  redirect: "follow", signal: AbortSignal.timeout(2500) })`.
- If the resolved `response.url` is still on
  `vertexaisearch.cloud.google.com` (HEAD didn't actually redirect anywhere
  useful), or HEAD throws (some redirect targets reject HEAD with 403/405),
  fall back to a GET request with the same timeout.
- On success, `response.url` is the real destination URL
  (`https://www.movistar.es/fibra-y-movil/`), and
  `extractDomain(resolvedUrl)` yields the real domain
  (`www.movistar.es`).
- `resolveGroundingRedirects` deduplicates identical URIs, runs all
  resolutions in parallel via `Promise.allSettled`, and returns a `Map<uri,
  { resolvedUrl: string | null }>`. A failed/rejected/timed-out promise for
  one URI never affects the others.

`buildGroundedCitations()` in `lib/scan/extraction.ts` calls
`resolveGroundingRedirects()` once per prompt result with all of that
result's grounding chunk URIs, then looks up each chunk's resolution by URI.

### 2. Fallback when resolution fails

If `resolvedUrl` is `null` (timeout, network error, or the redirect never
left Google's host), the citation is persisted as:

```ts
{
  url: chunk.uri,        // original Google redirect URI, kept for traceability/debugging
  domain: null,          // never the Google redirect host
  title: chunk.title ?? null,
  source: "grounding",
  confidence: "low"      // downgraded from "high"
}
```

The citation **still counts** toward `citations_count` /
`citation_found` — it is still a real grounding source Gemini consulted, we
simply could not resolve its display domain. Only the `domain` and
`confidence` fields are affected.

### 3. Frontend display fallback

`app/dashboard/projects/[projectId]/page.tsx` ("Páginas fuente más citadas"
card):

- Citations are grouped/counted by `domain` when `domain` is non-null.
- When `domain` is `null` and `source === "grounding"` (unresolved
  redirect), the citation is grouped/displayed by `title` instead (e.g.
  "Movistar - Fibra y Móvil"). If `title` is also missing, the generic label
  "Fuente sin resolver" is used.
- Unresolved entries are keyed separately (`unresolved:<title>`) so they are
  never merged into the same count bucket as a resolved domain that happens
  to share a display string.
- The raw `vertexaisearch.cloud.google.com` redirect URL is **never**
  rendered in the UI. `cit.url` is retained in `extracted_json` purely for
  debugging/traceability.
- Non-grounding (`source: "inline"`) citations without a `domain` keep their
  prior behavior — they fall back to displaying the raw `url`, since these
  are heuristic inline mentions, not Google redirect wrappers.

---

## Timeout, Parallelism, and Latency Budget

Constraint: scans run synchronously under
`docs/adr/0003-sync-scan-execution-and-maxduration.md`
(`maxDuration = 60`). Redirect resolution must not meaningfully threaten that
budget.

**Design:**

- Each individual fetch (HEAD, and GET fallback if needed) is bounded by
  `AbortSignal.timeout(2500)` (`REDIRECT_RESOLUTION_TIMEOUT_MS` in
  `lib/scan/citation-resolution.ts`). Worst case per chunk: HEAD times out
  (2.5s) **then** GET times out (2.5s) = 5s.
- All chunks for a single prompt result are resolved in parallel via
  `Promise.allSettled` — total wall-clock time for a prompt's resolution
  step is bounded by the **slowest single chunk**, not the sum.
- `EXTRACTION_BATCH_SIZE` (`lib/scan/constants.ts`; named `MAX_EXTRACTION_RESULTS`
  and valued at 10 when this ADR was written) caps how many prompt results are
  extracted per BATCH, not per run — see docs/adr/0027-chained-structured-
  extraction.md (SCAN-CHAIN-2): a run with more eligible rows than this now
  runs additional batches instead of silently leaving the rest unextracted.
  Grounding chunk counts per prompt are typically small in practice (Gemini
  Search grounding for a single conversational answer commonly returns
  somewhere in the range of 1–10 chunks).

**Worst-case added latency per prompt result:** ~5s (one chunk hits the
absolute worst case: HEAD timeout + GET timeout, both 2.5s) regardless of how
many chunks that prompt has, because all chunks resolve in parallel. In the
typical case (HEAD succeeds and redirects immediately), added latency per
prompt is well under 1s.

**Worst-case added latency for a full run:** extraction processes up to
`MAX_EXTRACTION_RESULTS = 10` prompt results, currently **sequentially** (a
`for` loop in `runStructuredExtractionForRun`). If every prompt result hit
the absolute worst case (~5s) simultaneously, that's up to **+50s** added to
the run — which would blow the 60s budget on its own.

**Why this is acceptable in practice:**

- The absolute worst case (HEAD *and* GET both timing out at 2.5s, for
  *every* chunk in *every* prompt result) requires a sustained, total
  failure to reach `vertexaisearch.cloud.google.com` — at that point the
  network path to Google is broken for the whole request, which is an
  unusual environment failure, not a normal "slow site" scenario. A normal
  slow/unresponsive destination site fails fast at the Google redirect hop
  itself (Google's redirect responds quickly; it's the *final* destination
  that may be slow — and HEAD/GET to that destination either redirects
  immediately or the connection to Google's own infra times out quickly).
- Typical case: HEAD against `vertexaisearch.cloud.google.com` resolves in
  well under 500ms per chunk, parallel across chunks → low hundreds of ms
  added per prompt result.

**Flagged risk:** if real-world data shows grounding chunk counts or
redirect-target latency are higher than assumed, the sequential per-prompt
extraction loop (not the per-chunk parallelism) is the dominant risk to the
60s budget. Mitigations available without further redesign, in order of
preference if this becomes a problem:

1. Reduce `REDIRECT_RESOLUTION_TIMEOUT_MS` (e.g. to 1500ms).
2. Run `runStructuredExtractionForRun`'s per-row extraction in parallel
   (bounded concurrency) instead of the current sequential `for` loop —
   this is a larger change and out of scope for this fix.
3. Use the existing `ENABLE_SYNC_SCAN_EXECUTION` flag (ADR 0003 rollback
   path) to move extraction off the synchronous request path entirely.

This fix ships with the parallel-per-chunk + 2.5s-timeout approach as the
agreed mitigation; the sequential-row risk above is noted for `reliability`
to monitor via real scan completion times, not blocking this PR.

---

## Consequences

- "Páginas fuente más citadas" now shows real destination domains (e.g.
  `www.movistar.es`) instead of `vertexaisearch.cloud.google.com` for
  resolved citations.
- Unresolved citations degrade gracefully: `domain: null`, `confidence:
  "low"`, displayed by `title` (or "Fuente sin resolver"), never as a raw
  Google redirect URL.
- `citations_count` / `citation_found` semantics are unchanged — both
  resolved and unresolved grounding citations still count as real grounding
  sources (ADR 0004 point 3 still holds).
- No schema migration: `groundedCitationSchema` (`lib/extraction/schema.ts`)
  already had `domain`, `title`, `source`, `confidence` as nullable/typed
  fields.
- Adds at most one extra network round trip (HEAD, occasionally HEAD+GET)
  per unique grounding chunk URI, parallelized per prompt result and
  individually timeout-bounded at 2.5s. See latency analysis above for the
  sequential-row risk to monitor.
