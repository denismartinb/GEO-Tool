# Environment Contract — GEO Studio

Single source of truth for every environment variable, where it lives, and what
value shape is expected. **Never commit actual secret values.** Document names
and shapes only.

Owned by: `platform-deploy` agent. Update this file whenever a variable is
added, renamed, or removed.

---

## Required variables

### Supabase

| Variable | Required | Where | Expected shape |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | Vercel + local `.env.local` | `https://<project-ref>.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | Vercel + local `.env.local` | `eyJ...` JWT |
| `SUPABASE_SERVICE_ROLE_KEY` | Only for admin tasks | Vercel (not local) | `eyJ...` JWT — never expose client-side |

### Gemini

| Variable | Required | Where | Expected shape |
|---|---|---|---|
| `GEMINI_API_KEY` | Yes | Vercel + local `.env.local` | `AIza...` |
| `GEMINI_MODEL` | No (defaults to `gemini-2.5-flash`) | Vercel optional | Valid model id matching `/^gemini-[a-z0-9][a-z0-9._-]*$/i` |

See `docs/adr/0002-gemini-model-pinning.md` and
`docs/adr/0009-gemini-2.5-flash-model-pin.md` — model is pinned to
`gemini-2.5-flash`. Do not change without an ADR. If a `GEMINI_MODEL`
override is set in Vercel, it must also be updated to a served model id.

### Claude (Anthropic)

| Variable | Required | Where | Expected shape |
|---|---|---|---|
| `ANTHROPIC_API_KEY` | Only if Claude is an active scan engine | Vercel + local `.env.local` | Anthropic API key |
| `ANTHROPIC_MODEL` | No (defaults to `claude-haiku-4-5-20251001`) | Vercel optional | Valid Claude model id |

### Scan engines

| Variable | Required | Where | Expected shape |
|---|---|---|---|
| `LLM_SCAN_PROVIDERS` | No (defaults to Gemini-only) | Vercel | Comma-separated engine list, e.g. `gemini,claude` — each listed engine runs concurrently for every prompt in a scan |
| `LLM_SCAN_PROVIDER` | No — legacy, only read when `LLM_SCAN_PROVIDERS` is unset | Vercel | `gemini` \| `claude` |

Setting `LLM_SCAN_PROVIDERS=gemini,claude` requires both `GEMINI_API_KEY` and
`ANTHROPIC_API_KEY` to be configured — a misconfigured engine does not abort
the run as long as at least one other listed engine is configured (see
`lib/scan/executor.ts`), but if every listed engine is misconfigured the run
fails fast.

### Scan execution

| Variable | Required | Where | Expected shape |
|---|---|---|---|
| `ENABLE_SYNC_SCAN_EXECUTION` | Yes for current sync mode | Vercel | `true` |

See `docs/adr/0003-sync-scan-execution-and-maxduration.md`.

### Recurring scans (cron)

| Variable | Required | Where | Expected shape |
|---|---|---|---|
| `CRON_SECRET` | Yes, once `CRON_SCANS_ENABLED=true` | Vercel | random secret string; Vercel sends it as `Authorization: Bearer <CRON_SECRET>` to `/api/cron/weekly-scans` |
| `CRON_SCANS_ENABLED` | No (defaults to disabled) | Vercel | `true` to enable; any other value (or unset) is a no-op kill switch |
| `MAX_PROJECTS_PER_CRON_RUN` | No (defaults to `5`) | Vercel | positive integer |

The cron only ever processes projects with `projects.recurring_scans_enabled = true`
(opt-in, default `false`, no UI yet — see migration `0008_recurring_scans.sql`).
`vercel.json` schedules the route daily (`0 6 * * *`).

### Batched scan campaigns (SCAN-CHAIN-1)

| Variable | Required | Where | Expected shape |
|---|---|---|---|
| `SCAN_CONTINUE_SECRET` | Yes, for campaigns with more active prompts than `MAX_REAL_SCAN_PROMPTS` | Vercel + local `.env.local` | random secret string; `executePendingScan` sends it as `Authorization: Bearer <SCAN_CONTINUE_SECRET>` to `/api/scan/continue` |
| `NEXT_PUBLIC_SITE_URL` | No (falls back to `https://${VERCEL_URL}`, then `http://localhost:3000`) | Vercel | `https://<production-domain>` — set explicitly on Preview deploys if self-continuation needs to target the deploy's own URL rather than a stale `VERCEL_URL` |

