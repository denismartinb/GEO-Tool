# Environment Contract — Lumira

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
| `GEMINI_MODEL` | No (defaults to `gemini-2.0-flash-001`) | Vercel optional | Valid model id matching `/^gemini-[a-z0-9][a-z0-9._-]*$/i` |

See `docs/adr/0002-gemini-model-pinning.md` — model is pinned to
`gemini-2.0-flash-001`. Do not change without an ADR.

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
`vercel.json` schedules the route weekly (`0 6 * * 1`).

---

## Vercel configuration

- **Production branch**: set to the branch you want deployed as production in
  Vercel → Settings → Environments → Production → Branch Tracking.
- **maxDuration**: `export const maxDuration = 60` must be present in the scan
  route handler (`app/dashboard/projects/[projectId]/page.tsx`). Vercel Hobby
  plan default is 10s — scans take 30–60s and will time out silently without it.
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
```

---

## Checklist before smoke test

- [ ] All required Vercel env vars are set and non-empty (check in Vercel → Settings → Environment Variables)
- [ ] `NEXT_PUBLIC_SUPABASE_URL` is a valid `https://` URL (not empty, not quoted)
- [ ] `GEMINI_API_KEY` is present
- [ ] `ENABLE_SYNC_SCAN_EXECUTION=true` is set in Vercel
- [ ] Production branch in Vercel points to the branch under test
- [ ] A fresh deploy was triggered after any env var change
- [ ] Gemini model id is still served (validate against API before smoke — see ADR 0002)
