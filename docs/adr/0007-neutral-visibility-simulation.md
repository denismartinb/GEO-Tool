# ADR 0007 — Neutral (Brand-Blind) Visibility Simulation Prompt

**Date:** 2026-06-14
**Status:** Accepted
**Deciders:** Founder + Director

---

## Context

`generateGeminiVisibilityAnswer` (`lib/llm/gemini.ts`) is the "simulation"
half of the two-pass scan pipeline: it asks Gemini to answer a user's prompt
as a real end user would, with Google Search grounding enabled
(`docs/adr/0004-gemini-search-grounding.md`). A second, separate pass
(`extractGeminiStructuredData`) then reads that answer and detects whether the
brand/competitors were mentioned, their position, sentiment, and citations.

The generation call was previously **not brand-blind**. The request body
included:

```
Prompt: <prompt>
Brand: <brand>
Competitors: <comma-separated competitor names>
Country: <country>
Language: <language>
```

with a systemInstruction:

> "You are a GEO visibility analyst. Answer naturally in plain text. Mention
> the brand and relevant competitors when useful."

This made the simulated answer **circular**: Gemini was explicitly told which
brand was being measured and was nudged to mention it. In practice this meant:

- The brand was mentioned in almost every answer, regardless of whether a real
  end user asking that question would actually encounter it →
  `visibility_score` (the headline "Puntuación GEO" / "GEO Score" on Overview
  and Runs) was inflated toward 100 for nearly all projects.
- `extracted_json.brand.position` was pinned at `1` (the brand, primed by the
  prompt, tends to be mentioned first).
- "Cuota de voz en IA" (share of voice) collapsed toward `1/N` for every
  brand/competitor, since all of them were named in the same primed prompt.

None of `extractGeminiStructuredData`, `lib/scoring/run-scoring.ts`, or the
position/SoV/citation formulas were wrong — the **input** to the simulation
was biased, so the "real" signal they measured was an artifact of the prompt,
not of how Gemini would actually answer an unprimed user.

---

## Decision

### 1. Make `generateGeminiVisibilityAnswer` brand-blind

The function signature drops `brand: string` and `competitors: string[]`.
It now only takes `prompt`, `country`, and `language` — this call must never
know which brand/competitors are being measured.

**New systemInstruction:**

```
You are a helpful AI assistant answering a real user's question. Answer
naturally and concisely in plain text, as you normally would for an end user.
Recommend specific products, brands, services or providers by name when that
genuinely helps answer the question — exactly as you would for any user. Do
not favour or avoid any particular brand. Do not mention that this is an
analysis.
```

**New request content block:**

```
Question: <prompt>
Answer for a user in this market/country: <country>
Respond in this language: <language>
```

`tools: [{ google_search: {} }]` and the pinned model id (ADR 0002) are
unchanged — this ADR only changes the prompt/systemInstruction text and
request body shape, not the model or grounding behavior.

### 2. The extraction pass is unchanged

`lib/scan/executor.ts` stops passing `brand`/`competitors` to
`generateGeminiVisibilityAnswer`, but the second pass
(`runStructuredExtractionForRun` → `extractGeminiStructuredData`) continues to
receive `brand_snapshot`/`competitors_snapshot` (persisted from
`project.brand` / `competitors` at insert time) and performs the real
mention/position/sentiment/citation detection against the now-neutral
`rawResponseText`. This preserves the two-pass architecture: generation
simulates an unprimed user; extraction measures the result.

The interim, naive substring-based `brand_mentioned` /
`mentioned_competitors_count` computed at insert time in `executor.ts` are
unchanged structurally — they remain a fallback overwritten by extraction for
completed runs, and continue to operate on `responseText` regardless of how it
was generated.

### 3. `PROMPT_VERSION` marker

`lib/scan/constants.ts` adds:

```ts
export const PROMPT_VERSION = "neutral-sim-v1";
```

This is persisted into `raw_response_json.prompt_version` on
`scan_prompt_results` (existing jsonb column — **no DB migration**) for every
new result, so rows generated with the brand-blind prompt are distinguishable
from earlier rows.

**No-backfill policy:** older `scan_prompt_results` rows simply lack
`raw_response_json.prompt_version` (or could carry an older value in future).
There is no migration to retroactively tag or recompute historical rows.

---

## Why `country` / `language` / `google_search` are kept

- **`country` / `language`** are not brand-identifying — they describe the
  *user's* context (locale of the hypothetical asker), which is legitimate
  information for simulating a real user and does not bias which brand gets
  mentioned.
- **`google_search` grounding** (ADR 0004) stays enabled — it makes the
  simulated answer reflect real, current search results, independent of the
  brand-blindness fix. Removing it would be an unrelated regression.

---

## Expected Effect on Metrics

With generation now brand-blind:

- `visibility_score` should become **differentiated** across projects —
  brands that genuinely come up in AI answers score higher; brands that don't
  score lower. It should no longer cluster near 100.
- `extracted_json.brand.position` should vary (no longer pinned to `1`).
- "Cuota de voz en IA" (share of voice) should reflect real relative mention
  frequency instead of collapsing to `1/N`.

This is expected to **lower** visibility scores for most existing projects —
that is the fix working as intended, not a regression. Time-series
comparisons across the `prompt_version` boundary (absent/old vs.
`"neutral-sim-v1"`) should be treated as a methodology change, similar to the
`EXTRACTION_VERSION` boundary in ADR 0004.

---

## Consequences

- The core GEO metrics (`visibility_score`, `brand.position`, share of voice)
  now measure something real: how Gemini answers an unprimed user, not how it
  answers when told which brand to favor.
- `extractGeminiStructuredData`, `lib/scoring/run-scoring.ts`, and the
  position/SoV/citation formulas are untouched — only their input changed.
- No schema/migration required; `prompt_version` lives inside the existing
  `raw_response_json` jsonb column.
- Dashboard/UI changes to surface this methodology shift (e.g. a banner
  explaining why scores dropped) are explicitly out of scope for this PR — see
  the planned PR2.
