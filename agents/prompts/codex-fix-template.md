# Codex Fix Template

## PR URL

-

## Claude findings

Read the latest Claude QA PR comment or review thread and copy only the actionable blockers here.

## Blockers to fix

-

## Hard rules

- Fix only the listed findings.
- Do not widen scope.
- Do not touch protected areas unless a finding explicitly requires it and the issue allows it.
- Re-run validation before reporting done.

## Minimal fix instructions

1. Reproduce the finding from the PR comment or review.
2. Apply the smallest safe correction.
3. Re-run validation.
4. Update the PR summary if needed.
5. Return the PR to `status:ready-for-qa` when blockers are resolved.

## Validation

```bash
pnpm run validate
git diff --check
find . -path "./.git" -prune -o \( -name "* 2.*" -o -name "* 3.*" -o -name "index 2.lock" \) -print
```

## Commit

- Stage only files required by the fixes.
- Use a narrow follow-up commit message.

## Push

```bash
git push origin <branch-name>
```

## Output required

- Findings fixed
- Files changed
- Validation result
- Remaining risks or follow-ups
