# ADR 0008 — Composite GEO Score

**Date:** 2026-06-14
**Status:** Accepted
**Deciders:** Founder + geo-strategy + Director

---

## Context

The Overview gauge ("Puntuación GEO") currently displays `visibility_score`,
which is defined as the percentage of prompts where the brand was mentioned
(`brand_mentioned_count / total_results * 100`). This is the same underlying
metric as the "Tasa de mención" (mention rate) card shown directly below the
gauge.

In other words, the headline number and one of its own supporting breakdown
cards currently show **the same value twice**. This is redundant and
under-uses the data GEO Studio already computes per run:

- `citation_score` (authority signal — is the brand backed by a real
  citation/grounding source?);
- `competitor_gap_score` (competitive pressure/risk relative to the brand);
- `brand_position` / `brand_avg_position` (docs/adr/0005 — how prominently,
  not just whether, the brand appears relative to competitors).

A GEO analyst reading an AI-visibility report doesn't just ask "is the brand
mentioned?" — they ask "is it mentioned, how prominently, how does it compare
to competitors, and is it backed by a citation?". The gauge should reflect
that holistic read, not a single binary-ish rate.

---

## Decision

### 1. Four components, weighted

`computeRunScoresFromResults` (`lib/scoring/run-scoring.ts`) computes a new
composite, `geo_score`, from four components, each normalized to a `0..100`
scale where higher is always better:

| Component    | Source                                  | Weight | Meaning |
|--------------|------------------------------------------|--------|---------|
| `presence`   | `visibility_score`                        | 0.40   | Is the brand mentioned at all? The most fundamental signal — if the brand never appears, nothing else matters. |
| `prominence` | derived from `brand_position` (ADR 0005)  | 0.25   | When mentioned, how early/prominently relative to competitors? Captures the "first vs. afterthought" distinction that `presence` alone misses. |
| `standing`   | `100 - competitor_gap_score`              | 0.20   | How does the brand fare against competitive pressure overall? A broader, run-level competitive read than `prominence`'s per-prompt ranking. |
| `authority`  | `citation_score`                          | 0.15   | Is the brand's presence backed by a real citation/grounding source? A corroboration signal, valuable but the least foundational of the four. |

The ordering `presence > prominence > standing > authority` mirrors the order
a GEO analyst naturally checks these signals: first "are we in the
conversation at all", then "how prominently", then "how do we stack up against
competitors as a whole", then "is that backed by evidence".

### 2. Component formulas

```
presence   = visibility_score                                  (0..100, higher better, as-is)
authority  = citation_score                                    (0..100, higher better, as-is)
standing   = clamp(0, 100, 100 - competitor_gap_score)          (inverted: competitor_gap_score is a
                                                                  risk score where higher = worse, so
                                                                  standing = its complement)
prominence = clamp(0, 100, (1 - (brand_avg_position - 1) / total_entities) * 100)
             — only computable when brand_position is present and
               brand_avg_position !== null and total_entities > 0
```

`prominence` maps `brand_avg_position` (1 = best, `total_entities + 1` =
worst-case penalty per ADR 0005) onto a `0..100` "higher is better" scale
consistent with the other three components: position 1 → 100, position
`total_entities + 1` → 0, linear in between.

### 3. Weighted sum with renormalization on missing inputs

```
geo_score = Σ (component_value * normalized_weight)
normalized_weight(c) = base_weight(c) / Σ base_weight(available components)
```

`prominence` is the only component that can be structurally absent (when a
run predates `"grounded-position-v1"` extraction, or no prompt produced valid
position data — see ADR 0005 §5 for when `brand_position` is omitted). When
`prominence` is unavailable:

- it is **dropped** from the sum entirely (not treated as 0 — a missing input
  is not evidence of poor prominence);
- the remaining three weights are renormalized so they sum to 1:
  `presence 0.40/0.75 ≈ 0.5333`, `standing 0.20/0.75 ≈ 0.2667`,
  `authority 0.15/0.75 = 0.20`;
- `inputs_used` records exactly which components contributed, so the stored
  record is self-describing;
- `geo_score.components.prominence` is still present in the output, with
  `value: null`, `weight: 0`, and a `reason` string
  (`"brand_position absent (pre-grounded-position-v1 run)"`), so the frontend
  can render an explicit "not available for this run" state rather than
  silently omitting the component.

If `totalResults === 0`, `geo_score` is **omitted entirely** from
`details_json` — same honest-empty-state pattern as `brand_position` (ADR
0005 §5). There is nothing to score.

### 4. Confidence

