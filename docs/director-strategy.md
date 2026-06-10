# Director Strategy — GEO Studio Product Roadmap

This file is the Director's long-term memory. Read it at the start of every
session. Update it when a horizon shifts or a decision changes the roadmap.

---

## START HERE — next session pickup (updated 2026-06-10)

**All 3 "possible P0" items from the 2026-06-08 founder walkthrough are now
DONE and merged to `main`:**
1. "Añadir dominio" CTA on Escaneos — PR #44 ✅
2. Recommendations badge mismatch (8 vs 2) — PR #45 + migration 0007 ✅
3. "Eliminar dominio" hard delete — PR #46 (DB) + PR #49 (app) ✅, migrations
   0005/0006/0007 applied live to Supabase ✅

Two P1 UX phases also shipped: PR #47 (scan-in-progress banner on Escaneos),
PR #48 (wizard suggestion-loading overlay).

**Founder still needs to do a production smoke-test of PR #49** (delete
domain) — see manual test plan already given in chat. If it works, no further
action; if it fails, that's the first thing to fix next session.

**Open items, in recommended order:**
1. **Clarify item 9** — founder said "la página de Recomendaciones generadas
   no tiene que estar". Ambiguous: does this mean removing "Soluciones
   generadas" from the sidebar nav entirely, or something about the
   Recomendaciones page itself? Needs a direct question to the founder before
   any work — see "Detected gaps" P2 section below.
2. **P1 — Overview "Qué hacer primero" summary card** — surfaces top
   recommendations with Impacto/Esfuerzo/Confianza, per founder's
   design-reference screenshot. Not started. Likely needs `geo-strategy` input
   (this is the H2 "actionable recommendations" work intersecting with H1
   Overview).
3. **P2 — Prompts screen vs. design reference** — needs `ux-alignment` to
   produce an exact gap list against `states.jsx` (current build already has
   a Topics tab, so this is a refinement, not a missing feature).
4. **Wizard steps 2/3 redesign** — mentioned in original gap list, never
   scoped via Task Intake.
5. **ASYNC-SCAN-1** (async scans + notifications) — gated, needs a Task Intake
   Report (`reliability` + `platform-deploy`) before any code, per existing
   plan below. Do not start without explicit founder approval (touches
   ADR-0003, schema, RLS, background scheduler — all Forbidden-without-approval).

**Standing instruction from founder:** always tell them exactly what to test
manually whenever a PR needs Human Gate approval.

---

## Product mission

GEO Studio helps brands understand and improve how they appear in AI-generated
answers. The product measures visibility in LLM responses (Gemini and others),
scores it, tracks it over time, and turns the data into actionable
recommendations.

This is a private-beta SaaS tool. The priority is a working core loop — not
feature breadth.

---

## Three horizons

### H1 — Now: core loop must work end to end

The core loop is the minimum viable product. Every other priority is blocked
until H1 is clean.

```
Registro / Login
→ Nuevo dominio
→ Competitors suggested by the system (Gemini-backed)
→ Prompts suggested by the system (Gemini-backed)
→ Primer escaneo Gemini
→ Scan exits pending → done (not stuck)
→ Overview renders real scan data
→ Prompts / Competitors / Recommendations / Escaneos (all with real data)
```

**Current H1 status (updated 2026-06-05):**
- Wizard UX (2-column, auto-suggestions): working
- Competitor suggestions via Gemini: working (after model pin fix)
- Prompt suggestions via Gemini: working
- Scan stuck in pending: BLOCKER — stuck scans from before the `maxDuration=60`
  fix remain unresolvable without a cancel-scan action
- Overview with real data: unverified — depends on scan completing
- Gemini model pinned: `gemini-2.0-flash-001` (see ADR 0002)
- Vercel `maxDuration=60` on scan route (see ADR 0003)

**Next H1 actions (in priority order):**
1. Cancel-scan action for stuck runs (P0 blocker for launch)
2. Verify full scan → Overview data flow end to end
3. UX baseline pass aligned to GEO Suite design reference

### H2 — Next: GEO product differentiators

Work here only after H1 is clean and smoke-tested.

- Visibility scoring: composite metric (mention rate, share of voice, sentiment,
  citations) documented and computed from real data
- Temporal comparison: visibility trend over scans
- Actionable recommendations: generated from real scan deltas, not filler
- Share of voice per competitor
- Prompt performance breakdown

