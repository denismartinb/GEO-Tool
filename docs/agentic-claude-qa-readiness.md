# AGENTIC-5A Claude QA Auto-run Readiness

## Current status

**Classification: `HANDOFF_ONLY`.**

AGENTIC-4 currently provides a GitHub-centered Claude QA handoff:

- `scripts/generate-claude-qa-handoff.sh` generates a QA prompt from real PR metadata.
- `scripts/post-claude-qa-handoff.sh` posts or updates a stable PR comment marked with `<!-- agentic:claude-qa-handoff -->`.
- `.github/workflows/claude-qa-handoff.yml` can post that handoff from `workflow_dispatch` or PR labels.
- The handoff comment tells Claude QA what to review and what output format to use.

AGENTIC-4 does **not** currently execute Claude automatically.

`.github/workflows/claude-qa.yml` is a conservative placeholder. It detects QA triggers and checks for a placeholder secret, but it does not call Anthropic, Claude Code, or any real Claude execution action. It also does not post a review verdict back to the PR.

## Current GitHub readiness notes

The repository already has:

- PR-centered handoff comments.
- QA trigger labels such as `agent:qa` and `status:ready-for-qa`.
- Human Gate labels such as `status:ready-for-human-review`.
- Local validation and duplicate-file guards.
- A clear Claude QA output contract in the handoff template.

During this audit, local repo inspection was sufficient to classify the current implementation as handoff-only. GitHub secret values must never be printed. If checking repository secrets, list names only.

Observed during this audit:

- `gh repo view` resolved `denismartinb/GEO-Tool` with default branch `main`.
- PR #11 remained open on `feature/ux-align-2a-runs-operational-hub` and was not modified.
- `gh secret list` returned no visible repository secret names.

## Required secrets

The exact secret depends on the chosen Claude execution path. Candidate secret names:

- `ANTHROPIC_API_KEY` for direct Anthropic API-based QA execution.
- `CLAUDE_CODE_OAUTH_TOKEN` if using an approved Claude Code GitHub automation path.
- `CLAUDE_QA_TOKEN` only if it is intentionally retained as a generic internal placeholder and mapped to a real Claude integration.

`GITHUB_TOKEN` is provided by GitHub Actions automatically and should not be stored or printed manually.

## Required workflow changes

To execute Claude automatically from the handoff comment, AGENTIC-5B should replace the placeholder path in `.github/workflows/claude-qa.yml` with a real, reviewed Claude execution step.

The workflow should:

1. Resolve the PR number from `workflow_dispatch` or label event.
2. Fetch the PR metadata and the latest handoff comment.
3. Build a bounded QA prompt from:
   - PR title/body.
   - Changed files.
   - Handoff comment.
   - Existing Claude QA template.
4. Run Claude through the chosen approved integration.
5. Post a structured QA result as a PR comment or review.
6. Apply label transitions based on the verdict.
7. Never merge, push fixes, or mutate product code.

Do not add untested third-party actions or fake Claude execution. If the required secret is missing, the workflow should skip gracefully and explain which secret name is required.

## Safe trigger model

Recommended triggers:

- `workflow_dispatch` with explicit `pr_number`.
- PR label `status:ready-for-qa`.
- PR label `agent:qa`.
- Optional compatibility label `agent:claude-qa` if that label exists in the repository.

Use conservative permissions. Avoid running privileged write-token workflows against untrusted fork code.

## Output contract

Claude QA should post exactly one verdict:

- `ACCEPT`
- `ACCEPT WITH MINOR FIXES`
- `BLOCKED`

The result should include:

- scope verdict;
- validation verdict;
- blocking findings, if any;
- file references for blockers;
- minimal Codex fix instructions;
- whether the PR is ready for Human Gate.

## Label transitions

Recommended transitions:

- `status:ready-for-qa` -> `status:qa-blocked` when verdict is `BLOCKED`.
- `status:ready-for-qa` -> `status:ready-for-human-gate` when verdict is `ACCEPT`.
- `status:ready-for-qa` -> `status:ready-for-human-gate` plus a clear minor-fix note when verdict is `ACCEPT WITH MINOR FIXES`.

Keep `risk:*` labels unchanged unless the QA result explicitly identifies incorrect risk classification.

## Safety constraints

- Never auto-merge.
- Never expose secrets or token values.
- Never run on untrusted forks with a privileged write token.
- Do not execute arbitrary PR code with privileged credentials.
- Keep Human Gate manual.
- Keep Codex fix loops explicit and PR-bound.
- Do not claim Claude reviewed a PR unless a real Claude execution or human Claude session produced the result.

## Next implementation phase

### AGENTIC-5B — Execute Claude QA from PR handoff

Goals:

- Choose one approved Claude execution integration.
- Wire `.github/workflows/claude-qa.yml` to execute Claude only when the required secret is present.
- Read the existing handoff comment as the source of truth.
- Post a structured QA verdict back to the PR.
- Apply safe label transitions.
- Preserve Human Gate as the final merge decision.

Non-goals:

- No auto-merge.
- No autonomous Codex fixes.
- No Product Director automation.
- No product runtime changes.
- No schema/RLS/migration/provider/pipeline changes.
- No execution on untrusted fork code with privileged credentials.
