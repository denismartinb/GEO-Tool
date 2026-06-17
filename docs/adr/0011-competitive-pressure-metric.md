# ADR 0011 — Competitive Pressure Metric (replaces Competitive Risk)

**Status:** Accepted
**Date:** 2026-06-17
**Deciders:** Founder + Gemini Pipeline Engineer

---

## Context

`competitor_gap_score` (stored in `run_scores`, surfaced in the Overview as
"Riesgo Competitivo") was computed as:

```
competitor_gap_score = clamp(0, 100,
  (totalCompetitorMentions / total_results) * 50 +
  (100 - visibilityScore * 0.6) * 0.4
)
```

`totalCompetitorMentions` was the **sum** of `mentioned_competitors_count`
across all prompts in the run — not the number of distinct prompts in which
a competitor appeared. With a typical project tracking 2-3 active
competitors, almost every prompt that mentions any competitor at all
contributes 2-3 to that sum. For a 10-prompt run, `totalCompetitorMentions`
routinely exceeds `total_results` (e.g. 25 mentions / 10 prompts = 2.5),
which alone pushes `competitorPresencePerPrompt` to 125 before the clamp —
saturating the score to 100 in the vast majority of real runs, regardless of
how the brand itself was actually doing.

The deeper problem was not just the magnitude, but what the formula measured:
it added competitor-mention volume and a (loosely) inverted brand-visibility
term, but **never checked whether the brand and the competitor co-occurred in
the same prompt**. A prompt where the brand and three competitors are all
listed side by side scored as "risk" identically to a prompt where the brand
is completely absent and only competitors appear — even though only the
second case represents the brand actually losing ground. The metric measured
competitor *noise*, not brand *displacement*.

---

## Decision

Replace the scoring logic with **Presión Competitiva** (Competitive
Pressure), a measure of brand displacement:

```
competitor_gap_score = clamp(0, 100, (displaced_prompts_count / total_results) * 100)

displaced_prompts_count = count of prompts where:
  mentioned_competitors_count > 0  AND  brand_mentioned === false
```

Interpretation:

- **0%** — every time a competitor is mentioned, the brand is also
  mentioned in that same prompt. No real competitive displacement.
- **100%** — every time a competitor is mentioned, the brand is absent.
  Maximum displacement: competitors are filling the space the brand should
  occupy.

Because `displaced_prompts_count` is bounded by `total_results` by
construction (it counts a subset of prompts, not a sum of per-prompt
mention counts), the ratio is naturally within `[0, 1]` — the `clamp` is
now a defensive guard rather than the mechanism doing the real work of
keeping the score sane.

### Classification bands (Overview UI)

| Band | Range | Tone |
|---|---|---|
| Baja | < 20% | positive (green) |
| Media | 20–50% | accent |
| Alta | 50–80% | warning (amber) |
| Crítica | > 80% | negative (red) |

### Input data

Computed per prompt from data already present on `scan_prompt_results` /
`ScoreInputRow` (`lib/scoring/run-scoring.ts`):

- `brand_mentioned` (boolean column, set during extraction — see
  `lib/extraction/schema.ts`'s `brand.mentioned`).
- `mentioned_competitors_count` (integer column, count of competitors with
  `mentioned: true` in that prompt's `extracted_json.competitors[]`).

No new query, no new extraction field, no change to `extracted_json`'s shape
(`brand.mentioned` / `competitors[].mentioned`, per `lib/extraction/schema.ts`,
already carry everything this formula needs — `run-scoring.ts` simply reads
the two derived columns instead of iterating `extracted_json` itself, since
they already encode the same co-occurrence information per prompt).

### Why the same DB field name is kept

`competitor_gap_score` is **not renamed** at the database level. Only the
computation inside `computeRunScoresFromResults` changes. This means:

- No schema migration (forbidden without explicit founder approval per the
  project constitution, and unnecessary here).
- No RLS change.
- Historical `run_scores` rows keep their old (saturated) values as-is —
  this ADR does not backfill or recompute past runs, consistent with how
  ADR 0005 and ADR 0008 handled formula/versioning changes.
- Every downstream reader (`app/dashboard/projects/[projectId]/page.tsx`,
  `app/dashboard/projects/[projectId]/runs/[runId]/page.tsx`,
  `lib/recommendations/recommendation-engine.ts`, the `geo_score` composite's
  `standing` component in ADR 0008) continues to work unchanged — they all
  read `competitor_gap_score` as "higher = worse competitive pressure",
  which remains true; the change makes that signal **meaningful** instead of
  pinned near 100.

### UI label change

The Overview card previously labeled "Riesgo Competitivo" is renamed to
**"Presión Competitiva"** to match the new question the metric answers. The
card follows the same tooltip + classification-badge visual pattern
established for "Cuota de Citas" (ADR 0010): an `InfoTip` explaining the
metric, plus a badge showing which band (Baja/Media/Alta/Crítica) the current
score falls into. Unlike Cuota de Citas, this card keeps its existing
sparkline trend and delta-vs-previous-run, since `competitor_gap_score` (now
correctly computed) already has real trend history in `run_scores`.

---

## Consequences

- `competitor_gap_score` now varies meaningfully across runs instead of
  clustering near 100 for any project with 2+ active competitors. Its
  earlier near-universal saturation made it useless as a signal; this
  restores it as one.
- `standing = 100 - competitor_gap_score` (ADR 0008's `geo_score` composite)
  is unaffected in formula, but its *values* improve: runs with low
  displacement will now show high `standing` and a higher composite
  `geo_score`, instead of being dragged down by a near-saturated
  competitor_gap_score regardless of actual brand performance.
- `lib/recommendations/recommendation-engine.ts`'s `close_competitor_gap`
  rule (`competitor_gap_score >= 50 && totalCompetitorMentions > 0`) now
  fires only when real displacement is happening, rather than almost always.
  This is a behavior improvement consistent with the goal of this ADR, but
  is worth flagging: recommendation volume for that rule will likely drop
  for runs that were previously over-triggering it.
- No backfill: runs scored before this change keep their old (saturated)
  `competitor_gap_score` value in `run_scores`. Trend sparklines that span
  the cutover will show a visible drop from old-formula to new-formula
  values — this is expected and reflects a metric definition change, not an
  actual change in competitive pressure.
- Out of scope for this ADR: the run-detail page
  (`app/dashboard/projects/[projectId]/runs/[runId]/page.tsx`) still labels
  this field "Brecha competitiva" in a simpler, non-card layout. It was not
  touched here per the approved task scope (Overview only); it should be
  updated in a follow-up pass for label consistency.
