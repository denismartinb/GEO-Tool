# GEO Studio v0 (Phase 0/1)

Minimal scaffold for GEO Studio using Next.js App Router + Supabase Auth + Supabase Postgres.

## Includes

- Auth: signup/login/logout
- Protected dashboard routes
- Projects list and create
- Project detail with:
  - Overview placeholder
  - Prompts CRU (create/update/deactivate)
  - Competitors CRU (create/update/deactivate)
  - Runs placeholder
  - Recommendations placeholder
- Supabase SQL migrations for schema + RLS

## Not Included Yet

- OpenAI integration
- scan execution
- jobs worker runtime
- crawler
- scoring/recommendation logic

## Environment

Create `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

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
pnpm run typecheck
pnpm run lint
pnpm run build
```

## Apply Migrations

Use Supabase CLI or SQL editor:

1. `supabase/migrations/0001_v0_schema.sql`
2. `supabase/migrations/0002_v0_rls.sql`
3. `supabase/migrations/0003_v0_profile_trigger.sql`

## Routes

- `/`
- `/login`
- `/signup`
- `/dashboard`
- `/dashboard/projects`
- `/dashboard/projects/new`
- `/dashboard/projects/[projectId]`

## Input Data Rules in UI

- Projects are archived (`is_archived = true`) instead of deleted.
- Prompts are deactivated (`is_active = false`) instead of deleted.
- Competitors are deactivated (`is_active = false`) instead of deleted.

## RLS Verification

See `docs/rls-manual-test-checklist.md`.
