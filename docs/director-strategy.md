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

## SCAN-TRACKED-SET-1 — untracked competitors polluting scoring (founder report, 2026-07-24)

**Status: Fase 1 implemented (docs/adr/0018), pending Human Gate.** Founder
reported a fresh scan (project Ikea, 5 tracked competitors) producing a
21-entity position ranking with untracked brands (Sklum, Brico Depôt,
BANNI, Lefties Home) outranking the brand itself. Root-caused: the
extraction pipeline persisted the model's `competitors[]` output verbatim,
with nothing enforcing that it only contained the project's actual tracked
competitors. Consulted `geo-strategy` before implementing — see docs/adr/
0018 for the full methodological dictamen (confirmed the diagnosis, and
corrected the initial hypothesis: the main damage is untracked entities
gaining a **structural ranking advantage** by skipping the not-mentioned
penalty tracked-but-unmentioned entities receive, not primarily the SOV
depression I'd first assumed).

Fase 1 (this phase): `reconcileExtractedCompetitors` (`lib/scan/
extraction.ts`) reconciles the model's output against `competitors_snapshot`
before persistence — tracked-and-returned entities keep their data, tracked-
and-omitted entities are materialized as explicit non-mentions, anything
else moves to `other_brands_mentioned`. Positions re-densified after
reconciliation. `standing` guarded against fabricating 100 for projects with
zero tracked competitors. Prompt hardened (defense in depth) across all
three providers. `EXTRACTION_VERSION` bumped to `"tracked-set-v1"`;
`computeRunScoresFromResults` drops `prominence`/`standing` to `null` for
any run containing a pre-fix row rather than computing over a possibly-
contaminated set. No schema/RLS changes. `pnpm test` 722/722,
`pnpm run validate` green.

**Deferred, not yet approved:**
- **SCAN-TRACKED-SET-2 (backfill):** existing `scan_prompt_results`/
  `run_scores` keep contaminated data until this runs. Deterministic, no LLM
  calls needed (reconciliation is a pure function of `extracted_json.
  competitors` + `competitors_snapshot`, both already persisted per row).
  Needs its own Task Intake: dry-run deriving aggregate score drift first,
  provenance (`recomputed_from`) on every rewritten `run_scores` row, and a
  check against `lib/scan/score-alert.ts`'s composite_version comparison
  gate (backfilling the full history avoids creating an artificial cohort
  boundary that would silently mute legitimate alerts).
- **`prominence` incentive-compatibility ADR:** the formula rewards tracking
  fewer, more-consistently-mentioned competitors — needs real multi-project
  distribution data before redesigning, same reasoning ADR 0015 §5 used to
  defer the score-band recalibration. See docs/adr/0018 "Deferred".
- **No in-app competitor management UI** (found while diagnosing the
  earlier stale-scan case, 2026-07-24): `createCompetitor`/
  `updateCompetitor`/`deactivateCompetitor` exist in `actions.ts` but
  aren't wired to any screen — competitor list changes only happen via
  direct Supabase edits today. Logged in `docs/brand/design-decisions-log.md`.

---

## COMPETITOR-GROUNDING-1 — wrong competitors/prompts for SMEs (founder report, 2026-07-25)

**Status: Phase A implemented, pending Human Gate.** Founder tested onboarding
against SME/agency-sized domains — the product's actual target market, not
the large brands it had been smoke tested against — and got nonsense:
`genscore.es` (a GEO visibility tool) suggested generator manufacturers
(Himoinsa, Gesan, Inmesol, SDMO, Cummins); `ifinanciera.es` (a financial-
management consultancy for SMEs) suggested consumer fast-loan lenders
(Cofidis, Vivus, Creditea, QueBueno, Wandoo).

Root cause: `suggestCompetitors`/`suggestPrompts` (`lib/llm/gemini.ts`) were
domain-only, closed-book Gemini calls with no `google_search` grounding —
the only informative input was `brand`, itself just the capitalized domain
label. For a brand present in the model's training data (IKEA, Zara) this
works; for an SME with no training-data footprint, the model has nothing to
reason from but the domain string and decomposes it morphologically
("gen" → generators, "financiera" → consumer credit). The same blind inputs
feed prompt suggestion too, so a wrong inference contaminates the first
scan and every metric derived from it, not just one onboarding screen.

Phase A (this phase, see docs/adr/0020): fetches the domain's own homepage
(`lib/projects/business-profile.ts`'s `fetchHomepageEvidence`, reusing
`fetchPageSafely` unmodified — one page, not a crawler), infers a structured
`BusinessProfile` from that evidence (`inferBusinessProfile`), then requires
that profile for `suggestCompetitors` (now `google_search`-grounded,
explicitly asking for comparable-size/regional competitors instead of
"well-known" ones) and `suggestPrompts`. Honest failure
(`resolveBusinessContext` returns `"unidentified"`) when there's no evidence
and no user description, or Gemini itself reports low confidence — the
wizard falls back to its existing manual-entry state rather than guessing.
`export const maxDuration = 60` added to `app/dashboard/projects/new/
page.tsx` (previously unset, defaulting to Vercel Hobby's 10s) since the new
flow does meaningfully more I/O. No schema/RLS changes. `pnpm test` 754/754,
`pnpm run validate` green.

**Deferred, not yet approved:**
- **COMPETITOR-GROUNDING-2 (persist the profile):** would let re-suggestion,
  the post-creation "Añadir prompts" flow (`generateAddedPrompts`), and
  future re-scans reuse the profile instead of re-deriving it. Needs a
  `projects` schema migration — its own approval per `CLAUDE.md`.
- **`generateAddedPrompts` stays domain-only** — it backs both the wizard's
  "Generar N más" and the persisted-project "Añadir prompts" screen, and the
  latter has no profile without the schema work above.
- **No manual "describe your business" UI field** — `resolveBusinessContext`
  already accepts an optional `userDescription` and `createProject` already
  threads the pre-existing (previously dead) `businessDescription` form
  field through to it, but no wizard input populates it yet. Scoped out to
  keep this phase to the inference pipeline; adding the field is a small,
  separate UX-alignment-reviewed change.

---

## MENTION-VERIFY-1 — fabricated brand mentions inflating visibility_score (founder report, 2026-07-25, amended 2026-07-30 x2)

**Status: Implemented (three passes), Human Gate pending on the third.** Founder tested `genscore.es` (a
brand-new product, essentially zero online footprint) and got "% de mención"
= 23% when it should be 0% — the brand is never genuinely mentioned in any
collected AI response. The "Evidencias de mención" panel showed why: for one
ChatGPT response, the persisted evidence was a generic sentence about "brand
performance analysis with AI" that never contains the string "GenScore" —
`brand.mentioned` was fabricated, not real.

Root cause (see docs/adr/0021): all three structured-extraction call sites
(`extractGeminiStructuredData`, `extractClaudeStructuredData`,
`extractOpenAIStructuredData`) share one prompt shape that asks for
`"mentioned": boolean`/`"evidence": string[]` but never required "mentioned"
to be based on the entity's name genuinely appearing as text — so a model
can conflate topical/category relevance with an actual mention (especially
for "GenScore", a name that reads as a generic description of its own
product category) and fabricate a matching "evidence" quote. Identical
defect for `competitors[].mentioned` at the same call sites — not
brand-specific.

Fix, two layers: (1) new `verifyExtractedMentions` (`lib/scan/
extraction.ts`), run before `reconcileExtractedCompetitors` (ADR 0018),
downgrades any `mentioned: true` whose claimed `display_name_found` isn't
actually a substring of the raw response text — added `display_name_found`
to competitors too (`lib/extraction/schema.ts`, JSON-shape change, no
migration) for parity with brand. (2) hardened all three providers' prompts
(defense in depth): "mentioned" requires literal textual presence, never
topical relevance; "evidence"/"display_name_found" must be verbatim quotes.
`EXTRACTION_VERSION` bumped to `"verified-mention-v1"`, which — since
`hasUntrustedCompetitorSet` was already a general staleness check, not
specific to ADR 0018 — automatically extends `prominence`/`standing`/
`geo_score`-confidence null-gating to any run with a pre-fix row, with no
new run-scoring code. No schema/RLS changes, no backfill.

**Follow-up found on the founder's own preview smoke (2026-07-30):** the
first pass wasn't enough. A prompt about the cost of "a service that
analyzes your brand's presence in conversational search" (essentially
echoing GenScore's own category back at the model) got a ChatGPT answer
that only ever talked about "tu marca" ("your brand") in the abstract,
never naming GenScore. The extraction model set `display_name_found: "tu
marca"` — which genuinely IS a substring of the raw response, so the
first version's substring-only check wrongly kept it `mentioned: true`.
Fix: `verifyMention` now ALSO requires `display_name_found` to plausibly
NAME the real entity (`namesPlausiblyMatch`, reusing the same tolerant
token-normalization `reconcileExtractedCompetitors` already uses) —
"tu marca" does not plausibly match "GenScore". Both checks (substring-
present AND plausible-name) are now required together; regression test
added reproducing this exact case. `pnpm test` 749/749, `pnpm run
validate` green.

**Third pass (2026-07-30), found smoke-testing a real dermatology-clinic
project ("Alberdiderma"):** a genuinely verified mention (the brand's name
really was in the response, as a markdown link) still displayed a
fabricated "evidence" quote — one that actually described a *different*
clinic listed above it in the same AI answer. Root cause: `verifyMention`
validated the mention (`display_name_found`) but never validated each
`evidence[]` entry independently — the model can get one field right and
the other wrong. Fix: once a mention passes verification, every quote in
its `evidence` array is now checked individually against the raw text
(same substring check, applied per-quote); quotes that aren't genuinely
present are dropped, which can leave `mentioned: true` with `evidence: []`
— the UI already hides the evidence panel entirely when empty, so this is
the honest "no evidence to show" state, not a wrong one. `pnpm test`
813/813, `pnpm run validate` green. See docs/adr/0021's "Follow-up 2".

**Deliberately NOT done (see ADR 0021 for the full reasoning):**
- **`visibility_score`/`competitor_gap_score` themselves are NOT nulled**
  for stale-version runs, unlike the original Task Intake's stated plan.
  Reconsidered after finding `computeRunScoresFromResults` only ever runs
  once per scan execution (never recomputed against historical rows) — the
  gate would only protect a narrow within-run mixed-version edge case
  (partial retry straddling a deploy), while making these two fields
  nullable ripples into 8+ consumer files (Overview, runs pages, weekly
  digest, score alerts, recommendation engine). Every new scan's
  `brand_mentioned` is already correct at write time via Layer 1 regardless
  — that's what actually fixes the founder's reported number. This mirrors
  the exact boundary ADR 0018 itself already drew (it never touched these
  two fields either).
- **No backfill (MENTION-VERIFY-2):** the founder's own `genscore.es`
  history keeps its old, unverified number until a new scan runs.

---

## COMPETITOR-GROUNDING-2 — persisted business profile, computed lazily (founder-approved 2026-07-30)

**Status: Implemented, pending Human Gate.** Closes the gap COMPETITOR-
GROUNDING-1 (PR #265) declared explicitly deferred: the `BusinessProfile`
inferred from a domain's homepage was computed once during onboarding
suggestion and discarded, so "Añadir prompts" (post-creation,
`lib/projects/add-prompts.ts`) stayed just as blind (brand/domain strings
only) as `suggestCompetitors`/`suggestPrompts` were before ADR 0020.

Design (see docs/adr/0022): nullable `projects.business_profile jsonb`
(migration 0022, no backfill, no RLS change needed). Investigated the actual
creation flow first — `createProject` only computes a profile in its
existing fallback branch (wizard skipped/submitted empty), since the common
wizard-completed path already arrives with competitors/prompts filled in and
never recomputes one. Threading the profile through the wizard's hidden
fields for the common path was considered and rejected as more surface/risk
than benefit (see ADR 0022). Instead: `createProject`'s existing fallback
persists the profile it already computes (zero new Gemini calls); `addPromptsCore`
now selects `business_profile`, uses it directly when cached, or — for
`mode !== "manual"` — resolves it once and caches it back (best-effort, never
blocking generation on a cache-write failure); `generateAddedPrompts`
(`lib/llm/gemini.ts`) gained an optional `profile?: BusinessProfile` param,
purely additive (absent = identical prompt to before this phase). Most new
projects still get `business_profile: null` at creation and compute-and-cache
it lazily on first "Añadir prompts" use, never blocking project creation.
`pnpm test` 809/809, `pnpm run validate` green.

**Known gap, declared not fixed:** `createProject`'s new `business_profile`
field in the insert is verified by code review + typecheck only — that
server action has no unit-test harness (uses `redirect()`, no extracted
"Core" function), a pre-existing gap from before this phase, not introduced
by it.

---

## OPENAI-CITATION-NOISE-1 — Google Maps/Search fallback links counted as real citations (founder report, 2026-07-31)

**Status: Implemented, pending Human Gate.** Founder reviewing a real
ChatGPT response (project "Alberdiderma", dermatology clinic) flagged the
citation URLs as looking "wrong": every clinic listed, including the
project's own brand, was cited via
`google.com/maps/search/{name}%2C+Madrid...?utm_source=openai` — a Google
Maps search shortcut, not the clinic's real site. `lib/llm/openai.ts`
treated these as final, real destination URLs (`groundingUrlsAreFinal:
true`), so they resolved to `domain: "google.com"` at `confidence: "high"`
— counted toward `citations_count`/`citation_found` and shown as a "source"
on the Citations page and prompt drawer, none of which is true (the model
found no real page to cite).

This mirrors a fix already shipped for the equivalent *inline*-citation case
(`resolveCitation`, `lib/citations/aggregate-citations.ts`, founder review
2026-07-19) — but that fix's own comment assumed grounding citations are
always genuine, which held for Gemini (resolved through real redirects) but
not for OpenAI's `url_citation`, which can BE the Maps link directly.

Fix (docs/adr/0023): new `isGoogleMapsSearchNoise` in `lib/llm/openai.ts`
filters `google.com`/`www.google.com` URLs whose path is `/maps/search/...`
or a plain `/search` — dropped before they ever become a `groundingChunk`,
so every downstream consumer (scoring, Citations page, prompt drawer) is
protected automatically. Deliberately narrower than "any google.com
grounding citation is noise" — a genuine citation hosted on google.com (e.g.
Google Shopping) is untouched, keeping `aggregate-citations.ts`'s existing
tested distinction intact.

**Same report, separate root cause — UI fix bundled in:** the founder also
flagged that a *genuinely verified* evidence quote ("Especialistas en
dermatología médica y estética...") doesn't itself name the brand when read
in isolation. Not a data bug (MENTION-VERIFY-1 already confirmed this quote
is real) — a labeling gap. Fixed with a one-line JSX change
(`components/prompts/prompt-drawer.tsx`): the evidence section header now
reads "Evidencias de mención de {projectBrand}" instead of an unlabeled
"Evidencias de mención". `pnpm test` 816/816, `pnpm run validate` green.

**No backfill:** existing persisted rows keep any Maps-search noise already
counted in their citation numbers.

---

## MARKDOWN-RENDER-1 — raw markdown links shown as literal text in "Respuestas" (founder report, 2026-07-31)

**Status: Implemented, pending Human Gate.** After the citation-noise fix
above shipped, the founder kept seeing the full `google.com/maps/search/...`
URL in the prompt drawer's "Respuestas" tab and reported it as still broken.
It was a **third, unrelated root cause**: the citation filter governs which
URLs count as citations (scoring, "Fuentes usadas"), never how the raw
transcript itself is displayed — the transcript must always be shown
verbatim, so no filter could have changed it.

The actual bug was in the markdown-lite renderer: OpenAI wraps long citation
URLs onto their own line, emitting `[Clínica ...]\n(https://...)`, and
`tokenizeInline`'s regex required `]` and `(` to be adjacent. The link never
tokenized, so the whole construct fell through to plain text and the reader
saw raw brackets plus the full URL. Confirmed by replaying the founder's
verbatim response through the parser: 0 links detected before the fix, 2
after.

Fix, in two commits on the same PR:
1. The regex now tolerates whitespace (space or newline) between `]` and
   `(`; `renderInline` accepts multi-line input and renders embedded
   newlines as `<br/>`, so the paragraph branch can tokenize a whole block
   at once instead of per line — a construct spanning a line boundary is no
   longer severed before parsing.
2. Parser extracted to `lib/markdown/inline-markdown.ts` with 18 unit tests
   (the founder's verbatim ChatGPT answer is a fixture). This logic had
   lived inline in a component with **zero test coverage**, which is why the
   bug shipped unnoticed in the first place. `normalizeMarkdownSource` also
   rejoins a label/target pair separated by a blank line (which the block
   splitter would otherwise tear apart), restricted to parentheticals that
   actually open a URL so ordinary prose is untouched. Italic (`_text_`)
   support added — `_Madrid, España_` was rendering with literal
   underscores in the same screenshot — with a word-boundary check so an
   underscore inside a bare URL (`?utm_source=openai`) can't open an italic
   run.

**Second root cause in the same renderer — nesting (found on retest):** with
the above deployed, the founder retested and the URLs were *still* raw. The
tell was in the screenshot itself: the leaked `[label]` and `(url)` rendered
**in bold**, darker than the surrounding paragraph. OpenAI wraps these cited
listings in bold — `**[label](url)**` — and the tokenizer was flat. Regex
alternation picks the *leftmost* match, so the bold run (starting two
characters earlier) swallowed the entire link and emitted it as literal text
inside a `<strong>`. Fixed by making `tokenizeInline` recursive: `bold`,
`italic` and link labels now hold child tokens instead of a raw string, and
the renderer recurses to match, with a depth cap (4) as a loop guard. New
`visibleText()` helper makes "no raw URL leaks into the transcript" directly
assertable, and the founder's answer is now a fixture covering both quirks
at once (bold-wrapped *and* line-wrapped).

`pnpm test` 838/838, `pnpm run validate` green.

**Process notes — two rounds lost, both avoidable:**
1. The founder's first retest used a screenshot taken 11 minutes *before*
   the corresponding Vercel preview finished building. Handoffs must state
   that the preview has to show as **Ready**, not just that a commit was
   pushed.
2. The first fix was shipped after verifying the regex against a
   *reconstructed* sample rather than the real stored `raw_response`. That
   sample happened to omit the bold wrapper, so it confirmed a real bug but
   masked the dominant one. When a rendering bug is reported, reproduce from
   the persisted row, not from a hand-typed approximation of the screenshot.

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
Anthropic API key are NOT used for QA.** `scripts/run-claude-qa.py` and
`.github/workflows/claude-qa.yml` were **deleted** in PRELAUNCH-HARDENING-1
Fase 0 (2026-08-09) after months of being declared superseded here and in
CLAUDE.md while still armed. The QA *handoff* (`claude-qa-handoff.yml` and the
two `*-claude-qa-handoff.sh` scripts) is unaffected and still required.

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
