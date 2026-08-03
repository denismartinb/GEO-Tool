# ADR 0025 — A brand is not a string: identity aliases

**Status:** Accepted
**Date:** 2026-08-02
**Deciders:** Founder (approved the migration and automatic derivation) + Director
**Relates to:** ADR 0021 (verified mention), ADR 0020/0022 (grounded + persisted business profile), ADR 0024 (reliability layer), `docs/geo-score-variability-2026-08.md`

---

## Context

The founder reported a 44-point GEO Score jump between two scans with no user
action. ADR 0024 addressed the presentation of that jump; this ADR addresses
its cause.

The project's brand string is `Mozilla`. `verifyMention` (ADR 0021) accepts a
mention only when the extractor's `display_name_found` plausibly names that
string, and `namesPlausiblyMatch("Firefox", "Mozilla")` is `false`.

Run against the verifier with the founder's three real responses:

```
[ChatGPT] 1 línea con "Mozilla": "…la última actualización del navegador de Mozilla"
          (5 líneas hablan de Firefox SIN nombrar a Mozilla)
[Gemini ] 2 líneas: "Firefox Focus: Desarrollado por Mozilla…" / "Mozilla Firefox: …"
[Claude ] 1 línea: "…desarrollado por Mozilla, una organización sin ánimo de lucro."
```

In all three, the recommended entity is **Firefox**; "Mozilla" appears only as
incidental parent-company attribution in a subordinate clause. Remove that
attribution and all three become non-mentions — the same reality scoring 74 or
0 depending on whether the model happened to write the parent company's name.

This is not Mozilla-specific. It affects every brand whose product is better
known than the company: Inditex/Zara, Meta/Instagram, Alphabet/Google,
Mahou/San Miguel.

## Decision

### 1. `projects.brand_aliases text[]`, snapshotted per scan

Migration `0023`. Alongside it, `scan_prompt_results.brand_aliases_snapshot`,
frozen at scan time exactly like the existing `brand_snapshot` /
`competitors_snapshot` (migration 0001).

Persisted scores are never recomputed for historical runs (ADR 0021), so
adding an alias cannot rewrite an old score. The snapshot exists for a
different reason: without it, a scan taken before an alias was added and one
taken after are **indistinguishable from a real change in visibility** — the
product would be manufacturing exactly the unexplained jump this whole phase
exists to eliminate.

A DB-level `check` bounds the list at **25 aliases**, enforced in the schema
so no future write path can bypass it.

