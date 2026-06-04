#!/usr/bin/env python3
"""Run Claude QA for a pull request using the AGENTIC handoff comment.

This script is designed for GitHub Actions. It reads PR metadata and diff text
from the GitHub API, reads the stable Claude QA handoff comment, calls the
Anthropic Messages API, and posts a structured QA result back to the PR.

It never checks out or executes PR head code.
"""

from __future__ import annotations

import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from typing import Any


HANDOFF_MARKER = "<!-- agentic:claude-qa-handoff -->"
RESULT_MARKER = "<!-- agentic:claude-qa-result -->"
VERDICTS = ("ACCEPT WITH MINOR FIXES", "ACCEPT", "BLOCKED")
MAX_PATCH_CHARS = 50000
MAX_HANDOFF_CHARS = 20000
MAX_BODY_CHARS = 12000


class QaError(RuntimeError):
  pass


def env(name: str) -> str:
  value = os.environ.get(name, "").strip()
  if not value:
    raise QaError(f"Missing required environment variable: {name}")
  return value


def request_json(method: str, url: str, token: str, payload: dict[str, Any] | None = None) -> Any:
  headers = {
    "Accept": "application/vnd.github+json",
    "Authorization": f"Bearer {token}",
    "X-GitHub-Api-Version": "2022-11-28",
  }
  data = None
  if payload is not None:
    data = json.dumps(payload).encode("utf-8")
    headers["Content-Type"] = "application/json"

  request = urllib.request.Request(url, data=data, headers=headers, method=method)
  try:
    with urllib.request.urlopen(request, timeout=30) as response:
      body = response.read().decode("utf-8")
      return json.loads(body) if body else None
  except urllib.error.HTTPError as error:
    detail = error.read().decode("utf-8", errors="replace")
    raise QaError(f"GitHub API request failed: {method} {url} {error.code} {detail[:500]}") from error


def github_api(repo: str, path: str) -> str:
  return f"https://api.github.com/repos/{repo}{path}"


def paginate(repo: str, path: str, token: str) -> list[dict[str, Any]]:
  output: list[dict[str, Any]] = []
  page = 1
  while True:
    separator = "&" if "?" in path else "?"
    url = github_api(repo, f"{path}{separator}per_page=100&page={page}")
    batch = request_json("GET", url, token)
    if not batch:
      return output
    output.extend(batch)
    if len(batch) < 100:
      return output
    page += 1


def truncate(value: str, limit: int) -> str:
  if len(value) <= limit:
    return value
  return value[:limit] + "\n\n[truncated for Claude QA prompt size]\n"


def find_handoff_comment(comments: list[dict[str, Any]]) -> str:
  for comment in reversed(comments):
    body = comment.get("body") or ""
    if HANDOFF_MARKER in body:
      return truncate(body, MAX_HANDOFF_CHARS)
  raise QaError("No Claude QA handoff comment found on PR. Run scripts/post-claude-qa-handoff.sh first.")


def build_files_section(files: list[dict[str, Any]]) -> str:
  sections: list[str] = []
  remaining = MAX_PATCH_CHARS

  for item in files:
    path = item.get("filename", "unknown")
    status = item.get("status", "modified")
    additions = item.get("additions", 0)
    deletions = item.get("deletions", 0)
    patch = item.get("patch") or "[patch unavailable from GitHub API]"
    entry = (
      f"### {path}\n"
      f"- status: {status}\n"
      f"- additions: {additions}\n"
      f"- deletions: {deletions}\n\n"
      f"```diff\n{patch}\n```\n"
    )
    if remaining <= 0:
      sections.append("\n[additional file patches truncated]\n")
      break
    sections.append(truncate(entry, remaining))
    remaining -= len(entry)

  return "\n".join(sections) if sections else "No changed files were returned by the GitHub API."


