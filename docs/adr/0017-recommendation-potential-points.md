# ADR 0017 — Real "potential score points" per recommendation

**Date:** 2026-07-23
**Status:** Accepted
**Deciders:** Founder + Director (Task Intake RECS-POTENTIAL-1 approved
2026-07-23, methodology validated by the geo-strategy agent)

---

## Context

The Overview redesign's "Oportunidades" card mirrors the approved design
reference, which shows a headline number ("+14 Puntos potenciales") and a
per-recommendation "+X pt" figure. Neither number existed in the product —
CLAUDE.md forbids fake metrics, so the redesign shipped (PR #255) with a
real count of active recommendations instead, deferring the actual point
estimate to this ADR.

The founder asked for the real methodology. The first proposal (percentage
gap × the component's composite weight, e.g. `× 0.40` for presence) was
rejected on review: it ignores weight renormalization (ADR 0008/0015 — a
component's real weight is only .40 when all four components are present;
it's higher whenever one is dropped), and it misattributes which score
component several recommendation types actually move
(`increase_brand_prominence` doesn't touch presence at all; `standing`'s
non-linear ratio can't be approximated by `percentage × weight`).

## Decision

### 1. Counterfactual recomputation, not a formula shortcut

For a recommendation with real, persisted `affected_prompt_ids`
(`evidence_json`, already written by `buildEvidenceJson` in
`lib/recommendations/recommendation-engine.ts`), the "potential points" is:

```
delta = geo_score(counterfactual_rows) − geo_score(real_rows)
```

where `geo_score` is `computeRunScoresFromResults` — the exact same,
already-pure function that produces the real score — called twice: once on
the real per-prompt rows, once on a deep-cloned copy where the affected
rows carry that recommendation type's "best case" mutation
(`lib/scoring/run-scoring.ts`):

| Recommendation type | Mutation on affected rows | Component moved |
|---|---|---|
| `increase_brand_visibility` | `brand_mentioned = true` | presence (+ standing, for free — see below) |
| `close_competitor_gap` | `brand_mentioned = true` | presence + standing |
| `increase_brand_prominence` | `extracted_json.brand = { mentioned: true, position: 1 }` | prominence |
| `add_citation_block` | synthetic own-domain grounding citation in `extracted_json.citations`, own-domain rows only | authority |
| `pursue_citation_sources` | same as `add_citation_block` | authority |

`standing = brand_mentioned_count / (brand_mentioned_count +
total_competitor_mentions)` is driven purely by the totals, so flipping
`brand_mentioned` on an affected row lifts standing automatically — no
separate mutation needed, and (verified by test) `increase_brand_visibility`
and `close_competitor_gap` produce an **identical** delta for an
equivalent single affected prompt, since both apply the exact same mutation.

Reusing `computeRunScoresFromResults` verbatim means weight renormalization,
the confidence cap, and every existing scoring edge case apply to the
counterfactual automatically — there is no second formula to keep in sync.

### 2. Only 5 recommendation types are quantifiable

A number is only defensible where the recommendation's own evidence
(`affected_prompt_ids`) maps 1:1 to a specific score component with a
concrete before/after state. The other types
(`create_faq_section`, `strengthen_brand_entity_clarity`,
`add_comparison_content`, `update_stale_content`,
`amplify_positive_pattern`, `address_negative_narrative`,
`track_emerging_competitor`) get a qualitative impact badge (from the
existing `impact: low/medium/high` field) — **never** a "+X pt" figure.
`address_negative_narrative` in particular can never move geo_score:
sentiment isn't a geo-score-v2 component. `track_emerging_competitor` is
measurement hygiene, not a score-improving action, and must not imply a
point gain either.

### 3. The aggregate is a joint counterfactual, not a sum

Summing each recommendation's standalone delta double-counts any prompt
affected by more than one recommendation (e.g. two `close_competitor_gap`
cards for different dominant competitors can share a prompt). The
Oportunidades header total instead applies **every** quantifiable
recommendation's mutation to the **union** of affected rows at once and
rescores **once**:

```
joint_delta = geo_score(union_counterfactual_rows) − geo_score(real_rows)
```

Verified by test: the joint delta of two recommendations sharing the same
affected prompt equals the standalone delta of just one of them (the
overlap collapses for free), and `joint_delta` never exceeds the sum of
the standalone deltas.

### 4. Confidence gate

If the run's `confidence` is `"low"`, both `computeRecommendationPotentialPoints`
and `computeJointPotentialPoints` return `null` — the UI must fall back to
the qualitative badge / real count, never render a number over a
low-confidence sample. A composite that doesn't exist yet (pre-geo-score-v2
runs, no backfill per ADR 0008/0015) also returns `null`.

### 5. Presentation is an optimistic, verifiable ceiling — not a promise

Every number is framed as "hasta +X pt" (a ceiling assuming the
recommendation's affected prompts fully resolve), with copy disclosing that
assumption and that the next scan verifies it. This is what keeps a
100%-adoption assumption honest rather than fake: it is a falsifiable
prediction, not an invented constant.

## Consequences

- No schema changes. `computeRecommendationPotentialPoints` and
  `computeJointPotentialPoints` (`lib/scoring/run-scoring.ts`) are pure
  functions over the same `ScoreInputRow[]` shape `computeRunScoresFromResults`
  already consumes.
- Extra CPU cost: 2 additional calls to `computeRunScoresFromResults` per
  quantifiable recommendation shown (cheap — pure, synchronous, no I/O,
  bounded by the run's prompt count) plus one joint call for the header.
- `evidence_json.affected_prompt_ids` becomes load-bearing for a second
  purpose (score deltas, not just evidence display) — any future change to
  how recommendations compute `affected` must keep it accurate.
