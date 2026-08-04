# ADR 0027 — A technical failure is not a finding (geo-score-v4)

**Status:** Accepted
**Date:** 2026-08-03
**Deciders:** Founder + Director
**Relates to:** ADR 0024 (reliability layer), ADR 0026 (position measures rank),
`docs/geo-methodology-audit-2026-07.md`

---

## Context

The agentic pilot reported the same brand's mention rate as three different
numbers on two screens — 47 %, 27 % and 54 % — none of them labelled. Chasing
why they differed turned up two separate things, and only one was cosmetic.

The cosmetic one: the Overview reads the **latest scan**, the Competitors
screen pools **every completed scan**. Both are legitimate questions and both
answers were right; neither said which question it was answering.

The one that mattered: a prompt whose extraction failed was being counted as a
prompt where the AI did not mention the brand.

Founder, on being shown it:

> *"No tiene sentido que un fallo técnico penalice la nota de posicionamiento.
> Revísalo para que no ocurra, ni en este caso ni en ningún otro posible dentro
> de todos los cálculos que impactan en el GEO score."*

### Why it happens

A row whose extraction failed has `brand_mentioned = false` and
`citation_found = false` — not because the model declined to name the brand,
but because **nothing was ever read from it**. Those fields default to false
and no extraction ever overwrote them.

Every denominator in `computeRunScoresFromResults` was `total_results`, so
those rows landed in the denominator with a falsy numerator. A provider
timeout, a schema-validation failure, a truncated response — each one moved the
score down as though the AI had considered the brand and passed it over.

`prominence` was the exception, and by accident of construction rather than
design: `computeBrandPosition` skips rows it cannot parse, because it has
nothing to rank. It was already right.

## Decision

**A row that produced no usable evidence is excluded from every denominator,
in every component of the GEO Score.** It is neither a mention nor a
non-mention; it is absent sample.

`isScorableRow` requires a valid `extracted_json` **and** no
`extraction_error`. Both, not either: a row can carry an error alongside
partial JSON, and half-read evidence is not evidence.

Component by component, as swept:

| Component | Before | After |
|---|---|---|
| `presence` (.40) | failure counted as a non-mention — **penalized** | excluded from the denominator |
| `authority` (.15) | failure counted as "no citation found" — **penalized** | excluded; grounded rows must also be scorable |
| `standing` (.20) | contributed 0 to numerator and denominator — already neutral | unchanged in effect, computed over scorable rows for consistency |
| `prominence` (.25) | already excluded them | unchanged — this is the model the others now follow |
| Competitive pressure | failure inflated the denominator — **understated** the pressure | excluded |

The last row is worth naming: the same defect ran in the *opposite* direction
there. An unreadable row is not a prompt where the brand held its ground
either, and leaving it in quietly made competitors look less threatening. A
rule that only fixed the flattering direction would not be a rule.

**When no row can be read at all, `presence` is dropped, not zeroed** — the
remaining weights renormalize through the mechanism `prominence`, `standing`
and `authority` already use. A run that read nothing has no mention rate, and
publishing 0 % would be the same fabrication ADR 0024 removed from the delta.

`scored_results_count` and `unscorable_results_count` ship in `details_json`
beside `total_results`, so the losses stay visible and auditable.

**Confidence is deliberately not relaxed.** Any extraction error still forces
the run to `low`. That is the honest pairing: the score stops being punished
for an outage, and the confidence keeps telling the truth that the sample got
smaller. Fixing one without the other would trade a pessimistic score for an
overconfident one.

`composite_version` → `geo-score-v4`; `SCORING_VERSION` →
`phase9-geo-score-v4`. No backfill, consistent with ADR 0026 §4 — and the
comparability guard from ADR 0024 already refuses to publish a delta across
differing `composite_version`, so the step cannot render as a movement.

### Scope, labelled

The Overview now labels its panorama *último escaneo* and the Competitors
screen labels its share-of-voice section *histórico*. The two figures were
never in conflict; they were answering different questions in silence.

The Overview's own displayed mention rate now applies the same scorable-row
rule as the scoring, so the number on the screen and the number in the score
are computed the same way.

## Consequences

**Scores go up on runs that had extraction failures, and stay put on runs that
did not.** The guard is inert on healthy data — a test asserts exactly that,
because a change that also moved clean runs would be a different change.

**Every score changes version.** Historical runs keep their v3 numbers; the
trend chart will show a step at the transition, and the comparability guard
prevents it being read as movement.

**A run with heavy extraction loss now reports a confident-looking rate over a
thin sample.** That is why the confidence floor was left alone, and why
`scored_results_count` is published: the reliability layer from ADR 0024 is
what stops a rate over three readable rows being presented as precision.

**Not addressed here.** The weights (.40/.25/.20/.15) and the 70/40 bands stay
untouched, for the same reason as in ADR 0026: changing the measurement and
the weights together would make neither attributable. Why extractions fail at
all — provider timeouts, schema drift — is a pipeline question this ADR does
not answer; it only stops the failures being charged to the brand.