Owner of methodology: `geo-strategy` agent. Do not implement H2 features
without a GEO Strategy consultation.

### H3 — Future: platform

Work here only after H2 has real data and a validated scoring model.

- Multi-user / teams / RBAC
- Email alerts on visibility changes
- Public API
- Integrations (Slack, etc.)
- Billing / plans

These are explicitly **forbidden** to implement without a dedicated phase
approval (they appear in `CLAUDE.md`'s Forbidden list).

---

## Planned phase — ASYNC-SCAN-1 (not started, not approved)

**Origin:** while testing the redesigned add-domain wizard (PR #41), the
founder asked whether scan launch could be made asynchronous so the user lands
immediately on Escaneos and gets a bell notification when the scan finishes,
instead of waiting through the synchronous 30-90s scan inside `createProject`
(current mitigation: a loading overlay, shipped in PR #41).

**Why this is a phase, not a patch:** async execution means reopening
ADR-0003 (which currently mandates sync execution + `maxDuration=60` for the
private beta and explicitly marks async as "forbidden without explicit phase
approval"), plus a notifications system — new schema, new RLS policies, a
background-execution mechanism (`CLAUDE.md` lists "background scheduler" as
forbidden without approval). None of this should be implemented piecemeal.

**Why it is also necessary, not optional:** the founder confirmed that
**daily/scheduled scans** are on the roadmap. Scheduled scans are async by
definition — there is no user request to hang a synchronous call off of, so
the system needs a scheduler, background scan execution, and a way to tell the
user something finished without them asking. That is the *same*
infrastructure this phase would build for the manual "create domain" flow,
just with a different trigger (cron vs. user click).

**Recommendation:** design once for both triggers (manual launch +
scheduled/daily) rather than building the async pipeline twice. Before any
code: a Task Intake Report consulting `reliability` (async scan lifecycle,
retries, timeout handling without a synchronous request to anchor to) and
`platform-deploy` (which background-execution mechanism is viable on Vercel
without adding paid infra — `waitUntil`, Vercel Cron, external queue, etc.).
This phase is **gated on explicit founder approval** before any implementation
starts (schema + RLS + background scheduler are all in the Forbidden list).

---

## Product principles

1. **No fake progress.** Every metric, suggestion, and recommendation must trace
   to real persisted data. If data is insufficient, show an explicit empty state.
2. **Core flow first.** A broken H1 is the only P0. Visual polish is P2/P3.
3. **Small, reversible PRs.** One concern per PR. Human Gate before merge.
4. **Methodology before metrics.** The `geo-strategy` agent defines what to
   measure before the pipeline measures it.

---

## Active work (updated 2026-06-10)

| Branch | Status | Next action |
|---|---|---|
| `claude/geo-studio-ux-audit-VHGBS` | Stale (PR #18) | Likely superseded by later UX work — verify before reviving |
| `feature/data-mgmt-1-delete-archived-projects` | Superseded, do not merge | Implementation was broken (no DELETE RLS policy existed); replaced by DATA-MGMT-2 (PR #46 + #49, merged). Branch can be deleted. |
| `feature/test-1-core-unit-tests` | Status unknown | Verify if merged; if not, check relevance after DATA-MGMT-2 |
| All other feature branches from 2026-06-08/09/10 (`feature/data-mgmt-2-*`, `fix/recs-lifecycle-1-*`, `feat/escaneos-scan-in-progress-banner`, `feat/wizard-suggestion-loading-state`, `docs/detected-gaps-2026-06-08`) | Merged to `main` | Safe to delete via GitHub UI (founder informed, not auto-deleted by agents) |

No active branches in flight as of 2026-06-10. Next work starts fresh from
`main` per the "START HERE" section above.

---

## Detected gaps — status (reported by founder, 2026-06-08; updated 2026-06-10)

Raw founder observations from a live walkthrough of Lumira (with screenshots).
Classification against the P0–P3 framework in `CLAUDE.md`.

**P0 — core flow blockers — ALL DONE:**
- ✅ **"Añadir dominio" non-functional from Escaneos** — fixed, PR #44 merged.
- ✅ **Domain deletion missing** — founder decision: definitive hard delete.
  DB groundwork (migrations 0005, 0006, 0007 — applied live to Supabase
  2026-06-10) + app UI/action (PR #49, merged 2026-06-10: trash icon on
  Escaneos domain cards, confirmation modal with honest "permanent and
  irreversible" copy, owner-scoped `deleteProject` server action). QA
  ACCEPT. **Pending: founder production smoke-test.**
- ✅ **Recommendations badge mismatch (8 vs 2)** — root cause: prior-run
  recommendations stayed `status='active'` forever. Fixed via PR #45
  (scan-runner marks prior-run recs `superseded` on each new run) + migration
  0007 (extends `rec_status_chk`). Merged and applied.

**P1 — structural UX gaps:**
- ✅ Onboarding loading overlay while suggesting competitors/prompts — PR #48
  merged (`SuggestionsLoadingOverlay`, "Analizando tu dominio…").
- ✅ Escaneos "scanning in progress" treatment — PR #47 merged (`firstscan-banner`,
  copy corrected to remove false "4 motores de IA" / notification claims).
- ⬜ **Overview: no "Qué hacer primero" / resumen de recomendaciones summary
  card** (Impacto/Esfuerzo/Confianza) — NOT STARTED. Likely needs
  `geo-strategy` consultation (intersects with H2 "actionable recommendations").
- ⬜ **Notifications (bell icon does nothing)** — gated inside **ASYNC-SCAN-1**
  (see plan below). Do not design separately.

**P2 — UI/structure mismatches vs. design reference:**
- ⬜ **Prompts screen vs. reference** — current build has a Topics tab/grouping
  already; founder says visual separation/grouping still doesn't match
  `states.jsx`. Needs `ux-alignment` exact gap list before any change.
- ⬜ **"La página de Recomendaciones generadas no tiene que estar"** —
  AMBIGUOUS, unresolved. Sidebar has a separate (locked) "Soluciones
  generadas" entry distinct from "Recomendaciones". Needs founder
  clarification: remove the nav item entirely? merge into Recomendaciones?
  something else? → ask directly before scoping.

**Already tracked — do not duplicate:**
- "Activar lógica de primer escaneo asíncrono y escaneos diarios" +
  notifications = **ASYNC-SCAN-1** (planned, not started, gated on explicit
  founder approval — touches ADR-0003, schema, RLS, background scheduler, all
  in the Forbidden list).

**Not yet scoped:**
- Wizard steps 2/3 redesign (mentioned in original gap list, never scoped via
  Task Intake).

---

## QA execution model

Claude QA is run by the `qa` specialist subagent (`.claude/agents/qa.md`),
invoked by the Director from the main session. **GitHub Actions and the
Anthropic API key are NOT used for QA.** The `scripts/run-claude-qa.py` script
and `.github/workflows/claude-qa.yml` are superseded.

---

## Completed phases

- `UX-ALIGN-1`: guided onboarding wizard
- `UX-ALIGN-2A`: Escaneos as operational hub
- `AGENTIC-3`: GitHub-centered handoff workflow
- `AGENTIC-4`: PR handoff comments
- `AGENTIC-5B`: real Claude QA execution from PR handoff
- `TEST-1`: Vitest unit tests for parsers + delete action + delete button
- `AGENTS-RESTRUCTURE-1A`: multi-file agent architecture
- `CTA-ADD-DOMAIN-1`: "Añadir dominio" CTA on Escaneos (PR #44)
- `RECS-LIFECYCLE-1`: recommendations `superseded` status, fixes badge
  mismatch (PR #45 + migration 0007)
- `DATA-MGMT-2-DB`: FK cascades + `projects_delete_owner` RLS policy +
  `generated_solutions` table finally applied live (migrations 0005, 0006,
  0007 — PR #46)
- `DATA-MGMT-2-APP`: "Eliminar dominio" hard delete UI + server action (PR #49)
- `UX-SCAN-PROGRESS-ESCANEOS-1`: scan-in-progress banner on Escaneos (PR #47)
- `UX-WIZARD-SUGGEST-LOADING-1`: onboarding suggestions loading overlay (PR #48)

**Note:** `DATA-MGMT-1` (hard delete of *archived* projects,
`feature/data-mgmt-1-delete-archived-projects`) was previously listed here as
completed, but was **never merged** and its implementation was found to be
broken (no DELETE RLS policy existed, so `.delete()` silently affected 0 rows
— a fake-success bug). It has been fully superseded by `DATA-MGMT-2`. The
branch should not be merged or revived.

---

## Design reference

`GEO Suite-2.zip` is the UX/UI source of truth. Location: `docs/design-reference/`.
Do not rename GEO Studio to Lumira (prototype name in some reference files).
