# ADR 0021 — Verified brand/competitor mention (MENTION-VERIFY-1)

**Status:** Accepted
**Date:** 2026-07-25 (amended 2026-07-30 — see "Follow-up" below)
**Deciders:** Founder (approved MENTION-VERIFY-1 Task Intake) + Director

---

## Context

The founder tested `genscore.es` (a brand-new product with essentially zero
online footprint) and got a "% de mención" (`visibility_score`) of 23% when
the true value should have been 0% — the brand is never genuinely mentioned
in any of the AI responses collected. Inspecting the "Evidencias de
mención" panel for one ChatGPT response showed the fabricated nature
directly: the persisted evidence was a generic sentence about "brand
performance analysis with AI" that never contains the string "GenScore" at
all, yet `brand.mentioned` was persisted as `true`.

Root cause, confirmed by reading all three structured-extraction call
sites (`extractGeminiStructuredData` in `lib/llm/gemini.ts`,
`extractClaudeStructuredData` in `lib/llm/claude.ts`,
`extractOpenAIStructuredData` in `lib/llm/openai.ts`): all three share the
same `schemaInstruction` shape asking for `"mentioned": boolean` and
`"evidence": string[]`, but **none of them ever instructed the model that
"mentioned" must be based on the entity's name genuinely appearing as text
in the response** — nor that "evidence" must be a verbatim quote of that
response. Nothing downstream (`lib/scan/extraction.ts`) verified the
claim either; whatever the extraction model returned was persisted as-is.

