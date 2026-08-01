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

Evidence lands in `.pilot/` (gitignored — it contains a live Supabase session):

- `.pilot/screens/<viewport>--<screen>.png`
- `.pilot/findings.jsonl`
- `.pilot/report.json`

## What the harness does NOT check

Whether the screen **looks right** and whether it matches **what the PR
promised**. That is the `ux-pilot` agent's job: it reads the PNGs with vision and
judges them against the acceptance criteria. The split is deliberate — assertions
own what a machine can know for certain, the agent owns judgement, and neither
pretends to do the other's work.

## Scope guard (UX-PILOT-1)

The pilot runs against the **same Supabase project as production**, and scans
cost real money. This phase is therefore strictly read-only:

- no scan launches;
- no project creation, rename, or deletion;
- no writing forms;
- no billing flows.

Write journeys are UX-PILOT-2 and need their own approval, with an explicit cost
cap and a cleanup strategy.

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

## Harness self-check

`pnpm pilot:selfcheck` runs the real pilot against a local fixture app twice: a
healthy fixture that must produce `PILOT PASS`, and a deliberately overflowing
one that must produce `PILOT FAIL`. It proves the gate can both pass and fail.
A gate that cannot fail is not a gate — and a harness that quietly stopped
working would otherwise report a comfortable PASS forever.
