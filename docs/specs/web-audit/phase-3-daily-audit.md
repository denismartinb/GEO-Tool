# WEB-AUDIT-3 — Daily automatic audit + regression notices

> **Estado (2026-08-04): la mitad de "auditoría automática" ya está
> implementada, y NO con el diseño de este documento.** AUDIT-AFTER-SCAN-1
> (ADR 0027, log §18) la resolvió como una cola de `jobs` encolada por el
> escaneo al completarse, no como un barrido diario que busca proyectos
> candidatos. Lo de abajo se conserva como registro de lo que se diseñó y por
> qué; **no describe el código**. Ver `ROADMAP.md` → "Fila 6 — qué se
> implementó y qué no".
>
> **Actualización 2026-08-05: los avisos de regresión también están
> implementados** (WEB-AUDIT-ALERTS-1, log §25), y tampoco con el diseño de
> abajo. Lo que dice esta sección sobre derivarlos al vuelo en
> `getWorkspaceCounters` y sobre el `LAST_SEEN_KEY` de `localStorage` describe
> una campana que ya no existe: NOTIF-SERVER-1a la sustituyó por la tabla
> `notifications` con leído por fila. Los avisos se **escriben** al detectar la
> regresión (`lib/web-audit/regression-alerts.ts`), y por eso esta fase sí
> necesitó una migración (`0029`) pese a lo que promete el "Goal" de abajo.
> Son seis tipos, no cuatro. **Nada de esta spec queda pendiente.**

**Gates:** extends the background-execution surface (CLAUDE.md forbidden list:
"background scheduler") — even though it rides the ALREADY-SHIPPED daily cron,
this phase requires its own Task Intake Report, a reliability-agent
consultation, and explicit founder approval. Depends on phases 1 and 2 being
merged (it reuses their cores and persistence).

## Reframe vs. the original proposal

The original proposal marked this phase "blocked on ASYNC-SCAN-1". That was
too pessimistic: a **daily cron already exists and ships scans in production**
(`vercel.json` → `/api/cron/weekly-scans` at `0 6 * * *`, `lib/scan/cron.ts`,
`recurring_scans_enabled` toggle on Escaneos). "Auditoría diaria" is the same
pattern with a different unit of work — no new scheduler infrastructure, no
notifications schema. What ASYNC-SCAN-1 remains needed for (user-triggered
async scan launch + push-style notification) is NOT needed here.

## Goal

1. Projects with daily scans enabled and a Pro-plan owner get their coverage
   audit (phase 1 core) and technical audit (phase 2 core) refreshed
   automatically after their daily scan.
2. The notification bell surfaces **derived** regression notices — no new
   tables — when a daily audit shows: coverage dropped, surfacing dropped, an
   AI bot became blocked, or llms.txt disappeared.

## Design

### Cron entry

Add a second cron to `vercel.json`:

```json
{ "path": "/api/cron/daily-web-audit", "schedule": "30 6 * * *" }
```

30 minutes after the scan sweep so audits run against the fresh scans.
Confirm against the current Vercel plan's cron allowance before implementation
(platform-deploy agent owns this check; Hobby historically allows 2 daily
crons — if only 1 is available, fall back to running the audit sweep at the
tail of the existing weekly-scans route under its remaining budget, which is
the documented alternative, not the preference).

### Route + sweep (`app/api/cron/daily-web-audit/route.ts`, `lib/web-audit/cron.ts`)

Mirror the structure and protections of `lib/scan/cron.ts` verbatim where they
apply:

- Same auth as the existing cron route (CRON secret header check — copy from
  `weekly-scans/route.ts`).
- Candidates: `projects` where `recurring_scans_enabled = true` and
  `is_archived = false`, whose owner's `profiles.current_plan` passes
  `isProOrAbove` (service-role join; the cron has no user context — this is
  the one place the plan gate reads via service role, flag it to
  data-guardian).
- Skip rules, in order:
  - `skipped_recent`: latest coverage map already targets the latest completed
    run (the phase-1 cache makes the audit a no-op anyway — skip without
    consuming budget);
  - `skipped_rate_limited`: the shared 5/day budgets protect cost by
    construction (cron consumes from the same counters as manual runs; a cron
    entry uses at most 1 of the 5);
  - `skipped_budget`: total sweep budget `TIME_BUDGET_MS = 45_000`, oldest
    -audit-first ordering (same starvation-fairness rationale as scan cron).
- Per project: run a **cron variant** of the phase-1 core, then (remaining
  budget permitting) the phase-2 core with `source: 'cron'`. The cores must be
  refactored to accept an ownership-already-proven service context
  (`auditDomainCoverageCoreForCron`) the same way `createPendingScanRunForCron`
  parallels the user-context path — do NOT weaken the user-context path.
- `MAX_PROJECTS_PER_RUN = 5`, `BATCH_CONCURRENCY = 1` (each audit is itself
  several sequential Gemini calls; concurrency 2 here could double Gemini
  pressure vs. the scan cron — start at 1, revisit with logs).
- Structured summary log line (`[geo:web-audit:cron]`) with per-project
  statuses, mirroring the scan cron's.

### Regression notices (no schema)

`components/notification-bell.tsx` already derives items from recent data via
`lib/project-workspace.ts` — extend the same mechanism:

- In `getWorkspaceCounters`/the bell's data loader, load the last 2 coverage
  maps + last 2 web_audit_snapshots per project (bounded queries, existing
  RLS).
- New derived item kinds:
  - `coverage_dropped`: latest conclusive coverage % < previous by ≥ 1 topic —
    `«{domain}»: un tema ha perdido cobertura de contenido`;
  - `surfacing_dropped`: a topic moved `performing → invisible` —
    `«{domain}»: la IA ha dejado de citar una página tuya`;
  - `bot_blocked`: a tracked bot moved allowed → blocked —
    `«{domain}»: {bot} ya no puede leer tu web`;
  - `llms_txt_lost`: present → absent.
- Items link to `/dashboard/projects/{id}/web-audit`. The existing
  `LAST_SEEN_KEY` localStorage mechanism handles read/unread — no new state.

### UI

- Auditoría web page: `source: 'cron'` snapshots/maps render identically, with
  the meta line `Última auditoría: {fecha} (automática)`.
- The Escaneos "Escaneo automático diario" toggle description gains one line:
  `Incluye la auditoría web diaria en proyectos Pro.` (the audit follows the
  existing toggle; a separate toggle is deliberately NOT added — one less
  decision for the user, and the scan is a prerequisite anyway).

## Tests

- `lib/web-audit/cron.test.ts`: candidate filtering (plan gate, archived,
  toggle off), skip precedence (`recent` before rate-limit consumption),
  budget cutoff marks remainder, fairness ordering — mirror the structure of
  `lib/scan/cron.test.ts`.
- Notification derivation: each regression kind fires on the right transition
  and NOT on inconclusive-topic noise (a topic going `performing →
  inconclusive` must not fire `surfacing_dropped` — inconclusive is unknown,
  not regression).

## Acceptance criteria

1. With the toggle on and a Pro owner, the morning cron leaves a fresh
   coverage map (and snapshot, budget permitting) with `source: 'cron'`; the
   section shows it as "(automática)".
2. A free-plan or toggle-off project is never audited by cron (test + log
   evidence).
3. Manual 5/day budget is shared: after a cron audit, 4 manual audits remain.
4. Regression notices appear in the bell only on genuine transitions; none
   fire from inconclusive data.
5. Cron route completes under 60s with the summary log line; no unhandled
   rejection on a failing project (fail-soft per project, sweep continues).