For a brand whose name reads as a generic description of its own product
category ("GenScore" — "a generated score"), an extraction model asked to
judge "is this response about GenScore" can conflate topical/semantic
relevance ("this response describes analyzing brand performance with AI,
which is what GenScore does") with an actual textual mention, and then
fabricates a plausible-looking "evidence" quote to match. This is not
brand-specific noise — the same defect exists identically for
`competitors[].mentioned` at the same three call sites, since they share
one prompt shape.

**Blast radius.** `brand_mentioned` (and `mentioned_competitors_count`)
feed `visibility_score`, `standing` (share of voice), `competitor_gap_score`
and the `geo_score` composite (`lib/scoring/run-scoring.ts`) — this is not
a display-only bug, it silently mis-scores the product's core KPI.

## Decision

**Layer 1 — deterministic post-extraction verification (the actual fix).**
New `verifyExtractedMentions(data, rawResponseText)` in
`lib/scan/extraction.ts`, run on every extraction result **before**
`reconcileExtractedCompetitors` (ADR 0018): for the brand and every
competitor, if `mentioned: true`, the model's own `display_name_found` claim
must be non-empty and must appear as a substring of the raw response text
(case-insensitive, diacritic-insensitive, whitespace-collapsed). If not, the
entity is downgraded to an explicit non-mention
(`{ mentioned: false, display_name_found: null, evidence: [], position:
null }`).

Checking the model's own claimed `display_name_found` — rather than
requiring the canonical tracked/brand name verbatim — still tolerates
genuine spelling/capitalization/abbreviation variants (e.g. "IBERIA" vs
"Iberia Líneas Aéreas") while catching a fabricated mention, since a
hallucinating model has nothing real to put in that field either.

Running this **before** reconciliation means the existing position
re-densification logic in `reconcileExtractedCompetitors` — which already
treats `mentioned`/`position` as the source of truth for ranking — handles
re-ranking a downgraded mention automatically, with zero duplicated logic.

**Schema change (not a DB migration):** `extractionCompetitorSchema`
(`lib/extraction/schema.ts`) gained `display_name_found: string | null`,
mirroring the field brand already had — competitors need the same
verifiable claim brand-only verification would otherwise lack. This is a
JSON-shape change to the flexible `extracted_json` column, not a Supabase
schema/RLS migration; `.default(null)` keeps older persisted rows parsing.

**Layer 2 — hardened prompts, defense in depth (not the primary fix).** All
three providers' `schemaInstruction` now explicitly state: "mentioned" must
be based on the entity's name (or an unambiguous variant) genuinely
appearing as text — never on topical/category relevance; "display_name_found"
must be an exact, character-for-character substring of the response, used to
justify `mentioned: true`; "evidence" must be verbatim quotes, never
paraphrased. This reduces how often Layer 1 needs to downgrade anything, and
improves the quality of evidence shown in the UI even when a mention is
genuine.

**Version bump, reusing the existing gate.** `EXTRACTION_VERSION`
(`lib/scan/constants.ts`) bumped `"tracked-set-v1"` → `"verified-mention-v1"`.
`hasUntrustedCompetitorSet` (`lib/scoring/run-scoring.ts`) was already a
general "does any row in this run predate the current extraction pipeline
version" check, not something specific to ADR 0018's concern — bumping the
version constant means it now ALSO drops `prominence`/`standing`/
`geo_score` confidence to null for any run containing a pre-this-fix row,
for free, with no new run-scoring code. Its docstring and the two `reason:`
strings in `geoScore.components` were generalized to name both ADRs instead
of only 0018.

### Considered and rejected: nulling `visibility_score`/`competitor_gap_score` too

The original Task Intake proposed extending the null-gate to the top-level
`visibility_score`/`competitor_gap_score` fields as well (both currently
typed as plain `number`, never `null`, and consumed directly by 8+ files:
Overview, runs pages, weekly digest, score alerts, the recommendation
engine). Implementing that would mean making those fields nullable
end-to-end — a much larger ripple than `standing`/`prominence`, which live
entirely inside the already-nullable `details_json.geo_score.components`
object.

Rejected as disproportionate once the actual trigger scenario was
understood: `computeRunScoresFromResults` only ever runs once, immediately
after extraction, inside the same scan execution (`lib/scan/executor.ts`)
— it is never re-invoked against historically-persisted `run_scores` rows.
So the gate would only ever matter for the narrow edge case of a single run
whose rows straddle a version-bump deploy (e.g. a partial retry
re-extracting only the failed subset of a run's prompts after this fix
shipped). Every brand-new scan already gets a correctly-verified
`brand_mentioned` at write time via Layer 1 regardless of any run-scoring
gate — which is what actually fixes the founder's reported number. ADR 0018
itself drew this same boundary (it never touched `visibility_score`/
`competitor_gap_score` either, only `prominence`/`standing`), so this
decision is also consistent with that precedent rather than a new one-off
judgment call.

### Explicitly out of scope

- **No backfill (MENTION-VERIFY-2).** Historical `run_scores`/
  `scan_prompt_results` rows keep whatever unverified value they were
  computed with. Same reasoning ADR 0018 used for SCAN-TRACKED-SET-2.
- **No change to `generateAddedPrompts`** or any other Gemini call —
  scoped strictly to the three structured-extraction functions and their
  shared downstream pipeline.

## Follow-up (2026-07-30) — substring-of-raw-text alone was not enough

The founder smoke-tested the preview immediately after the first version of
this fix shipped and reproduced the same 23%-style inflation on a different
prompt: `visibility_score` still counted a mention that never named
"GenScore". The "Evidencias de mención" panel showed why — for a prompt
asking about the cost of "a service that analyzes your brand's presence in
conversational search" (a generic description of GenScore's own category,
essentially echoing the user's own question back), ChatGPT's answer only
ever talked about "tu marca" ("your brand") in the abstract. The extraction
model set `display_name_found: "tu marca"` — which genuinely IS a substring
of the raw response text, so the first version of `verifyMention` (checking
only "is the claimed text actually in the response") judged it verified and
kept `mentioned: true`.

The gap: verifying that the model's claim is *textually present* is
necessary but not sufficient — it says nothing about whether the claimed
text actually *names the entity in question*. A model can be internally
consistent (the exact phrase it points to really is in the response) while
still being wrong that the phrase constitutes a mention of the brand.

**Fix:** `verifyMention` now requires BOTH conditions before trusting
`mentioned: true`:
1. `namesPlausiblyMatch(display_name_found, realName)` — the claimed text
   must itself plausibly name the real entity (brand's actual name for
   brand rows; the competitor's own model-returned `name` for competitor
   rows), using the same tolerant token-normalization
   (`normalizeCompetitorName`) reconciliation already uses elsewhere in this
   file for accent/case/legal-symbol-insensitive name comparison. "tu marca"
   does not plausibly match "GenScore"; "GénScore" does.
2. The existing substring-of-raw-text check (unchanged) — the claimed text
   must actually appear in the response, not just resemble the brand name
   in the abstract.

Both together close the loophole: a fabricated claim fails (2); a genuine
phrase that doesn't actually name the brand fails (1). `verifyExtractedMentions`
now takes the project's real `brand` name as a parameter (threaded from
`row.brand_snapshot` in `extractAndPersistRow`) to make check (1) possible
for the brand entity.

## Consequences

**Positive.** `brand_mentioned`/`mentioned_competitors_count` — and every
metric derived from them — can no longer be inflated by a model conflating
topical relevance with an actual textual mention. The failure mode is now
caught deterministically (testable without a live LLM call) rather than
depending on prompt wording alone.

**Accepted risk.** Both checks (substring-of-raw-text and
`namesPlausiblyMatch`) are strict: if a genuine mention's
`display_name_found` differs meaningfully from how the entity actually
appears in the text (e.g. the model paraphrases instead of quoting despite
Layer 2's instruction), or is a real but distant variant
`namesPlausiblyMatch`'s substring-either-direction rule doesn't recognize,
it will be downgraded as a false negative rather than trusted. This trades
a small risk of under-counting real mentions for eliminating the observed,
more damaging failure of fabricating them — consistent with the product's
"no fake metrics" principle. Layer 2's prompt hardening is the main
mitigation for this risk; there is no backfill to fix it retroactively for
rows already downgraded.

**No historical fix.** Existing runs (like the founder's own `genscore.es`
history) keep their old, unverified numbers until a new scan runs. The
founder must re-scan to see the corrected value.
