#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -ne 1 ]; then
  echo "Usage: bash scripts/generate-claude-qa-handoff.sh <PR_NUMBER>" >&2
  exit 1
fi

pr_number="$1"

if ! command -v gh >/dev/null 2>&1; then
  echo "gh CLI is required but not installed." >&2
  exit 1
fi

if ! gh auth status >/dev/null 2>&1; then
  echo "gh CLI is installed but not authenticated. Run 'gh auth login' and retry." >&2
  exit 1
fi

pr_json="$(gh pr view "$pr_number" --json url,title,body,baseRefName,headRefName,state,files)"

PR_JSON="$pr_json" python3 - "$pr_number" <<'PY'
import json
import os
import sys

pr_number = sys.argv[1]
pr = json.loads(os.environ["PR_JSON"])
files = pr.get("files", [])
file_paths = [item.get("path", "") for item in files if item.get("path")]

scope_guard = [
    "Do not expand scope beyond the PR and linked issue.",
    "Do not approve changes in schema, RLS, migrations, auth, providers, scan pipeline, billing, or security-sensitive areas unless explicitly allowed.",
    "Do not treat placeholders or undocumented assumptions as completed work.",
    "Do not expose secrets or token values in findings."
]

print("## Claude QA Handoff")
print()
print("Role: Claude QA")
print()
print(f"PR URL: {pr['url']}")
print(f"PR Number: {pr_number}")
print(f"Title: {pr['title']}")
print(f"Base: {pr['baseRefName']}")
print(f"Head: {pr['headRefName']}")
print(f"State: {pr['state']}")
print()
print("### Context")
print()
print("Review this PR against its stated scope, changed files, validation evidence, and AGENTIC workflow boundaries.")
print("Use the PR itself as the source of truth for implementation and handoff context.")
print()
print("### Files Changed")
print()
if file_paths:
    for path in file_paths:
        print(f"- `{path}`")
else:
    print("- No changed files were returned by GitHub metadata.")
print()
print("### Hard Rules")
print()
for rule in scope_guard:
    print(f"- {rule}")
print()
print("### Validation Commands")
print()
print("```bash")
print("pnpm run validate")
print("git diff --check")
print("find . -path \"./.git\" -prune -o \\( -name \"* 2.*\" -o -name \"* 3.*\" -o -name \"index 2.lock\" \\) -print")
print("bash scripts/agentic-handoff-check.sh")
print("```")
print()
print("### QA Focus")
print()
print("- Scope accuracy")
print("- Validation completeness")
print("- Forbidden-area drift")
print("- UX/copy issues if the PR touches user-facing behavior")
print("- Architecture honesty: no fake automation claims")
print()
print("### Output Format")
print()
print("Choose exactly one:")
print()
print("- `ACCEPT`")
print("- `ACCEPT WITH MINOR FIXES`")
print("- `BLOCKED`")
print()
print("If blocked, return:")
print()
print("- exact blocker list")
print("- file references")
print("- minimal Codex fix instructions")
print("- whether the PR is ready for Human Gate after fixes")
PY
