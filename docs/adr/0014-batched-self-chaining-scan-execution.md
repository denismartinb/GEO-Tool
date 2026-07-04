# ADR 0014 — Batched, Self-Chaining Scan Execution (SCAN-CHAIN-1)

**Date:** 2026-07-04
**Status:** Accepted
**Deciders:** Founder + Director

---

## Context

`MAX_REAL_SCAN_PROMPTS` (10, `lib/scan/constants.ts`) caps how many prompts a
single scan execution processes, sized to fit inside the ~60s Vercel Hobby
`maxDuration` budget (ADR 0003) with multi-engine execution (up to 2 engines
per prompt). Before this ADR, `createPendingScanRunCore` also capped **job
creation** at this same number — meaning any active prompt beyond the oldest
10 never got a real `scan_prompt` job at all, on any plan.

This silently broke the pricing promise in `app/pricing/plans-data.ts`:
Starter (~25 prompts), Pro (~100), and Agency (~300) all only ever had their
oldest 10 prompts actually scanned; the rest were carried forward from
whatever earlier result existed (or never scanned at all for a new project),
regardless of plan.

The founder explicitly ruled out two ways to fix this:
- **Upgrading the Vercel plan** to raise `maxDuration` and process more
  prompts in one execution — ruled out on cost grounds for now.
- **A true background worker/queue** (Vercel Cron ticking more often, an
  external scheduler, Supabase pg_cron) — Vercel Hobby's cron is hard-capped
  at once/day regardless of `vercel.json`'s schedule expression, so achieving
  same-day, browser-independent completion this way would have required the
  Vercel upgrade anyway or a new external scheduling dependency, which is
  itself a `background scheduler` — forbidden without a dedicated, explicitly
  approved phase (`CLAUDE.md`).

## Decision

Keep `MAX_REAL_SCAN_PROMPTS` as a **per-batch** limit, not a per-campaign one.
`createPendingScanRunCore` now creates a real `scan_prompt` job for every
active prompt up to the project owner's **plan cap**
(`resolvePlan(...).caps.prompts`, `lib/billing.ts`), not `MAX_REAL_SCAN_PROMPTS`.

`executePendingScan` claims and processes at most `MAX_REAL_SCAN_PROMPTS`
still-`pending` jobs per invocation (the claim is an atomic
`UPDATE ... WHERE status = 'pending' ... RETURNING`, so a racing duplicate
invocation can only ever pick up jobs nobody else has claimed yet). If more
`scan_prompt` jobs are still pending or in flight elsewhere after that batch,
it schedules — via Next.js's `after()`, without making its own caller wait —
a fire-and-forget POST to a new endpoint, `/api/scan/continue`, secured by a
shared secret (`SCAN_CONTINUE_SECRET`, mirroring the existing
`CRON_SECRET`/`/api/cron/weekly-scans` pattern). That endpoint runs the next
batch in its own fresh ~60s-budgeted invocation, which repeats the same
claim/process/chain-or-finalize logic. Once every `scan_prompt` job for the
run is terminal, the invocation that observes this atomically claims the
run's `scan_finalize` job as a single-owner gate, runs structured extraction,
scoring, and recommendations exactly once, and marks the run `completed`.

`scan_runs.successful_prompts`/`failed_prompts` are recomputed from the
`jobs` table on every batch rather than incremented, so concurrent/duplicate
batches can never corrupt them, and the existing real-progress UI
(`components/scan-in-progress.tsx`) shows genuine, campaign-wide progress
across every batch without any UI changes.

`reconcileStuckScanRuns`'s running-timeout check was changed to key off
`scan_runs.updated_at` (bumped by the existing DB trigger on every batch's
progress write) instead of `started_at`, so a legitimately in-progress
multi-batch campaign is never mistaken for a stuck run just because it has
been `running` longer than `SCAN_RUNNING_TIMEOUT_SECONDS` (120s) since it
started.

### Why not the alternatives

- **Client-driven sequential continuation** (the browser fires batch 1, then
  batch 2, etc.): rejected because it stops working the moment the user
  closes the tab mid-campaign — exactly the reliability gap the founder asked
  to close, and the whole reason "asíncrono, independiente del navegador" was
  the stated requirement.
- **Supabase Cron (`pg_cron`/`pg_net`)** ticking a continuation endpoint on a
  schedule: still viable as a future rescue mechanism for a stalled campaign,
  but rejected as the *default* mechanism here because it adds a component
  that lives outside this repo (configured in the Supabase dashboard/SQL, not
  reviewed in a PR, not covered by `pnpm test`), and its fire-and-forget
  semantics need the same reconciliation safety net this design already
  relies on — it would not have simplified anything.
- **GitHub Actions scheduled workflow**: rejected — documented 5-30 minute
  delays under load and a silent auto-disable after 60 days without a commit
  are not acceptable for something a paying plan's promise depends on.
- **External queue (QStash, cron-job.org, ...)**: rejected as the heaviest
  option for what this design achieves with zero new components — a new
  vendor, a new secret, and a new external dependency to monitor, worth
  reconsidering only if self-chaining proves insufficient at higher volume.

## Consequences

- **Positive:** Starter/Pro/Agency now actually get every active prompt up to
  their plan's cap scanned, campaign completion no longer depends on the
  browser staying open, and none of this required raising `maxDuration` or
  introducing new infrastructure — every moving part already existed in this
  repo (the jobs/claim pattern, `scan_finalize`, the cron's own
  secret-gated-endpoint pattern) or is a stable Next.js primitive (`after()`).
- **Negative:** a campaign for a high-cap plan now takes several batches
  (~10-20s each) to fully complete — e.g. an Agency project with 300 active
  prompts takes on the order of 30 batches. The manual "Lanzar escaneo" UI
  shows this as ordinary in-progress state (real counters, no fake steps);
  there is no user-facing "campaign phase" indicator beyond the existing
  X-of-Y progress bar.
- **Negative:** `SCAN_CONTINUE_SECRET` must be configured in every
  environment (Vercel + local) for campaigns larger than
  `MAX_REAL_SCAN_PROMPTS` to complete — see `docs/environment-contract.md`.
  Without it, the first batch still runs for real, but the campaign stalls
  until `reconcileStuckScanRuns` notices no progress and auto-retries.
- **Future trigger to revisit:** if self-chaining proves unreliable in
  production (continuation dispatches lost often enough that campaigns
  routinely need the auto-retry safety net rather than completing on the
  first attempt), reopen this ADR to consider the Supabase Cron rescue
  mechanism mentioned above, or revisit the Vercel plan question now that its
  actual cron/maxDuration constraints are documented here.
