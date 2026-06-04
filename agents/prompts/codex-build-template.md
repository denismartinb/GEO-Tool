# Codex Build Template

## Phase name

-

## Goal

-

## Scope

-

## Hard rules

- Do not change files outside the allowed scope.
- Stop if the branch is wrong, the worktree is unexpectedly dirty, or duplicate `* 2.*` / `* 3.*` files appear.
- Stop if schema, RLS, migrations, secrets, or protected runtime areas are touched without approval.

## Branch setup

- Start from updated `main`.
- Create a fresh implementation branch.
- Confirm `git status --short` is clean before editing.

## Implementation tasks

1. Read the GitHub issue as the source of truth.
2. Change only the allowed files.
3. Keep forbidden areas untouched.
4. Keep notes for the PR self-check and human gate.

## Validation

Run:

```bash
pnpm run validate
git diff --check
find . -path "./.git" -prune -o \( -name "* 2.*" -o -name "* 3.*" -o -name "index 2.lock" \) -print
```

## Commit

- Stage only intended files.
- Write a narrow commit message tied to the issue scope.

## Push

```bash
git push origin <branch-name>
```

## PR creation

```bash
gh pr create \
  --base main \
  --head <branch-name> \
  --title "<title>" \
  --body "<summary, validation, scope guard>"
```

## QA handoff after PR creation

- Apply labels if available:
  - `agent:claude-qa`
  - `status:ready-for-qa`
- Run or request:

```bash
bash scripts/post-claude-qa-handoff.sh <PR_NUMBER>
```

## Output required

- Files changed
- Validation result
- Risks / open questions
- What was explicitly not changed
- PR URL
