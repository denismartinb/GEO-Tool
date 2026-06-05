# CLAUDE.md — GEO Studio Constitution

GEO Studio is a private-beta SaaS that helps brands understand and improve how
they appear in AI-generated answers.

**Talk to the Director for every request.** The Director is the primary agent:
it evaluates critically, consults specialists, orchestrates implementation, and
owns the quality of every deliverable. Start sessions with `--agent director`.

> Architecture context: `.claude/agents/*.md` holds all specialist agents.
> `.claude/rules/*.md` holds path-scoped invariants. `docs/` holds the
> long-term roadmap, environment contract, scan lifecycle, and ADRs.

---

## Core Target Flow (H1 — must work before anything else)

```
Registro/Login
→ Nuevo dominio
→ Competitors suggested by system (Gemini)
→ Prompts suggested by system (Gemini)
→ Primer escaneo Gemini
→ Scan exits pending → done
→ Overview renders real scan data
→ Prompts / Competitors / Recommendations / Escaneos
```

**Do not ship fake product behavior.**

---

## Task Intake Protocol

Before implementing any non-trivial request, the Director decides:

- **Small, clear, low-risk** → execute directly.
- **Broad, ambiguous, or risky** → produce a Task Intake Report first and wait
  for explicit approval.

Task Intake is **mandatory** when the request:

- says "implementa este diseño" / "implement this design";
- says "arregla el flujo" / "compara las pantallas";
- says "Sí" or "go ahead" without a specific approved Task Intake Report on record;
- touches multiple screens, UX/UI alignment, scanning state, onboarding flow,
  prompts or competitors flow;
- touches Gemini, Supabase, auth, schema, RLS, pipeline, or server actions;
- asks for broad UX alignment, continuation without a precise issue, or mixes
  product/backend/design concerns;
- could produce a large PR.

Additional enforced rules:

- Never ask "Which gap should I implement?" after a broad audit — produce a
  full report and recommend the first safe phase explicitly.
- Never interpret a broad "Sí" as blanket approval for all gaps simultaneously.
- Never collapse multiple concerns into one PR without explicit approval.
- Always bias toward P0 functional blockers before P1/P2 visual polish; say so
  explicitly when both exist.
- Separate audit → planning → implementation → QA → Human Gate as distinct
  steps.

When in doubt, prefer Task Intake. **Interpreting and scoping first is always
cheaper than building the wrong thing.**

The Task Intake Report must end with:
> "Do you approve this plan? I will not implement until you confirm."

---

## Retroactive Regularization Protocol

If the Director implements before approval:

1. Stop immediately. Do not add more commits, do not continue, do not merge.
2. Report: branch, commit hash, PR URL if any, files changed, exact summary,
   validation result, whether any forbidden areas were touched.
3. Convert the work into a retroactive Task Intake Report.
4. Mark PR as Draft if already opened.
5. Wait for founder decision: approve, reject, or split.

---

## Agentic Operating Model

All non-trivial work follows this flow:

1. Start from updated `main`.
2. Create a dedicated branch.
3. Implement the smallest safe slice.
4. Run `pnpm test && pnpm run validate`.
5. Push branch.
6. Open PR.
7. Post or rely on AGENTIC handoff.
8. Let automated Claude QA run.
9. Wait for Human Gate before merge.

**Never commit directly to `main`. Never force-push without approval. Never
auto-merge. Human Gate is always manual.**

---

## Human Gate

Human Gate is always manual. It asks:

1. Is the problem real and important?
2. Was the implemented scope correct?
3. Did validation pass? Did tests pass?
4. Did Claude QA accept?
5. Are there product risks?
6. Should this merge now?

Only after Human Gate may a PR be merged.

---

## Task Classification

- **P0** — Core flow blocker: scan stuck, Gemini failing, Overview no data,
  auth broken, project creation broken.
- **P1** — Structural UX mismatch: wrong flow order, missing step, confusing nav.
- **P2** — UI/copy inconsistency: cards, badges, spacing, copy differ from
  design but flow works.
- **P3** — Polish: animation, microcopy, minor visual refinements.

**P0 must be fixed before visual polish.**

---

## Forbidden Without Explicit Approval

Do not implement without explicit founder approval:

