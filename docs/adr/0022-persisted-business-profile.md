# ADR 0022 — Persisted business profile, computed lazily (COMPETITOR-GROUNDING-2)

**Status:** Accepted
**Date:** 2026-07-30
**Deciders:** Founder (approved COMPETITOR-GROUNDING-2 Task Intake) + Director

---

## Context

COMPETITOR-GROUNDING-1 (PR #265, docs/adr/0020) fixed wrong competitor/prompt
suggestions for SME-sized domains by fetching the project's own homepage and
inferring a structured `BusinessProfile` from it before asking Gemini for
competitors/prompts. That profile is computed, used once, and discarded —
`projects` has no column for it.

This left a known, previously-declared gap: `generateAddedPrompts` (the
"Añadir prompts" post-creation flow, `lib/projects/add-prompts.ts`) has no
profile to draw on and stays exactly as blind as `suggestCompetitors`/
`suggestPrompts` were before ADR 0020 — brand/domain strings only, no real
evidence of what the business does.

## Decision

**Persist the profile as a nullable `jsonb` column, computed lazily rather
than eagerly at project creation.**

Investigated the actual creation flow before designing this: `createProject`
only calls `resolveBusinessContext` in its existing fallback branch (wizard
skipped or submitted empty) — the common path (user completes the wizard
normally) never recomputes a profile at all, since competitors/prompts
already arrive filled in the form submission. Threading the profile from
`suggestProjectSetup` (the wizard's suggestion step) through to `createProject`
for the common path would require serializing it into a new hidden form
field, validating it server-side, and touching
`components/onboarding-wizard.tsx` — more surface and risk for a marginal
benefit, since the common path doesn't need it persisted at creation time to
work correctly.

Instead:

1. **Migration** (`supabase/migrations/0022_project_business_profile.sql`):
   `alter table projects add column business_profile jsonb null;`. No
   backfill, no RLS change — `projects`' existing row-level policies are
   owner-scoped per row, which already covers every column including this
   one.
2. **`createProject`**'s existing fallback branch: when it already computes
   a profile (identified), the insert now includes it. Zero new Gemini
   calls — reuses exactly what ADR 0020 already computes there.
3. **`addPromptsCore`** (`lib/projects/add-prompts.ts`): now selects
   `business_profile` too. If cached, uses it directly — no
   `resolveBusinessContext` call. If `null` and `mode !== "manual"`,
   calls `resolveBusinessContext` once, and on success persists it back to
   `projects` (update scoped by `id` + `owner_user_id`) so the next
   invocation for this project is cached. A cache-write failure never blocks
   the current call — the freshly-resolved profile is still used for this
   generation. `mode: "manual"` never triggers profile resolution at all: it
   only categorizes the user's own text, no new prompt content is generated,
   so there's nothing for a profile to improve.
4. **`generateAddedPrompts`** (`lib/llm/gemini.ts`): gained an optional
   `profile?: BusinessProfile` parameter, included in the "auto"/"keywords"
   generation prompt when present (same wording pattern `suggestPrompts`
   already uses). Absent — every project created before this migration, or
   one whose profile couldn't be identified — produces the exact same prompt
   as before this phase. Purely additive.

The result: most new projects (created via the normal wizard flow) still
have `business_profile: null` immediately after creation, and get one
computed and cached the first time "Añadir prompts" is used — never before
it's actually needed, never blocking project creation or the wizard.

### Explicitly out of scope

- **The onboarding wizard is untouched.** No hidden-field plumbing, no
  eager persistence during the common creation path.
- **No backfill.** Existing projects simply have `business_profile: null`
  until "Añadir prompts" is used for them.
- **No re-suggestion/re-scan reuse yet** — a future phase could use the same
  cached profile for a "regenerate competitors" feature if one is ever
  built; not needed today.

## Consequences

**Positive.** "Añadir prompts" stops being uniformly blind — it now benefits
from the same real evidence-based profile as initial onboarding suggestion,
the first time it's used per project, with zero added Gemini calls for
projects that already have a cached profile.

**Testing note.** `createProject`'s new `business_profile` field in the
insert call is verified by code review and `pnpm run typecheck`/`pnpm run
validate` only — this server action has no existing unit-test harness (it
uses `redirect()`, which throws, and multiple sequential Supabase calls with
no extracted "Core" function the way `addPromptsCore`/
`createPendingScanRunCore` have). Building that harness was out of scope for
this phase; the surrounding `resolveBusinessContext`/`suggestCompetitors`/
`suggestPrompts` calls in that same fallback branch were already untested
for the same pre-existing reason before this phase.

**Accepted risk.** The cached profile can go stale if the project's actual
business changes materially after creation (rare, and no different from any
other point-in-time snapshot already stored elsewhere in this product, e.g.
`brand_snapshot` on scan rows). No expiry/refresh mechanism exists; a manual
"regenerate profile" action would be a natural follow-up if this becomes a
real complaint.
