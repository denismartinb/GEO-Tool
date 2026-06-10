# Director Strategy — GEO Studio Product Roadmap

This file is the Director's long-term memory. Read it at the start of every
session. Update it when a horizon shifts or a decision changes the roadmap.

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

## Active work (2026-06-05)

| Branch | Status | Next action |
|---|---|---|
| `claude/geo-studio-ux-audit-VHGBS` | Active (PR #18) | Smoke test pending |
| `feature/data-mgmt-1-delete-archived-projects` | Ready for PR | Claude QA + Human Gate |
| `feature/test-1-core-unit-tests` | Ready for PR | Merge with data-mgmt branch or separately |
| `chore/agents-restructure-1a` | In progress | This PR |

---

## Detected gaps — pending triage (reported by founder, 2026-06-08)

Raw founder observations from a live walkthrough of Lumira (with screenshots).
Not yet triaged into Task Intake Reports — listed here so nothing gets lost.
Classification below is a first pass against the P0–P3 framework in
`CLAUDE.md`; needs confirmation by the relevant specialist before any PR.

**Possible P0 — core flow blockers (verify first, before anything else):**
- **"Añadir dominio" is reportedly non-functional from Escaneos** — founder
  states it is currently *not possible* to add a new domain from that screen.
  If confirmed, this is a core-flow blocker (`project creation broken`,
  CLAUDE.md P0 definition). → `core-flow` to reproduce and root-cause first.
- **Domain deletion from Escaneos cards is reportedly missing/non-functional**
  — founder states it is currently *not possible* to delete a domain from the
  domain cards (distinct from `DATA-MGMT-1`, which covered hard-delete of
  *archived* projects only). → `core-flow` + `data-guardian` to confirm scope
  and whether this is "missing feature" vs. "broken existing feature".
- **Recommendations count mismatch: sidebar badge says 8, only 2 render** —
  this is either a real data/query bug or a sign that recommendations are not
  fully real yet ("quedaba una fase para hacerlas reales"). A badge that shows
  a number the UI cannot back up is a direct violation of the "No fake
  progress" principle. → `geo-strategy` + `data-guardian` to root-cause before
  any UI fix; do not silently change the badge to hide the mismatch.

**P1 — structural UX gaps:**
- No loading/progress animation while the system calculates suggested
  competitors and prompts right after the user enters a domain (gap in the
  onboarding flow, screenshot attached by founder).
- Escaneos: missing the "scanning in progress" animation treatment for a
  domain (or the very first domain) being scanned — likely the same
  `ScanInProgress` component from PR #35 needs to be extended here.
- Overview: no "resumen de recomendaciones" / "Qué hacer primero" summary card
  surfacing top recommendations (founder attached a design-reference
  screenshot showing this card with Impacto/Esfuerzo/Confianza).
- Notifications: the bell icon currently does nothing. Founder wants a
  contextual popup (not a full page) listing async events — first scan
  finished, prompt analysis available, etc. Directly overlaps with the
  notifications system already scoped (but gated) in **ASYNC-SCAN-1** below —
  should be designed together, not as a separate parallel effort.

**P2 — UI/structure mismatches vs. design reference:**
- Prompts screen doesn't match the reference: founder says there's no clear
  visual separation between prompts and no grouping by Topics in the rendered
  UI (note: current build *does* render a Topics tab and topic rows — likely
  a finer-grained layout/grouping mismatch than a missing feature; needs
  `ux-alignment` to produce an exact gap list against `states.jsx`).
- Possible page-structure question: founder says "la página de Recomendaciones
  generadas no tiene que estar" — needs clarification, since the sidebar
  currently shows a separate (locked) "Soluciones generadas" entry. Could be
  the founder flagging that this page shouldn't exist as a standalone nav item,
  or scoping confusion between "Recomendaciones" and "Soluciones generadas".
  → clarify with founder before treating as a gap to fix.

**Already tracked — do not duplicate:**
- Item "activar lógica de primer escaneo asíncrono y escaneos diarios" is the
  **ASYNC-SCAN-1** phase documented above (planned, not started, gated on
  explicit founder approval — touches ADR-0003, schema, RLS, and a background
  scheduler, all in the Forbidden list). The notifications gap above should be
  designed as part of this same phase, per the existing recommendation to
  "design once for both triggers."

**Suggested next step:** before opening any Task Intake Report, `core-flow`
should reproduce and confirm/deny the three "possible P0" items above — if
either "add domain" or "delete domain" is genuinely broken, that supersedes
all P1/P2 UX work per the "Core flow first" principle.

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
- `DATA-MGMT-1`: hard delete of archived projects
- `TEST-1`: Vitest unit tests for parsers + delete action + delete button
- `AGENTS-RESTRUCTURE-1A`: this document (multi-file agent architecture)

---

## Design reference

`GEO Suite-2.zip` is the UX/UI source of truth. Location: `docs/design-reference/`.
Do not rename GEO Studio to Lumira (prototype name in some reference files).