- schema migrations;
- RLS changes;
- service-role shortcuts;
- OpenAI runtime;
- Perplexity runtime;
- crawler;
- background scheduler;
- billing;
- teams / RBAC;
- auto-merge;
- automatic destructive cleanup;
- hard delete of projects (already shipped in DATA-MGMT-1);
- fake suggestions;
- fake recommendations;
- fake scans;
- fake monitoring;
- fake metrics.

---

## Implementation Rules

Before editing: check current branch, git status, recent commits, handoff check.

During: keep changes small; prefer one concern per PR; avoid speculative
rewrites; document tradeoffs; stop if scope expands.

After: `pnpm test && pnpm run validate`; open PR; apply labels; rely on Claude
QA; report exact changed files and results.

Never delete source files casually. Never touch `Documentacion/` unless
explicitly instructed.

---

## Standard Commands

```bash
# Preflight
git switch main && git pull origin main
git status --short && git log --oneline -8
bash scripts/agentic-handoff-check.sh

# Validation
pnpm test
pnpm run validate
git diff --check
bash scripts/agentic-handoff-check.sh
```

---

## Design Reference

`GEO Suite-2.zip` is the UX/UI source of truth (`docs/design-reference/`).
Do not rename GEO Studio to Lumira. Do not blindly paste prototype code.
Do not introduce prototype-only state as real product behavior.

---

## GitHub / Agentic Reporting

Every PR must contain or trigger:

- linked issue; summary; validation; scope guard;
- `<!-- agentic:claude-qa-handoff -->` comment;
- `<!-- agentic:claude-qa-result -->` comment;
- clear Human Gate status.

**QA execution model:** Claude QA is run by the `qa` specialist subagent
(`.claude/agents/qa.md`) invoked by the Director. It does NOT use GitHub
Actions or the Anthropic API key. The `.github/workflows/claude-qa.yml`
workflow and `scripts/run-claude-qa.py` are superseded and should not be used.

---

## Index of Agent and Documentation Files

### Agents (`.claude/agents/`)

| File | Role |
|---|---|
| `director.md` | **Primary interface** — strategy, criticism, orchestration, quality |
| `task-intake.md` | Prompt optimizer, Task Intake Reports |
| `geo-strategy.md` | GEO methodology, metrics, recommendations |
| `core-flow.md` | End-to-end user journey |
| `gemini-pipeline.md` | Gemini execution and scan persistence |
| `data-guardian.md` | Schema, RLS, auth, data integrity (plan mode) |
| `ux-alignment.md` | Design reference comparison, gap lists (plan mode) |
| `frontend.md` | Next.js UI implementation |
| `qa.md` | Regression gate before Human Gate |
| `test-architect.md` | Test strategy and Vitest coverage |
| `reliability.md` | Scan lifecycle, stuck scans, timeouts, cancellation |
| `platform-deploy.md` | Vercel config, env vars, model pinning |
| `release.md` | GitHub workflow, PRs, merge safety |

### Path-scoped rules (`.claude/rules/`)

| File | Paths |
|---|---|
| `supabase.md` | `supabase/**`, `lib/supabase/**` |
| `gemini.md` | `lib/llm/**` |
| `server-actions.md` | `app/**/actions.ts` |

### Documentation (`docs/`)

| File | Purpose |
|---|---|
| `director-strategy.md` | Long-term roadmap (H1/H2/H3), active work, completed phases |
| `environment-contract.md` | All env vars, Vercel config, smoke checklist |
| `scan-lifecycle.md` | Scan state machine and invariants |
| `adr/0001-record-architecture-decisions.md` | ADR process |
| `adr/0002-gemini-model-pinning.md` | Gemini model pinned to versioned id |
| `adr/0003-sync-scan-execution-and-maxduration.md` | Sync scans + maxDuration=60 |
| `agentic-*.md` | Existing agentic pipeline docs (handoff, QA, delivery) |

---

## Final Instruction

Move fast, but never fake progress.

If the product is broken, say exactly where and why.

If the design cannot be matched safely in one PR, split the work.

If a change requires backend/schema work, stop and ask for an explicit backend
phase.

The goal is not to produce lots of PRs. The goal is to make GEO Studio actually
work and look like the intended product.
