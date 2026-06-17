# ADR 0012 — Grounding-Aware citation_score (exclude ungrounded providers)

**Status:** Accepted
**Date:** 2026-06-17
**Deciders:** Founder + GEO Strategy Specialist

---

## Context

Multi-engine execution (migration `0009_scan_result_multi_provider.sql`, PR
#114) added Claude as a second provider alongside Gemini, fanning each prompt
out to one call per active engine and writing one `scan_prompt_results` row
per provider. `computeRunScoresFromResults` (`lib/scoring/run-scoring.ts`)
pools all rows from a run regardless of provider when computing every metric,
including `citation_score`.

Only Gemini's generation call uses Google Search grounding
(`docs/adr/0004-gemini-search-grounding.md`). Claude's
`generateClaudeVisibilityAnswer` (`lib/llm/claude.ts`) explicitly does **not**
enable web search/grounding — its own doc comment states "groundingChunks
will always be absent, meaning citation_found / citations_count remain 0 for
Claude-backed scans. This is honest — no fake citations." That is correct
behavior for Claude in isolation, but it has a structural consequence once
Claude's rows are pooled with Gemini's in the same `citation_score`
denominator: **Claude rows can only ever contribute a 0 to the numerator,
never a citation_found:true**, regardless of how good or bad real citation
performance is. With `MAX_REAL_SCAN_PROMPTS = 10` and 2 active engines (20
rows per run, 10 from each provider), pooling imposes a hard ceiling of 50%
on `citation_score` even in a hypothetical run where Gemini is cited on every
single prompt.

This was surfaced by a real production run on the Ikea project (run
`9f24b517-44bb-400e-ac05-fe594687062d`, a 10-prompt run after
`MAX_REAL_SCAN_PROMPTS` was raised to 10): Claude showed a 100% mention rate
vs Gemini's 30%, confirmed via SQL to be genuine model behavior (no timeouts,
both engines completed 10/10 cleanly), which prompted a full methodology
review. The review found the same pooling problem is most severe for
`citation_score` (a hard ceiling, unrelated to real citation performance),
present but less severe for `visibility_score` (dilution, not a structural
ceiling — both providers can genuinely mention the brand), and a real risk
for `competitor_gap_score` / `standing` (an ungrounded provider's mention
behavior can mask real competitive displacement happening on the grounded
provider). This ADR addresses `citation_score` and the `authority` component
of `geo_score` (ADR 0008) only — `visibility_score` and `competitor_gap_score`
remain pooled, per-engine breakdown for those is tracked as a follow-up, not
implemented here.

`citationShareResult` ("Cuota de Citas", ADR 0010,
`app/dashboard/projects/[projectId]/page.tsx`) already filters
`cit.source === "grounding"` when building its citation list — it was already
correctly grounding-aware and required no change.

---

## Decision

Introduce a `GROUNDED_PROVIDERS` set (currently `{"gemini"}`) and compute
`citation_score` — and the `authority` component of `geo_score` — only over
`scan_prompt_results` rows from providers in that set:

```
groundedResults = results.filter(row => !row.provider || GROUNDED_PROVIDERS.has(row.provider))
citation_score = groundedResults.length > 0
  ? (groundedResults.filter(r => r.citation_found).length / groundedResults.length) * 100
  : 0   // with citation_score_data_available: false (see below)
```

A row with `provider` unset (`null`/absent) is treated as **grounded**, for
backward compatibility with pre-multi-engine data and existing tests, which
predate the `provider` column and were always single-engine Gemini.

The old pooled formula (all providers, including ungrounded ones) is kept as
`citation_score_blended` in `details_json`, for transparency/comparison only
— it is not used for the official `citation_score` KPI or `geo_score`.

A new `provider` per-breakdown, `citation_by_provider`, is also added to
`details_json` (`{ [provider]: { total, citation_found_count } }`) so a run
detail view can show "Gemini: 3/10 cited, Claude: not applicable (no
grounding)" if a future UI pass wants it — not built in this ADR.

