# Architecture Audit — July 2026

**Trigger:** founder-reported ~3s latency on every click/navigation in the
dashboard, plus a request for a low-level review of technical debt before
continuing product evolution.

**Verdict up front:** the architecture (Next.js App Router + Supabase +
Vercel, thin `lib/` domain layer with good Vitest coverage, ADR discipline)
is sound for this product stage. **No rewrite or framework change is
warranted.** The perceived lag is not "the stack being slow" — it is the
result of five specific, fixable implementation patterns that compound on
every navigation. They are listed below in causal order, followed by the
structural-debt items that should be scheduled but are not blockers.

---

## 1. Why every click takes ~3 seconds

Every dashboard route is fully dynamic (Supabase session cookie via
`cookies()`), so **every navigation waits for a full server render before
anything changes on screen**. The time budget of one click decomposes into
a sequential chain of network round trips, with zero visual feedback while
it runs.

### 1.1 No `loading.tsx` anywhere — the click feels dead (P0, biggest UX lever)

There is not a single `loading.tsx`, `error.tsx`, or `<Suspense>` boundary
in the entire `app/` tree (verified by search). Consequences:

- On click, Next.js has nothing to paint until the **entire** RSC payload
  for the target page arrives. The user stares at the old page for the full
  server time (1.5–3 s), which is what "lag on every click" feels like.
- `<Link>` prefetching is effectively useless: for dynamic routes Next.js
  only prefetches up to the nearest loading boundary — with none defined,
  there is nothing to prefetch, so no navigation is ever warm.
- With no `error.tsx`, any thrown server error bubbles to a blank screen.

**Fix:** add `app/dashboard/loading.tsx` and per-segment `loading.tsx`
skeletons (Overview, prompts, competitors, recommendations, runs,
settings). This alone converts a 3 s frozen click into an instant
navigation with a skeleton. Zero risk, no behavior change.

### 1.2 Redundant `supabase.auth.getUser()` network calls (P0)

`supabase.auth.getUser()` is **a network round trip to the Supabase Auth
server**, not a local JWT check. Today one navigation performs it 2–4
times sequentially:

1. `middleware.ts:44` — every request, including RSC payload requests and
   server-action POSTs.
2. `app/dashboard/layout.tsx:16` — on hard loads / `router.refresh()`.
3. Every page via `requireUser()` (`lib/auth.ts:8`) — and pages that also
   call `requireActiveProject()` or `getPlanForUser()` trigger it **again**
   inside each helper (e.g. the prompts page reaches 3 calls by itself),
   because nothing is deduplicated with `React.cache()`.

At ~80–150 ms per auth round trip, this is 300–600 ms of pure duplication
per click before a single product query runs.

**Fix (two steps, increasing impact):**
- Wrap `createClient()` and a `getUser()` helper in `React.cache()` so one
  request = one auth call at most outside middleware. Trivial, no behavior
  change.
- Longer term, switch middleware to local JWT validation
  (`supabase.auth.getClaims()` with asymmetric keys) so the middleware hop
  costs ~0 ms. Auth-sensitive → requires data-guardian review as its own
  phase.

### 1.3 Sequential query waterfall on the Overview read path (P0)

`app/dashboard/projects/[projectId]/page.tsx` executes, **in series**:

1. `requireUser()` → auth round trip (line 152)
2. `projects` select (line 154)
3. `reconcileStuckScanRuns()` (line 166) — **3–5 more sequential queries,
   plus writes when anything is stale** (`lib/scan/reconciliation.ts:169`)
4. `Promise.all` batch #1 — prompts / competitors / runs (line 168)
5. `Promise.all` batch #2 — scores / results / recommendations / trend
   (line 199)

That is ~8–12 sequential network round trips per Overview render. The
same reconcile-on-read pattern exists in `runs/page.tsx:201`. Reconciliation
is a **write-path system correction embedded in the hottest read path** —
every page view (and every poller tick, see 1.5) pays for it, and its own
internal queries are also sequential.

**Fix:**
- Merge steps 2 and 4 into one `Promise.all` (the project row is not needed
  to *start* the other queries, only to decide `notFound()`).
- Move `reconcileStuckScanRuns` off the read path: run it in the scan
  poller endpoint / cron / on scan launch instead of on every page render.
  Reconciliation cadence belongs to the reliability domain, not to TTFB.

### 1.4 Probable Vercel ↔ Supabase region mismatch (P0 — must be verified)

`vercel.json` sets no `regions`, so serverless functions run in the default
**`iad1` (US East)** unless overridden in the dashboard. The product and
its users are in Spain; if the Supabase project is in an EU region
(likely), **every one of the ~10–20 round trips above crosses the
Atlantic (~90–120 ms each)**. This is a multiplier on every other finding.

