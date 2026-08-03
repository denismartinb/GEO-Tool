# Agentic User Pilot (UX-PILOT-1)

The mandatory step between Claude QA and the Human Gate: an agent opens the PR's
Vercel preview, logs in as a real user, walks the affected screens at three
viewports, looks at the result, and decides whether what shipped is what was
asked for.

## Why this exists

Before UX-PILOT-1 the pipeline could hand the founder a PR that had passed
`pnpm test`, `pnpm run validate`, and Claude QA, and still render a broken
screen. The QA agent's "mandatory frontend visual check" existed on paper since
its introduction but could never run:

1. `playwright` was not a dependency of this repo — the documented snippet threw
   on `require('playwright')` every time.
2. It targeted `http://localhost:3000`, not the deployment the founder opens.
3. It had no session, so every authenticated route redirected to `/login`.

The result is visible in the QA comment on PR #276: *"Layout risk, unconfirmed
(no live browser available in the QA sandbox — no Supabase session) … Added to
the founder's 'qué probar'."* The agent found the risk, could not check it, and
delegated it back to the human. That is the exact loop this phase closes.

## Where it sits in the flow

```
1. Intake                → task-intake
2. Implementation        → frontend / core-flow / gemini-pipeline / ...
3. Technical validation  → pnpm test && pnpm run validate
4. QA (static)           → qa
5. PR opened, preview deploys
6. USER PILOT            → ux-pilot        ← this document
7. PILOT FAIL → back to 2. The Director iterates, not the founder.
8. Human Gate            → only with PILOT PASS + preview URL + "qué probar"
```

## First-time setup (local machine)

The pilot must run somewhere with network access to `*.vercel.app` — today,
that means the founder's own machine, not Claude Code's remote/web sessions
(see "Known limits" below).

```bash
git switch claude/human-gate-workflow-utotif && git pull
pnpm install                        # pulls in @playwright/test
pnpm exec playwright install chromium   # one-time; not needed inside the
                                         # agent sandbox, which ships a
                                         # prebuilt Chromium already
```

Add to `.env.local` (gitignored, same file every other local var lives in):

```
PILOT_EMAIL=...
PILOT_PASSWORD=...
```

`scripts/pilot.mjs` loads `.env.local` itself — no extra export step, no
shell profile changes. `PILOT_PROJECT_ID` is optional; leave it unset to let
the pilot pick the first project on the account, or pin it if you want the
journeys to always inspect the same one.

Then prove the harness itself works before trusting it against a real preview:

```bash
pnpm pilot:selfcheck
```

## Running it

```bash
pnpm pilot --url https://<preview>.vercel.app   # primary interface
pnpm pilot --pr 276                             # convenience, needs GITHUB_TOKEN
pnpm pilot:selfcheck                            # proves the harness still works
```

For a new PR: open it, find the Vercel bot's comment, copy the `Preview` link
once it shows `Ready`, and run `pnpm pilot --url <that-link>`. The verdict and
the reasoning behind it should also be posted to the PR as a
`<!-- agentic:ux-pilot-result -->` comment (see the Report format in
`.claude/agents/ux-pilot.md`) — the founder should never have to re-derive it
from raw terminal output.

## Automatic runs in CI (UX-PILOT-1b)

`.github/workflows/ux-pilot.yml` runs the pilot on **every Vercel preview
deployment**, so the gate no longer depends on which kind of session the founder
is working from.

How it is wired:

- **Trigger:** `deployment_status`, filtered to `state == 'success'` and
  `environment == 'Preview'`. Verified against this repo — Vercel publishes real
  GitHub Deployments and puts the preview URL in `environment_url`, so nothing
  scrapes bot comments.
- **Never `pull_request_target`.** That event would expose the pilot account's
  credentials to code from any fork. `deployment_status` runs only against
  commits already deployed from this repo.
- **Output:** a `<!-- agentic:ux-pilot-result -->` comment with the verdict and a
  per-screen × per-viewport table, plus a `pilot-screenshots` artifact
  (screenshots, `findings.jsonl`, `report.json`), retained 14 days.
- **Check status:** green only on `PILOT PASS`. Both `PILOT FAIL` and
  `PILOT INCONCLUSIVE` fail the check — an INCONCLUSIVE run must never look
  like a pass.

### Required repository secrets

Settings → Secrets and variables → Actions:

| Secret | Required | Notes |
|---|---|---|
| `PILOT_EMAIL` | Yes | Dedicated pilot account |
| `PILOT_PASSWORD` | Yes | Password for that account |
| `PILOT_PROJECT_ID` | No | Pins the project the journeys inspect |