def build_prompt(pr: dict[str, Any], files: list[dict[str, Any]], handoff: str) -> str:
  return f"""You are Claude QA for the GEO Tool repository.

Review this pull request using only the trusted metadata, PR body, changed-file patches, and AGENTIC handoff comment below.

Do not ask to execute PR code. Do not suggest merging. Do not expose secrets. Do not expand scope.

Return a concise Markdown QA result. The first non-empty line must be exactly one of:

Verdict: ACCEPT
Verdict: ACCEPT WITH MINOR FIXES
Verdict: BLOCKED

Then include:
- Scope review
- Validation review
- Findings
- Required Codex fixes, if any
- Human Gate readiness

## Pull Request Metadata

- URL: {pr.get("html_url")}
- Number: {pr.get("number")}
- Title: {pr.get("title")}
- State: {pr.get("state")}
- Base: {pr.get("base", {}).get("ref")}
- Head: {pr.get("head", {}).get("ref")}
- Author association: {pr.get("author_association")}

## Pull Request Body

{truncate(pr.get("body") or "[no PR body]", MAX_BODY_CHARS)}

## AGENTIC Handoff Comment

{handoff}

## Changed Files and Patches

{build_files_section(files)}
"""


def call_anthropic(prompt: str) -> str:
  api_key = env("ANTHROPIC_API_KEY")
  model = os.environ.get("CLAUDE_QA_MODEL", "claude-sonnet-4-6").strip() or "claude-sonnet-4-6"
  payload = {
    "model": model,
    "max_tokens": 2200,
    "temperature": 0,
    "system": "You are a strict pull request QA reviewer. Return only the requested structured Markdown verdict.",
    "messages": [{"role": "user", "content": prompt}],
  }
  data = json.dumps(payload).encode("utf-8")
  request = urllib.request.Request(
    "https://api.anthropic.com/v1/messages",
    data=data,
    method="POST",
    headers={
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
      "x-api-key": api_key,
    },
  )
  try:
    with urllib.request.urlopen(request, timeout=120) as response:
      result = json.loads(response.read().decode("utf-8"))
  except urllib.error.HTTPError as error:
    detail = error.read().decode("utf-8", errors="replace")
    message = detail[:300]
    try:
      parsed = json.loads(detail)
      message = parsed.get("error", {}).get("message") or parsed.get("message") or message
    except json.JSONDecodeError:
      pass
    raise QaError(f"Anthropic API request failed with status {error.code}: {message}") from error

  blocks = result.get("content", [])
  text_parts = [block.get("text", "") for block in blocks if block.get("type") == "text"]
  text = "\n".join(part for part in text_parts if part).strip()
  if not text:
    raise QaError("Anthropic API returned no text content.")
  return text


def extract_verdict(text: str) -> str:
  first_lines = [line.strip() for line in text.splitlines() if line.strip()]
  first_line = first_lines[0] if first_lines else ""
  match = re.match(r"^Verdict:\s*(ACCEPT WITH MINOR FIXES|ACCEPT|BLOCKED)\s*$", first_line)
  if match:
    return match.group(1)

  for verdict in VERDICTS:
    if re.search(rf"\b{re.escape(verdict)}\b", text):
      return verdict
  return "BLOCKED"


def post_or_update_result(repo: str, pr_number: str, token: str, body: str) -> None:
  comments = paginate(repo, f"/issues/{pr_number}/comments", token)
  existing = None
  for comment in comments:
    if RESULT_MARKER in (comment.get("body") or ""):
      existing = comment
      break

  if existing:
    request_json("PATCH", github_api(repo, f"/issues/comments/{existing['id']}"), token, {"body": body})
  else:
    request_json("POST", github_api(repo, f"/issues/{pr_number}/comments"), token, {"body": body})


def list_label_names(repo: str, token: str) -> set[str]:
  labels = paginate(repo, "/labels", token)
  return {label.get("name", "") for label in labels}


