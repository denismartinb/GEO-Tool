# ADR 0018 — Reconcile extracted competitors against the tracked set

**Date:** 2026-07-24
**Status:** Accepted (Fase 1 — SCAN-TRACKED-SET-1). Backfill of historical
runs (SCAN-TRACKED-SET-2) and the `prominence` configurability problem
(§ "Deferred") are separate, not-yet-approved phases.
**Deciders:** Founder + Director (Task Intake SCAN-TRACKED-SET-1 approved
2026-07-24, methodology validated by the geo-strategy agent)

---

## Context

Founder report on a real, fresh scan (project Ikea, 2026-07-24, 5 tracked
competitors: Conforama, Leroy Merlin, Maisons du Monde, JYSK, El Corte
Inglés): the Overview's "Tu posición media" showed **1 / 21** — a
21-entity ranking against only 5 tracked competitors — and the top-5
podium was Ikea, Sklum, Brico Depôt, BANNI, Lefties Home. None of the
last four are tracked competitors.

Root cause, verified in code: `lib/scan/executor.ts` reads the project's
active `project_competitors` into `competitors_snapshot` and
`lib/scan/extraction.ts` passes their names to the structured-extraction
call (`lib/llm/gemini.ts` / `claude.ts` / `openai.ts`). The model returns a
`competitors[]` array, but nothing enforced that this array only contains
the names it was given — the prompt named them but never said "and only
these." The extractor persisted the model's output verbatim
(`extracted_json: { ...extracted.data, citations }`), so any brand the
model chose to surface under `competitors` (rather than the schema's own
`other_brands_mentioned` field, which exists precisely for this) silently
became a tracked-looking entity.

This contaminated real, scored metrics, not just display:

- **`brand_position`** (`computeBrandPosition`, `lib/scoring/
  run-scoring.ts`): a tracked competitor appears in every prompt's entity
  array, so when not mentioned it receives the not-mentioned penalty
  (`total_entities + 1`) and its `avg_position` is averaged over every
  prompt. An untracked entity only appears in the prompts where the model
  happened to mention it — it never receives that penalty, and its
  `promptCount` is smaller. Net effect: **untracked entities are
  structurally favored** in the ranking over tracked ones. This is the
  direct cause of Sklum/Brico Depôt/BANNI/Lefties Home outranking Ikea's
  own tracked competitors. `prominence` (weight .25 in geo_score) is
  derived from this ranking.
- **`mentioned_competitors_count`** → `total_competitor_mentions` →
  `standing` (share of voice, weight .20).
- **`competitor_gap_score`** ("Presión competitiva"): counts prompts where
  a competitor was mentioned but the brand wasn't — inflatable by the same
  contamination.