Until these exist, every run reports `PILOT INCONCLUSIVE` with "missing pilot
credentials" and the check goes red. That is intended: a gate that cannot run
should be visibly broken, not quietly green.

### How a remote agent session uses it

A Claude Code remote/web session cannot open the preview itself (its egress
proxy blocks `*.vercel.app`). So the work splits:

1. GitHub's runner drives the browser and captures the screenshots.
2. The agent fetches those screenshots and **looks at them**, then judges
   against the PR's acceptance criteria.

**Do not try to download the Actions artifact from an agent session.** Artifacts
(upload-artifact v4) are served from `*.blob.core.windows.net`, which the egress
proxy rejects at CONNECT — verified, not assumed. The artifact exists for humans
clicking through the Actions UI.

Agents read the evidence over git, which already works through the proxy:

```bash
git fetch origin pilot-evidence/pr-<N>
git checkout FETCH_HEAD -- screens findings.jsonl summary.md   # or: git show FETCH_HEAD:screens/desktop--overview.png
```

The workflow force-pushes one orphan commit per run to
`pilot-evidence/pr-<N>`, so evidence is replaced rather than accumulated and
superseded blobs become unreachable for garbage collection. Those branches are
disposable — never merge one, and deleting them is always safe.

Note that these screenshots are of a logged-in test account's screens and live
in the repository's branches, visible to anyone with repo access. That is why
the pilot account must be a dedicated test account with no real data.

The mechanical half runs where there is network; the judgement half runs where
there is a model. Neither half is skipped.

### The three ways to run it

| Way | When |
|---|---|
| **CI, automatic** | Every preview deploy. No action needed once the secrets exist. |
| **Local, manual** | `pnpm pilot --url ...` — fastest feedback while iterating. |
| **Director, agentic** | Only from a session that can reach `*.vercel.app` (a local CLI session). A remote-session Director reports `PILOT INCONCLUSIVE` and defers to the CI run. |

Exit codes are the verdict:

| Exit | Verdict | Meaning |
|---|---|---|
| `0` | `PILOT PASS` | Every journey rendered clean |
| `1` | `PILOT FAIL` | The product is broken on this deployment |
| `78` | `PILOT INCONCLUSIVE` | The pilot never got to see the product |

`78` is the load-bearing one. Unreachable host, blocked egress, gated preview,
failed login — all classify as INCONCLUSIVE, never as PASS. **An unverified PR
must never reach the Human Gate labelled as verified.**

## Required environment

Injected from outside the repository. Never committed, never passed on a command
line, never echoed into a PR comment (`tests/pilot/support/env.ts` redacts them
defensively).

| Variable | Required | Notes |
|---|---|---|
| `PILOT_EMAIL` | Yes | Dedicated pilot account. Not the founder's own account. |
| `PILOT_PASSWORD` | Yes | Password for that account. |
| `PILOT_BASE_URL` | Yes (or `--url`) | The deployment under test. |
| `PILOT_PROJECT_ID` | No | Pins the project to inspect; otherwise the first project on the account is discovered. |
| `PILOT_CHROMIUM_PATH` | No | Overrides browser resolution. |

The pilot account must be **seeded**: it needs at least one project that already
has completed scans. A pilot pointed at an empty account reports FAIL on the
projects-list journey, which is correct but useless.

## What the harness checks mechanically

Per screen, per viewport (375 / 768 / 1280):

- horizontal overflow (`scrollWidth > viewport + 2px`);
- first-party HTTP responses ≥ 400 (third-party analytics failures are recorded
  but never fail the run);
- console errors, with the source URL attached — Chromium reports failed
  subresources as a bare `Failed to load resource: 404`, so the URL from
  `location()` is appended or the noise filters cannot match;
- silent session loss (any authenticated route bouncing to `/login`).

### Captures reach past the fold (UX-PILOT-1d)

`fullPage: true` grows a screenshot to `document.documentElement.scrollHeight`
and no further. The app shell pins itself to the viewport
(`.shell { height: 100dvh; overflow: hidden }`, `app/globals.css`) and scrolls
an inner element instead, so that number never exceeds one viewport — and
every "full-page" capture of an authenticated screen was **silently cropped at
the fold**, looking exactly like a complete one.

Found 2026-08-03 on PR #308, where the pilot could not see the Overview's
position headline or any panorama row past the third, at any viewport. It had
been blind below the fold on every dashboard screen since the harness was
written, not just on that PR.

