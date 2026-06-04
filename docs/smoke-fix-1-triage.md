# SMOKE-FIX-1 Core Flow and Design Alignment Triage

Source: GitHub issue #14.

## Design package access

Verified local package:

- `/Users/denismartinb/Downloads/GEO Suite-2.zip`

The archive contains the intended reference materials, including:

- `design_handoff_lumira/README.md`
- `design_handoff_lumira/prototype/overview.jsx`
- `design_handoff_lumira/prototype/prompts.jsx`
- `design_handoff_lumira/prototype/recommendations.jsx`
- `design_handoff_lumira/prototype/onboarding.jsx`
- `runs.jsx`, `competitors.jsx`, `prompt-setup.jsx`, `competitor-setup.jsx`
- screenshots for auth, onboarding, overview, prompts, competitors, runs and recommendations

The reference remains UX/UI source material only. It should not be pasted directly into the production app, and the product name in GEO Tool remains GEO Studio.

## P0 diagnosis

### Scan remains pending

Root cause found in code:

- `app/dashboard/projects/[projectId]/actions.ts` gated synchronous Gemini execution behind `ENABLE_SYNC_SCAN_EXECUTION === "true"`.
- `.env.example` and README did not document this flag.
- Local `.env.local` did not include `ENABLE_SYNC_SCAN_EXECUTION`.
- Therefore `runProjectScan` created `scan_runs` and `jobs`, then redirected with `scan_pending` without executing Gemini.

Fix applied in this PR:

- Synchronous Gemini execution is now enabled by default.
- Set `ENABLE_SYNC_SCAN_EXECUTION=false` only when intentionally preparing pending runs for debugging.

Expected effect:

- `Lanzar escaneo` creates a run and immediately executes Gemini in the current browser/server-action flow.
- Completed runs should populate `scan_prompt_results`, `run_scores`, `recommendations` and Overview data when Gemini and Supabase service-role env vars are configured.

### Overview does not receive/render real data

Overview already reads real data from:

- latest completed `scan_runs`
- `run_scores`
- completed `scan_prompt_results`
- active `recommendations`

The observed blank Overview is consistent with the run never completing. No separate Overview rendering blocker was found in this first pass.

## P0/P1/P2/P3 plan

### P0 - Core Gemini flow reliability

Done in this PR:

- Enable synchronous Gemini scan execution by default.
- Document the opt-out env var.

Still required for full confidence:

- Browser smoke with real Supabase + Gemini credentials:
  - signup/login;
  - create project;
  - add or confirm prompts;
  - add or confirm competitors;
  - launch scan;
  - verify completed run;
  - verify Overview metrics and recommendations.

### P1 - Real setup suggestions

Issue #14 asks for competitors and prompts to be suggested automatically after creating a domain. Current production behavior is manual/editable setup rows, not system-generated suggestions.

This should not be faked with static competitor names or fake discovery. A safe implementation needs an approved product decision:

- deterministic prompt templates only, based on brand/category; or
- Gemini-backed setup suggestion action using brand, domain, country, language and business description; or
- explicit manual setup retained for private beta.

Recommended next phase:

- `SMOKE-FIX-2: Gemini-backed setup suggestions`
- Generate 5-10 editable prompts and 3-5 competitor candidates via Gemini JSON with validation.
- Store only after user review.
- Keep cost limits and traceability.

### P1 - Design alignment

Reference comparison summary:

- Auth: current app is functional but simpler than the reference split signup/login cards.
- Onboarding: current app has a 3-step wizard, but reference has stronger hero/domain-first visual hierarchy and richer state treatment.
- Overview: current app has real metrics and evidence, but reference has stronger executive summary, metric hierarchy, gauge/sparklines and opportunity layout.
- Prompts: current app has prompt-level signals, but reference has topic/prompt explorer and detail drawer.
- Competitors: current app has real competitor evidence, but reference has richer ranking/source/gap views.
- Escaneos: current app now behaves as a project-level operational hub, but reference has stronger empty/loading/history states.
- Recommendations: current app has evidence-backed recommendations, but reference has expandable action cards and generation states.
- Sidebar/topbar: current app is functional; reference has denser app shell, counts, project switcher and scan status.

Recommended next UI phase:

- Apply design tokens and shell alignment first.
- Then upgrade Overview and Recommendations, because they carry the beta value proposition.

### P2 - Operational polish

- Add clearer scan progress/error states without fake background claims.
- Add support copy around keeping the browser open for synchronous execution.
- Add docs for recovering failed runs.

### P3 - Later platform work

- Background jobs or cron.
- Crawler.
- Multi-provider routing.
- Scheduled monitoring.
- Export/reporting.

## Scope boundaries respected

This first pass does not add:

- fake suggestions;
- fake scan completion;
- fake Overview metrics;
- crawler;
- OpenAI or Perplexity;
- background jobs;
- schema or RLS changes;
- blind prototype code import.
