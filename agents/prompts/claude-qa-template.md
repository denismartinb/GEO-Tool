# Claude QA Template

## PR URL

-

## Context

-

## Files to review

-

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
- expected Codex fix prompt format