`visitAsUser` now measures the real content height — including inside any
inner scroll container — and, when it exceeds the viewport, grows the
*viewport* to match before capturing, then restores it. The width never
changes, so the responsive breakpoint under test is untouched, and the app
lays itself out honestly at the taller size rather than having its
`overflow: hidden` stripped to fake a layout the product never renders.

Captures are capped at 6000px. When a page is taller, `captureTruncated: true`
is recorded — a silently cropped screenshot reads exactly like a complete one,
which is the whole defect this fixes.

Post-interaction captures stay viewport-sized on purpose: growing the viewport
reflows the page, which would move an element out from under the cursor and
dismiss the very `:hover` state being captured.

Evidence lands in `.pilot/` (gitignored — it contains a live Supabase session):

- `.pilot/screens/<viewport>--<screen>.png` — page-load captures (full content,
  including below the fold; `contentHeight` / `capturedHeight` /
  `captureTruncated` in the findings say exactly how much was captured)
- `.pilot/screens/<viewport>--<screen>--xN-<control>.png` — post-interaction
  captures (viewport-sized)
- `.pilot/findings.jsonl` — page-load signals
- `.pilot/interactions.jsonl` — interaction signals (separate file on purpose:
  `scripts/pilot.mjs` groups `findings.jsonl` by `label` to build the per-screen
  table, and label-less interaction records rendered a phantom `undefined` row)
- `.pilot/report.json`

## Interaction sweep (UX-PILOT-1c)

`tests/pilot/support/explore.ts` discovers the safe in-page controls on each
screen, exercises them, and records what happened. It exists because a pilot
that only proves a screen *renders* will happily pass a control that does
nothing — and writing a bespoke test per feature neither scales nor covers what
nobody remembered to write.

Three outcomes a machine can assert with certainty:

| Outcome | Meaning |
|---|---|
| `changed` | The control did something; a capture of the new state is attached |
| `dead` | Clicked, and nothing in the DOM changed — a control that looks interactive and isn't |
| `skipped` | Refused for safety, with the reason recorded |

Plus, per interaction: `introducedOverflow` (the interaction broke the layout)
and `consoleErrors`.

### Safety — read before widening any selector

The pilot account is in the **same Supabase project as production** and scans
cost real money. "Click everything" is indefensible there, so the explorer is
allow-list-first: only patterns that are local UI state are considered at all,
and anything inside a `<form>`, any submit button, anything that navigates away,
and anything whose accessible name looks destructive is refused. Refusals are
**recorded, never silent** — "not covered" must never read as "verified".

Two lessons already paid for, both caught by the fixture rather than by
production:

- The deny-list's first version used `\belimina\b`, which does **not** match
  "Eliminar" (the trailing `r` breaks the word boundary), so the decoy
  "Eliminar proyecto" button was clicked instead of refused. Stems are now
  anchored only at the start of a word. Over-refusing is the correct failure
  direction: refusing a harmless control costs coverage, clicking a destructive
  one costs data.
- `tests/pilot/fixtures/server.mjs` carries a deliberate dead control and a
  deliberate destructive-looking control, so `pnpm pilot:selfcheck` proves the
  detector and the refusal both still work.

### Budgets

`MAX_INTERACTIONS_PER_SCREEN = 4` and a hard `SWEEP_BUDGET_MS = 25_000` per
screen, well inside Playwright's 60s per-test timeout. The first real run blew
that timeout on a 32-row citations list at 375px taking full-page screenshots;
interaction captures are viewport-sized now. A long screen must degrade to
"fewer controls exercised" — visible in the evidence — never to a failed run
that verifies nothing.

## Asserting a reveal is actually legible

`assertFullyVisible` (`tests/pilot/support/journey.ts`) exists because
`expect(bubble).toBeVisible()` passed for a KPI tooltip that was rendering
half-cut behind its own card (`overflow: hidden` on the parent). The assertion
was green and the UX was broken. It now also asserts the revealed element is not
clipped by an ancestor and does not run outside the viewport — a class of defect
that is mechanically detectable and therefore should never have depended on a
human noticing it in a screenshot.

## What the harness does NOT check

Whether the screen **looks right**, whether it matches **what the PR promised**,
and whether the UX is any **good**. That is the `ux-pilot` agent's job: it reads
the PNGs with vision and judges them against the acceptance criteria, the
approved design, an interaction checklist, and a UX quality bar — and it always
returns concrete proposed improvements, even on a pass. See
`.claude/agents/ux-pilot.md`. The split is deliberate — assertions own what a
machine can know for certain, the agent owns judgement, and neither pretends to
do the other's work.

