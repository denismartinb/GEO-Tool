# Agentic Delivery Pipeline

This repository uses a GitHub-based delivery flow for future GEO Tool phases.

## Flow

1. **PLAN** — Product Director turns product intent into a GitHub issue.
2. **BUILD** — Codex implements only the requested scope in a pull request.
3. **SELF-CHECK** — Codex documents what changed, what did not change, how to validate, and risks.
4. **QA** — Claude Code reviews the pull request against the phase checklist.
5. **FIX** — Codex fixes Claude QA findings.
6. **VERIFY** — Claude verifies the fixes.
7. **HUMAN GATE** — Denis approves, rejects, or requests another iteration.

## Artifact Roles

- **GitHub Issue**: phase brief and implementation contract.
- **Pull Request**: implementation unit for one narrow scope.
- **PR Template**: self-check record and handoff summary.
- **Issue Template**: product intent translated into execution-ready form.

## Labels

Use these labels consistently:

- `agent:plan`
- `agent:build`
- `agent:self-check`
- `agent:qa`
- `agent:fix`
- `agent:verify`
- `agent:human-gate`
- `status:ready-for-build`
- `status:ready-for-qa`
- `status:changes-requested`
- `status:ready-for-human-review`
- `status:blocked`
- `status:approved`
- `risk:ui-only`
- `risk:database`
- `risk:rls`
- `risk:auth`
- `risk:migration`
- `risk:pipeline`

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
