# ADR 0013 — Own-Domain citation_score (require a brand-domain citation match)

**Status:** Accepted
**Date:** 2026-06-18
**Deciders:** Founder + GEO Strategy Specialist

---

## Context

`citation_score` (and the `authority` component of `geo_score`, ADR 0008)
measured **any real grounding citation present**, computed only over
grounded-provider rows since docs/adr/0012-grounding-aware-citation-score.md.
It did not check *whose* domain was cited. A prompt where the AI grounds its
answer entirely on a competitor's site, or an unrelated third party, still
counted as `citation_found: true` and pushed `citation_score` up — even
though the brand earned zero authority from that citation.

This produced a real, confusing contradiction surfaced by the founder on a
production run: `citation_score` (labelled "Autoridad" in the dashboard)
showed 100%, while `own_citation_share` ("Cuota de Citas", docs/adr/0010)
showed 0% on the same run. Both numbers were individually correct under
their own definitions, but the discrepancy looked like a bug: "how can the
AI cite sources in every prompt, yet none of those sources be mine?" The
answer was that `citation_score` was never checking domain ownership in the
first place — ADR 0010's own Context section had actually mis-described
`citation_score` as if it already did this check (corrected in this ADR's
companion edit to ADR 0010).

`own_citation_share` already solved the *aggregate* version of this problem
("what fraction of all cited URLs are mine") by domain-matching against
`projects.domain`. This ADR applies the same domain-match logic to
`citation_score`'s *presence* definition ("in what fraction of prompts did
the AI cite my domain").

---

## Decision

Redefine `citation_score` — and the `authority` component of `geo_score` — to
require a grounding citation whose domain exactly matches, or is a subdomain
of, the project's own domain (`projects.domain`), mirroring the domain-match
rule already established by `own_citation_share` (docs/adr/0010):

```
groundedResults = results.filter(isGroundedRow)              // docs/adr/0012
ownDomainCitationCount = groundedResults.filter(row =>
  row.extracted_json.citations.some(c =>
    c.source === "grounding" && c.domain && isSameOrSubdomain(normalize(c.domain), projectDomain)
  )
).length
citation_score = groundedResults.length > 0 && projectDomain
  ? (ownDomainCitationCount / groundedResults.length) * 100
  : 0   // with citation_score_data_available: false (same "0 + flag" pattern as ADR 0012)
```

Only `source === "grounding"` citations count, never `source === "inline"` —
same scope restriction as `own_citation_share` and the original
`citation_found` invariant (docs/adr/0004).

`computeRunScoresFromResults` now takes the project's domain as a required
second parameter (previously it took only the results array), since the
domain match cannot be computed without it. The one production call site
(`lib/scan/executor.ts`) already has `project.domain` in scope.

### Demoted formulas, kept for comparison

The two formulas this ADR replaces as the *official* KPI are not deleted —
they remain in `details_json` for transparency and debugging:

- `citation_score_any_domain`: grounded-provider rows with **any** grounding
  citation, regardless of domain (the official formula introduced by ADR
  0012, immediately before this phase).
- `citation_score_blended`: all rows including ungrounded providers, any
  domain (the original pre-0012 formula).

`own_domain_citation_count` is added alongside the existing
`citation_found_count` so the numerator of each formula is independently
inspectable.

### The "no domain" edge case: 0 + a flag, not a crash

`citation_score_data_available` (introduced by ADR 0012) is broadened to
also require a non-empty project domain: `groundedTotal > 0 &&
projectDomainNormalized.length > 0`. In practice `projects.domain` is a
required, non-null column (set during onboarding), so this branch is mostly
a defensive guard rather than an expected runtime state — but it reuses the
existing flag rather than introducing a second one, keeping the "0 is
ambiguous by design, check the flag" contract from ADR 0012 intact.

### `SCORING_VERSION`

Bumped from `"phase7-grounded-citation-score-v1"` to
`"phase8-own-domain-citation-score-v1"`, same versioning pattern as ADR 0012.

---

## Consequences

- `citation_score` and `authority` now require the brand's own domain to be
  cited, not just any source. Most brands will see this score **drop**
  relative to the pre-0013 value, since "any citation present" is a much
  looser bar than "my domain was the citation." This is the intended fix,
  not a regression — the old number was systematically overstating brand
  authority whenever the AI grounded its answer on someone else's site.
- The "Autoridad 100% / Cuota de Citas 0%" contradiction is resolved: both
  metrics now agree in spirit (own-domain-only), though they remain
  numerically distinct by design (presence rate vs. share of total — see the
  corrected docs/adr/0010 Consequences section).
- No schema migration: `citation_score` stays the same `numeric(5,2) not
  null` column: only its computation changes.
- No backfill: runs scored before this change keep their old (any-domain)
  `citation_score` value in `run_scores`. Trend sparklines spanning the
  cutover may show a drop — expected, reflects a metric definition change,
  same precedent as ADR 0005/0008/0011/0012.
- `lib/recommendations/recommendation-engine.ts`'s existing Spanish copy
  ("Las respuestas de IA rara vez citan tu marca o tu dominio") already
  matches the new, stricter definition better than it matched the old one —
  no copy change needed.
- `computeRunScoresFromResults`'s signature changed (new required
  `projectDomain` parameter); the test suite
  (`lib/scoring/run-scoring.test.ts`) was updated accordingly, including new
  cases that directly exercise the own-domain-vs-any-domain distinction.