- The Overview's competitor table already computes "Cuota de voz en IA"
  correctly (it intersects `extracted_json.competitors` against the
  project's real `project_competitors` rows, `app/dashboard/projects/
  [projectId]/page.tsx`), while `standing` computed the same-sounding
  metric over the model's unfiltered set. **Two different numbers with the
  same name on the same screen.**

## Decision

### 1. Reconcile at persistence, not at each read site

`reconcileExtractedCompetitors` (`lib/scan/extraction.ts`) runs once,
right after the structured-extraction call, before anything is persisted:

- A tracked competitor the model returned keeps its `mentioned` /
  `evidence` / `position`, but the persisted `name` is the project's own
  canonical spelling (not whatever variant the model echoed), so later
  exact-name matching stays reliable.
- A tracked competitor the model **omitted** is materialized as
  `{mentioned: false, evidence: [], position: null}` — an explicit
  non-mention, not a silent absence. This also defends against the model
  spending its attention on other brands instead of reporting on a tracked
  one.
- Any model-returned entity **not** in the tracked list is moved into
  `other_brands_mentioned` (deduped against what the model already put
  there) — never silently dropped. That field already exists for exactly
  this (RECS-4A, "competidores emergentes") and is intentionally **not**
  capped at the model-facing prompt's "up to 5" once merged with spillover
  — only the request to the model is capped.

Rejected: filtering only at read time (in `run-scoring.ts` or in each
page). At least six independent consumers read `extracted_json.competitors`
or `mentioned_competitors_count`, three of which already reimplement the
tracked-set intersection with slightly different normalization. Filtering
at persistence fixes the invariant once; every future consumer inherits
correct data by default instead of having to remember to filter.

### 2. Positions are re-densified after reconciliation

Dropping spillover entities from the model's original dense ranking (1..N,
no gaps) leaves gaps — a tracked competitor originally ranked 9th out of 21
is internally inconsistent once only 6 entities remain. Reconciliation
re-ranks the surviving mentioned entities (brand + reconciled competitors)
1..k, preserving their relative order from the model's original positions.
Without this, `computeBrandPosition`'s per-entity average would be computed
against a `total_entities` that no longer matches the actual entity count.

### 3. Prompt hardening (defense in depth, not the fix)

All three providers' extraction prompts now say explicitly: return exactly
one entry per listed competitor (including a `mentioned: false` entry for
ones not mentioned), and never add an entry for a brand outside that list.
This reduces how often the model spends a "slot" on an untracked brand
instead of reporting an explicit non-mention for a tracked one — but a
model's compliance with a text instruction is not something a scoring
pipeline can depend on. The schema (`lib/extraction/schema.ts`) cannot
express "exactly this set" structurally either. Reconciliation in code is
the actual guarantee; the prompt only improves its input quality.

### 4. Standing must not fabricate 100 for zero tracked competitors

Reconciliation guarantees `extracted_json.competitors` is empty for a
project with no tracked competitors (nothing to reconcile against). Without
a guard, `standing = brand_mentioned_count / (brand_mentioned_count + 0)`
= 100 the moment the brand is mentioned even once — the exact
"empty-market fabricated 100" ADR 0015 eliminated for the true
zero-denominator case, reappearing through a different path. `standing` is
now forced to `null` (component dropped, weights renormalized) whenever
`brand_position.total_entities <= 1` (brand only, no tracked competitors) —
distinct from "competitors are tracked but weren't mentioned this run",
which is a real, valid 100.

### 5. Runs extracted before this fix are not trusted silently

`EXTRACTION_VERSION` bumped to `"tracked-set-v1"` (`lib/scan/constants.ts`).
`computeRunScoresFromResults` checks every row's `extraction_version`
(`ScoreInputRow.extraction_version`, now threaded through from both call
sites — `lib/scan/executor.ts` and `app/dashboard/projects/[projectId]/
page.tsx`'s RECS-POTENTIAL-1 path): if any row predates the current
version, `brand_position`, `prominence`, and `standing` are all dropped to
`null` for that run (component `reason` cites this ADR) rather than
computing them over a possibly-contaminated competitor set. Gated at the
run level, not per-row: a run's rows are extracted together right after the
scan, so a mixed-version run is rare, and averaging trustworthy with
untrustworthy rows would silently launder the old bias into a new-looking
number — worse than an honest `null`. `competitor_gap_score` is **not**
gated in this phase (see "Deferred").

## Consequences

- No schema/RLS changes. `reconcileExtractedCompetitors` operates purely
  on already-fetched/generated data before the single `update()` call that
  already existed.
- `other_brands_mentioned` can now exceed the model-facing "up to 5" limit
  once merged with spillover — intentional, documented in the field's own
  persisted shape, not a bug.
- Raw model output is never discarded: `raw_response_text` has no
  retention/purge policy anywhere in the codebase, so the pre-reconciliation
  extraction is always re-derivable if ever needed for auditing.
- **No backfill in this phase.** Existing `scan_prompt_results` /
  `run_scores` rows keep their contaminated `extracted_json.competitors`
  and already-computed `standing`/`brand_position` until SCAN-TRACKED-SET-2.
  The precedent set by ADR 0008/0013/0015 ("no backfill") does **not**
  apply here: those ADRs changed a metric's *definition*, and the old
  values remained valid computations of the *previous* definition — kept
  labeled for comparison. This bug is different: the code violated the
  definition it already documented (`standing = ... tracked competitor
  mentions`, this same file). The historical values are not "v1 of
  standing" — they are not a valid computation of anything, so they cannot
  be kept and labeled the way v1 values were. SCAN-TRACKED-SET-2 (separate
  Task Intake) will recompute them deterministically — the reconciliation
  is a pure function of two fields already persisted per row
  (`extracted_json.competitors`, `competitors_snapshot`), so no LLM calls
  are needed for the backfill itself.
- `mentioned_competitors_count`, `brand_position`, `standing`,
  `competitor_gap_score` for any run extracted before this ships remain
  exactly as unreliable as described above until that backfill runs.

## Deferred (explicitly out of scope for this phase)

- **`competitor_gap_score` ("Presión competitiva") is not gated** by
  `hasUntrustedCompetitorSet` in this phase — it's a directly-displayed KPI
  (Overview, run detail page) but not a geo_score composite component, and
  gating it would require touching rendering code outside this phase's
  approved file list. Its persisted historical values are wrong in the same
  way as `standing`'s and get fixed by the same SCAN-TRACKED-SET-2 backfill.
- **`prominence` is manipulable by the user's own competitor-list size.**
  `prominence = (1 - (p-1)/n) * 100` — the same mentioned position scores
  higher `prominence` the fewer competitors are tracked (smaller `n`), and
  lower the more are tracked. This makes the metric incentive-incompatible
  (adding competitors that are rarely mentioned inflates your own score) and
  not comparable across projects with different-sized tracked lists, nor
  comparable with itself across a founder editing their own list over time.
  Reconciliation makes this pre-existing problem more visible (it no longer
  hides behind contamination) but doesn't cause it and doesn't fix it.
  Needs its own ADR and real distribution data from multiple projects
  before a redesign — same reasoning ADR 0015 §5 used to defer recalibrating
  the 70/40 score bands.
- **Legal-suffix name matching.** `normalizeCompetitorName` (mirrors
  `normalizeEntityName`, `app/dashboard/projects/[projectId]/page.tsx`)
  strips accents/case/punctuation but not company-form suffixes — "Ikea
  S.A." (tracked) and "IKEA" (model output) do NOT match today. Not
  observed in the real Ikea case (its competitor names carry no legal
  suffixes) and out of this phase's approved scope; worth revisiting if a
  real case surfaces it.
