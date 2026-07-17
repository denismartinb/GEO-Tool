# ADR 0016 — Self-Chaining Daily Cron Sweep (ASYNC-SCAN-1a / CRON-SCALE)

**Date:** 2026-07-17
**Status:** Accepted
**Deciders:** Founder + Director (Task Intake approved 2026-07-17, launch-plan Fase 9)

---

## Context

The daily recurring-scan sweep (`/api/cron/weekly-scans` → `runDailyCronScan`,
`lib/scan/cron.ts`) fires **once per day** — a hard Vercel Hobby limit
(ADR 0014) — and processes at most `MAX_PROJECTS_PER_CRON_RUN` (5) projects
per invocation inside the 60s `maxDuration` budget (ADR 0003). That made 5
recurring projects/day the ceiling for the entire system: with 30 Pro
customers on daily cadence, 25 projects/day would simply never be scanned.
`docs/launch-plan.md` Fase 9 flags this as the scale prerequisite — it does
not block launch, but it blocks the first month with traction.

SCAN-CHAIN-1 (ADR 0014) already solved the same shape of problem one level
down: a single scan campaign larger than one invocation's budget self-chains
across invocations via `after()` + a secret-gated continuation endpoint, with
atomic claims making duplicate invocations safe. Nothing equivalent existed
at the *sweep* level — projects deferred by the per-invocation cap or time
budget just waited for the next day.

## Decision

Apply the ADR 0014 pattern one level up. `runDailyCronScan` now:

1. Counts **deferred** candidates — those the invocation never reached
   because the per-invocation project cap (`maxProjects`) or the 45s soft
   time budget cut the loop short. Candidates skipped for cause
   (`skipped_recent`, `skipped_failure_streak`, `skipped_active_run`,
   `skipped_plan_ineligible`) are *not* deferred: they resolved for today.
2. If any candidates were deferred, **and** the invocation scanned at least
   one project (progress guard), **and** the chain is below its hard cap,
   dispatches — via `after()`, fire-and-forget — a POST to a new
   endpoint, **`/api/cron/sweep-continue`**, authenticated with the existing
   `CRON_SECRET` and gated by the existing `CRON_SCANS_ENABLED` kill switch.
   That endpoint re-runs `runDailyCronScan` with `chainIndex + 1` in its own
   fresh 60s-budgeted invocation.

`MAX_PROJECTS_PER_CRON_RUN` therefore becomes a **per-invocation batch
size**, no longer the system's daily capacity.

### Termination and convergence

- **Convergence:** every project scanned by one link gets a fresh
  `scan_runs` row, so every later link classifies it `skipped_recent` (or
  `skipped_active_run` while its campaign is still executing). The eligible
  set strictly shrinks with each link that makes progress.
- **Progress guard:** a link that scans zero projects (e.g. every attempt
  failing fast against a broken upstream) does not chain — without this, a
  persistently failing candidate set would loop up to the cap for nothing.
- **Hard cap:** `MAX_SWEEP_CHAIN_INVOCATIONS` (default 20, env-overridable)
  bounds the chain regardless, checked on the dispatch side
  (`chainIndex + 1 < cap`) and defended in depth by the endpoint's zod
  bounds on `chainIndex`.

### Capacity and cost math

- **Before:** 1 firing/day × 5 projects = **5 recurring projects/day**.
- **After:** ≤ 20 invocations × 5 projects = **100 recurring projects/day**,
  each invocation inside its own 60s budget. The Fase 9 target (30 Pro
  customers, daily cadence) fits with ~3× headroom.
- **LLM cost is bounded by the same plan caps as before**, not increased per
  project: the sweep only *starts* each project's campaign (first batch);
  per-project execution and its cost are governed by SCAN-CHAIN-1 batching
  and plan prompt caps exactly as for a manual scan. What changes is how
  many entitled projects actually get their daily scan. Worst-case daily
  volume at the cap: 100 projects × 100 prompts (Pro) × 2 engines =
  ~20,000 LLM calls/day — reaching that requires 100 paying Pro customers,
  at which point the cost conversation is a revenue conversation. Raising
  `MAX_SWEEP_CHAIN_INVOCATIONS` beyond 20 is a founder decision, not a code
  default.

### Duplicate/racing invocations

The chain is sequential by construction: a link dispatches its successor
once, at its own end. If a dispatch is ever duplicated or replayed, both
invocations re-query candidates fresh; per-project safety rests on
`createPendingScanRunForCron`'s active-run guard plus the atomic job claims
of ADR 0014. The active-run guard is read-then-insert (not a DB constraint),
so a perfectly simultaneous duplicate could in principle create two runs —
**unchanged from, and no worse than, the pre-existing race** between the
cron and a manual launch. A lost dispatch is equally benign: deferred
projects wait for the next day's firing, where oldest-last-scan-first
ordering prioritizes them (the pre-existing starvation protection).

### Why not the alternatives

- **Vercel Pro + more frequent cron schedule:** simpler, but couples pipeline
  scale to the billing go-live checklist (launch-plan Fase 3/4, deliberately
  deferred by the founder). Worth revisiting once Pro is contracted anyway —
  this design degrades gracefully into it (a more frequent firing just makes
  chains shorter).
- **External queue / scheduler (QStash, pg_cron, GitHub Actions):** all
  rejected for the same reasons as in ADR 0014 — new vendor or out-of-repo
  component for something the existing in-repo pattern covers.

## Consequences

- **Positive:** daily capacity grows 20× with zero new infrastructure, no
  schema changes, no new secrets (reuses `CRON_SECRET`), and one new route
  that mirrors an existing, battle-tested pattern.
- **Negative:** like `/api/scan/continue`, the sweep chain requires a
  reachable deployment URL (`NEXT_PUBLIC_SITE_URL` / `VERCEL_URL`) — on an
  unreachable or protection-gated deploy the first invocation still runs but
  the chain stops there (production is reachable; previews don't run crons).
- **Negative:** sweep observability is log-based (`chainIndex`, `deferred`,
  `continuationScheduled` in the summary log line); there is no persisted
  sweep-level record. Acceptable at current scale; a `sweep_runs` table
  would need its own schema approval.
- **Future trigger to revisit:** >100 recurring projects/day, or evidence of
  lost continuation dispatches leaving deferred projects unscanned across
  multiple days — then either raise the cap consciously, contract Vercel Pro
  and shorten chains, or reopen the external-queue question.
