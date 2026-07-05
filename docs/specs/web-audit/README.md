# Web Audit ("Auditoría web") — Design Overview

**Status (2026-07-05):** WEB-AUDIT-1 **implemented** (PR #170) + mobile fixes.
The remaining phases are designed/proposed and each requires its own go-ahead —
several touch entries on the CLAUDE.md forbidden list.
**Execution order:** see `ROADMAP.md` (single source of truth for phase order).
It supersedes the "Phase map" table below, which now only indexes the specs.
**Visual reference:** interactive mockup shared with the founder (Claude artifact
"Propuesta · Auditoría Web"). The specs in this directory supersede the mockup on
any detail where they differ.

---

## Product thesis

GEO Studio today measures the **demand side**: what AI answers say about the brand
(scans, GEO Score, citations, share of voice). DOMAIN-COVERAGE-1 (PR #162) opened
the **supply side**: what the brand's own domain actually publishes, verified
fail-closed via Gemini Google-Search grounding restricted to the domain.

"Auditoría web" is a new sidebar section (group *Analizar*) that joins both sides
around one actionable question: **is your site ready to be cited by AI — and when
it is, does AI actually cite it?** The signature element is the *opportunity
matrix*: every prompt topic classified by (has own content?) × (AI cites your
domain?), because each quadrant needs the opposite fix (create content vs.
optimize existing content).

## Spec index (order lives in `ROADMAP.md`)

| Identifier | Spec | Scope | Risk / gates |
|---|---|---|---|
| WEB-AUDIT-1 | `phase-1-section-and-matrix.md` | New section + move coverage audit there + persisted history + opportunity matrix + coverage/surfacing KPIs + trend | ✅ Implemented (PR #170). No migrations, no new Gemini calls, no forbidden areas. |
| WEB-AUDIT-DQ | `phase-dq-coverage-quality.md` | Fix the coverage false-negative (Ryanair 0/6): diagnose + tune query derivation / redirect resolution | Touches the DOMAIN-COVERAGE-1 core; no schema → geo-strategy + data-guardian review |
| WEB-AUDIT-ACTION | `phase-action-plan.md` | Action-plan card (matrix → recommendations) + competitor-aware content gaps | No migrations, no Gemini, no forbidden areas. One PR. |
| WEB-AUDIT-2 | `phase-2-technical-audit.md` | Bounded fetch of ≤10 already-known own-domain pages + deterministic GEO-readiness checks + robots.txt/llms.txt AI-bot access + Readiness KPI | Adjacent to forbidden "crawler"; new table (migration 0015) → **data-guardian review + explicit founder approval required** |
| WEB-AUDIT-BRIEF | `phase-brief-generator.md` | AI content-brief generator per content gap (H1/H2, entities, intent, answer-first intro) | New Gemini runtime + migration (generation_type) → **explicit founder approval + Task Intake + data-guardian** |
| WEB-AUDIT-3 | `phase-3-daily-audit.md` | Daily automatic audit via the existing Vercel cron infrastructure + derived notifications on regressions | Extends the existing cron (a new cron entry) → **explicit founder approval required** |

Each phase is one PR with its own Human Gate. Every phase behind a hard gate
(DQ, 2, BRIEF, 3) must produce a Task Intake Report before implementation.

## KPI definitions (canonical)

All percentages are computed from real persisted data or not shown at all
("never fake progress"). `conclusive` topics are those whose coverage note is NOT
`COULD_NOT_VERIFY_NOTE` (a transient Gemini failure / budget cutoff is *unknown*,
never "not covered" — same distinction RECS-COVERAGE-OVERLAY-1 already enforces).

| KPI | Formula | Source | Phase |
|---|---|---|---|
| **Cobertura de temas** | topics with `found === true` ÷ conclusive topics | Latest persisted coverage map (`generated_solutions`, `generation_type = 'domain_coverage'`) | 1 |
| **Tasa de aprovechamiento** | topics with `found && aiCitesOwnDomain` ÷ topics with `found` | Coverage map × `scan_prompt_results.extracted_json` grounding citations of the same scan | 1 |
| **Preparación GEO (0–100)** | weighted page checks: structured data 30 + answer format 30 + metadata 20 + freshness 20, averaged over audited pages | Bounded fetch + deterministic HTML analysis (no LLM) | 2 |
| **Acceso bots IA** | allowed AI crawlers ÷ tracked AI crawlers, plus llms.txt presence | `/robots.txt` + `/llms.txt` fetch, deterministic parse | 2 |

`aiCitesOwnDomain` for a topic = its prompt's latest scan result contains at least
one `source: "grounding"` citation whose resolved domain equals, or is a
label-boundary subdomain of, the project's normalized domain — the same semantics
as `hasOwnDomainCitation` in `lib/scoring/run-scoring.ts` (ADR-0013). Rows from
ungrounded providers are excluded (ADR-0012).

## Opportunity matrix classification (canonical)

Per topic in the latest coverage map, joined to that scan's completed prompt
results by `promptId`:

| `found` | `aiCitesOwnDomain` | Extra condition | Outcome | UI label (es) | Tone |
|---|---|---|---|---|---|
| true | true | — | `performing` | Rindiendo | positive |
| true | false | — | `invisible` | Invisible para la IA | warning |
| false (conclusive) | false | `mentioned_competitors_count > 0` | `content_gap` | Hueco de contenido | negative |
| false (conclusive) | false | no competitors mentioned | `open_opportunity` | Oportunidad abierta | neutral |
| false (conclusive) | true | — | `unverified_cited` | Citado sin contenido verificado | neutral |
| inconclusive (`COULD_NOT_VERIFY_NOTE`) | any | — | `inconclusive` | Sin verificar | muted, excluded from KPIs |
| any | no scan result for promptId | — | `inconclusive` | Sin verificar | muted, excluded from KPIs |

## Shared invariants (apply to every phase)

1. **No fake product behavior.** Every number is computed from persisted data.
   No placeholder KPIs for not-yet-built phases (phase-2 tiles simply don't
   render until phase 2 ships).
2. **Fail-closed own-domain matching everywhere**: normalize (strip scheme,
   `www.`, path), label-boundary subdomain match (`evilacme.com` never matches
   `acme.com`). Reuse the exact semantics already used by
   `lib/recommendations/domain-coverage.ts` and `lib/scoring/run-scoring.ts`.
3. **Gemini narrative text is never verified fact.** Coverage notes render with
   the existing "interpretación de la IA" disclaimer.
4. **Pro gate** reads `profiles.current_plan` raw via `isProOrAbove`
   (lib/billing.ts), never via `getPlanForUser`/`resolvePlan`.
5. **Rate limits are real spend counters**: coverage stays at 5/day/project
   (separately scoped `generation_type`); phase-2 technical audits get their own
   5/day budget.
6. **ADR-0003 budget discipline**: everything runs synchronously under
   `maxDuration = 60`; any multi-network-call feature carries a total wall-clock
   budget well under it and degrades partially rather than dying.
7. **UI copy in castellano; code, identifiers, comments and commits in English.**
8. **RLS**: reads on the user-context client; any service-role write proves
   ownership with the user-context client first (data-guardian C5 pattern).
9. **Untrusted content**: anything fetched from the web (phase 2 HTML) or
   returned by Gemini is sanitized through the existing control-char/tag-strip
   pattern (`sanitizeField`) before persistence or render; raw HTML is never
   stored or rendered.

## Existing code the phases build on (read before implementing)

- `lib/recommendations/domain-coverage.ts` — coverage core, invariants, cache,
  rate limit, persistence shape.
- `app/dashboard/projects/[projectId]/runs/domain-coverage-section.tsx` — current
  (ephemeral) UI to be moved/absorbed.
- `app/dashboard/projects/[projectId]/actions.ts` → `auditDomainCoverageAction`.
- `lib/scoring/run-scoring.ts` — `hasOwnDomainCitation` semantics (private; do
  not import, mirror with tests).
- `lib/scan/citation-resolution.ts` — bounded fetch pattern (timeouts,
  HEAD→GET fallback) reused conceptually in phase 2.
- `lib/recommendations/generation-rate-limit.ts` — windowed rate-limit guard.
- `lib/scan/cron.ts` + `app/api/cron/weekly-scans/route.ts` + `vercel.json` —
  the existing daily cron phase 3 extends.
- `components/sidebar.tsx` — nav groups (`analyzeLinks`).
- `supabase/migrations/0005_generated_solutions.sql`, `0013_domain_coverage.sql`
  — persistence + RLS of coverage maps.