### The "no grounded rows" edge case: 0 + a flag, not `null`

`run_scores.citation_score` is `numeric(5,2) not null default 0`
(`supabase/migrations/0001_v0_schema.sql`). Returning a literal `null` would
require a schema migration, which is forbidden without separate explicit
founder approval and out of scope for this fix. Instead, when a run has zero
grounded rows (e.g. only Claude is active, or Gemini's calls all failed),
`citation_score` is written as `0` and `details_json.citation_score_data_available`
is set to `false`. Any reader that wants to distinguish "genuinely 0% cited"
from "no citation-capable data this run" must check that flag — the `0`
alone is ambiguous by design (DB constraint), the flag is not.

### `authority` component of `geo_score` (ADR 0008)

When `citation_score_data_available` is `false`, the `authority` component is
dropped from the composite exactly like `prominence` already is when
`brand_position` is absent:

```
components.authority = { value: null, weight: 0, reason: "no grounded (citation-capable) provider rows in this run (docs/adr/0012)" }
```

`authority` is removed from `inputs_used`, the remaining components'
weights are renormalized, and `geoScore.confidence` is capped at `medium` if
it would otherwise be `high` — mirroring the existing `droppedProminence`
rule, now generalized to `droppedProminence || droppedAuthority`.

### `SCORING_VERSION`

Bumped from `"phase6-extraction-scoring-v1"` to
`"phase7-grounded-citation-score-v1"` so historical runs (scored under the
pooled formula) remain distinguishable from runs scored under this fix —
same pattern as `EXTRACTION_VERSION` / `PROMPT_VERSION` in
`lib/scan/constants.ts`.

---

## Consequences

- `citation_score` (and `authority`) now reflect genuine grounded-citation
  performance instead of being structurally capped by the fraction of
  ungrounded-provider rows in the pool. A project where Gemini cites well
  will see this in `citation_score` even while Claude is active and
  contributes 0 by construction.
- No schema migration: `citation_score` stays `numeric(5,2) not null`. The
  "no data" case is signaled via `details_json.citation_score_data_available`
  rather than a true `null`, an explicit deviation from the originally
  suggested fix (literal `null`) made to respect the existing NOT NULL
  constraint without a separate migration-approval round.
- No backfill: runs scored before this change keep their old (pooled)
  `citation_score` value in `run_scores`, consistent with how ADR 0005, 0008
  and 0011 handled prior formula/versioning changes. Trend sparklines that
  span the cutover may show a jump from the old pooled value to the new
  grounded-only value — expected, reflects a metric definition change.
- `lib/recommendations/recommendation-engine.ts` consumes `citation_score` as
  a plain 0-100 number with `< 50` / `< 20` thresholds; no change needed
  there — the field's type and range are unchanged, only its computation is.
- `app/dashboard/projects/[projectId]/page.tsx`'s composite breakdown UI
  already renders any `geo_score.components.*` entry generically, checking
  `value === null || value === undefined` and showing "No disponible para
  este escaneo" (the same code path already used for `prominence`) — no UI
  change was required for `authority` to degrade gracefully.
- Explicitly out of scope for this ADR (tracked as follow-up, not done
  here): `visibility_score` dilution and `competitor_gap_score` / `standing`
  risk-masking from pooling grounded and ungrounded providers. If a future
  run shows those signals are materially distorted in practice, they should
  get the same per-engine treatment, likely exposed as parallel `*_blended`
  / per-provider fields rather than changing the pooled definition outright,
  to preserve "higher engine count = more signal" for those two metrics
  where pooling is not structurally wrong, only a coarser signal.
- Adding a new provider with real grounding in the future means adding it to
  `GROUNDED_PROVIDERS` in `lib/scoring/run-scoring.ts` — a one-line, explicit
  decision point rather than an implicit default.
