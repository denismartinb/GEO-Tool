# ADR 0015 — GEO Score v2: share-of-voice standing and honest confidence

**Date:** 2026-07-12
**Status:** Accepted
**Deciders:** Founder + Director (Task Intake GEO-SCORE-V2 approved 2026-07-12)
**Supersedes parts of:** ADR 0008 (composite GEO Score)

---

## Context

The methodology audit (`docs/geo-methodology-audit-2026-07.md`, findings 4, 5
and 11) identified three weaknesses in the v1 composite:

1. **Double counting.** Three of the four components derived from the same
   underlying `brand_mentioned` signal: `presence` directly,
   `prominence` via the N+1 penalty for unmentioned prompts, and
   `standing = 100 - competitor_gap_score` (competitive pressure can only
   accrue on prompts where the brand is absent). ~85% of the composite's
   weight was correlated with one binary variable.
2. **The empty-market case.** A brand that is completely invisible, in a
   market where the AI mentions no competitors either, scored
   `standing = 100` (pressure 0) — 20/100 composite for a brand nobody has
   ever seen, because v1 interpreted "no competitors mentioned" as merit.
3. **Overstated confidence.** `confidence = "high"` required only 5
   fully-extracted results. With one LLM sample per prompt/engine, 5 results
   give each answer a 20-point swing on presence — statistically that is not
   "high confidence", and the UI presented it as sample reliability.

## Decision

### 1. `standing` = real Share of Voice

```
standing = brand_mentioned_count / (brand_mentioned_count + total_competitor_mentions) * 100
```

Per-prompt binary mention counts of tracked entities (the same counts the
Overview's competitive table already displays as "Cuota de voz en IA"). When
the denominator is 0 — neither the brand nor any tracked competitor mentioned
anywhere in the run — there is **no voice to share**: the component is
dropped and the remaining weights renormalize, exactly the existing
mechanism for `prominence` and `authority` (ADR 0008 §3). No more fabricated
100 for invisible brands in empty markets.

SoV still correlates with presence, but its denominator carries competitor
activity — new information the v1 complement did not have — and its failure
mode is honest (absent, not perfect).

### 2. `composite_version = "geo-score-v2"`, v1 kept for comparison

The composite object bumps to `"geo-score-v2"` and gains `standing_v1`
(the old `100 - competitor_gap_score` value) for comparison only — the same
transition pattern ADR 0013 used with `citation_score_any_domain`. Weights
(.40/.25/.20/.15), renormalization, and the confidence cap are unchanged;
the cap now also applies when `standing` is dropped.

### 3. Honest run confidence

`"high"` now requires **≥20** fully-extracted results (was ≥5); 2–19 clean
results are `"medium"`. Top-level `SCORING_VERSION` bumps to
`"phase9-geo-score-v2"`.

### 4. No backfill; alert transition guard

Same as ADR 0008: no recalculation of historical runs. Old runs keep
`geo-score-v1`; `getEffectiveGeoScore` is unchanged. The Overview trend line
will show a step at the transition — accepted and documented. The score-drop
alert must **not compare runs whose `composite_version` differs** (shipped
as the GEO-SCORE-V2 E2 change in `lib/scan/score-alert.ts`, together with
requiring the drop to persist across two consecutive comparisons), so the
v1→v2 step cannot fire a spurious "your score dropped" email.

The Overview's score-composition row is version-aware: v2 runs render the
standing row as "Cuota de voz"; legacy v1 runs keep "Posición competitiva",
because showing the v2 label over a v1 value would misdescribe the number.

### 5. Explicitly out of scope

Recalibrating the 70/40 gauge bands stays deferred (audit finding 11): it
needs the observed score distribution of ≥10–20 real projects, which does
not exist yet. Revisit as its own small ADR once that data exists.

## Consequences

- Scores shift on the first post-merge scan of every project (typically
  downward where v1's empty-market standing was inflating them). This is the
  score becoming more truthful, not a regression.
- The stricter confidence threshold demotes most current runs (5–19 prompts)
  from "high" to "medium" — including the composite's confidence cap and the
  rule-engine's confidence-weighted severity. Free-plan runs (≤10 prompts)
  can no longer present themselves as high-confidence samples.
- No schema changes; everything lives in `run_scores.details_json`.
