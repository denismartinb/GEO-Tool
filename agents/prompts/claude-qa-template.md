# Claude QA Template

## PR URL

-

## Context

Read the Claude QA handoff comment on the PR first. Treat that comment, the PR template and the changed files as the source of truth.

## Files to review

Use the changed-file list included in the PR handoff comment.

## Scope boundaries

- Confirm the PR matches the issue only.
- Confirm forbidden files stayed untouched.
- Confirm no out-of-scope runtime or schema work slipped in.

## Validation commands

```bash
pnpm run validate
git diff --check
find . -path "./.git" -prune -o \( -name "* 2.*" -o -name "* 3.*" -o -name "index 2.lock" \) -print
```

## Functional QA

- Scope implementation matches the issue.
- No fake or incomplete behavior is being presented as done.

## Backend / security QA

- No secret exposure.
- No schema / RLS / migration drift unless explicitly approved.
- No unsafe workflow or automation claims.

## UX / copy QA

- Copy is clear and consistent.
- Handoff and review states are understandable.

## Architecture / scope QA

- No unnecessary platform complexity.
- No hidden product runtime changes.

## Output

Choose exactly one:

- `ACCEPT`
- `ACCEPT WITH MINOR FIXES`
- `BLOCKED`

If blocked, return:

- exact blocker list
- file references
- minimal Codex fix instructions
- whether the PR is ready for Human Gate after fixes
