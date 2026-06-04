#!/usr/bin/env bash
set -euo pipefail

if ! command -v gh >/dev/null 2>&1; then
  echo "gh is not installed. Install/authenticate GitHub CLI, then rerun this script."
  exit 0
fi

labels=(
  "agent:codex|1f6feb|Codex implementation owner"
  "agent:claude-qa|5319e7|Claude QA reviewer"
  "status:planned|d4c5f9|Phase is defined and waiting to start"
  "status:building|fbca04|Implementation is in progress"
  "status:ready-for-qa|0e8a16|Ready for Claude QA review"
  "status:qa-blocked|b60205|Blocked by QA findings"
  "status:fixing|d93f0b|Fixes are in progress"
  "status:ready-for-human-gate|1d76db|Ready for final human decision"
  "status:merged|8250df|Work was merged"
  "risk:scope|8b949e|Scope-control risk"
  "risk:schema|b60205|Schema or migration risk"
  "risk:security|d93f0b|Security or secret-handling risk"
)

for entry in "${labels[@]}"; do
  IFS='|' read -r name color description <<< "$entry"
  if gh label create "$name" --color "$color" --description "$description" >/dev/null 2>&1; then
    echo "Created label: $name"
  else
    gh label edit "$name" --color "$color" --description "$description" >/dev/null
    echo "Updated label: $name"
  fi
done

echo "Agentic labels are ready."
