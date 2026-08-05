#!/usr/bin/env bash
#
# Vercel "Ignored Build Step" — BUILD-BUDGET-1 Fase 1.
#
# CONTRACT (Vercel's, not ours): exit code 0 means SKIP the build. Any other
# exit code means RUN it. That inversion is easy to get backwards, so every
# decision in here goes through run()/skip() rather than a bare exit.
#
# WHY THIS EXISTS: the Hobby plan caps the project at 100 deployments per day
# and the agentic flow was reaching it (50 preview deploys on 2026-08-03, 40 by
# 17:52 on 2026-08-04). 5 of the 41 commits merged since 2026-08-01 touched
# nothing that Next builds — docs, agent config, tests — and every one of them
# still cost a build, and a `ux-pilot` run on top of it.
#
# FAIL-OPEN BY DESIGN: every branch this script is not sure about ends in
# "run the build". A build that was skipped when it should have run leaves the
# PR's preview pointing at stale code, and the pilot would then judge a screen
# that is not what the commit says it is — the exact "verified something it
# never saw" failure the pilot exists to prevent. Quota is cheaper than that.
set -uo pipefail

run() { printf '[should-build] BUILD — %s\n' "$1"; exit 1; }
skip() { printf '[should-build] SKIP — %s\n' "$1"; exit 0; }

# Production is never skipped. The measured win is in previews (12 of the 90
# deployments in that two-day window were production), and a production deploy
# that silently does not happen is a much worse trade than one wasted build.
if [ "${VERCEL_ENV:-}" = "production" ]; then
  run "production deployment"
fi

sha="${VERCEL_GIT_COMMIT_SHA:-}"
[ -n "$sha" ] || sha="$(git rev-parse HEAD 2>/dev/null || true)"
[ -n "$sha" ] || run "no commit SHA to inspect"

# The SHA of the last *successful* deployment of this branch. Comparing against
# it — rather than against HEAD^ — is what makes the whole-push diff correct:
# a push of three commits is one deployment, and HEAD^ would only see the last
# of them. It also means consecutive doc-only pushes keep comparing against the
# last commit that was actually built, so nothing drifts out of the preview.
prev="${VERCEL_GIT_PREVIOUS_SHA:-}"
[ -n "$prev" ] || run "no previous successful deployment for this branch"

have() { git cat-file -e "${1}^{commit}" 2>/dev/null; }

# Vercel clones shallow, so the previous SHA is usually not present yet. Try to
# reach it; if we cannot, we build rather than guess.
if ! have "$prev"; then
  git fetch --quiet --depth=50 origin "${VERCEL_GIT_COMMIT_REF:-HEAD}" 2>/dev/null || true
fi
if ! have "$prev"; then
  git fetch --quiet --depth=1 origin "$prev" 2>/dev/null || true
fi
have "$prev" || run "previous SHA ${prev} is not reachable in this clone"
have "$sha" || run "commit ${sha} is not reachable in this clone"

changed="$(git diff --name-only "$prev" "$sha" 2>/dev/null)" || run "git diff failed"

if [ -z "$changed" ]; then
  # Includes the empty "retrigger" commits this phase bans: an empty diff means
  # the deployed output would be byte-identical to the one already live.
  skip "nothing changed since the last successful deployment"
fi

# Paths that cannot reach the built app. Verified 2026-08-04: nothing under
# app/, lib/, components/ or middleware.ts imports from tests/ or scripts/.
# `scripts/` is deliberately NOT on this list — this file lives there, and a
# change to the build-decision logic must always be exercised by a real build.
while IFS= read -r file; do
  [ -n "$file" ] || continue
  case "$file" in
    # Same argument as `scripts/` below, one level down: the pilot only ever
    # runs against a preview deployment (`ux-pilot.yml` triggers on
    # `deployment_status` and nothing else), so skipping the build for a change
    # to the pilot itself means that change can never be exercised. It happened
    # on 2026-08-05: a commit fixing the pilot's own interaction sweep was
    # deployed "Ignored", no preview, no pilot run, no way to know if the fix
    # worked. Unit tests under tests/ that run in CI are unaffected.
    tests/pilot/*) run "${file} changes the pilot, which needs a preview to run against" ;;
    docs/* | .claude/* | .github/* | tests/* | agents/*) ;;
    # Root-level prose only (CLAUDE.md, README.md, PRD.md…). A nested .md may
    # be routed content — pageExtensions in next.config.ts includes "md".
    */*) run "${file} affects the build" ;;
    *.md) ;;
    *) run "${file} affects the build" ;;
  esac
done <<<"$changed"

skip "only docs, agent config, CI workflows and tests changed"
