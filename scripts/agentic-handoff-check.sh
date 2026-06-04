#!/usr/bin/env bash
set -euo pipefail

scan_duplicates() {
  find . -path './.git' -prune -o \( -name '* 2.*' -o -name '* 3.*' -o -name 'index 2.lock' \) -print
}

printf '\n== Agentic Handoff Check ==\n'
printf 'Branch: '
git branch --show-current

printf '\nLatest commits:\n'
git log --oneline -5

printf '\nGit status:\n'
git status --short

printf '\nDuplicate file scan (pre-validation):\n'
pre_duplicates="$(scan_duplicates)"
if [ -n "$pre_duplicates" ]; then
  printf '%s\n' "$pre_duplicates"
  echo "Duplicate file check failed before validation."
  exit 1
fi
echo "clean"

printf '\nGitHub CLI:\n'
if command -v gh >/dev/null 2>&1; then
  if gh auth status; then
    printf '\nOpen PRs:\n'
    gh pr list --state open --limit 10 || echo "Could not list open PRs."
  else
    echo "gh is installed but authentication is not healthy; continuing without GitHub API checks."
  fi
else
  echo "gh not installed; skipping GitHub checks."
fi

printf '\nValidation:\n'
pnpm run validate

echo
printf 'Diff check:\n'
git diff --check

echo
printf 'Duplicate file scan (post-validation):\n'
post_duplicates="$(scan_duplicates)"
if [ -n "$post_duplicates" ]; then
  printf '%s\n' "$post_duplicates"
  echo "Duplicate file check failed after validation."
  exit 1
fi
echo "clean"

echo
printf 'Agentic handoff preflight passed.\n'
