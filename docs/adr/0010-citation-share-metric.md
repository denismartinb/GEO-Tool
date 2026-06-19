# ADR 0010 — Citation Share Metric

**Status:** Accepted  
**Date:** 2026-06-16  
**Deciders:** Founder + Gemini Pipeline Engineer

---

## Context

`citation_score` (stored in `run_scores`) measures **binary citation
presence**: the percentage of prompts where a grounding citation exists. At
the time this ADR was written, that presence check did not look at *whose*
domain was cited — any grounding citation counted, including a competitor's
or an unrelated third party's. A brand with 10/10 prompts grounded could
score 100% on `citation_score` while holding 0 of the cited domains, which is
exactly the contradiction this ADR's Citation Share metric was designed to
expose (see "Why two separate metrics" below). `citation_score` was later
redefined to require the same own-domain match described here — see
docs/adr/0013-own-domain-citation-score.md — so this historical accuracy note
is preserved for context, not because the gap still exists.

This is correct and useful as a coverage signal, but it does not reflect how
dominant the brand is among all cited sources in a run.

The founder requested a complementary metric — **Citation Share** — that
captures that dominance. The two metrics measure different things and must
coexist without one replacing the other.

---

## Decision

Add **Cuota de Citas** (Citation Share) as a second, independent citation
metric displayed in the Overview alongside (not instead of) the existing Tasa
de Cita.

### Formula

```
own_citation_share = own_citations / total_resolved_citations × 100
```

Where:
- `own_citations` = count of grounding citations (`source === "grounding"`) in
  `extracted_json.citations[]` whose `domain` (after stripping `www.`) exactly
  matches the project's `projects.domain`, or is a subdomain of it.
- `total_resolved_citations` = count of grounding citations with
  `domain !== null` across **all** `scan_prompt_results` rows of the run.
- Result: `null` when `total_resolved_citations === 0` — displayed as
  "Sin datos" to distinguish from a genuine 0% share.

### Scope

Only `source === "grounding"` citations count toward both numerator and
denominator. Inline citations (`source === "inline"`) are excluded, consistent
with the invariant established in ADR 0004: only real grounding sources count
as citation evidence.

### Implementation approach

**Computed at read time, not persisted.** The `run_scores` table has no column
for `own_citation_share`, and no migration was created (schema migrations
require explicit founder approval per the project constitution). The value is
derived in the Overview server component by iterating over `extracted_json`
from the already-fetched `scan_prompt_results` rows.

This means:
- No database change, no RLS change, no pipeline change.
- The metric is always recomputed from raw data — it cannot drift from source.
- Historical runs benefit automatically as long as their `extracted_json` was
  populated by the grounded-v1 extraction phase.

---

## Why two separate metrics

| Metric | Question answered | Failure mode avoided |
|---|---|---|
| **Tasa de Cita** (citation_score) | "In how many prompts does my domain appear as a source?" | Hides that a single citation across 10 prompts is still 100% coverage. |
| **Cuota de Citas** (own_citation_share) | "Of all grounding URLs the AI cited, what fraction are mine?" | Hides sparsity — a brand with 3/130 URLs would show 100% on the coverage metric. |

Both signals are useful; neither supersedes the other.

---

## Consequences

- `citation_score` in `run_scores` was unchanged in meaning, formula, and
  persistence **at the time of this ADR**. It was later redefined to require
  an own-domain match (docs/adr/0013-own-domain-citation-score.md), making it
  conceptually closer to (but numerically distinct from) `own_citation_share`:
  `citation_score` is "% of grounded prompts citing my domain" (a presence
  rate), `own_citation_share` is "what fraction of all cited URLs are mine"
  (a share of total). Both metrics remain independently useful and neither
  supersedes the other.
- `own_citation_share` is not persisted; trend history is not available for
  this metric.
- The "Sin datos" state (null share) is surfaced explicitly so users
  understand the absence of resolved grounding URLs rather than seeing 0%.
- If a future phase adds a `citation_share` column to `run_scores`, this ADR
  should be superseded and the read-time computation removed.
