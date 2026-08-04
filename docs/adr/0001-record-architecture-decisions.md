# ADR 0001 — Record Architecture Decisions

**Date:** 2026-06-05  
**Status:** Accepted  
**Deciders:** Founder + Director

---

## Context

GEO Studio is a private-beta SaaS tool being built iteratively. We have already
made several non-obvious technical decisions (model pinning, sync vs async scan
execution, Vercel timeout configuration) that caused confusion and rework when
they were not documented.

We need a lightweight mechanism to record decisions so they are not rediscovered
or accidentally reversed.

---

## Decision

We will use Architecture Decision Records (ADRs) stored in `docs/adr/`.

Format:
- Numbered sequentially: `NNNN-short-title.md`
- Sections: Context, Decision, Consequences, Status
- Kept short (< 1 page for most decisions)

ADRs are written when:
- A non-obvious technical tradeoff is made
- A provider, model, or third-party dependency is pinned to a specific version or
  configuration
- A previously-considered alternative is explicitly rejected
- A decision is likely to be questioned or reversed without context

ADRs are owned by the `platform-deploy` and `reliability` agents for platform
decisions, `geo-strategy` for methodology decisions, and `data-guardian` for
schema/RLS decisions. The Director maintains the index.

### Numeración

The number is not a sequence counter, it is a **unique identifier**. Two ADRs
may never share one, because every reference in the codebase is a bare
`docs/adr/NNNN` and a duplicate turns that pointer into a coin flip.

Rules:

- Take the next number **above every number that already exists on `main`**,
  not above the ones on your branch. A branch cut days ago has a stale view.
- Before opening the PR, `git fetch origin main` and check again. Parallel
  agent sessions are the normal case here, not the exception: each one
  independently computes `max + 1` from its own base, so two branches
  claiming the same number is the *expected* failure, not bad luck.
- If the number you claimed is taken by the time you merge, renumber yours —
  never the one already on `main`. Renaming a merged ADR breaks every link to
  it; renaming an unmerged one costs a `sed`.
- `tests/adr-numbering.test.ts` enforces this and fails `pnpm test`. It can
  only see one branch at a time, so it catches a duplicate against `main`,
  not two branches racing for the same free number — that one still surfaces
  on whichever PR merges second.

This rule exists because it was broken twice in one week: `0026` was claimed by
both `article-imagery-policy` and `position-when-mentioned` (both merged, one
had to be renumbered to `0028` afterwards), and four separate branches claimed
`0027` at the same time.

---

## Consequences

- New ADRs should be short and written at decision time, not retrospectively.
- Existing decisions (ADR 0002, ADR 0003) are retroactively documented to cover
  decisions already made.
- The Director reads the ADR directory when orienting to the current state of the
  project.
