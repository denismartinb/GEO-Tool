# ADR 0001 — Record Architecture Decisions

**Date:** 2026-06-05  
**Status:** Accepted  
**Deciders:** Founder + Director

---

## Context

Lumira is a private-beta SaaS tool being built iteratively. We have already
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

---

## Consequences

- New ADRs should be short and written at decision time, not retrospectively.
- Existing decisions (ADR 0002, ADR 0003) are retroactively documented to cover
  decisions already made.
- The Director reads the ADR directory when orienting to the current state of the
  project.
