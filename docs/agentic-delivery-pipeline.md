# Agentic Delivery Pipeline

This repository uses a GitHub-centered delivery flow for future GEO Tool phases.

## Available Now

- GitHub issue as the phase brief and source of truth
- GitHub pull request as the build / QA / fix handoff unit
- Reusable prompt templates for Codex build, Claude QA, and Codex fix loops
- Local safety preflight via `scripts/agentic-handoff-check.sh`
- Label-based state machine for build, QA, fix, and human gate
- Claude QA handoff generation from real PR metadata
- Optional PR comment posting so the QA prompt lives on the PR itself
- Manual Human Gate before merge

## Flow

1. **PLAN** — Product Director turns product intent into a GitHub issue.
2. **BUILD** — Codex implements only the requested scope in a pull request.
3. **SELF-CHECK** — Codex documents what changed, what did not change, how to validate, and risks.
4. **QA** — Claude QA reviews the pull request against the phase checklist.
5. **FIX** — Codex fixes Claude QA findings.
6. **VERIFY** — Claude verifies the fixes.
7. **HUMAN GATE** — Denis approves, rejects, or requests another iteration.

## Artifact Roles

- **GitHub Issue**: phase brief and implementation contract.
- **Pull Request**: implementation unit for one narrow scope.
- **PR Template**: self-check record and handoff summary.
- **Issue Template**: product intent translated into execution-ready form.
- **PR Comments / Reviews**: structured QA findings and fix loop record.

## Labels

Use these labels consistently:

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

## Workflow Reality Check

GitHub Actions in this repository are currently **guardrails and placeholders**, not autonomous agent runners.

They can summarize context and enforce conservative reminders, but they do **not** currently provide:

- fully automated Codex execution from GitHub Actions
- fully automated Claude review
- fully automated fix loops
- autonomous Product Director execution
- automatic merge approval

AGENTIC-4 delivers a semi-automated handoff model centered on GitHub, shared prompts, PR-based Claude QA dispatch, validation discipline, and a manual Human Gate.

## Allowed Scope Boundaries

This phase only scaffolds documentation, GitHub templates, agent role prompts, and safe workflow placeholders.

It must not change:

- application runtime code
- Supabase schema
- migrations
- RLS
- auth
- provider runtime
- scan/run/job pipeline logic
- package dependencies
- product UI

## Expected Discipline

- Keep issues narrow and explicit.
- Keep PRs tied to one issue.
- Keep QA focused on the brief and the checklist.
- Keep the human gate manual.
- Stop when branch, validation, or scope guardrails fail.

## AGENTIC-4 Reality Check

New now:

- Claude QA handoff can be generated directly from PR metadata.
- The handoff can be posted to the PR as a comment with a stable marker.
- The PR becomes the source of truth for Claude QA prompts and findings.

Still manual:

- Claude execution itself, unless a separate integration is configured.
- The Codex fix loop beyond reading Claude findings from PR comments or reviews.
- Human Gate and merge approval.
