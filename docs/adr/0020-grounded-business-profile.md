# ADR 0020 — Grounded business profile for competitor/prompt suggestion

**Status:** Accepted
**Date:** 2026-07-25
**Deciders:** Founder (approved COMPETITOR-GROUNDING-1 Task Intake) + Director

---

## Context

The onboarding wizard suggests competitors and prompts for a new domain via
`suggestCompetitors`/`suggestPrompts` (`lib/llm/gemini.ts`). Both were
domain-only, closed-book Gemini calls: the only informative input was
`brand`, itself derived from the domain string by capitalizing its label
(`deriveBrandFromDomain`, `lib/projects/project-form.ts`). Neither call
enabled `google_search` grounding.

The founder reproduced two real failures testing SME/agency-sized domains —
the actual target market, not the large brands the product had been smoke
tested against:

| Domain | Real business | Suggested competitors | What happened |
|---|---|---|---|
| `genscore.es` | GEO visibility tool | Himoinsa, Gesan, Inmesol, SDMO, Cummins | All generator/genset manufacturers — the model read "gen" → generators. |
| `ifinanciera.es` | Financial-management consultancy for SMEs | Cofidis, Vivus, Creditea, QueBueno, Wandoo | All consumer fast-loan lenders — the model read "financiera" → consumer credit. |

Neither is a wrong-competitor error; both are wrong-business errors. For a
brand present in the model's training data (IKEA, Zara) domain-only
suggestion works because the knowledge lives in the model's weights. For an
SME with no training-data footprint, the model has nothing to reason from
but the domain string's morphology, and decomposes it — the exact failure
mode the product's actual target segment (agencies, SMEs, mid-size
companies) hits every time.

The same blind inputs feed `suggestPrompts`, so the damage is not confined
to one onboarding screen: a wrong business inference contaminates the
prompt set, the first scan, and every metric derived from it (share of
voice, position, recommendations) for the segment the product is built for.

## Decision

Insert real evidence and an inspectable intermediate artifact between "user
gives a domain" and "we ask Gemini for competitors":

1. **Homepage evidence** (`lib/projects/business-profile.ts`,
   `fetchHomepageEvidence`). A single request to the project's own domain
   via the existing SSRF-hardened `fetchPageSafely`
   (`lib/web-audit/fetch-page.ts`, unmodified) — one page, no link
   discovery or traversal, so this is not a crawler. Extracts `<title>`,
   meta description, H1/H2 headings, and a capped (1500 char) excerpt of
   visible text.
2. **Business profile** (`inferBusinessProfile`, `lib/llm/gemini.ts`). A
   fast, non-grounded JSON call that turns that evidence (+ an optional
   user-supplied description) into a structured profile: what it sells,
   sector/sub-sector, business model (b2b/b2c/both/unknown), target
   customer, geographic scope, size estimate, and a `confidence` the model
   sets itself. The prompt explicitly forbids guessing from the domain
   string's spelling.
3. **Grounded competitors** (`suggestCompetitors`, rewritten). Now requires
   a `profile` and enables `google_search` grounding so competitors the
   model has no training-data knowledge of (small/regional players) can
   still be found. The prompt no longer asks for "well-known" competitors —
   it explicitly asks for comparable size/market position, regional/local
   players included, and forbids defaulting to category giants unless they
   genuinely compete for the same customers.
4. **Profile-driven prompts** (`suggestPrompts`, updated). Same profile
   context, still a fast JSON call (see API constraint below) — no reason
   for prompt generation to pay grounding latency.
5. **Honest failure** (`resolveBusinessContext`). If the homepage can't be
   fetched/has no usable content *and* no user description was given, or if
   Gemini's own profile call reports "low" confidence with nothing to
   fall back on, the orchestrator returns `"unidentified"` and the caller
   (`app/dashboard/projects/actions.ts`) skips suggestion entirely — the
   wizard falls back to its existing empty-manual-entry state rather than
   ever calling `suggestCompetitors`/`suggestPrompts` with a placeholder
   profile.

### API constraint this ran into

`google_search` grounding and `generationConfig.responseMimeType:
"application/json"` cannot be combined — the Gemini API 400s. This was
already known from `auditDomainContent`'s precedent (the only prior grounded
call). `suggestCompetitors` now uses a new `generateGroundedGeminiJson`
helper: JSON is requested via instruction text only, and the response is
parsed leniently (`parseLenientJson` strips a ```` ```json ```` fence if
present) rather than via `responseMimeType`.

### Explicitly out of scope (deferred to a follow-up phase)

- **No schema migration.** The business profile is not persisted — it's
  recomputed for each onboarding suggestion call and, if needed, once more
  in `createProject`'s fallback path (when the wizard was skipped or
  submitted empty). A persisted `projects` column would let re-suggestion,
  the post-creation "Añadir prompts" flow (`generateAddedPrompts`,
  `lib/projects/add-prompts.ts`), and future re-scans reuse it instead of
  re-deriving — that is its own phase (schema change = forbidden without
  separate founder approval per `CLAUDE.md`).
- **`generateAddedPrompts` is unchanged.** It backs both the wizard's
  "Generar N más" button and the persisted-project "Añadir prompts" screen;
  the latter has no profile to draw on without the schema work above, so
  fixing only the wizard call site would create two different quality bars
  for the same function. Left blind in this phase, tracked as a known gap.
- **No manual "describe your business" UI field.** `resolveBusinessContext`
  accepts an optional `userDescription` (exercised by
  `business-profile.test.ts`) and `createProject` already threads
  `parsedForm.value.businessDescription` (a pre-existing, previously-dead
  schema field) through to it, but no wizard input currently populates it.
  This keeps the change scoped to the inference pipeline; adding the field
  is a small, separate UI change that should go through the UX-alignment
  discipline `CLAUDE.md` requires for onboarding changes.

## Consequences

**Positive.** Competitor/prompt suggestion for SME/agency-sized domains —
the product's actual target market — now reasons from real evidence instead
of the domain string's spelling, and fails honestly (empty result, existing
manual-entry fallback) rather than fabricating a confident wrong guess.

**Latency.** The onboarding suggestion step goes from two blind parallel
Gemini calls to: homepage fetch (≤4s, `PER_PAGE_TIMEOUT_MS`) → profile
inference → competitors (grounded) + prompts (fast) in parallel. Grounded
calls are measurably slower than ungrounded ones. `export const maxDuration
= 60` was added to `app/dashboard/projects/new/page.tsx` (previously unset,
defaulting to the Vercel Hobby plan's 10s) for the same reason the scan
route needed it (ADR 0003) — this route's Server Actions
(`suggestProjectSetup`, `createProject`) now do meaningfully more I/O than
before.

**Accepted risk.** A homepage that renders content client-side only (SPA
with no server-rendered text) or blocks the fetcher's user agent yields no
evidence; `resolveBusinessContext` correctly falls back to
`"unidentified"` in that case rather than guessing, but that means some
legitimate SMEs will see the honest "couldn't suggest, add manually" state
until the manual-description UI field (noted above) ships.
