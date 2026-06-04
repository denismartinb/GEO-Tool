# Agentic QA Dispatch

AGENTIC-4 added a minimal PR-centered Claude QA handoff for this repository.

AGENTIC-5B adds real Claude QA execution from that handoff when `ANTHROPIC_API_KEY` is configured.

The goal is to remove manual copy and paste when a pull request is ready for QA.

## Available in AGENTIC-4

- Generate a Claude QA handoff from real GitHub PR metadata.
- Prepare or post a PR comment that includes:
  - PR URL
  - base and head branches
  - changed files
  - validation checklist
  - scope boundaries
  - Claude QA output format
- Use PR labels to indicate QA state:
  - `status:ready-for-qa`
  - `agent:claude-qa`
- Keep Human Gate manual.

## Not Available Yet

Even with AGENTIC-5B, the workflow does **not** provide:

- fully autonomous Codex fix loops
- autonomous GPT Director execution
- auto-merge

Claude QA execution is automated, but Human Gate remains manual.

## Dispatch Contract

1. Codex finishes implementation, validation, push, and PR creation.
2. Codex applies or requests QA labels.
3. A local script or GitHub workflow generates the Claude QA handoff from the PR itself.
4. The handoff is posted as a PR comment with a stable marker.
5. Claude QA reads the PR comment as the source of truth for review context.
6. Codex uses PR comments or reviews as the source of truth for fixes.
7. Human Gate remains the final merge decision.

AGENTIC-5B posts a stable `<!-- agentic:claude-qa-result -->` comment containing one of:

- `ACCEPT`
- `ACCEPT WITH MINOR FIXES`
- `BLOCKED`

## Manual Model Override

The Claude QA workflow defaults to `claude-sonnet-4-6`, the model validated during AGENTIC-5B. Manual `workflow_dispatch` runs may pass an optional `model` input to override it for that run.

If Anthropic reports that the default model is unavailable for the account, rerun the workflow with an allowed model such as `claude-sonnet-4-5`.

## Source of Truth

- GitHub Issue: phase contract
- Pull Request: implementation and QA unit
- PR Comment with handoff marker: Claude QA prompt/context
- PR Reviews / Comments: Claude findings and Codex fix loop

## Safety Rules

- Never claim Claude review has already happened unless it actually did.
- Never post secrets or token values.
- Never modify application runtime as part of the dispatch scripts.
- Never merge or push from the dispatch workflow.
- Stop when the PR target branch or labels are wrong.