## Scope guard (UX-PILOT-1)

The pilot runs against the **same Supabase project as production**, and scans
cost real money. This phase is therefore strictly read-only:

- no scan launches;
- no project creation, rename, or deletion;
- no writing forms;
- no billing flows.

Write journeys need their own approval, with an explicit cost cap and a
cleanup strategy — see UX-PILOT-2a below for the one that has one.

**Switching project is not a write.** Reading a second and third project on the
same account (UX-PILOT-1d, `second-project.spec.ts`) is navigation and stays
inside this guard: every journey it runs is the same read-only pair of screens.
It exists because one project only ever exercises one shape of data — see
"Known limits". Nothing about it needed an exception.

**Launching a scan needs one, and now has it — see UX-PILOT-3 below.**

## UX-PILOT-3 — the pilot asks for a scan (opt-in, never automatic)

Task Intake approved 2026-08-03. Founder: *"que el pilot aprenda a lanzar
escaneos cuando lo necesite… solo necesita preguntarme y yo lo autorizo."*

**Why it exists.** Some states cannot be reached by looking harder. After a
scoring change there is, by construction, no run anywhere carrying the new
shape of data — `details_json` holds whatever the code that scored *that* run
wrote, and there is no backfill (ADR 0026 §4). PR #308 hit this exactly: six
acceptance criteria, including the whole trend chart, had no qualifying data on
any project the pilot could reach, so the verdict was INCONCLUSIVE and no
amount of harness work could change it. Without this journey that repeats on
every methodology PR, forever.

**Three independent locks.** "The agent asks first" is a human gate, and a
human gate alone is a convention — one forgetful code path and the money is
gone. This file's own rule is that the guard is *enforced in code by an
allow-list, not by convention*, so both hold at once:

1. **`workflow_dispatch` only.** `.github/workflows/ux-pilot-scan.yml` has no
   `deployment_status` trigger, so no preview deploy can start it. Triggering
   it is the founder's authorization — there is no path where it happens
   without one.
2. **`--journeys scan`.** `scripts/pilot.mjs` includes the `scan` Playwright
   project only for that explicit flag. The per-deploy workflow runs the
   default read set and cannot reach `tests/pilot/journeys/scan/**` at all.
3. **`PILOT_SCAN_AUTHORIZATION`.** `tests/pilot/support/scan-authorization.ts`
   refuses without the founder's secret, refuses without an explicitly named
   `PILOT_SCAN_PROJECT_ID`, and refuses above the hard cap of
   `MAX_SCANS_PER_RUN = 2` rather than clamping — a run that spends less than
   it was told to reads as a run that did what it was asked. Ten unit tests
   cover the refusal paths, because those are the ones that must never regress.

**What it does.** Presses the project's own "Repetir escaneo" button on an
existing project, up to twice, waiting for each to finish. Then captures the
Overview and Competitors screens that the scans just unlocked, through the
normal helper, so the evidence lands beside every other screenshot. Two is not
a round number: the trend chart needs two runs with position data before it
renders at all.

**What it does not do.** Create projects, add prompts, touch competitors,
delete anything, or pick its own target. The project is pinned by secret, never
auto-discovered — "scan whatever project is first" is how a pilot ends up
spending money on the founder's real tracked brand.

**Evidence and reporting** go to `pilot-evidence/pr-<n>-scan` and a
`<!-- agentic:ux-pilot-scan-result -->` comment, both distinct from the
read-only and write pilots' — otherwise a scan run would update the read
pilot's verdict in place and replace a screen-by-screen judgement with a
two-line cost report. The comment always states how many scans were authorized
and against which project: cost that is not stated is cost nobody reviews.

**Its output is captures, not a verdict.** A green scan run means the money was
spent and the screens were photographed. The `ux-pilot` agent still has to look
at them.

### Required secrets

| Secret | Purpose |
|---|---|
| `PILOT_SCAN_AUTHORIZATION` | The founder's grant. Absent everywhere else; without it nothing launches. |
| `PILOT_SCAN_PROJECT_ID` | The one project that may be scanned. Never auto-discovered. |

## UX-PILOT-2a — the one write journey (opt-in, not automatic)

`tests/pilot/journeys/write/add-prompt-and-scan.spec.ts` exercises the part of
the core flow read-only journeys structurally cannot: adding a prompt and
watching a scan actually run and complete. It is the closest thing to a
regression test for the P0 that used to matter most here — a scan stuck in
`pending`.

