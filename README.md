# GEO Studio v0 - Gemini-only Private Beta MVP

Private beta MVP for GEO Studio using Next.js App Router + Supabase Auth + Supabase Postgres.

## Includes

- Auth: signup/login/logout
- Protected dashboard routes
- Projects list and create
- Project detail with:
  - Overview + Run scan
  - Prompts CRU (create/update/deactivate)
  - Competitors CRU (create/update/deactivate)
  - Runs and run detail
  - Manual Gemini scan execution per run
  - Raw prompt results persistence
  - Structured extraction
  - Deterministic scoring
  - Rule-based recommendations with evidence
- Supabase SQL migrations for schema + RLS

## Not Included Yet

- OpenAI and multi-provider integration
- Background monitoring and scheduled runs
- Crawler
- Billing and teams

## Environment

Create `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
GEMINI_API_KEY=...
# Optional. Defaults to gemini-2.0-flash.
GEMINI_MODEL=...
# Optional placeholder for a future provider phase. Not active today.
OPENAI_API_KEY=...
# Optional future OpenAI provider model. Not used by the current Gemini-only MVP.
OPENAI_MODEL=
```

Notes:
- Gemini is the active provider in the current scan pipeline.
- `OPENAI_API_KEY` is optional and setting it does not enable OpenAI today.
- OpenAI integration will be added in a later provider phase.
- Keep `.env.local` local. Do not commit environment files or secrets.

## Beta Testing

- The current MVP is Gemini-only. OpenAI is documented but not active.
- Use `docs/beta-run-checklist.md` for real-data beta validation.
- Real scans are limited to 10 prompts per run.
- `Lanzar escaneo` executes Gemini directly. Keep the page open while the synchronous scan runs.
- Technical run detail remains available for debugging and support.
- The Prompts screen shows prompt-level signals from the latest completed Gemini scan. Raw responses remain persisted for technical auditing.
- The Competitors screen shows configured competitors and mentions detected in the latest completed Gemini scan. Discovery is not automatic yet; competitors are managed manually in project configuration.
- The Recommendations screen shows the full evidence-backed action backlog from the latest completed Gemini scan.
- Recommendations are directional, rule-based v0 actions grounded in extracted evidence. They are not rewritten by an LLM.
- Projects can be archived and restored. Archived projects stay hidden from active workspace navigation.

## Install and Run

Using pnpm:

```bash
pnpm install
pnpm run dev
```

Using npm:

```bash
npm install
npm run dev
```

Quality checks:

```bash
pnpm run validate
git diff --check
```

Next 16 generates `.next/types` during `build` or `dev`, so `build` must run before `typecheck` when `.next` has been cleaned.

## Apply Migrations

Use Supabase CLI or SQL editor:

1. `supabase/migrations/0001_v0_schema.sql`
2. `supabase/migrations/0002_v0_rls.sql`
3. `supabase/migrations/0003_v0_profile_trigger.sql`
4. `supabase/migrations/0004_v0_scan_result_dedup.sql`

## Routes

- `/`
- `/login`
- `/signup`
- `/dashboard`
- `/dashboard/projects`
- `/dashboard/projects/new`
- `/dashboard/projects/[projectId]`
- `/dashboard/projects/[projectId]/prompts`
- `/dashboard/projects/[projectId]/competitors`
- `/dashboard/projects/[projectId]/runs`
- `/dashboard/projects/[projectId]/recommendations`
- `/dashboard/projects/[projectId]/runs/[runId]`

## Project Workspace

The authenticated MVP is organized as a project workspace. Its main areas are `Visión general`, `Prompts`, `Competidores`, `Escaneos` and `Recomendaciones`.

The Prompts area shows prompt-level results and the Recommendations area shows the full evidence-backed action backlog from the latest completed Gemini scan. The remaining placeholder areas will be implemented in later Phase 10B iterations.

## Input Data Rules in UI

- Projects are archived (`is_archived = true`) instead of deleted.
- Restore an archived project instead of recreating the same domain, country and language combination.
- Prompts are deactivated (`is_active = false`) instead of deleted.
- Competitors are deactivated (`is_active = false`) instead of deleted.

## RLS Verification

See `docs/rls-manual-test-checklist.md`.
