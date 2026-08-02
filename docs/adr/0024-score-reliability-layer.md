# ADR 0024 — Reliability layer over the GEO Score (precision and comparability)

**Status:** Accepted
**Date:** 2026-08-02
**Deciders:** Founder (reported live, approved GEO-SCORE-RELIABILITY-1) + Director
**Relates to:** ADR 0008 (composite), ADR 0015 (geo-score-v2 + confidence),
`docs/geo-methodology-audit-2026-07.md` finding 5, `docs/geo-score-variability-2026-08.md`

---

## Context

The founder ran two consecutive scans of a test project (brand "Mozilla",
domain `mozilla.org`) without changing anything, and the GEO Score moved
**44 points** (30 → 74). The Overview presented that jump as a plain
`+44 pt` delta next to a qualitative band ("Franja «competitivo»"), with no
statement of sample size or margin.

Reproduced exactly against the real `computeRunScoresFromResults`. The
project has **one prompt scanned across three engines — 3 AI responses
total**, and its brand mention rate moved 1/3 → 3/3:

```
mentions=1/3   visibility=33.33   GEO=24.52
mentions=3/3   visibility=100     GEO=71.67        (+47.15 pt)
```

Sensitivity of the composite to a single flipped AI response, by plan:

```
1 prompt x 3 motores    n=  3    23.81 pt
Free  (10 x 1)          n= 10     7.12 pt
Starter (25 x 3)        n= 75     0.96 pt
Pro   (100 x 3)         n=300     0.24 pt
```

Two further findings that make the presented number less stable than it
looks, both reproduced:

- **Amplification.** A mention-rate swing reaches the composite at a measured
  **0.71x**, not the 0.40 that `presence`'s weight implies — `prominence`
  penalizes unmentioned prompts with position N+1 and `standing`'s numerator
  is the brand mention count, so three of the four components move together
  (the double-counting `docs/geo-methodology-audit-2026-07.md` finding 4
  identified; ADR 0015 fixed only `standing`).
- **Scale discontinuities.** With identical underlying data, dropping the
  `authority` component (a run scored only on an ungrounded engine) moves the
  composite 71.67 → 84.31, and a single row carrying a stale
  `extraction_version` collapses `inputs_used` from four components to two.
  The Overview's delta subtracted two `run_scores` rows with no check that
  either had happened — while `lib/scan/score-alert.ts` had *already* been
  taught (ADR 0015 E2) to refuse exactly that comparison for the email alert.
  The same step was suppressed in email and rendered as fact on screen.

Finding 5 of the July audit predicted all of this ("varianza sin controlar")
and its proposals 2 and 3 were never implemented.

## Decision

A reliability layer that changes **no score**. It governs what the product is
willing to *assert* about a score it already computed.

### 1. `lib/stats/wilson.ts` — one Wilson implementation

`lib/web-audit/sample-confidence.ts` (WEB-AUDIT-R6) already computed a Wilson
interval, for the same reason, from a founder report of the same shape. Rather
than add a second copy with different constants and rounding, the formula is
extracted to a shared primitive returning raw proportions; each surface keeps
its own thresholds, rounding and presentation. Web-audit behavior is
unchanged (its 7 existing tests pass untouched).

Wilson rather than the normal approximation because the normal interval
returns a width of **zero** at p̂ = 0 and p̂ = 1 — "100%, no margin" from
three coin flips is precisely the claim being removed.

### 2. `lib/scoring/score-reliability.ts` — sample floor and comparability

- `MIN_RESPONSES_FOR_BAND = 10`. Below it a single AI response moves the
  mention rate by ≥10 points, ~0.71x of which reaches the composite; a 70/40
  band boundary cannot be asserted when one response is worth more than 7
  points. The **score is still shown** — it is real evidence the user paid
  for. What is withheld is the *interpretation*: the qualitative band and the
  "vs. escaneo anterior" delta.
- `compareRuns` refuses a delta across runs that differ in
  `composite_version`, `inputs_used`, engine set, or response count — each
  one a reproduced scale discontinuity. **Unknown is not equal**: two legacy
  runs that both lack a fingerprint are two unverifiable measurements, not a
  match. (This was a real bug in the first draft of the module, caught by its
  own test.)
- `resolveDelta` is the single decision point, so the gauge and the KPI cards
  cannot drift apart in what they assert.

### 3. `confidence`: "medium" now requires ≥ `MIN_RESPONSES_FOR_BAND`

Was `>= 2`, which presented a 2-response run and a 19-response run
identically. This propagates deliberately into `computeRecommendationPotential
Points`, which already refuses a point estimate on a `"low"` run: tiny runs
stop showing "hasta +X pt" ceilings their sample cannot support. Intended
consequence, not a side effect. The ≥20 "high" bar from ADR 0015 is unchanged.

### 4. Overview: units, margin, honest absence

- `total_results` counts **prompt × engine rows**, and the insight banner
  called them "prompts" — a 1-prompt, 3-engine project read "3 de 3 prompts".
  The unit is now "respuestas de IA" wherever that count is displayed.
- The mention-rate card states its margin (`±N pt`, Wilson 95%).
- A withheld delta renders as **"— sin comparación"** with the reason, never
  as "— sin cambio". Refusing to assert a change is not evidence of
  stability, and rendering it as one is the same false claim inverted.

## Consequences

**Positive.** The product can no longer present a 3-response sample with the
same authority as a 300-response one, nor a cross-methodology step as a real
movement. Existing `run_scores` rows need no migration or backfill — every
field `compareRuns` reads (`total_results`, `citation_by_provider` keys,
`geo_score.composite_version`, `geo_score.inputs_used`) is already persisted
by `computeRunScoresFromResults`.

**Accepted cost.** Projects below 10 responses lose their band, their delta
and their recommendation point-estimates until they add prompts or engines.
That is the honest state for such a sample, and it gives the product a
concrete reason to recommend more prompts — but it does make the smallest
projects' Overview visibly emptier.

**Explicitly NOT fixed by this ADR.** This layer makes the product honest
about precision; it does **not** make the measurement correct, and it would
not have suppressed the founder's +44 for the right reason — it suppresses it
only because n=3. The actual root cause of that jump is brand identity: all
three AI responses recommended **Firefox**, and `verifyMention` (ADR 0021)
counts a brand mention only when the extractor's `display_name_found`
plausibly names the tracked string "Mozilla". Strip the incidental
parent-company attribution from those same three responses and all three
become non-mentions — a 74 that should be a 0, or a 0 that should be a 74,
decided by whether the model wrote "Firefox" or "Mozilla Firefox". That is
a separate phase requiring a schema migration; see
`docs/geo-score-variability-2026-08.md`.
