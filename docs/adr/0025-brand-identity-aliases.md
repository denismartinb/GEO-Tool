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

A DB-level `check` bounds the list at 25 aliases of ≤120 chars, enforced in
the schema rather than only in application code so no future write path can
bypass it.

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
would let through. Mitigation is that `brand_aliases` is ordinary
user-editable project data, not an invisible internal.

**Not covered here.** Existing projects keep `brand_aliases = '{}'` until
derived — there is no backfill, consistent with ADR 0018/0021. An existing
project's aliases are not yet derived on any path other than creation; a
lazy compute-and-cache on first scan (mirroring `business_profile` in ADR
0022) is the natural follow-up and is **not** in this change.
