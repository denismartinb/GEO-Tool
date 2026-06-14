# ADR 0004 — Gemini Search Grounding for Citations

**Date:** 2026-06-13
**Status:** Accepted
**Deciders:** Founder + Director

---

## Context

GEO Studio scans were returning `citations_count: 0` and `citation_found:
false` for essentially every prompt result. Investigation found two
compounding causes:

1. The visibility call to Gemini (`generateGeminiVisibilityAnswer` in
   `lib/llm/gemini.ts`) never enabled Google Search grounding. Gemini answered
   from its own knowledge with no `groundingMetadata`, so there were never any
   real sources to report.
2. The placeholder "citation extraction" in `lib/scan/executor.ts` was a naive
   regex over the plain-text answer (`/(https?:\/\/[^\s)]+|www\.[^\s)]+)/gi`).
   Gemini rarely writes literal URLs in prose, so this almost never matched —
   and even when it did, a URL appearing in generated text is not evidence the
   model actually consulted that source.

The result: a core GEO metric (citation visibility) was always zero,
regardless of the brand's real presence in AI answers.

---

## Decision

1. **Enable Google Search grounding** on the Gemini visibility call only
   (`generateGeminiVisibilityAnswer`), using the Gemini 2.0 / v1beta tool
   syntax:

   ```json
   { "tools": [{ "google_search": {} }] }
   ```

   This is **not** the deprecated Gemini 1.5 `googleSearchRetrieval` syntax.
   The model id, endpoint, and the separate structured-extraction call
   (`extractGeminiStructuredData`) are unchanged.

2. **Parse `candidates[0].groundingMetadata.groundingChunks[].web.{uri,title}`**
   from the response and persist it as `raw_response_json.grounding_chunks` on
   `scan_prompt_results`, so the extraction step can use it.

3. **Citation shape.** The final persisted citation list
   (`extracted_json.citations`, `groundedCitationSchema` in
   `lib/extraction/schema.ts`) is:

   ```ts
   { url: string | null, domain: string | null, title: string | null,
     source: "grounding" | "inline", confidence: "low" | "medium" | "high" }
   ```

   - `source: "grounding"` — a real Google Search source from
     `groundingMetadata.groundingChunks`. Confidence `"high"`.
   - `source: "inline"` — a URL mentioned in the model's plain-text answer and
     surfaced by the LLM structured-extraction step. Heuristic, not verified
     by grounding. Confidence `"low"`.

   **Only `source: "grounding"` citations count toward `citations_count` and
   `citation_found`.** Inline mentions are kept for evidence/recommendations
   but never flip `citation_found` to `true` on their own — they are not
   proof the model consulted that source.

4. **Methodology version bump.** `EXTRACTION_VERSION` (in
   `lib/scan/constants.ts`) is bumped from `"gemini-extraction-v1"` to
   `"grounded-v1"`. Grounded runs are **not directly comparable** to prior
   non-grounded runs in time-series metrics: enabling grounding changes the
   response text itself (the model now writes with awareness of live search
   results), which can shift `brand_mentioned`, `sentiment`,
   `mentioned_competitors_count`, and share-of-voice — independent of any
   real change in the brand's visibility. Dashboards/trends that compare
   across `extraction_version` values should treat `"grounded-v1"` as a new
   baseline, not a continuation of `"gemini-extraction-v1"`.

   A real zero-grounding result (model answered but cited nothing) is
   persisted with `extraction_version: "grounded-v1"` and `citations_count:
   0` — this is distinguishable from an unprocessed row, which still carries
   the pre-grounding `extraction_version` (e.g. `"phase4-basic-v1"`) until
   `runStructuredExtractionForRun` processes it.

5. **Model id drift fix.** While implementing this, the default model
   constant in `lib/llm/gemini.ts` was found to still be the deprecated
   floating alias `gemini-2.0-flash`, drifted from the pinned value
   `gemini-2.0-flash-001` decided in
   `docs/adr/0002-gemini-model-pinning.md`. Corrected to match the ADR. This
   is a bugfix to restore the already-decided pin, not a new model decision.

---

## Latency Risk and Mitigation

Google Search grounding adds an estimated ~2–5s of latency per Gemini call
(the model issues search queries before composing its answer). Under
`docs/adr/0003-sync-scan-execution-and-maxduration.md`, scans with
`ENABLE_SYNC_SCAN_EXECUTION=true` run synchronously inside a single Vercel
function call with `maxDuration = 60`. For a project with the maximum 10
prompts, added grounding latency could push total scan time close to or over
the 60s budget.

**Mitigation (already exists, no new code required):**
`ENABLE_SYNC_SCAN_EXECUTION` (`lib/scan/constants.ts`) is a feature flag. If
grounding pushes sync scans over the timeout budget in practice, this flag can
be turned off so scans run **async via the existing cron/jobs pipeline** — the
same path automatic/recurring scans already use. This is the rollback path for
latency regressions and requires no further code changes, only a config flip.

---

## Consequences

- Citations now reflect real Google Search grounding sources instead of an
  almost-always-empty regex match. `citations_count` /
  `citation_found` / `citation_score` become meaningful metrics for the first
  time.
- Time-series comparisons across the `"gemini-extraction-v1"` →
  `"grounded-v1"` boundary should be treated as a methodology change, not
  noise — see point 4 above.
- Slightly higher per-prompt latency; monitor sync scan completion times and
  use the `ENABLE_SYNC_SCAN_EXECUTION` flag as the rollback path if scans
  start timing out under ADR 0003.
- The Gemini model id pin (ADR 0002) is restored to `gemini-2.0-flash-001`.