def update_labels(repo: str, pr_number: str, token: str, verdict: str) -> None:
  label_names = list_label_names(repo, token)
  current_issue = request_json("GET", github_api(repo, f"/issues/{pr_number}"), token)
  current_labels = {label.get("name", "") for label in current_issue.get("labels", [])}

  remove_candidates = {"status:ready-for-qa"}
  add_candidates: list[str]
  if verdict == "BLOCKED":
    add_candidates = ["status:qa-blocked", "status:changes-requested"]
  else:
    add_candidates = ["status:ready-for-human-gate", "status:ready-for-human-review"]

  labels = set(current_labels)
  labels.difference_update(remove_candidates)
  for candidate in add_candidates:
    if candidate in label_names:
      labels.add(candidate)
      break

  if labels != current_labels:
    request_json("PUT", github_api(repo, f"/issues/{pr_number}/labels"), token, {"labels": sorted(labels)})


def main() -> int:
  if len(sys.argv) != 2:
    print("Usage: scripts/run-claude-qa.py <PR_NUMBER>", file=sys.stderr)
    return 2

  pr_number = sys.argv[1]
  repo = env("GITHUB_REPOSITORY")
  token = os.environ.get("GH_TOKEN") or os.environ.get("GITHUB_TOKEN") or ""
  if not token:
    raise QaError("Missing GH_TOKEN or GITHUB_TOKEN.")

  pr = request_json("GET", github_api(repo, f"/pulls/{pr_number}"), token)
  head_repo = (pr.get("head", {}).get("repo") or {}).get("full_name")
  if head_repo != repo:
    body = (
      f"{RESULT_MARKER}\n"
      "## Claude QA Result\n\n"
      "**Verdict:** BLOCKED\n\n"
      "Claude QA did not run because this PR head is not from the trusted base repository. "
      "This protects repository secrets and avoids running privileged automation on untrusted forks.\n"
    )
    post_or_update_result(repo, pr_number, token, body)
    update_labels(repo, pr_number, token, "BLOCKED")
    return 0

  comments = paginate(repo, f"/issues/{pr_number}/comments", token)
  try:
    handoff = find_handoff_comment(comments)
  except QaError as error:
    body = (
      f"{RESULT_MARKER}\n"
      "## Claude QA Result\n\n"
      "**Verdict:** BLOCKED\n\n"
      f"{error}\n\n"
      "Claude QA requires the AGENTIC handoff comment as source of truth.\n"
    )
    post_or_update_result(repo, pr_number, token, body)
    update_labels(repo, pr_number, token, "BLOCKED")
    return 0

  files = paginate(repo, f"/pulls/{pr_number}/files", token)
  prompt = build_prompt(pr, files, handoff)
  try:
    qa_text = call_anthropic(prompt)
  except QaError as error:
    body = (
      f"{RESULT_MARKER}\n"
      "## Claude QA Result\n\n"
      "**Verdict:** BLOCKED\n\n"
      "Claude QA could not complete because the Anthropic API returned an execution error.\n\n"
      f"Sanitized error: {error}\n\n"
      "No product code was reviewed by Claude in this run. Human Gate should wait for a successful Claude QA run or perform manual QA.\n"
    )
    post_or_update_result(repo, pr_number, token, body)
    update_labels(repo, pr_number, token, "BLOCKED")
    print(f"Claude QA blocked for PR #{pr_number}: Anthropic execution error")
    return 0

  verdict = extract_verdict(qa_text)

  body = (
    f"{RESULT_MARKER}\n"
    "## Claude QA Result\n\n"
    f"**Verdict:** {verdict}\n\n"
    f"{qa_text}\n\n"
    "---\n"
    "Generated by AGENTIC-5B Claude QA automation from the PR handoff comment. "
    "Human Gate remains manual.\n"
  )
  post_or_update_result(repo, pr_number, token, body)
  update_labels(repo, pr_number, token, verdict)
  print(f"Claude QA completed for PR #{pr_number} with verdict: {verdict}")
  return 0


if __name__ == "__main__":
  try:
    raise SystemExit(main())
  except QaError as error:
    print(f"Claude QA failed: {error}", file=sys.stderr)
    raise SystemExit(1)
