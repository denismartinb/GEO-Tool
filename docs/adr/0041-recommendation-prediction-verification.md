# ADR 0041 — Verifying a recommendation's prediction, not measuring its delta

**Date:** 2026-08-27
**Status:** Accepted
**Deciders:** Founder + Director (Task Intake RECS-LOOP-1 Fase A approved
2026-08-27, methodology from the geo-strategy agent, schema/ownership review
from the data-guardian agent)

---

## Context

ADR 0017 §5 framed "potential points" as *"a falsifiable prediction... the
next scan verifies it"* — but nothing ever checked. A recommendation could
resolve (`status='resolved'`, its `dedupe_key` stops recurring) or get
dismissed by hand, and the product never said whether what it promised
actually happened.

The founder asked to close that loop with a "recovered points" verdict. The
obvious shape — a score delta between the run where the card was active
(`recommendations.run_id`) and the run that confirmed it gone
(`resolved_in_run_id`) — was evaluated and rejected before any code was
written.

## Why a between-run score delta is rejected

Both `geo-strategy` and `data-guardian` reached the same conclusion by
independent paths:

1. **It is usually not publishable at all.** `.claude/rules/scoring.md`:
   *"Ninguna superficie publica una comparación entre escaneos sin pasar por
   `resolveDelta`"* (DELTA-GUARD-1, log §22). `compareRuns`
   (`lib/scoring/score-reliability.ts`) requires strict equality of
   `composite_version`, `inputs_used`, the engine set, and total responses —
   and `rescore-run.ts` can retroactively rewrite an already-completed run's
   `details_json` (a late web-audit landing the `technical` component), so
   two nominally-consecutive runs routinely fail that check for reasons that
   have nothing to do with the recommendation.
2. **It is not attributable even when it is comparable.** `presence` moves
   with *every* prompt, not just the ones this card cited; any other card
   that resolved in the same window, competitor movement, and ordinary LLM
   non-determinism all land in the same number. A card could show "your
   presence went up" while its own prompt regressed, or the reverse — both
   readings would be presented as if this action caused them. Unsupported
   causality is exactly what CLAUDE.md's "no fake metrics" already forbids,
   whether the underlying number is real or invented.
3. **It contradicts SCORE-WINDOW-1 (ADR 0036).** The headline the user
   already sees is the median of the last 3 comparable runs, not one run's
   score. A run-vs-run delta on this screen would be a second, different
   answer to "how much did your score move" sitting next to the first.

## Decision

**Verify the specific mutation the promise assumed, on the exact prompts the
card cited, in the run that confirmed it gone.** This is an observation over
a fixed, small set of rows — not an inference over a population — so it needs
no confidence band and no sample-size floor; a single checked prompt is a
complete, honest answer to "did this happen".

### 1. What "the promise" is, reused verbatim

`lib/scoring/run-scoring.ts` already maps each quantifiable recommendation
type to the one mutation its counterfactual assumes
(`getRecommendationPotentialKind`, unchanged from ADR 0017): `presence`,
`prominence`, or `authority`. `lib/recommendations/prediction-verification.ts`
reads the SAME map — never a second, independently-maintained one — so the
promise checked here can never drift from the promise the user actually saw.

### 2. What "checking it happened" means per kind

Not the counterfactual's optimistic ceiling (`position: 1`, the best
possible rank) — a realistic, narrow check against the SAME evidence that
generated the card:

| Kind | Check on the confirming run's row |
|---|---|
| `presence` | `brand_mentioned === true` |
| `prominence` | `brand_mentioned === true` **and** none of the specific competitor(s) named in this card's own evidence (`evidence_json.affected_prompt_details[].competitors`) still ranks strictly ahead of the brand |
| `authority` | the row is from a grounded provider (`GROUNDED_PROVIDERS`, ADR 0012) **and** carries an own-domain grounding citation (`hasOwnDomainCitation`, ADR 0013) |

`prominence` deliberately does not require position 1 — that was always the
counterfactual's best-case ceiling, not a realistic bar, and holding a real
scan to it would make the feature report "not fulfilled" almost every time
it actually helped.

### 3. Crossing runs correctly

