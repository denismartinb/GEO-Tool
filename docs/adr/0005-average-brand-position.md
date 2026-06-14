# ADR 0005 — Average Brand Position

**Date:** 2026-06-14
**Status:** Accepted
**Deciders:** Founder + geo-strategy + Director

---

## Context

GEO Studio already tracks whether the brand and competitors are *mentioned*
in a Gemini answer (`brand_mentioned`, `mentioned_competitors_count`), but
not *how prominently*. Two brands can both have `mentioned: true` while one
is named first and the other is an afterthought three paragraphs later — a
real difference in AI visibility that the existing metrics don't capture.

"Average Brand Position" (Posición media de marca) closes this gap: a
per-entity ranking of how early/prominently each tracked entity (brand +
competitors) appears across a run's prompts, averaged into a single number
per entity. Lower is better (position 1 = mentioned first).

---

## Decision

### 1. Per-prompt position (extraction step)

`lib/extraction/schema.ts` adds `position: z.number().int().positive().nullable()`
to both `extractionOutputSchema.brand` and `extractionCompetitorSchema`:

- **1-based rank** of the entity's FIRST mention in the raw response text
  (1 = mentioned first / most prominent).
- **Dense ranking** (1, 2, 3, ... no gaps) over entities *actually mentioned*
  in that prompt, ordered by first-appearance offset in the text; ties broken
  by extraction order.
- **Brand and competitors share one ranking** — they are not ranked
  separately.
- `null` when `mentioned: false`. Must be consistent with `mentioned`.

The Gemini structured-extraction prompt (`lib/llm/gemini.ts`,
`extractGeminiStructuredData`'s `schemaInstruction`) was updated to ask for
this field with the same definition.

### 2. Entities not mentioned in a prompt: penalized position N+1

For a given prompt, `N = 1 (brand) + competitors.length` = total tracked
entities. An entity not mentioned in that prompt is **not excluded** from the
aggregation — it is assigned an `effective_position` of `N+1`, i.e. one worse
than the worst possible real rank. This:

- keeps the average meaningful even when an entity is mentioned in only some
  prompts (no survivorship bias from dropping zero-mention prompts);
- penalizes brands/competitors that are simply absent from the conversation,
  which is itself a visibility signal worth surfacing.

### 3. Aggregation formula

Computed per run in `lib/scoring/run-scoring.ts`
(`computeRunScoresFromResults` → `computeBrandPosition`), over all completed
prompt results with a valid `extracted_json` shape:

```
effective_position(entity, prompt) = position if mentioned, else N+1
avg_position(entity) = mean(effective_position over prompts with valid extraction)
```

Rounded with the existing `round2` helper. The final `ranking` array is
sorted by `avg_position` ascending (best/most prominent first).

### 4. Defensive normalization

If Gemini returns a non-null `position` for an entity but `mentioned: false`
for that entity in a given prompt (an internally inconsistent extraction),
the position is **ignored** and the entity is treated as not-mentioned (i.e.
`effective_position = N+1` for that prompt). The pipeline never fabricates a
position without evidence of an actual mention — see `readEntity` in
`lib/scoring/run-scoring.ts`.

### 5. Persisted shape — no migration

Stored under the existing `run_scores.details_json` jsonb column as
`details_json.brand_position`, requiring **no schema migration**:

```jsonc
"brand_position": {
  "prompts_with_position_data": 6,
  "total_entities": 4,
  "ranking": [
    { "name": "Orange",   "is_brand": false, "avg_position": 2.68, "mention_count": 5 },
    { "name": "O2",       "is_brand": false, "avg_position": 2.81, "mention_count": 4 },
    { "name": "Vodafone", "is_brand": false, "avg_position": 3.07, "mention_count": 4 },
    { "name": "MiMarca",  "is_brand": true,  "avg_position": 1.86, "mention_count": 6 }
  ],
  "brand_avg_position": 1.86,
  "confidence": "high"
}
```

- `total_entities` = the max `N` (brand + competitors) observed across the
  run's prompts (competitor snapshots can vary slightly per prompt in theory;
  this records the largest tracked set).
- `brand_avg_position` is a convenience pointer to the brand's own
  `avg_position` from `ranking` (the entity where `is_brand: true`).
- `confidence: "low"` when `prompts_with_position_data < total_results`
  (i.e. some completed prompt results didn't have a valid extracted shape —
  partial coverage); `"high"` otherwise. This mirrors the existing
  `confidence` semantics elsewhere in `details_json`.
- The brand's identity in the ranking is its `brand_snapshot` (the project's
  brand name as snapshotted on `scan_prompt_results` at scan time), so the
  ranking is stable even if the project's brand name changes later.
- `brand_position` is **omitted entirely** from `details_json` when no
  completed result has a valid extracted shape with position data (e.g. all
  rows are pre-position-versioned, or all have `extraction_error`). This is
  an honest empty state, not a zeroed-out metric.

### 6. Methodology versioning

`EXTRACTION_VERSION` (`lib/scan/constants.ts`) is bumped from
`"grounded-v1"` to `"grounded-position-v1"`. Runs scored from
`"grounded-position-v1"` extractions are the only ones that can populate
`details_json.brand_position` — prior runs simply won't have this key, which
the frontend treats as an empty state. **No backfill or recalculation of
historical runs** is performed.

---

## Consequences

- A new GEO metric — "where does my brand rank relative to competitors in AI
  answers, on average" — becomes available without any database migration.
- Old runs (pre `"grounded-position-v1"`) have no `brand_position` in
  `details_json`; this is expected and handled as an empty state by the
  dashboard, not a bug.
- The penalized `N+1` position means `avg_position` is not directly
  comparable across runs/projects with a different number of tracked
  competitors (a larger competitor set raises the penalty ceiling). This is
  an accepted tradeoff: the ranking *within* a run is still meaningful, which
  is the primary use case.
- Extraction prompts now ask Gemini for one more field per entity. No change
  to the pinned Gemini model id (ADR 0002) or to citation/grounding behavior
  (ADR 0004).
