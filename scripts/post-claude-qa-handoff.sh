#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -ne 1 ]; then
  echo "Usage: bash scripts/post-claude-qa-handoff.sh <PR_NUMBER>" >&2
  exit 1
fi

pr_number="$1"
marker="<!-- agentic:claude-qa-handoff -->"

if ! command -v gh >/dev/null 2>&1; then
  echo "gh CLI is required but not installed." >&2
  exit 1
fi

if ! gh auth status >/dev/null 2>&1; then
  echo "gh CLI is installed but not authenticated. Run 'gh auth login' and retry." >&2
  exit 1
fi

repo="$(gh repo view --json nameWithOwner --jq '.nameWithOwner')"
comment_body="$marker
$(bash scripts/generate-claude-qa-handoff.sh "$pr_number")"
existing_comment_id="$({ gh api "repos/$repo/issues/$pr_number/comments" --paginate; } | python3 -c 'import json,sys
comments=json.load(sys.stdin)
marker="<!-- agentic:claude-qa-handoff -->"
for comment in comments:
    if marker in comment.get("body", ""):
        print(comment["id"])
        break
' || true)"

if [ -n "$existing_comment_id" ]; then
  gh api \
    --method PATCH \
    "repos/$repo/issues/comments/$existing_comment_id" \
    -f "body=$comment_body" >/dev/null
  echo "Updated existing Claude QA handoff comment on PR #$pr_number."
else
  gh pr comment "$pr_number" --body "$comment_body" >/dev/null
  echo "Posted Claude QA handoff comment on PR #$pr_number."
fi