`evidence_json.affected_prompt_details[].id` is `scan_prompt_results.id` — a
fresh row every run (RECS-DEDUPE-1), not the stable prompt identity. The
caller translates it via `project_prompts.id` (`scan_prompt_results.prompt_id`,
queried scoped to the card's own `run_id` and `project_id`) before looking up
the corresponding row in the confirming run. A prompt deleted since
(`prompt_id` nulled by `on delete set null`) fails closed to "no verdict" —
never assumed.

### 4. No score-shaped output, ever

The result is a count — "fulfilled in N of M cited prompts" — never a point
figure, never a percentage framed as a probability, never compared to the
original "hasta +X pt" ceiling. `docs/adr/0017`'s number and this verdict
answer different questions ("what's the best case" vs. "did the best case's
specific claim hold") and are never presented as two readings of the same
thing.

### 5. Degrades honestly, and silently

No verdict — nothing rendered, not a placeholder — when: the type isn't
quantifiable (no entry in the shared map); the row has no confirming run yet
(a `dismissed` card, which never receives `resolved_in_run_id` — see
"Deferred" below); a cited prompt's id doesn't translate; or the confirming
run has no matching row for that prompt. A history row with nothing to show
says nothing, matching this codebase's established tri-state discipline for
"never measured" (`.claude/rules/web-audit.md`).

### 6. Copy is observational and dated, never a permanent claim

"En el escaneo que lo confirmó, la IA te nombró en..." — never "ya
apareces". The next scan's ordinary non-determinism can revert a mention;
the verdict describes what one specific scan found, not a state the product
is asserting still holds.

## Ownership and scoping (data-guardian)

Pure read, no migration, no RLS change. `recommendations.run_id` and
`resolved_in_run_id` carry composite FKs to `scan_runs(id, project_id)`
(0010) making cross-project access structurally impossible through them.
`evidence_json.affected_prompt_details[].id` (unconstrained jsonb) is the one
weak point — every query against it carries an explicit `project_id` **and**
`run_id`/`resolved_in_run_id` filter and runs under the requesting user's
Supabase client (RLS as the second line), the same pattern already
established by the coverage-overlay join
(`lib/recommendations/coverage-overlay.ts`, AUDIT-RECS-JOIN-1). No new
column: the promise is derivable on demand from immutable
`scan_prompt_results` rows (nothing rewrites them after a run completes —
`rescore-run.ts` only ever touches `run_scores`), so nothing needs freezing.

## Deferred (own Task Intake, not this phase)

- **`dismissed` rows never get a verdict.** `dismissRecommendationCore`
  writes only `status='dismissed'`; `resolved_in_run_id` stays null forever,
  so there is no confirming run to check against, and
  `computeRecommendationTransition` already excludes dismissed rows from
  resolution tracking — a dismissed card's gap can keep recurring in every
  future scan with nothing telling the user. RECS-LOOP-1 Fase B.
- **A live durability bug, independent of this phase:** the scan finalize's
  `recommendations` delete for the run being finalized
  (`lib/scan/executor.ts`) has no error capture, and a finalize retry
  (ADR 0037's lease/retry design) after a user has dismissed a card from that
  run silently reverts the dismissal. Flagged to the founder; not fixed here.

## Consequences

- No schema migration, no RLS policy change.
- Extra read cost on the "Resueltas" tab only: up to two batched
  `scan_prompt_results` queries across the run ids already referenced by that
  page's existing 30-row history query — bounded, not per-row.
- `evidence_json.affected_prompt_details[].competitors` becomes load-bearing
  for a second purpose (prominence verification, not just original-evidence
  display) for `increase_brand_prominence` cards specifically.

## Addendum (2026-08-28) — both "Deferred" items closed, one corrected

**"A live durability bug" was not live.** Re-investigated by `data-guardian`
before RECS-LOOP-1 Fase B, with the specific reproduction path this ADR
implied — a finalize retry racing a user's dismissal — traced end to end.
It does not exist: `executePendingScan` returns for any terminal run before
it ever reads the `jobs` table (its own entry guard, in place since
2026-08-13, PR #394), so finalize cannot re-run against a run a user could
already have dismissed a card from. What WAS real, found in the same pass:
the delete lacked the `status='active'` scope its two neighbors already had,
and neither the delete nor the insert checked its error — a latent hazard
(safe only by depending on an unrelated guard) plus a live-but-different bug
(an unchecked failure could silently duplicate or zero out a run's
recommendations). Fixed as RECS-FINALIZE-DURABILITY-1 regardless of the
original claim being wrong (log §188) — this correction exists so a future
session reads this ADR's original "Deferred" line as superseded, not as
still-open.

**`dismissed` rows now get a verdict — RECS-LOOP-1 Fase B (log §189).** Not
via `resolved_in_run_id` (still never written for a dismissed row, and
still correctly excluded from `resolvedDedupeKeys`) — via a second anchor
mechanism, `lib/recommendations/dismissal-recurrence.ts`: the first
completed run after the dismissal, checking whether the gap's `dedupe_key`
reappeared. Same "pin once" shape as §54 above (Fase A never re-checks a
resolved row either), same fail-closed guard shape as §5 (an anchor run with
zero recommendation rows is indistinguishable from a persistence failure,
so it stays "no verdict" rather than reading as "the gap is gone"). See
`.claude/rules/recommendations.md` "Verificación de la predicción" for the
full mechanism and the copy rules (never "en el escaneo que lo confirmó" for
a dismissed row — nothing was confirmed by a manual click).

The methodology question Fase B actually turned on was not "does dismissal
deserve a verdict" but a concrete product asymmetry
`recommendation-history.ts:42` already encoded: a gap that resolves without
the "Marcar como hecho" button counts as a win; the same gap resolved BY the
button never did. `RecommendationToVerify.resolvedInRunId` renamed to
`anchorRunId` (pure rename, `verifyRecommendationPredictions` itself
unchanged) since the field now serves both callers and the old name would
misdescribe the second one.
