# ADR 0026 — Position measures rank, not frequency (geo-score-v3)

**Status:** Accepted
**Date:** 2026-08-03
**Deciders:** Founder (four explicit decisions, 2026-08-03) + Director
**Supersedes parts of:** ADR 0005 (average brand position), ADR 0008/0015 (the `prominence` component)
**Relates to:** `docs/geo-methodology-audit-2026-07.md` finding 4, ADR 0024 (reliability layer)

---

## Context

The founder read the competitors screen and rejected the metric on sight:

> *"Sigo sin entender la posición de los competidores. Cómo es posible que la
> posición mejor sea 6,5. Y peor aún, es imposible que mozilla esté por encima
> de chrome, edge o safari."*

Both objections were correct, and they share one cause.

`computeBrandPosition` (ADR 0005) assigned every **non-mention** the position
`N+1` and averaged that in with real ranks. Run over a synthetic scan where all
eight entities rank **2nd every single time they appear**, varying only how
often they appear:

```
Entidad             posición media    aparece en    puesto real
Mozilla                 5.50          10/20              2
Google Chrome           7.25           5/20              2
Apple Safari            7.60           4/20              2
Microsoft Edge          7.60           4/20              2
Brave                   8.30           2/20              2
Proton VPN              8.65           1/20              2
Amazon                  8.65           1/20              2
ESET                    9.00           0/20              —
```

That output reproduces the founder's real screenshot almost exactly, and not
one of those entities ranks better than another. **The metric ordered by
mention frequency and labelled it position.**

It follows that:

- **The best achievable value is not 1.** A brand listed first every single
  time it appears, in half of all answers, averages `(1 + 9) / 2 = 5.0`. A
  6.50 does not mean "sixth" and cannot be read without also knowing the
  mention rate — at which point it adds nothing.
- **The tracked brand is structurally flattered.** The prompt set is chosen
  around the brand, so the brand appears more often than competitors chosen as
  foils, so it eats fewer penalties. Mozilla outranking Chrome, Safari and Edge
  was an artefact of the design, not a finding about the market.

### The same defect inside the GEO Score

`prominence` (weight .25) is derived from this figure, so it was a second
encoding of the mention rate that `presence` (weight .40) already carries.
That is finding 4 of the July audit — ADR 0015 fixed `standing` and left this
one — and it is the measured cause of the amplification recorded in ADR 0024: a
mention-rate swing reached the composite at **0.71×**, not the 0.40 that
`presence`'s weight implies.

## Decision

### 1. `avg_position_when_mentioned` replaces `avg_position`

Mean rank over **only** the prompts where that entity was actually mentioned.
`1.0` means "always listed first" and reads without further context. An entity
the AI never named has `null` — no rank at all — and sorts last rather than
receiving a fabricated one.

`mention_rate` and `mention_count` ship alongside it per entity, because the
question the old figure was secretly answering is a real and useful one; it
just needs its own column.

The pre-v3 figure is retained per entity as `avg_position_penalized` for
comparison across the transition — the same pattern ADR 0013 used for
`citation_score_any_domain` and ADR 0015 for `standing_v1`. Nothing reads it.

### 2. `prominence` uses the conditional rank, gated on mentions

Removing the `N+1` penalty removes what used to keep a single lucky first
place honest: without a gate, one mention at rank 1 would read as a perfect
100. So `prominence` is dropped — and the remaining weights renormalized, the
mechanism `authority` and `standing` already use — unless the brand was
mentioned in at least `MIN_RESPONSES_FOR_BAND` prompts.

Gated on the brand's **mention count**, not the run's response count: the
sample that matters for an average rank is the number of ranks averaged.

`composite_version` → `geo-score-v3`; `SCORING_VERSION` → `phase9-geo-score-v3`.

### 3. Ranking ordered by rank, appearance rate shown beside it

Founder decision. The competitors list sorts by `avg_position_when_mentioned`
and prints the mention rate next to it, so "1.2º" can never be read without
seeing whether it came from 90% of answers or from one.

### 4. No backfill

Founder decision — *"el histórico da igual, no hemos salido a cliente real
aún"*. Historical runs keep their v2 numbers. The trend chart will show a step
at the transition; the comparability guard from ADR 0024 already refuses to
publish a delta across differing `composite_version`, so the step cannot be
rendered as a movement.

### 5. The chart

The trend chart was drawing eight series from `RANK_BAR_COLORS` — a
**sequential blue ramp**, correct for rank bars where lightness encodes order
and wrong as categorical identity. Eight shades of one hue is what made it
unreadable.

- Four series by default (brand + three), the rest one click away; the legend
  chips toggle individual series.
- Distinct hues from a validated categorical palette: worst adjacent pair
  separates by ΔE 11.4 under protanopia against the light surface. Identity is
  never colour-alone — every drawn series is labelled at the end of its own
  line.
- **Step interpolation**, not straight lines: a rank changes between scans, it
  does not slide through the values in between. Explicitly *not* smoothing,
  which the founder asked about first — a smoothed curve over integer ranks
  draws positions nobody ever occupied, which is the same fabrication ADR 0024
  removed from the delta.
- A scan where an entity was not mentioned is a **gap**, not a penalized point
  on a continuous line.

## Consequences

**Positive.** Position answers "when the AI names you, does it put you first or
fourth?" — a question `presence` does not answer. The transfer ratio should
fall from the measured 0.71× toward ~0.45, making the composite less sensitive
to sampling noise without touching a single weight.

**Every score changes on the first scan after merge.** Accepted by the founder
under decision 4.

**Small projects lose `prominence` entirely** until the brand is mentioned in
10+ prompts, and the composite renormalizes onto the other three components.
That is the honest state — an average of two ranks is not a measurement — but
it does mean the component appears later in a project's life than it used to.

**Not addressed here.** The weights (.40/.25/.20/.15) and the 70/40 bands are
untouched; recalibrating them still needs the observed distribution of real
projects that does not exist yet (ADR 0015 §5). Whether `prominence` deserves
0.25 once it stops duplicating `presence` is a fair question this ADR
deliberately does not answer — changing the measurement and the weights in the
same step would make neither effect attributable.