A project whose plan allows more active prompts than fit in one execution
batch (`MAX_REAL_SCAN_PROMPTS=10`) has its scan split across multiple
batches, each its own `executePendingScan` invocation. Without
`SCAN_CONTINUE_SECRET` set, the first batch still runs (and its results are
real), but the campaign stalls after it — no continuation can be dispatched,
and the run only progresses further once `reconcileStuckScanRuns` notices no
progress and auto-retries (docs/scan-lifecycle.md). See
`docs/adr/0014-batched-self-chaining-scan-execution.md`.

### Observability and analytics (PLATFORM-COMMERCIAL-1)

| Variable | Required | Where | Expected shape |
|---|---|---|---|
| `SENTRY_DSN` | No | Vercel + local `.env.local` | Sentry server/edge DSN, `https://...@...ingest.sentry.io/...` |
| `NEXT_PUBLIC_SENTRY_DSN` | No | Vercel | Same DSN, client-side (browser bundle) — usually identical to `SENTRY_DSN` |
| `SENTRY_ORG` / `SENTRY_PROJECT` / `SENTRY_AUTH_TOKEN` | No | Vercel (build-time) | Enables source-map upload during `next build`; without them the Sentry webpack plugin silently skips upload, the build is unaffected |
| `NEXT_PUBLIC_POSTHOG_KEY` | No | Vercel | PostHog project API key (`phc_...`) |
| `NEXT_PUBLIC_POSTHOG_HOST` | No (defaults to `https://eu.i.posthog.com`) | Vercel | PostHog ingestion host — keep EU unless the project region changes |

All five are optional by design: every one of `sentry.server.config.ts`,
`sentry.edge.config.ts`, `instrumentation-client.ts`, and
`components/posthog-provider.tsx` no-ops (no `Sentry.init`/`posthog.init`
call, no script loaded) when its variable is unset — this repo ships with
none of them configured until the founder creates the Sentry/PostHog
accounts (docs/launch-plan.md, Fase 3). PostHog is initialized with
`persistence: "memory"` (no cookies/localStorage) to match the "no
analytics cookies in use" claim in `/cookies` — if that ever changes,
`/cookies` and `/privacidad` need a follow-up update to list PostHog as a
processor before flipping the key on in production.

---

## Vercel configuration

- **Production branch**: set to the branch you want deployed as production in
  Vercel → Settings → Environments → Production → Branch Tracking.
- **maxDuration**: `export const maxDuration = 60` must be present in the scan
  route handler (`app/dashboard/projects/[projectId]/page.tsx`). Vercel Hobby
  plan default is 10s — scans take 30–60s and will time out silently without it.
- **regions**: `vercel.json` pins serverless functions to `dub1` (Dublin, EU
  West) to co-locate with the Supabase project (`eu-west-1`). Without this,
  Vercel functions run in `iad1` (US East) by default and every Supabase round
  trip crosses the Atlantic (docs/architecture-audit-2026-07.md, finding 1.4).
  If the Supabase project is ever migrated to a different region, update this
  value to match.
- For smoke testing a non-main branch: change Production Branch in Vercel
  settings, push a commit to trigger a deploy, then revert after the smoke.

---

## Local development

Create `.env.local` at project root (gitignored). Minimum required:

```
NEXT_PUBLIC_SUPABASE_URL=https://...
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
GEMINI_API_KEY=AIza...
ENABLE_SYNC_SCAN_EXECUTION=true
SCAN_CONTINUE_SECRET=any-random-string
```

---

## Checklist before smoke test

- [ ] All required Vercel env vars are set and non-empty (check in Vercel → Settings → Environment Variables)
- [ ] `NEXT_PUBLIC_SUPABASE_URL` is a valid `https://` URL (not empty, not quoted)
- [ ] `GEMINI_API_KEY` is present
- [ ] `ENABLE_SYNC_SCAN_EXECUTION=true` is set in Vercel
- [ ] `SCAN_CONTINUE_SECRET` is set in Vercel (required for any project whose plan allows more active prompts than `MAX_REAL_SCAN_PROMPTS` to finish a scan across batches)
- [ ] Production branch in Vercel points to the branch under test
- [ ] A fresh deploy was triggered after any env var change
- [ ] Gemini model id is still served (validate against API before smoke — see ADR 0002)
