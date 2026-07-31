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

**Two ways to get this running on every PR, not just this one:**

- **Manual today, on any PR:** copy the preview URL and run `pnpm pilot --url
  ...` yourself. Works right now, no further setup.
- **Agentic, via the Director:** ask the Director to run the pilot as part of
  its normal PR loop. This only works when the Director itself is running
  from a session with network access to `*.vercel.app` — a local Claude Code
  CLI session on your machine. A Claude Code **remote/web** session cannot do
  this (its egress proxy blocks the preview host by policy — see "Known
  limits"), so a remote-session Director will report `PILOT INCONCLUSIVE` and
  ask you to run it locally instead, exactly like it did on PR #279.

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
- **Egress-restricted environments cannot run it.** Claude Code's remote
  environment (`Default — trusted network access`) blocks `*.vercel.app` at the
  egress proxy (`403` on CONNECT), so pilots must run from an environment that
  can reach the preview — today, the founder's local CLI session. The harness
  returns INCONCLUSIVE rather than guessing.
- **Single account only.** The pilot cannot prove tenant isolation; that stays
  with `data-guardian`.

## Harness self-check

`pnpm pilot:selfcheck` runs the real pilot against a local fixture app twice: a
healthy fixture that must produce `PILOT PASS`, and a deliberately overflowing
one that must produce `PILOT FAIL`. It proves the gate can both pass and fail.
A gate that cannot fail is not a gate — and a harness that quietly stopped
working would otherwise report a comfortable PASS forever.
