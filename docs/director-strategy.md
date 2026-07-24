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

**Current H1 status (updated 2026-06-26):** H1 is working end to end and the
founder has confirmed the core flow is OK. The stuck-pending-scan issue
flagged below is resolved at the reliability layer (PR #78, hardened further
by the cron fairness/rotation + reconciliation fix in PR #130/#131), not by a
user-facing cancel action.
- Wizard UX (2-column, auto-suggestions): working
- Competitor suggestions via Gemini: working (after model pin fix)
- Prompt suggestions via Gemini: working
- Scan stuck in pending/running: handled by `reconcileStuckScanRuns`
  (PR #78) — a stuck run is detected by timeout, transitioned to `failed`,
  and auto-retried once per project within 24h (see
  `docs/scan-lifecycle.md`). This unblocks "one active scan per project"
  without requiring a cancel button. A true user-initiated cancel action is
  **not implemented** and is now P1, not a launch blocker (see "Next H1
  actions" below).
- Overview with real data: working — confirmed by founder.
- Gemini model pinned: `gemini-2.5-flash` (see ADR 0002, ADR 0009 — gemini-2.0-flash-001 was shut down by Google on 2026-06-01)
- Vercel `maxDuration=60` on scan route (see ADR 0003)

**Closed investigation (2026-06-13):** Reported "cross-tab session" bug
(second incognito tab shows `/login` after login in another tab) was
diagnosed via a temporary `/api/debug/session` endpoint (PR #93, removed in
PR #94). Tab A: cookie `sb-*-auth-token` present, `getUser()` authenticated.
Tab B (new private tab): zero cookies of any kind sent. This matches iOS
Safari 17+ Private Browsing tab isolation (each new private tab gets an
isolated storage context unless duplicated from an existing one) — not an
app defect. PRs #91/#92 (server action extraction, cookie handling review)
were harmless and remain merged, but were not the actual fix because there
was no server-side bug. No further action unless the founder reproduces the
symptom in normal (non-private) browsing with two tabs.

**Next H1 actions (in priority order):**
1. ~~Stabilization pass~~ — DONE. `pnpm test` resurrected (#80), and the
   `lib/scan/scan-runner.ts` monolith fully split into focused modules
   (constants/types/errors/job-logging/extraction/reconciliation/run-creation/
   executor/launch, PRs #81-87); `scan-runner.ts` is now a thin barrel.
2. Cancel-scan action for stuck/running runs — still **NOT IMPLEMENTED** (P1 —
   UX nicety, not a correctness blocker; auto-retry via
   `reconcileStuckScanRuns` plus the cron fairness fix already keep the
   system unstuck without it). Verified 2026-06-26: no cancel button/action
   exists in `runs/page.tsx`, `runs/[runId]/page.tsx`, or `actions.ts` — only
   "Repetir escaneo" (retry) and the existing toggle for recurring scans.
3. UX baseline pass aligned to GEO Suite design reference — still open, no
   full `ux-alignment` audit has been run since 2026-06-13.
4. **Tracked deadline**: `gemini-2.5-flash` (pinned by ADR 0009) has an
   announced cutover date of 2026-10-16. Revisit the model pin before then —
   otherwise all scans will fail with `scan_failed_no_results` again, as
   happened with `gemini-2.0-flash-001` on 2026-06-01.

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

**Note (2026-06-26):** a narrowly-scoped, founder-approved "phase 1" shipped
on top of this gate: a standalone `/pricing` marketing page (#133) and a
`/dashboard/billing` display page showing the fixed Pro plan + real usage
meters (#134) — both explicitly no Stripe integration, no schema/RLS
changes, and inert "Cambiar de plan"/"Cancelar suscripción"/"Hablar con
ventas" buttons. Actual billing (Stripe, plan changes, invoices) remains
forbidden without its own dedicated phase approval.

---

## Planned phase — ASYNC-SCAN-1 (split 2026-07-17; 1a in PR, 1b not approved)

**Status update (2026-07-17):** Task Intake for launch-plan Fase 9 approved
by the founder. The phase was split: **ASYNC-SCAN-1a (CRON-SCALE)** — the
self-chaining daily sweep, no schema, `docs/adr/0016` — is implemented and
awaiting Human Gate; **ASYNC-SCAN-1b (NOTIF-SERVER)** — server-side
notifications schema + RLS — still needs its own Task Intake and explicit
approval, designed once with Fase 6's needs. Much of the original scope
below was already delivered earlier by SCAN-CHAIN-1 (`docs/adr/0014`):
immediate landing on Escaneos and browser-independent campaign completion.
The original write-up is kept below for context.

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

## Active work (2026-07-09)

**Commercial launch track opened.** The founder requested a launch-readiness
audit (market, pricing, legal, architecture, UX) and approved turning it into
an executable roadmap: **`docs/launch-plan.md`** is now the single source of
truth for all commercial-launch work (phases 0–9 + MODEL-PIN deadline, with a
status ledger updated in the same PR as each phase). Read it before any
launch-related work; H1/H2/H3 below still govern product-core priorities.

## Active work (2026-06-26)

No branch currently in flight. `claude/architecture-review-refactor-o6n977`
(Fase 0-1 of the stabilization plan: `pnpm test` resurrection + full
`scan-runner.ts` split) shipped via PRs #80-87 and is complete. Most recent
merges: #133 (`/pricing`), #135 (Europe/Madrid timezone fix), #134
(`/dashboard/billing` display page) — the latter two from concurrent Claude
Code sessions working the same repo.

All work listed under "Active work (2026-06-05)" (UX audit PR #18,
DATA-MGMT-1, TEST-1, agents restructure) has shipped — see "Completed
phases" below and git history up to PR #79.

---

## Detected gaps — pending triage (reported by founder, 2026-06-08; re-verified against code 2026-06-26)

Raw founder observations from a live walkthrough of Lumira (with screenshots).
Not yet triaged into Task Intake Reports — listed here so nothing gets lost.
Classification below is a first pass against the P0–P3 framework in
`CLAUDE.md`; needs confirmation by the relevant specialist before any PR.

**Possible P0 — core flow blockers (verify first, before anything else):**
- **"Añadir dominio" is reportedly non-functional from Escaneos** — DONE.
  Fixed via PR #44 (added "Añadir dominio" CTA on the Escaneos domain list,
  linking to `/dashboard/projects/new`). Merged.
- **Domain deletion from Escaneos cards is reportedly missing/non-functional**
  — decision: hard delete, definitively (founder, 2026-06-10). DB groundwork
  done: migrations 0005 (`generated_solutions` table — was committed but never
  applied to live DB until now), 0006 (FK cascades from `projects` +
  `projects_delete_owner` RLS policy), 0007 (recommendations `superseded`
  status) all applied successfully to the live Supabase DB on 2026-06-10.
  **DATA-MGMT-2 app phase — DONE.** `DeleteDomainButton`
  (`runs/delete-domain-button.tsx`) renders on Escaneos domain cards with a
  confirmation modal, wired to the `deleteProject` server action (hard
  delete, owner-scoped).
- **Recommendations count mismatch: sidebar badge says 8, only 2 render** —
  root-caused: prior-run recommendations stayed `status='active'` forever
  (no supersede logic), inflating the badge. Fixed via PR #45 (scan-runner now
  marks prior-run active recommendations as `superseded` on each new run) +
  migration 0007 (extends `rec_status_chk` to allow `superseded`). Merged and
  migration applied.

**P1 — structural UX gaps:**
- No loading/progress animation while the system calculates suggested
  competitors and prompts right after the user enters a domain (gap in the
  onboarding flow, screenshot attached by founder) — DONE. Addressed by
  PR #76 ("Onboarding: checklist-style loading overlays").
- Escaneos: missing the "scanning in progress" animation treatment for a
  domain being scanned — DONE. `runs/page.tsx` now renders `AutoExecuteScan`
  plus an inline "Escaneando" banner with spinner, and domain cards show an
  "Escaneando" status badge (not the shared `ScanInProgress` component, but
  an equivalent inline treatment).
- Overview: no "resumen de recomendaciones" / "Qué hacer primero" summary card
  surfacing top recommendations — DONE. `page.tsx` now renders a "Qué hacer
  primero" section showing the top 3 recommendations with Impacto/Esfuerzo as
  dot meters and Confianza as a percentage.
- Notifications: the bell icon currently does nothing — DONE. PR #102 + #126
  shipped a functional dropdown (`components/notification-bell.tsx`) showing
  up to 5 contextual events (scan completed, prompts added), with
  localStorage-tracked read state and a "Marcar todas como leídas" action.
  Note: this is a client-side event log, not the full server-side
  notifications schema scoped under **ASYNC-SCAN-1** below — revisit if the
  founder wants server-persisted/cross-device notifications as part of that
  phase.

**P2 — UI/structure mismatches vs. design reference:**
- Prompts screen doesn't match the reference: founder says there's no clear
  visual separation between prompts and no grouping by Topics in the rendered
  UI. Topics grouping logic is implemented in code (`hasTopics`,
  `topicGroups`, `UNCATEGORIZED_LABEL` fallback in `prompts/page.tsx`) — still
  needs `ux-alignment` to confirm the rendered layout actually matches
  `states.jsx` pixel-for-pixel, since the original complaint was about visual
  presentation, not missing logic.
- Possible page-structure question: founder said "la página de Recomendaciones
  generadas no tiene que estar" — RESOLVED. The sidebar no longer has a
  separate "Soluciones generadas" entry; current nav is Visión general,
  Prompts, Competidores, Páginas citadas, Escaneos (Analizar) and
  Recomendaciones (Actuar) only. No further action needed.

**Already tracked — do not duplicate:**
- Item "activar lógica de primer escaneo asíncrono y escaneos diarios" is the
  **ASYNC-SCAN-1** phase documented above (planned, not started, gated on
  explicit founder approval — touches ADR-0003, schema, RLS, and a background
  scheduler, all in the Forbidden list). The notifications gap above should be
  designed as part of this same phase, per the existing recommendation to
  "design once for both triggers."

**Status as of 2026-06-26:** all "possible P0" and P1 items above are
confirmed resolved in code. The only open item from this 2026-06-08 batch is
the P2 Prompts/Topics visual-layout question, which needs a `ux-alignment`
pass against `states.jsx` before it's worth a Task Intake.

---

## Detected gap — untracked competitors surfacing in the panorama (founder report, 2026-07-24)

**Status: root-caused AND both follow-ups implemented (PR #258, same day) —
diagnosis corrected mid-implementation after live data disagreed with the
first hypothesis (kept below for the record, see "Diagnosis correction").**
Founder reported missing favicons + 0% SOV for some entries in the
Overview's "Panorámica competitiva" block (Ikea project). Root cause was
NOT the entity-name matching bug PR #258 also fixed (that fix is real and
independently correct — accents/punctuation drift between what Gemini
extracts and the stored competitor name — it just didn't explain THIS
case): the block renders `brand_position.ranking`, a snapshot frozen at the
*latest completed scan's* time.

**Real shape of the data** (confirmed via a temporary debug dump on the PR
preview, not guessed): Ikea's tracked competitor list wasn't swapped
wholesale — it **shrank** from ~17 tracked competitors down to 5 (Leroy
Merlin, Maisons du Monde, Conforama, JYSK, El Corte Inglés). All 5 survivors
are still present inside the old 17-entity ranking, so a "did the active set
fully disappear from the ranking" check finds nothing wrong. But the
top-5-by-position podium the panorama renders happens to surface exactly
the *removed* ones (Elfa, Lazy Bag, Sklum, Kave Home ranked best by position
in that old scan) — pure luck of which subset ranked highest, not a full
mismatch. `project_competitors` has no soft-delete/history for the removed
rows either (confirmed: `createCompetitor`/`updateCompetitor`/
`deactivateCompetitor` server actions in `actions.ts` exist but are wired to
zero real UI — the Competitors page is read-only — so the list was edited
directly in Supabase, and the removed rows are simply gone, not
deactivated).

- **✅ Resolve domain for historical (inactive) competitors in the
  panorama.** Added an unfiltered (`app/dashboard/projects/[projectId]/
  page.tsx`) read of `project_competitors` (`everTrackedCompetitorRows`,
  active + inactive), used ONLY as a fallback in `panoramaRows`' domain
  resolution when the active-only match misses — a domain doesn't stop
  being real just because tracking was turned off. `sov` intentionally
  stays 0 for a historical-only match. Correct in design, but **can't help
  the Ikea case specifically**: the removed rows aren't deactivated, they're
  gone, so there's nothing left to fall back to for Elfa/Lazy Bag/Sklum/Kave
  Home. It DOES help the general case where a competitor is properly
  deactivated rather than deleted.
- **✅ "Untracked competitor visible" banner** — corrected design.
  First attempt (`staleCompetitorSnapshot`) compared the full active-name
  set against the full ranking-name set, gated on **zero overlap** — wrong
  threshold for a shrinking (not swapping) list, so it never fired here
  despite the visible symptom. Replaced with `panoramaHasUntrackedEntity`:
  true when any non-brand row actually rendered in the panorama
  (`panoramaListRows`, the same top-5 + brand's-own-row set the bars and
  list both read from) has `domain === null` after both the active and
  historical lookups miss — i.e. a direct check on what's actually on
  screen, not a heuristic about the whole list. Renders a warn-toned notice
  (reuses the existing `.feedback` warn pattern) with a real "Volver a
  escanear" CTA (`ScanTriggerButton`, disabled while a scan is already
  running).

**Diagnosis correction, for the record:** the first pass assumed a total
list replacement and wrote `docs/brand/design-decisions-log.md` accordingly;
that text was corrected in the same PR once the real (shrinking-list) shape
of the data was confirmed via the temporary debug dump — never shipped past
the PR review stage.

No schema/RLS change; no new provider/Gemini call. `pnpm test` 710/710,
`pnpm run validate` green.

---

## Recommendations Asset roadmap — RECS-ASSET (approved 2026-06-27)

Founder direction (verbatim intent): recommendations must become **more
explicit, more complete, with real examples, almost copy-paste ready** — turn
each detected gap into a "masticated asset" the user can drop straight onto
their site. The 10-gap catalog (founder-provided) is the target surface; rows
1–8 are buildable from data already captured today, rows 9–10 need new scan
extraction (Fase 2).

| Gap | Real scan evidence (the "why") | Copy-paste asset |
|---|---|---|
| 1 Total absence | Prompt where ≥1 competitor appears and the brand does not | Content brief (H1/H2, entities, intent, draft intro) |
| 2 Mention without citation | `brand_mentioned ∧ ¬citation_found` | Citation block: factual extractable paragraph + JSON-LD |
| 3 Citation-share gap | Your domain cited < competitor domains | On-page optimization for the specific URL + `Article` schema |
| 4 Competitor dominance | One competitor wins a cluster of prompts | "Brand vs {comp}" / "alternative to {comp}" page outline |
| 5 Comparative-content gap | Comparative prompts without the brand | Comparison table + `FAQPage` |
| 6 Informational/FAQ gap | Informational prompts answered by third parties | FAQ block with `FAQPage` JSON-LD |
| 7 Entity clarity | Low visibility without competitive pressure | `Organization` schema + About/entity page |
| 8 Source gap (digital PR) | Sources Gemini cites don't include the brand | Prioritized PR-target list + pitch template |
| 9 Sentiment/narrative (Fase 2) | Recurring negative narrative drivers | Counter-narrative content brief |
| 10 Freshness/recency (Fase 2) | Cites outdated data about the brand | Update checklist + re-indexing note |

**Phasing (each phase is its own Task Intake + PR; biased to value-first,
no schema work until a gap genuinely needs it):**

- **Fase A — DONE (PR #132):** corrected the persistence architecture. The
  on-demand AI rewrite writes a sanitized row to `generated_solutions` via the
  service role (the recommendation row is never mutated; RLS makes a user-context
  update a silent no-op), rate-limited and idempotent. This unblocked everything
  below.
- **Fase B — IN PROGRESS:** upgrade the generated solution from a short
  title+description into a structured, copy-paste-ready **action plan** (title,
  summary, concrete steps, and a ready-to-paste example artifact), anchored to
  the recommendation's real evidence. B1 = the structured asset itself (no
  engine change). B2 = engine emits gaps 1–3 as distinct recommendations
  instead of collapsing into one generic row.
- **Fase C:** gaps 4–8 (comparison pages, FAQ/entity schema, PR targets).
  - **C1 — DONE:** `rewriteRecommendation` is now type-aware — per
    `recommendation_type` it steers the steps and example artifacts toward the
    right deliverable (comparison page for a competitor gap, FAQ for an
    informational gap, Organization schema for entity clarity, etc.). No engine
    change.
  - **C2 — DONE:** new gap-8 rule `pursue_citation_sources` (digital PR /
    source gap) — third-party domains Gemini grounds on in prompts where the
    brand is absent, surfaced as PR targets, built from the grounded
    `citation_domains` already captured (no crawler/extraction) + its
    PR-target/pitch asset focus.
  - **C3 — optional:** split bundled comparison/FAQ cards per prompt.
- **Fase D (Fase 2):** gaps 9–10 — need new sentiment/freshness extraction in
  the scan, so a dedicated backend/schema phase, explicitly separate.

**Honesty guardrails (non-negotiable, CLAUDE.md):** every asset is anchored to
real captured evidence; no fabricated stats, competitors, domains or URLs. Where
a specific value isn't in the evidence, the asset uses a clearly-marked
placeholder (`[tu dato aquí]`) instead of inventing one. All generated content
passes the `generated_solutions` server-side sanitization gate before it is ever
rendered. `generation_type` stays within the existing CHECK values for now;
adding granular per-asset types would be a schema migration (separate approval).

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
- `DATA-MGMT-2`: domain delete UI (`DeleteDomainButton` + `deleteProject`)
- `TEST-1`: Vitest unit tests for parsers + delete action + delete button
- `AGENTS-RESTRUCTURE-1A`: this document (multi-file agent architecture)
- `STABILIZATION-0/1`: resurrected `pnpm test`; split the `scan-runner.ts`
  monolith into focused modules (PRs #80-87)
- `SCAN-ROBUST-1/2`: hard Gemini call timeout + per-prompt retry (#90);
  parallelized Gemini calls and structured extraction (#111, #112)
- `GEMINI-GROUNDING-1`: real citations via Gemini Search grounding (#88)
- GEO Score composite metric (presence/prominence/standing/authority, #100);
  Citation Share (#116); Competitive Pressure replacing Competitive Risk
  (#117); Average Brand Position (#97); position trend chart (#105, #123)
- Functional notification bell (#102, fixed #126)
- "Qué hacer primero" recommendations summary card on Overview
- Daily (was weekly) recurring scan cadence (#96); cron fairness/rotation +
  reconciliation-aware active-run handling so starved/stuck projects recover
  on their own (#130/#131)
- "Añadir prompts" feature: auto/keywords/manual generation with partial
  rescan (#129)
- `AGENTIC-6`: require Vercel preview URL + Spanish test summary on every
  Human Gate handoff (#128)
- `TIMEZONE-1`: render all app dates in Europe/Madrid instead of
  server-local UTC (#135)
- `/pricing` marketing page, phase 1 (#133); `/dashboard/billing` display
  page with real usage meters, phase 1, no Stripe (#134)

---

## Design reference

`GEO Suite-2.zip` is the UX/UI source of truth. Location: `docs/design-reference/`.
Do not rename GEO Studio to Lumira (prototype name in some reference files).