**Why it's safe to run against a real project, unlike a naive "launch a scan"
journey would be:**

The journey adds exactly **one** manual prompt through the real "Añadir
prompts" UI. `lib/projects/add-prompts.ts` launches the resulting scan with
`onlyPromptIds` set to just that new prompt — by construction, never the
project's full active set (up to `MAX_REAL_SCAN_PROMPTS` × active engines,
~30 LLM calls). Cost per run is ~1 prompt × active engines, and the UI's own
confirmation copy ("Se ha lanzado un escaneo restringido a estos prompts
nuevos") is asserted on directly, so the cost-cap claim is verified against the
product's own text, not just trusted.

The prompt it creates is cleaned up (soft-deleted via the real "Borrar
prompt" UI) at the end of every run, and a sweep at the **start** of every run
removes any test prompt a previous, crashed run left behind — so a failure
never permanently eats into the write-project's prompt-count limit
(`plan.caps.prompts`) across repeated runs. All test prompts carry a
`[PILOT-TEST]` marker for exactly this reason.

**What it does NOT do:** create or delete a project, edit or deactivate any of
the founder's real prompts, touch competitors or billing, or use the
unrestricted "Lanzar escaneo" button. Any of those needs its own approved
phase — not a quiet extension of this one.

### Why it's opt-in, not part of the automatic per-deploy pilot

A real scan costs real money against Gemini / OpenAI / Anthropic. Running it on
every preview deploy of every PR would be an unbounded, silently growing bill.
So this journey lives in its own Playwright project (`write`), which
`scripts/pilot.mjs` only includes when explicitly asked:

```bash
pnpm pilot --url <preview-url> --journeys write   # local
```

`.github/workflows/ux-pilot.yml` (the always-on one) never passes
`--journeys write`, and its default (`read`) explicitly enumerates
`auth, mobile, tablet, desktop` — an allowlist, not "everything except write" —
so adding more Playwright projects later can't silently make them part of the
automatic run either.

Triggering it in CI is manual: `.github/workflows/ux-pilot-write.yml`
(`workflow_dispatch`, input `pr_number`). Fire it — from the Actions UI, or via
`mcp__github__actions_run_trigger` (`run_workflow`) — only when a PR's
acceptance criteria genuinely require exercising the write path.

### The write-project: self-bootstrapping, no secret required

The journey mutates the project whose domain is `PILOT_WRITE_DOMAIN`
(`tests/pilot/support/write-guard.ts`, currently `mozilla.org`) and **creates it
through the real onboarding wizard if it does not exist**. Nobody has to prepare
anything by hand — same self-healing philosophy as `sweepTestPrompts`.

Why this is not the auto-discovery the read-only pilot deliberately refuses:
matching an exact reserved domain nobody would track for real cannot select the
wrong project. "Pick the first project on the account" could have selected
`mahou.es`; this cannot.

The domain is chosen to be real (the wizard fetches its homepage to ground its
suggestions, so an invented domain fails), stable, non-commercial, and with zero
overlap with the founder's actual market — obviously a test artifact to anyone
looking at the projects list.

**Bootstrap cost, one-off:** the wizard's first step runs real grounded Gemini
calls for competitors and prompts — that *is* the product's onboarding, and
driving it any other way wouldn't test it. Creation then scans whatever prompts
survive, so the journey trims the suggested set to exactly **one** before
submitting. Roughly 5–6 LLM calls total, once. Subsequent runs skip all of this.

`PILOT_WRITE_PROJECT_ID` still exists as an **optional** override, for pointing
the write journeys at a different project temporarily.

Preconditions the journey reports rather than forces past (all
`PILOT INCONCLUSIVE`):

- The account is at its plan's project cap, so the wizard can't open.
- The grounded suggestion call fails or times out.
- A scan is still running after the bounded wait — both project creation and
  add-prompts launch real scans, and "Añadir prompts" is disabled while one is
  active. `waitForNoActiveRun` waits it out first, so this only fires if the
  pipeline is genuinely stuck.

### Verdict classification specific to this journey

The scan launched by "Añadir prompts" runs synchronously, server-side, bounded
by Vercel's `maxDuration=60`. A timeout there is documented pipeline behavior
under load (`lib/scan/constants.ts`'s note on `MAX_REAL_SCAN_PROMPTS`,
`docs/scan-lifecycle.md`), not a UI defect this journey found — it's classified
as `PILOT INCONCLUSIVE`, same as a blocked button, never `PILOT FAIL`.

## GROWTH-2 Fase 2.1 — public-pages journey (read-only, part of the default set)

`tests/pilot/journeys/public-pages.spec.ts` covers the public/SEO surfaces
shipped in GROWTH-2 Fase 2.1: the blog (index + 5 posts), `/geo`, the legal
pages, and `/feed.xml`. No config change was needed — it matches the same
`**/journeys/*.spec.ts` pattern as `core-flow.spec.ts`, so it is automatically
part of the `mobile`/`tablet`/`desktop` projects and therefore already
included in the default `read` journey set (`scripts/pilot.mjs`) and in the
always-on `.github/workflows/ux-pilot.yml` run on every future preview.

Beyond the generic health checks (`assertPageIsHealthy` — layout overflow,
console errors, failed requests, no silent bounce to `/login`), it asserts
the two things specific to this phase: each page's own `<link
rel="canonical">` matches its expected absolute URL, and the blog pages'
`<title>` ends in "— Genscore". `/feed.xml` is checked separately via
`page.request.get` (it is XML, not a page to screenshot) for a 200 status, an
XML content type, and a well-formed `<rss version="2.0">` body linking back
to at least one post.

Does not cover `/` or `/pricing` — both are client components that cannot
export per-page `metadata` yet (see `docs/launch-plan.md`, Fase 7b ledger).
Add them here once a future phase gives them their own canonical.

**`tests/pilot/fixtures/server.mjs` was extended to match**: it now serves
minimal stand-ins for these same public routes (with the same canonical/title
shape) so `pnpm pilot:selfcheck` keeps proving the harness works end to end —
without this, the new journey would 404 against the fixture and the
self-check would report a false `PILOT FAIL` on every run.

## Known limits

- **Signup with email confirmation is not pilotable** — no mailbox. Stays a
  manual founder smoke.
- **Egress-restricted environments cannot run it directly.** Claude Code's
  remote environment (`Default — trusted network access`) blocks `*.vercel.app`
  at the egress proxy (`403` on CONNECT). This is why the CI workflow exists:
  GitHub's runner drives the browser and the agent judges the screenshots it
  publishes. A remote session that tries to run the harness itself gets
  INCONCLUSIVE, correctly.

- **Preview deployments are protected.** Verified live 2026-08-01: Vercel
  Deployment Protection redirects every preview URL to `vercel.com/login`
  (`Login – Vercel`), including for CI. The pilot needs `PILOT_VERCEL_BYPASS`
  (Vercel → Settings → Deployment Protection → Protection Bypass for
  Automation) to get through; without it every run reports INCONCLUSIVE at the
  login step. Protection stays on for human visitors.
- **Single account only.** The pilot cannot prove tenant isolation; that stays
  with `data-guardian`.
- **One project shows one shape of data.** The core-flow journey walks a single
  project, so whole branches of these screens are unreachable from it — a brand
  the AI never named, a project with fewer than two scans carrying position
  data, a ranking where most entities have no rank. `second-project.spec.ts`
  (UX-PILOT-1d) walks the Overview and Competitors screens on up to two further
  projects on the same account for exactly this reason (founder, 2026-08-03).
  It skips, loudly, when the account has only one project, and annotates the
  run when more projects existed than the cap allowed.
- **UX-PILOT-2a exercises one prompt, not real load.** It proves a scan can
  complete end-to-end, but with a single active prompt it does not reproduce
  the concurrency of a full `MAX_REAL_SCAN_PROMPTS`-sized scan across every
  active engine — which is exactly where the documented Gemini-timeout risk
  lives. A stuck-scan-under-real-load regression needs a different phase, with
  its own explicit cost budget.

## Harness self-check

`pnpm pilot:selfcheck` runs the real pilot against a local fixture app twice: a
healthy fixture that must produce `PILOT PASS`, and a deliberately overflowing
one that must produce `PILOT FAIL`. It proves the gate can both pass and fail.
A gate that cannot fail is not a gate — and a harness that quietly stopped
working would otherwise report a comfortable PASS forever.

It also asserts **capture depth**: the fixture wraps its authenticated pages in
the same viewport-pinned shell the real app uses, and the check reads the
height straight out of each PNG's IHDR chunk to confirm the capture actually
reached the bottom of the content. The findings could claim anything; the image
cannot. Verified 2026-08-03 by reverting the capture fix — the check reports
`PNG is only 812px tall, expected ~1938px` and the self-check fails, which is
what makes it worth running.