The count is all the database enforces. The first version of that constraint
also bounded each element's length via `(select max(length(a)) from
unnest(brand_aliases) as a)`, which Postgres rejects: *"cannot use subquery in
check constraint"* (SQLSTATE 0A000) — found when the founder applied the
migration by hand. There is no subquery-free, provably IMMUTABLE builtin for
"longest element of a `text[]`", and a custom IMMUTABLE wrapper would add a
schema object whose later redefinition stops being re-validated against
existing rows. The per-alias length cap (`MAX_ALIAS_LENGTH = 120`) therefore
lives only in `lib/projects/brand-aliases.ts`. Accepted reduction in
enforcement: a direct SQL write could store one very long alias; the bound
that actually protects matching cost — how many aliases exist — stays in the
database.

### 2. `verifyMention` matches a SET of names

`realNames` replaces `realName`. The claim must plausibly name **one** of the
brand's known names. Check (b) of ADR 0021 — the claimed text must actually
appear in the raw response — is **unchanged**, so an alias can never
manufacture a mention out of text that isn't there. Competitors pass a
single-element set: aliases are a brand-level concept.

### 3. Automatic derivation, propose-then-dispose

Founder decision: aliases are derived automatically at project creation, not
left to a manual step — a brand like Mozilla is mis-measured from its very
first scan otherwise.

The danger here is the mirror image of the bug being fixed. ADR 0021 exists
because mentions were being *fabricated*; aliases deliberately loosen that
check. So the model never writes directly into something that moves the score:

- `inferBrandAliases` (`lib/llm/gemini.ts`) **proposes**, reading only the
  supplied homepage evidence. Deliberately ungrounded — recall is precisely
  what produces plausible-but-wrong aliases, and they would be discarded
  anyway.
- `selectVerifiableAliases` (`lib/projects/brand-aliases.ts`) **disposes**:
  every alias must appear in the brand's own homepage evidence, be ≥4
  characters, not be a generic category word, not duplicate the brand string,
  and fit the cap. All pure, all unit-tested without a live LLM.

The ≥4-character bar matters because `namesPlausiblyMatch` accepts substring
matches in *either* direction: a 2–3 character alias would match inside a
large fraction of unrelated words.

That same bidirectionality is why an alias **containing** the brand is
rejected as redundant, not just one the brand contains. Missed in the first
version and caught on the first real derivation: mozilla.org produced fourteen
aliases, seven of which — "Mozilla VPN", "Mozilla Monitor", "Mozilla.ai",
"Mozilla Ventures", "Mozilla Advertising", "Mozilla Builders", "Mozilla New
Products" — already matched through "Mozilla" itself and could never change a
verdict. They crowded out the ones that carry the information the whole phase
exists for (Firefox, Thunderbird, MDN Plus) and cost a comparison each, per
entity, per prompt.

The rule extends to aliases already covered by an *accepted alias*, not just
by the brand: once "Firefox" is in the set, "Firefox Relay" and "Firefox
Focus" match through it and cannot change a verdict either. Run over the real
mozilla.org list, the two rules together take 13 aliases down to 5 — Firefox,
MDN Plus, Thunderbird, Solo 0DIN, Tabstack — with nothing lost, since every
dropped name still matches through one that stayed. This check runs last, after
evidence and duplicates, so a hallucinated or repeated alias is still reported
as such instead of being masked as redundant.

## Consequences

**Positive.** A brand is measured by what it is actually called. The Mozilla
case is covered by a regression test using the founder's real response text.
Derivation failures degrade to `[]` — today's exact behavior — and never block
project creation or a scan.

**Accepted risk, stated plainly.** The generic-word denylist is a heuristic
and is **knowingly incomplete**; "generic" is contextual (a browser company
must not alias "browser"; a company named Browser Inc. might). There is a test
recording a case that slips through, so the gap is visible rather than
discovered in production. The real safety properties are evidence-verification
and the length bar; the denylist only catches common category nouns those two
would let through.

**Correction (2026-08-03).** The first version of this section claimed the
mitigation was that "`brand_aliases` is ordinary user-editable project data,
not an invisible internal". **That was false when written and is still false.**
There is no UI: aliases are derived, persisted, snapshotted and used to score,
and the only way to inspect or change them is a direct SQL query. A bad alias —
precisely the case the incomplete denylist lets through — moves the score with
no way for the owner to see it or remove it. The risk above is therefore
**unmitigated**, not mitigated, and this ADR should not have been written as if
it were.

What actually keeps it small today is narrower and worth naming honestly:
derivation only accepts aliases that appear verbatim in the brand's own
homepage evidence, so a wrong alias has to be a real string on the brand's own
site. That bounds the damage; it does not make it visible.

The missing surface (**Fase −1c**, not in this change): view a project's
aliases and where each came from, add and remove them by hand, and explain in
the mention-evidence panel *which* name matched — today that panel shows the
quote but never says the mention counted because it matched "Firefox" rather
than "Mozilla".

**Lazy derivation for existing projects (1b, founder-approved 2026-08-02).**
Creation-time derivation alone would leave every pre-existing project at
`'{}'` — including the founder's own Mozilla project, the one that surfaced
the bug. `ensureBrandAliasesDerived` (`lib/projects/ensure-brand-aliases.ts`)
derives on first scan, with two deliberate choices:

- **`brand_aliases_derived_at` (migration 0024)** distinguishes "never
  derived" from "derived, and the answer was none". The second is the common
  case; without the stamp, every scan of every alias-less brand would re-fetch
  its homepage and re-call Gemini forever to rediscover nothing.
- **It runs at scan LAUNCH, not inside `executePendingScan`.** The executor
  shares a ~60s Vercel budget across every prompt's LLM call (ADR 0003);
  spending part of it on a homepage fetch plus a Gemini call could push a full
  run past its ceiling. Launch is a separate request.

It never throws and never blocks a scan: on failure the run is scored without
aliases (today's behavior) and `derived_at` stays null so the next scan
retries, rather than caching a failure as "this brand has no aliases".

Still no backfill of historical `run_scores`/`scan_prompt_results`, consistent
with ADR 0018/0021 — a project's existing scans keep the numbers they were
computed with, and the corrected measurement starts from its next scan.