`geo_score.confidence` starts from the run's existing `confidence` value
(`"low" | "medium" | "high"`, driven by extraction coverage and result count —
unchanged by this ADR). If `prominence` had to be dropped *and* the run's
confidence would otherwise be `"high"`, `geo_score.confidence` is capped at
`"medium"`: a 3-of-4-component composite is inherently less complete than a
4-of-4 one, even if the underlying extraction data is itself high quality.
Runs already at `"low"` or `"medium"` are unaffected — there's no further
floor to apply.

### 5. Threshold bands re-anchored, not lowered

The Overview gauge's existing band thresholds (≥70 "good"/green, ≥40
"medium"/amber, below 40 "needs work"/red — via `getBandTone` /
`getBandLabel`) are **kept as-is**. This ADR does not change the numeric
thresholds.

What changes is *what the number means*. Previously a gauge reading of, say,
72 meant "the brand was mentioned in 72% of prompts." Now a reading of 72
means "across presence, prominence, standing and authority, weighted as
above, the brand scores 72/100" — a more holistic but structurally similar
0-100 scale (all four components are themselves 0..100, and weights sum to
1, so the composite stays in 0..100 by construction). The existing bands
remain a reasonable interpretation of "good / medium / needs work" for this
re-anchored number; recalibrating the thresholds themselves is out of scope
for this ADR and would need its own data-driven justification.

### 6. Persisted shape — no migration

Stored under the existing `run_scores.details_json` jsonb column as
`details_json.geo_score`, requiring **no schema migration**:

```jsonc
"geo_score": {
  "score": 96.8,
  "composite_version": "geo-score-v1",
  "confidence": "high",
  "inputs_used": ["presence", "prominence", "standing", "authority"],
  "components": {
    "presence":   { "value": 100, "weight": 0.4 },
    "prominence": { "value": 100, "weight": 0.25 },
    "standing":   { "value": 84,  "weight": 0.2 },
    "authority":  { "value": 100, "weight": 0.15 }
  },
  "formula": "geo_score = Σ(component_value * normalized_weight); base weights presence .40 / prominence .25 / standing .20 / authority .15; standing = 100 - competitor_gap_score; prominence = (1 - (brand_avg_position-1)/total_entities)*100; absent components dropped and remaining weights renormalized."
}
```

When `prominence` is dropped, its entry looks like:

```jsonc
"prominence": { "value": null, "weight": 0, "reason": "brand_position absent (pre-grounded-position-v1 run)" }
```

The `formula` string and `composite_version` are also duplicated into
`details_json.formulas_used.geo_score` and `details_json.assumptions`,
following the same documentation pattern established for `brand_position` in
ADR 0005.

### 7. Versioning — no backfill

`geo_score` is versioned independently via `composite_version: "geo-score-v1"`
inside the `geo_score` object itself (distinct from the top-level
`scoring_version` / `EXTRACTION_VERSION`, since `geo_score` can in principle
be recomputed from existing per-prompt data without re-extraction).

**No backfill or recalculation of historical runs is performed.** This
affects runs computed or recomputed going forward only. Old `run_scores` rows
simply have no `details_json.geo_score` key.

**Frontend note (for the concurrently-developed gauge work):** the frontend
must treat a missing `details_json.geo_score` as an empty state for that run
and **fall back to the existing `visibility_score`** for the gauge value in
that case, exactly as it does today. This ADR does not implement that
frontend fallback — it is the responsibility of the frontend change updating
`app/dashboard/projects/[projectId]/page.tsx`.

---

## Consequences

- The Overview gauge can show a genuinely composite "how are we doing in AI
  answers overall" number instead of duplicating the mention-rate card.
- Runs with full `brand_position` data (post ADR 0005,
  `"grounded-position-v1"` extraction) get the full 4-component score; older
  or partially-extracted runs get a 3-component score with `prominence`
  explicitly marked as unavailable and `confidence` capped at `"medium"`.
- No schema migration, no backfill, no change to the pinned Gemini model
  (ADR 0002) or to extraction/grounding behavior (ADR 0004, ADR 0005).
- The existing gauge band thresholds (70/40) are kept; their *meaning* shifts
  from "mention rate band" to "composite GEO score band". If this turns out
  to misrepresent runs in practice, recalibrating the thresholds is a
  follow-up ADR, not part of this change.
- `geo_score` is additive to `details_json` — nothing existing is removed or
  renamed, so any code reading `visibility_score`, `citation_score`,
  `competitor_gap_score`, or `brand_position` continues to work unchanged.