**Fix:** confirm the Supabase project region in its dashboard, then pin
Vercel functions to the co-located region (e.g. `"regions": ["fra1"]` or
`cdg1`) in `vercel.json`. One-line change, but must match the actual
Supabase region — verify first. Expected saving alone: often 50–70 % of
TTFB.

### 1.5 `router.refresh()` poller re-renders the whole tree every 4 s (P1)

`components/scan-progress-poller.tsx:23` calls `router.refresh()` every
4 s while a scan is active. Each refresh re-renders **layout + page**
server-side: the layout's 9-query `getWorkspaceCounters()` plus the
Overview's full waterfall including reconciliation writes. During a
multi-minute scan campaign this is a self-inflicted load loop and makes
the app feel sluggish precisely when the user is watching it most.

**Fix:** poll a cheap dedicated endpoint (status of the active run only)
and call `router.refresh()` only on status *transitions*; and/or lengthen
the interval. (The scan itself is server-chained since SCAN-CHAIN-1 and
does not depend on this poller.)

---

## 2. Structural debt (schedule, not blockers)

### 2.1 `getWorkspaceCounters()` does unbounded scans and aggregates in JS

`lib/project-workspace.ts:71` fetches **all** `scan_runs`, all active
`project_prompts` / `project_competitors` rows, all active
`recommendations`, and all `run_scores` for the user — with no limits —
then reduces them to counters in JavaScript. It runs in the dashboard
layout, so its cost is attached to hard loads, `router.refresh()`, and
`revalidatePath("/dashboard", "layout")`. Fine at beta scale; degrades
linearly with scan history (a project scanned weekly for a year ≈ 50+ runs
× prompts rows fetched on every layout render).

**Fix when scheduled:** replace with `count`-only queries
(`{ count: "exact", head: true }`) or a single Postgres RPC/view returning
the aggregates. No schema change required for the count variant.

### 2.2 Overview computes analytics from raw `extracted_json` at render time

`page.tsx` parses every prompt result's `extracted_json` (citations,
competitor mentions, share of voice) on each render. At 10–20 prompts per
scan this is fine; with multi-engine scans and richer history it becomes
the next hotspot after the waterfall is fixed. The natural home is
scan-completion time (persist aggregates alongside `run_scores`, which
already exists for exactly this purpose). Defer until it measurably hurts.

### 2.3 No observability for latency

Nothing measures server time today, so this audit's numbers come from
static analysis of round-trip counts. Before/after the PERF phases, use
Vercel's function duration logs (and optionally a `Server-Timing` header
around the Overview queries) to verify the win instead of guessing.

### 2.4 Minor notes

- `app/dashboard/projects/[projectId]/page.tsx` is a 1,200-line server
  component mixing data access, scoring math, and markup. Works, but
  extracting the data assembly into `lib/` (like the rest of the codebase
  already does) would make the perf work above easier to test.
- No `error.tsx` boundaries (see 1.1) — add alongside the loading states.
- Client-side, the app is healthy: small dependency footprint (React 19,
  Next 16, Supabase, zod — no heavy UI libs), few client components, no
  bundle-size concern found.

## 3. What is explicitly fine (do not churn)

- **Stack choice** (Next App Router + Supabase + Vercel + sync scan
  execution per ADR 0003) is appropriate for the stage; the scan pipeline's
  state machine, reconciliation logic, and test coverage in `lib/scan/` are
  genuinely solid.
- **`lib/` domain layer** with co-located Vitest suites — keep this pattern.
- **Docs/ADR discipline** — this audit slots into it.
- **RLS-first data access** with the service client confined to
  system-level corrections.

## 4. Recommended remediation plan

| Phase | Scope | Risk | Expected effect |
|---|---|---|---|
| **PERF-1** | `loading.tsx` + `error.tsx` skeletons for dashboard segments; `React.cache()` dedupe of `createClient`/`getUser`; merge Overview query batches | None (no behavior change) | Clicks feel instant (skeleton); −300–600 ms TTFB |
| **PERF-2** | Verify Supabase region; pin Vercel `regions` in `vercel.json` | None (config, reversible) | Potentially −50–70 % of remaining TTFB |
| **PERF-3** | Move `reconcileStuckScanRuns` off the Overview/Runs read path (into poller endpoint / launch / cron); cheap scan-status poll endpoint instead of full `router.refresh()` | Low — touches scan lifecycle, needs reliability + QA review | −4–6 round trips per view; app stays responsive during scans |
| **PERF-4** | `getWorkspaceCounters` → count queries or RPC; middleware `getUser` → `getClaims` | Medium — auth-sensitive part needs data-guardian | Scales with data growth; middleware hop ~0 ms |

PERF-1 and PERF-2 are the first safe slice and require no schema, RLS,
pipeline, or provider changes. PERF-3/PERF-4 need their own Task Intake.
