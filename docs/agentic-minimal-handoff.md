# Agentic Minimal Handoff

AGENTIC-3 defines the smallest practical GitHub-centered handoff workflow for GEO Tool work.

It is intentionally semi-automated.

## Actors

- **Product Director / GPT**: defines the phase as a GitHub issue.
- **Codex Builder**: implements the issue on a dedicated branch, validates, commits, pushes, and opens the PR.
- **Claude QA**: reviews the PR against scope, validation, and safety boundaries.
- **Human Gate**: makes the final merge or stop decision.

## GitHub Objects

- **Issue**: source of truth for one phase or task.
- **Branch**: isolated implementation workspace.
- **PR**: handoff unit between build, QA, and final review.
- **PR comments / reviews**: QA findings and fix loop record.
- **Labels**: visible state machine and risk markers.

## Required Labels

- `agent:codex`
- `agent:claude-qa`
- `status:planned`
- `status:building`
- `status:ready-for-qa`
- `status:qa-blocked`
- `status:fixing`
- `status:ready-for-human-gate`
- `status:merged`
- `risk:scope`
- `risk:schema`
- `risk:security`

## State Machine

1. Product Director creates or updates the GitHub issue with `status:planned`.
2. Codex starts work on a fresh branch and moves the issue/PR context to `status:building`.
3. Codex opens the PR and marks it `status:ready-for-qa`.
4. Claude QA reviews the PR.
   - If blockers exist: `status:qa-blocked`.
   - If accepted: `status:ready-for-human-gate`.
5. Codex fixes blockers under `status:fixing`, then returns the PR to `status:ready-for-qa`.
6. Human Gate reviews the issue, PR, and QA outcome.
   - Merge
   - Request changes
   - Stop
7. After merge, the issue/PR can be marked `status:merged`.

## Stop Conditions

Agents must stop and report when any of the following happens:

- wrong branch
- dirty unexplained worktree
- duplicate `* 2.*` / `* 3.*` files
- validation fails
- schema / RLS / migrations were touched without explicit approval
- product runtime was touched out of scope
- secrets were exposed
- PR target branch is wrong

## What AGENTIC-3 Actually Automates

- standard GitHub issue and PR structure
- reusable prompts for build, QA, and fix loops
- a local preflight script for branch, PR, duplicate, and validation checks
- a shared label/state contract across agents

## What AGENTIC-3 Does Not Automate Yet

- autonomous Codex execution from GitHub Actions
- autonomous Claude review execution
- autonomous fix loops
- autonomous Product Director decisions
- automatic merge approval

Use AGENTIC-3 as a practical, auditable handoff workflow rather than a fake autonomous platform.

## AGENTIC-4 Update

New now:

- Claude QA handoff can be generated from PR metadata.
- The handoff can be posted to the PR as a comment.
- The PR comment becomes the source of truth for Claude QA context.
- The founder should not need to manually copy and paste the QA prompt.

Still manual:

- Claude execution itself, unless a separate integration exists.
- Human Gate.
- Merge approval.
