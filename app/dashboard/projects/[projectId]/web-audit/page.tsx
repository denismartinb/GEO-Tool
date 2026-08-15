import Link from "next/link";
import { after } from "next/server";
import type { Metadata } from "next";
import { Icon } from "@/components/ui/icon";
import { Delta } from "@/components/ui/delta";
import { InfoTip } from "@/components/ui/info-tip";
import { Gauge } from "@/components/ui/gauge";
import { ScanStatePill } from "@/components/scan-state-pill";
import { requireUser } from "@/lib/auth";
import { requireActiveProject } from "@/lib/project-workspace";
import { isProOrAbove } from "@/lib/billing";
import { parseCoverageMap } from "@/lib/web-audit/coverage-map";
import { buildLlmsTxt, publishSteps, type LlmsTxtResult, type PublishStep } from "@/lib/web-audit/llms-txt";
import { sitemapSteps, type SitemapStep } from "@/lib/web-audit/sitemap";
import {
  buildWebAuditSummary,
  buildCitationWindowCandidates,
  type PromptResultLite,
  type ClassifiedTopic,
  type TopicOutcome
} from "@/lib/web-audit/opportunity-matrix";
import { buildCoverageTrend } from "@/lib/web-audit/trend";
import { buildGlobalScore } from "@/lib/web-audit/global-score";
import { isDeltaTrustworthy, SMALL_SAMPLE_THRESHOLD } from "@/lib/web-audit/sample-confidence";
import { WEB_AUDIT_JOB_TYPE, WEB_AUDIT_STALE_LOCK_MS } from "@/lib/web-audit/audit-job";
import { ReentryMission } from "@/components/reentry-mission";
import { deriveAuditPillState, isWebAuditJobDue } from "@/lib/web-audit/audit-liveness";
import { isAutoWebAuditEnabled, triggerWebAuditRun } from "@/lib/web-audit/audit-dispatch";
import { WebAuditProvider } from "./web-audit-context";
import { WebAuditDriveNotice } from "./web-audit-drive-notice";
import { AuditTabsProvider, AuditTabBar, AuditTabPanel } from "./audit-tabs";
import type { PageAuditEntry } from "@/lib/web-audit/technical-audit";
import type { BotAccessReport, BotAgent } from "@/lib/web-audit/robots";
import { buildPageCheckGuidance } from "@/lib/web-audit/page-checks";
import {
  buildTechnicalIssuesReport,
  failingPageChecks,
  type TechnicalIssue,
  type TechnicalIssuesReport,
  type TechnicalPassingCheck,
  type IssueCheckKey,
  type IssueSeverity
} from "@/lib/web-audit/issues";
import { buildPageFixes, type PageFixContext } from "@/lib/web-audit/page-fixes";
import { projectScreenMetadata } from "@/lib/seo/console-metadata";
import { PageFixBlock } from "./page-fix-block";
import { LlmsTxtBlock } from "./llms-txt-block";
import { SitemapStepsBlock } from "./sitemap-steps-block";
import { formatDate } from "./_components/format";
import { IssueRow, PassingRow } from "./_components/issue-rows";
import { ScoreGauge, SubScoreTile, LockedSubScoreTile, MiniBar } from "./_components/score-tiles";
import { PageAuditRow } from "./_components/page-audit-row";
import { BotAccessCard } from "./_components/bot-access-card";
import { TrendChart } from "./_components/trend-chart";

// Server Actions invoked from this page (auditDomainCoverageAction) run
// several sequential Gemini grounding calls up to COVERAGE_TOTAL_BUDGET_MS
// (~45s) — same ADR-0003 rationale as the Escaneos page's maxDuration.
export const maxDuration = 60;

// WEB-AUDIT-R3 (founder-approved 2026-07-12) rescaled page-checks.ts's point
// weights and added new sub-checks — the SAME page's pageScore can differ
// before/after this ships even with zero content change. A snapshot taken
// before this date used the old (narrower) criteria; the banner below flags
// that explicitly so a lower score never reads as a silent regression. Purely
// a display cutoff — self-expiring the moment a project re-audits.
const TECHNICAL_CRITERIA_EXPANDED_AT = new Date("2026-07-13T00:00:00Z");

// ROOT-METADATA-1: el dominio va en la pestaña. Sin esto las pantallas de
// consola heredaban `title: "GenScore"` del layout raíz y eran indistinguibles
// entre sí y entre proyectos. `requireActiveProject` está memoizada por
// petición, así que esto no añade ninguna consulta.
export async function generateMetadata({
  params
}: {
  params: Promise<{ projectId: string }>;
}): Promise<Metadata> {
  const { projectId } = await params;
  return projectScreenMetadata("Auditoría web", async () => (await requireActiveProject(projectId)).domain);
}

export default async function WebAuditPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const project = await requireActiveProject(projectId);
  const { supabase, user } = await requireUser();

  // Two capabilities, not one (WEB-AUDIT-TECH-ALL-PLANS-1, founder-approved
  // 2026-08-05). Coverage (DOMAIN-COVERAGE-1) still reads the raw plan
  // column directly via isProOrAbove, never getPlanForUser/resolvePlan
  // (route rule, .claude/rules/web-audit.md) — it runs batched Gemini
  // grounding calls and stays genuinely Pro-only. The technical half (pure
  // fetch + regex, zero LLM — lib/web-audit/technical-audit.ts) is now
  // available on every plan: GEO-SCORE-V4 (docs/adr/0033) made
  // `readiness_score` a real .20 GEO Score component, so gating it made the
  // headline metric measure a different number of signals depending on plan.

  // Always true today. Kept as a named capability rather than inlining
  // `true` at every call site so a future plan tier ever needs to gate it
  // again, there is one place to flip. Declarado aquí arriba (antes iba junto
  // a `canAuditCoverage`) porque el lote de abajo lo necesita y, a diferencia
  // de aquél, no depende de `profileRow`.
  const canAuditTechnical = true;

  // Las cinco lecturas independientes de esta pantalla, en paralelo
  // (PRELAUNCH-HARDENING-1 Fase V, V7). Estaban encadenadas una tras otra
  // aunque ninguna consume el resultado de la anterior: el usuario pagaba la
  // suma de cinco viajes a Supabase en vez del más lento de los cinco. Lo que
  // sí depende de algo (el `jobs` de abajo necesita `latestRunRow`) sigue
  // detrás, que es exactamente donde tiene que estar.
  const [
    { data: profileRow },
    { data: latestRunRow },
    { data: historyRows },
    { data: technicalHistoryRows },
    { data: activeCampaignRow }
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("current_plan")
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("scan_runs")
      .select("id, finished_at, created_at")
      .eq("project_id", projectId)
      .eq("status", "completed")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("generated_solutions")
      .select("sanitized_content, created_at")
      .eq("project_id", projectId)
      .eq("generation_type", "domain_coverage")
      .is("recommendation_id", null)
      .eq("status", "completed")
      .eq("is_sanitized", true)
      .order("created_at", { ascending: false })
      .limit(12),
    canAuditTechnical
    ? supabase
        .from("web_audit_snapshots")
        .select("readiness_score, pages, bots, created_at")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false })
        .limit(8)
    : { data: [] },
    supabase
      .from("generated_solutions")
      .select("sanitized_content, updated_at")
      .eq("project_id", projectId)
      .eq("generation_type", "domain_coverage")
      .is("recommendation_id", null)
      .eq("status", "running")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
  ]);

  const canAuditCoverage = isProOrAbove(profileRow?.current_plan as string | undefined);





  // WEB-AUDIT-2: technical-audit snapshots, most recent first. Rendered
  // as-is — this page never re-triggers the audit itself, only the button
  // does (lib/web-audit/technical-audit.ts owns the cache/rate-limit rules).
  //
  // WEB-AUDIT-ISSUES-1 fase 2 (founder-approved 2026-08-02): widened from
  // a single row to the last 8 — the "Problemas" tab's críticos/avisos
  // mini-trend and the readiness-score delta both need more than the latest
  // snapshot, which nothing on this page loaded before this phase.
  //
  // WEB-AUDIT-TECH-ALL-PLANS-1: queried for every plan now — this used to be
  // skipped entirely under `!canAudit` (the old single Pro gate), which made
  // a non-Pro project's technical snapshot null by construction even on a
  // project that had one. `canAuditTechnical` is always true; the ternary
  // stays so a future gate has one line to change, not this query's shape.

  const technicalHistory = (technicalHistoryRows ?? []) as Array<{
    readiness_score: number | null;
    pages: PageAuditEntry[];
    bots: BotAccessReport;
    created_at: string;
  }>;
  const technicalSnapshot = technicalHistory[0] ?? null;

  // Pure aggregation (lib/web-audit/issues.ts, WEB-AUDIT-ISSUES-1 fase 1) run
  // over each loaded snapshot — cheap, no I/O, no new query per point.
  // The chronological critical/warning series this used to build fed the two
  // sparklines beside the Críticos/Avisos counts; both were removed in the
  // founder review of 2026-08-03, so the series went with them rather than
  // being left computed and unread on every render.
  const technicalReportsNewestFirst = technicalHistory.map((snap) => ({
    createdAt: snap.created_at,
    report: buildTechnicalIssuesReport(snap.pages, snap.bots)
  }));
  const currentTechnicalReport: TechnicalIssuesReport | null = technicalReportsNewestFirst[0]?.report ?? null;
  const previousTechnicalReport: TechnicalIssuesReport | null = technicalReportsNewestFirst[1]?.report ?? null;
  const technicalScoreDelta =
    currentTechnicalReport?.actualReadinessScore != null && previousTechnicalReport?.actualReadinessScore != null
      ? currentTechnicalReport.actualReadinessScore - previousTechnicalReport.actualReadinessScore
      : null;

  // WEB-AUDIT-CHAIN: detect a campaign left "running" for the current scan
  // (from a previous batch, whether the user is still on this page or came
  // back after navigating away/closing the tab) so the audit button can
  // resume driving it automatically — same shape as AutoExecuteScan resuming
  // a pending/running scan_run on Escaneos. Read server-side, not from any
  // client-only state, so it survives a full page reload.

  const activeCampaignMap = parseCoverageMap(activeCampaignRow?.sanitized_content ?? null);
  const hasActiveCampaign = Boolean(
    activeCampaignMap && latestRunRow && activeCampaignMap.scanId === latestRunRow.id
  );

  // WEB-AUDIT-DRIVE-1: the audit job for this run, read through RLS
  // (`jobs_select_owner`) rather than the service client — this is a render
  // path and the owner is entitled to its own job's state.
  //
  // Two things depend on it, and neither could be answered from the campaign
  // row alone: whether the pill may claim the audit is moving, and whether
  // anything is owed that opening this page should wake up.
  const { data: auditJobRow } = latestRunRow
    ? await supabase
        .from("jobs")
        .select("status, next_attempt_at, locked_at")
        .eq("project_id", projectId)
        .eq("run_id", latestRunRow.id)
        .eq("job_type", WEB_AUDIT_JOB_TYPE)
        .maybeSingle()
    : { data: null };

  /* SCAN-STATES-3: is an audit actually moving right now? Read off the job
     row this page already fetches — no extra query. Deliberately NOT
     `auditPillState`, which is gated on `canAuditCoverage`: the technical
     half runs on every plan, so a Free project's first audit is real work
     and deserves the beat as much as a Pro one's. */
  const auditIsRunning = ["pending", "running", "retrying"].includes(String(auditJobRow?.status ?? ""));

  const auditPillState = deriveAuditPillState({
    campaignUpdatedAt: hasActiveCampaign ? activeCampaignRow?.updated_at : null,
    jobStatus: auditJobRow?.status
  });

  // Wake the worker when this project has an audit owed to it. Until now the
  // only things that could start one were the `after()` dispatch at the end of
  // a scan and the 07:00 daily cron, so a lost dispatch meant the screen sat
  // on "Auditando…" until the next morning — and on a preview deployment,
  // where Vercel runs no crons at all, forever (2026-08-07).
  //
  // Safe to fire on a render: the worker claims jobs with the same atomic
  // conditional UPDATE the scan batches use, so a duplicate dispatch is a
  // no-op rather than a second audit, and the predicate only passes for a job
  // that is genuinely due or genuinely abandoned. Fire-and-forget via
  // `after()`, so the page's own response is never held up by it.
  if (
    auditJobRow &&
    isAutoWebAuditEnabled() &&
    isWebAuditJobDue({
      status: auditJobRow.status as string,
      nextAttemptAt: auditJobRow.next_attempt_at as string | null,
      lockedAt: auditJobRow.locked_at as string | null,
      staleLockMs: WEB_AUDIT_STALE_LOCK_MS
    })
  ) {
    after(() => triggerWebAuditRun());
  }
  let activeCampaignProgress: { covered: number; total: number } | null = null;
  if (hasActiveCampaign && activeCampaignMap) {
    const { count: activePromptCount } = await supabase
      .from("project_prompts")
      .select("id", { count: "exact", head: true })
      .eq("project_id", projectId)
      .eq("is_active", true);
    activeCampaignProgress = {
      covered: activeCampaignMap.topics.length,
      total: activePromptCount ?? activeCampaignMap.topics.length
    };
  }

  const maps = ((historyRows ?? []) as Array<{ sanitized_content: string | null }>)
    .map((row) => parseCoverageMap(row.sanitized_content))
    .filter((m): m is NonNullable<typeof m> => m !== null);

  const scanIds = Array.from(new Set(maps.map((m) => m.scanId)));

  const { data: resultRows } =
    scanIds.length > 0
      ? await supabase
          .from("scan_prompt_results")
          .select("id, prompt_id, run_id, extracted_json, provider, mentioned_competitors_count")
          .eq("project_id", projectId)
          .in("run_id", scanIds)
          .eq("status", "completed")
      : { data: [] };

  const resultsByScanId = new Map<string, PromptResultLite[]>();
  for (const row of (resultRows ?? []) as Array<PromptResultLite & { run_id: string }>) {
    const list = resultsByScanId.get(row.run_id) ?? [];
    list.push(row);
    resultsByScanId.set(row.run_id, list);
  }

  const latestMap = maps.length > 0 ? maps.reduce((a, b) => (a.generatedAt > b.generatedAt ? a : b)) : null;

  // WEB-AUDIT-R6 phase 2: citation is classified over a fixed window of
  // recent scans, not just the latest one (see opportunity-matrix.ts) — the
  // same deduped candidates list drives both this current summary and every
  // historical trend point (buildCoverageTrend), so they stay consistent.
  const citationWindowCandidates = buildCitationWindowCandidates(maps, resultsByScanId);
  const summary = latestMap
    ? buildWebAuditSummary({ coverage: latestMap, citationWindowCandidates, projectDomain: project.domain })
    : null;
  const trend = buildCoverageTrend({ maps, resultsByScanId, projectDomain: project.domain });

  // Brand + domain for the copyable fixes (fase 3b). `project.domain` is
  // already the normalized host used everywhere else on this page.
  const fixContext: PageFixContext = { projectName: project.name, domainNormalized: project.domain };

  // Fase 3a: the llms.txt the user can publish, built from the latest coverage
  // campaign. Null when no campaign has ever produced a verified page — the
  // builder refuses to emit a file that would be nothing but placeholders.
  const llmsTxtFile = buildLlmsTxt({
    brand: project.name,
    domainNormalized: project.domain,
    coverage: latestMap
  });
  const llmsPublishSteps = publishSteps(project.domain);
  const sitemapFixSteps = sitemapSteps(project.domain);

  const auditedScan = latestMap ? maps.find((m) => m.scanId === latestMap.scanId) : null;
  const auditedScanDate = auditedScan?.scanId === latestRunRow?.id ? latestRunRow?.finished_at ?? latestRunRow?.created_at : null;

  // WEB-AUDIT-R6 phase 1 (geo-strategy methodology review 2026-07-17):
  // coverage/citation are both sampled fresh per scan from Gemini's Google
  // Search grounding — a noisy sensor. With a small denominator, a single
  // sampling flip swings the percentage by double digits; showing that swing
  // as a bare "+17 pt" delta reads as precision the sample doesn't support.
  // A delta is only shown when BOTH the current and previous point clear
  // SMALL_SAMPLE_THRESHOLD (isDeltaTrustworthy) — never fabricated, never
  // silently rounded away, just withheld when the comparison itself would be
  // noise. The tile itself still always shows the real fraction (n/N).
  const previousPoint = trend.length >= 2 ? trend[trend.length - 2] : null;

  const previousCoveragePct = previousPoint?.coveragePct ?? null;
  const coverageDeltaTrustworthy =
    previousPoint !== null && isDeltaTrustworthy(summary?.conclusiveCount ?? 0, previousPoint.conclusiveCount);
  const coverageDelta =
    coverageDeltaTrustworthy &&
    summary?.coveragePct !== null &&
    summary?.coveragePct !== undefined &&
    previousCoveragePct !== null
      ? summary.coveragePct - previousCoveragePct
      : null;

  const previousSurfacingPct = previousPoint?.surfacingPct ?? null;
  const surfacingDeltaTrustworthy =
    previousPoint !== null && isDeltaTrustworthy(summary?.coveredCount ?? 0, previousPoint.coveredCount);
  const surfacingDelta =
    surfacingDeltaTrustworthy &&
    summary?.surfacingPct !== null &&
    summary?.surfacingPct !== undefined &&
    previousSurfacingPct !== null
      ? summary.surfacingPct - previousSurfacingPct
      : null;

  // WEB-AUDIT-R1: the hero's composite score — plain mean of the real signals
  // available (see lib/web-audit/global-score.ts). Its breakdown renders right
  // next to it, so the composite is never a black box; a component that has
  // never been computed (e.g. technical audit not yet run) is excluded, not
  // faked as 0.
  const globalScore = buildGlobalScore({
    coveragePct: summary?.coveragePct ?? null,
    surfacingPct: summary?.surfacingPct ?? null,
    technicalScore: technicalSnapshot?.readiness_score ?? null
  });

  // WEB-AUDIT-TECH-ALL-PLANS-1 (Director's call, 2026-08-05): a non-Pro
  // account can never populate coverage/surfacing, so `globalScore.score`
  // would silently equal the technical score anyway (mean of one value is
  // itself) — the actual problem was never the number, it was the caption
  // ("Media de 1 señal disponible… audita el resto para completarla"), which
  // reads as "not run yet" when the true fact is "not included in your
  // plan". Rather than keep the composite framing with a patched caption,
  // the non-Pro headline IS the technical score — one named signal, not a
  // same-valued disguised average. Pro's composite is untouched.
  const heroScore = canAuditCoverage ? globalScore.score : (technicalSnapshot?.readiness_score ?? null);

  // WEB-AUDIT-ISSUES-1 fase 2 (founder-approved 2026-08-02): el Plan de
  // acción (competitor extraction, join con `recommendations`, `buildActionPlan`
  // y su expansor) se retiró de esta pantalla entero — "no tiene sentido
  // aquí, debe estar en la página de recomendaciones". `grouped` sigue
  // haciendo falta para "Lo que ya funciona" y la pista de la tarjeta hero.
  //
  // Su módulo (`lib/web-audit/action-plan.ts`) sobrevivió once días sin un solo
  // importador antes de borrarse en PRELAUNCH-HARDENING-1 Fase R8-b (log §98);
  // la spec queda marcada como retirada. Si vuelve, va en Recomendaciones.
  const grouped: Record<TopicOutcome, ClassifiedTopic[]> = {
    performing: [],
    invisible: [],
    content_gap: [],
    open_opportunity: [],
    unverified_cited: [],
    inconclusive: []
  };
  for (const topic of summary?.topics ?? []) {
    grouped[topic.outcome].push(topic);
  }

  const analyzedPagesCount = technicalSnapshot ? technicalSnapshot.pages.filter((p) => p.status === "analyzed").length : 0;

  return (
    <WebAuditProvider projectId={projectId} autoStart={activeCampaignProgress} canAudit={canAuditCoverage}>
    <div className="page">
      {/* Sticky header */}
      <div className="ov-sticky-header">
        <div className="ov-sticky-left">
          <div>
            <p className="kicker" style={{ marginBottom: 2 }}>Auditoría web</p>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 15, fontWeight: 750, color: "var(--ink)", letterSpacing: "-.01em" }}>
                {project.name}
              </span>
              <span className="badge badge-neutral" style={{ fontFamily: "var(--mono)", fontSize: 11 }}>
                {project.domain}
              </span>
              {/* Was hardcoded unconditionally — read as "your account is
                  Pro" sitting right next to a "Disponible en plan Pro"
                  button when it wasn't (founder report: contradictory at a
                  glance after a plan downgrade). Reflects `canAuditCoverage`
                  specifically (WEB-AUDIT-TECH-ALL-PLANS-1): coverage is the
                  one half of this page that's still actually Pro-only, so
                  this is the one badge that still means something by plan —
                  the technical panels below render for every plan now. */}
              {canAuditCoverage && <span className="badge badge-accent" style={{ fontSize: 10 }}>PRO</span>}
            </div>
          </div>
        </div>
        {/* WEB-AUDIT-ISSUES-1 fase 2 (founder-approved 2026-08-02): the
            sticky header is shared chrome across every console page
            (docs/brand/design-decisions-log.md §3) — "el contexto vive
            entero en el sticky-header... título de sección + pill de fecha".
            Citations and Prompts, the two other v3-repainted pages, only put
            passive badges/status pills here, never an action button. The
            real "Auditar ahora" button moved into the page body below,
            leaving this side purely informational. (That button is gone
            entirely since AUDIT-NO-BUTTON-1; the body now holds only the
            audit's state.) */}
        <div className="ov-sticky-right" style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {/* Two lengths, not one. `.ov-sticky-right` is `flex-shrink: 0`, so
              whatever sits here keeps its intrinsic width — fine for the short
              pills Citations/Overview put here, but this is prose, and at
              375px the full sentence claimed ~340px of a 375px header. The
              left block (`flex: 1; min-width: 0`) collapsed to ~25px and its
              "Auditoría web" kicker painted straight over this text. Caught by
              reading the pilot's own mobile capture of PR #289 — no console
              error, no failed request and no overflow signal fired, because
              nothing overflowed: two elements simply shared the same pixels.
              The compact form keeps the audit date on mobile (it is the only
              place in the page that shows audit freshness) while fitting. */}
          {latestMap ? (
            <span style={{ fontSize: 11, color: "var(--ink-4)" }}>
              <span className="wa2-hdr-audit-full">
                Última auditoría: {formatDate(latestMap.generatedAt)}
                {auditedScanDate ? ` · sobre el escaneo del ${formatDate(auditedScanDate)}` : ""}
              </span>
              <span className="wa2-hdr-audit-compact">Auditada {formatDate(latestMap.generatedAt)}</span>
            </span>
          ) : (
            // WEB-AUDIT-TECH-ALL-PLANS-1: `latestMap` only ever exists for a
            // coverage campaign, so a non-Pro project (which never has one)
            // used to show no date here at all — even with a real, fresh
            // technical snapshot. That reads as "never audited", which is
            // false. Falls back to the technical snapshot's own date; still
            // nothing when neither exists.
            technicalSnapshot && (
              <span style={{ fontSize: 11, color: "var(--ink-4)" }}>Auditada {formatDate(technicalSnapshot.created_at)}</span>
            )
          )}
          {/* DOMAINS-REDESIGN-1: era un `.scan-status`, que el CSS oculta bajo
              el breakpoint móvil — el mismo fallo que §26 arregló para el
              escaneo y dejó anotado como pendiente para la auditoría. La
              pastilla compartida lo hace visible también en móvil y unifica el
              vocabulario de estado de toda la consola. Gate renombrado a
              `canAuditCoverage` por WEB-AUDIT-TECH-ALL-PLANS-1 (ADR 0035):
              este chip anuncia la campaña de COBERTURA, que sigue siendo Pro
              — la auditoría técnica corre en todos los planes y no tiene
              campaña que anunciar aquí. */}
          {/* WEB-AUDIT-DRIVE-1: the pill used to render off `status='running'`
              alone, with no notion of when that row last moved — so a campaign
              whose driver stopped 13 minutes earlier said "Auditando…"
              indefinitely (2026-08-07). `auditPillState` is the same claim
              measured against the clock and against the job's own status. */}
          {canAuditCoverage && auditPillState === "auditing" && <ScanStatePill auditing />}
          {canAuditCoverage && auditPillState === "pending" && (
            <span className="badge" style={{ fontSize: 11 }}>
              Auditoría pendiente
            </span>
          )}
        </div>
      </div>

      {/* WEB-AUDIT-ISSUES-1 fase 2: v3 repaint + the founder-approved
          640/1200/1280px console width standard (CITATIONS-REDESIGN-1,
          docs/brand/design-decisions-log.md §5), same mechanism as
          .ov2-scope/.cit2-scope — re-points the shared token names so every
          unedited `.card`/badge/etc. inside repaints automatically. Wraps
          everything below the sticky header, which stays on the shared
          chrome untouched, matching this repo's established nesting. */}
      <div className="wa2-scope wa2-page">

      {/* AUDIT-NO-BUTTON-1 (founder, 2026-08-05): here lived the page's one
          "Auditar ahora" button, and briefly after it a status pill. Both are
          gone. The audit has run on its own after every scan since
          AUDIT-AFTER-SCAN-1, so the button asked for work already done; and
          once the pill carried the date too, it repeated what the sticky
          header above already says ("dejamos solo la info de la cabecera").
          The header states the audit date, whether it covers the newest scan,
          and shows its own "Auditando" pill while a campaign runs — there was
          nothing left for a second element to add. */}

      {/* A campaign can be left "running" server-side while the account's
          plan lapses mid-audit (e.g. downgraded via Stripe billing) — the
          banner must never promise "seguirá por donde se quedó" when it
          genuinely can't: WebAuditProvider won't auto-resume without
          canAuditCoverage, and the button that would show any driving state
          is hidden entirely under the plan gate. Founder report: the old
          unconditional version left the page looking permanently stuck with
          no error, no explanation. This banner is about the COVERAGE
          campaign specifically — the technical half never had a "campaign"
          to pause, so WEB-AUDIT-TECH-ALL-PLANS-1 leaves this whole block
          keyed on canAuditCoverage unchanged. */}
      {/* Sólo la variante de plan pausado. La de "Auditoría en curso" se
          retiró (founder review 2026-08-04): mientras se audita, el propio
          botón ya lleva el spinner y el conteo de temas en vivo, así que el
          banner repetía la misma información en tres líneas más una pastilla
          — "todo el resto es liar la experiencia". Esta variante NO es
          redundante: cuando el plan decae a mitad de auditoría el botón
          desaparece entero bajo el gate, y entonces este banner es lo único
          que explica por qué la página parece atascada. */}
      {/* WEB-AUDIT-DRIVE-1: the coverage driver's own failures, which had no
          renderer at all until this phase — see the component. Placed above
          the plan-lapsed banner because the two are mutually exclusive in
          practice (that one only shows when the driver never starts) and this
          one is about work that did start and then stopped. */}
      <WebAuditDriveNotice />

      {activeCampaignProgress && !canAuditCoverage && (
          <div className="firstscan-banner">
            <div className="fb-ico">
              <Icon name="search" size={18} />
            </div>
            <div style={{ flex: 1 }}>
              <div className="fb-t">Auditoría pausada por cambio de plan</div>
              <div className="fb-d">
                Se quedó en {activeCampaignProgress.covered} de {activeCampaignProgress.total} temas. Tu plan actual
                no incluye esta función — el progreso está guardado y se reanudará en cuanto vuelvas a un plan Pro o
                superior.
              </div>
            </div>
            <Link href="/dashboard/settings/billing" className="btn btn-primary btn-sm">
              Ver planes
            </Link>
          </div>
        )}

      {/* Gated / empty states. WEB-AUDIT-TECH-ALL-PLANS-1 (2026-08-05): the
          old single `!canAudit` branch blanked out the ENTIRE page —
          technical panels included — for any non-Pro account. That was
          exactly the asymmetry GEO-SCORE-V4 (docs/adr/0033) turned into a
          scoring bug, not just a UX one: `readiness_score` is a real .20 GEO
          Score component, so a plan that can never see it structurally
          scored on four signals instead of five. The ladder below now gates
          on real data only — a completed scan, then either kind of audit
          result — never on plan. The plan-specific "not included" fact is
          told per-signal instead, inside the tiles/sections that need it
          (LockedSubScoreTile, the coverage-only Evolución/Historial blocks
          that stay empty by construction for a non-Pro project). */}
      {!latestRunRow ? (
        <div className="card" style={{ marginTop: 14, padding: "24px 22px", textAlign: "center" }}>
          <div style={{ fontSize: 15, fontWeight: 750, color: "var(--ink)", marginBottom: 8 }}>
            Todavía no hay ningún escaneo completado
          </div>
          <p style={{ fontSize: 13.5, color: "var(--ink-3)", maxWidth: 460, margin: "0 auto 16px", lineHeight: 1.6 }}>
            La auditoría web necesita al menos un escaneo completado para cruzar tus prompts con lo que la IA cita.
          </p>
          <Link href={`/dashboard/projects/${projectId}`} className="btn btn-primary btn-sm">
            Ir a la visión general
          </Link>
        </div>
      ) : !summary && !technicalSnapshot && auditIsRunning ? (
        /* SCAN-STATES-3: the mission's sixth beat. Only here, and only when
           there is nothing to hide — this page does NOT take the screen over
           while a re-audit runs, so a project with previous results keeps
           reading them. First audit only, same rule the rocket follows. */
        <ReentryMission domain={project.domain} />
      ) : !summary && !technicalSnapshot ? (
        // Neither signal exists yet for THIS account — true empty state,
        // reachable on any plan (e.g. right after a scan finishes, before
        // the async post-scan audit job has run). Copy branches on
        // canAuditCoverage because the two plans are waiting on different
        // things: a Pro account is waiting on ITS OWN next audit; a non-Pro
        // account will only ever get the technical half, so telling it
        // "hasta 5 auditorías al día" would describe a feature it can't use.
        <div className="card" style={{ marginTop: 14, padding: "24px 22px", textAlign: "center" }}>
          <div style={{ fontSize: 15, fontWeight: 750, color: "var(--ink)", marginBottom: 8 }}>
            Todavía no has auditado tu web
          </div>
          {canAuditCoverage ? (
            <p style={{ fontSize: 13.5, color: "var(--ink-3)", maxWidth: 460, margin: "0 auto 16px", lineHeight: 1.6 }}>
              Tu dominio visto como lo ve la IA: la auditoría comprueba, tema a tema, si tu dominio publica contenido
              que Google encuentra, y lo cruza con las citas de tu último escaneo.
            </p>
          ) : (
            <p style={{ fontSize: 13.5, color: "var(--ink-3)", maxWidth: 460, margin: "0 auto 16px", lineHeight: 1.6 }}>
              La salud técnica de tu web se audita sola tras cada escaneo — vuelve en unos minutos. Comparar lo que
              publicas con lo que la IA cita en sus respuestas es una función del plan Pro.
            </p>
          )}
          <p style={{ fontSize: 11.5, color: "var(--ink-4)", marginBottom: 16 }}>Hasta 5 auditorías al día por proyecto.</p>
        </div>
      ) : (
        <AuditTabsProvider>
          {/* HERO (WEB-AUDIT-R1): one composite verdict + its breakdown,
              replacing the old 4-tile KPI row that mixed units (fractions,
              scores, counts) with no hierarchy. */}
          <div className="card" style={{ marginTop: 14, padding: "16px 18px" }}>
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "center", gap: 20 }}>
              {/* Title ABOVE the dial, like the mockup's "Salud del sitio"
                  (founder review 2026-08-03: "el gauge inicial necesita un
                  título"). It used to sit over the tiles, which left the big
                  number unlabelled and made it read as competing with the
                  "Salud técnica" tile below rather than summarising it. */}
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, flexShrink: 0 }}>
                <div className="wa2-diag-title" style={{ display: "flex", alignItems: "center", fontSize: 13.5, fontWeight: 750 }}>
                  Diagnóstico general
                  {/* Qué te aporta, no cómo se calcula (founder review
                      2026-08-04). La versión anterior describía la aritmética
                      —"media simple de tus señales disponibles… no cuenta
                      como 0"— que es exactamente lo que un usuario no
                      necesita saber para decidir qué hacer, y además ocupaba
                      once líneas que tapaban el propio gauge. El desglose
                      sigue visible al lado, en los tres tiles. */}
                  <InfoTip text="Lo preparada que está tu web para que la IA te cite como fuente. Sube al cubrir los temas que te importan, al conseguir que la IA te mencione en ellos y al dejar tus páginas legibles para los motores." />
                </div>
                {/* WEB-AUDIT-TECH-ALL-PLANS-1: `heroScore` (computed above)
                    is the composite for a Pro account, same as before, and
                    the technical score alone for a non-Pro one — see its own
                    comment for why that's the honest headline rather than a
                    same-valued 1-of-3 average with a misleading caption. */}
                <ScoreGauge score={heroScore} />
              </div>
              <div style={{ flex: 1, minWidth: 240 }}>
                {/* Caption above the tiles: for a non-Pro account this is
                    always shown (coverage/surfacing can never be computed —
                    that's a plan fact, not a "not run yet" one); for Pro it
                    only shows below 3 signals, same as before
                    WEB-AUDIT-TECH-ALL-PLANS-1. */}
                {(!canAuditCoverage || globalScore.includedCount < 3) && (
                  <div style={{ fontSize: 11.5, color: "var(--ink-3)", margin: "2px 0 10px" }}>
                    {!canAuditCoverage
                      ? "Tu salud técnica — el contenido propio y lo que la IA cita se destapan en el plan Pro."
                      : `Media de ${globalScore.includedCount} ${globalScore.includedCount === 1 ? "señal disponible" : "señales disponibles"} — audita el resto para completarla.`}
                  </div>
                )}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 8, marginTop: !canAuditCoverage || globalScore.includedCount < 3 ? 0 : 10 }}>
                  {/* Sin sparklines. Se probaron con 4 auditorías reales
                      (founder review 2026-08-04) y a 64×22px no se leen: "no
                      aportan mucho porque se ven muy pequeñas". Es además
                      información duplicada — el gráfico de Evolución, justo
                      debajo, dibuja exactamente la misma serie con ejes y
                      fechas. */}
                  {/* Contenido/Implementado: coverage stays Pro-only, and
                      `summary` is always null on a non-Pro account (no
                      coverage campaign ever runs) — locked, never "—", per
                      WEB-AUDIT-TECH-ALL-PLANS-1 (see LockedSubScoreTile). On
                      Pro, `summary` can ALSO be null transiently (a scan just
                      completed technical-first, coverage not through yet —
                      the structural fix that let this hero render at all
                      without a coverage summary), so this branch keeps its
                      own null-safety instead of assuming the old ladder's
                      guarantee. */}
                  {canAuditCoverage ? (
                    <>
                      <SubScoreTile
                        label="Contenido"
                        value={summary?.coveragePct == null ? "—" : `${summary.coveredCount} / ${summary.conclusiveCount}`}
                        hint="Temas con contenido propio verificado"
                        delta={coverageDelta}
                        pct={summary?.coveragePct ?? null}
                      />
                      <SubScoreTile
                        label="Implementado"
                        value={summary?.surfacingPct == null ? "—" : `${summary.surfacedCount} / ${summary.coveredCount}`}
                        hint={
                          summary?.surfacingPct != null && grouped.invisible.length > 0
                            ? `Palanca rápida: ${grouped.invisible.length} ${grouped.invisible.length === 1 ? "tema aún sin citar" : "temas aún sin citar"}`
                            : "De tus temas con contenido, cuántos cita la IA"
                        }
                        delta={surfacingDelta}
                        pct={summary?.surfacingPct ?? null}
                      />
                    </>
                  ) : (
                    <>
                      <LockedSubScoreTile label="Contenido" hint="Temas con contenido propio verificado por la IA" />
                      <LockedSubScoreTile label="Implementado" hint="Cuánto de ese contenido cita la IA en sus respuestas" />
                    </>
                  )}
                  <SubScoreTile
                    label="Salud técnica"
                    value={
                      technicalSnapshot
                        ? technicalSnapshot.readiness_score === null
                          ? "—"
                          : `${technicalSnapshot.readiness_score} / 100`
                        : "Sin auditar"
                    }
                    hint={
                      technicalSnapshot
                        ? `Media de ${analyzedPagesCount} ${analyzedPagesCount === 1 ? "página clave" : "páginas clave"}`
                        : "Se audita sola tras cada escaneo"
                    }
                    delta={null}
                    pct={technicalSnapshot?.readiness_score ?? null}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Evolución: subida aquí desde el pie de "Problemas" (founder
              review 2026-08-03: "subiría el gráfico de evolución de auditorías
              y lo pondría precisamente debajo de la primera caja"). Al vivir
              fuera del sistema de pestañas, la lectura pasa a ser: dónde
              estás (hero) → hacia dónde vas (esto) → qué hacer (pestañas).
              Umbral subido de 2 a 4 auditorías (founder-approved 2026-08-04,
              tras verlo en el preview): con dos puntos el gráfico dibuja una
              recta que se lee como tendencia sin serlo — el mismo criterio
              que ya aplican las sparklines de los tiles, y que pesa más aquí
              porque este bloque pasó a la posición más visible de la página.
              Sigue sin haber placeholder "necesitas más datos": desaparece
              entero. El Historial en tabla se queda en Problemas con umbral
              2 — es una tabla, no una línea: dos filas se leen perfectamente
              y son justo lo que da contexto mientras el gráfico no aparece. */}
          {trend.length >= 4 && (
            <div className="card" style={{ marginTop: 12 }}>
              <div style={{ padding: "13px 16px 0" }}>
                <div style={{ fontSize: 13.5, fontWeight: 750 }}>Evolución entre auditorías</div>
                <div style={{ fontSize: 11.5, color: "var(--ink-3)", marginTop: 2 }}>
                  Cobertura e implementación a lo largo de los últimos escaneos.
                </div>
              </div>
              <div style={{ display: "flex", gap: 14, fontSize: 11, color: "var(--ink-3)", fontWeight: 600, padding: "10px 16px 0" }}>
                <span>
                  <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 3, marginRight: 5, verticalAlign: -1, background: "var(--accent)" }} />
                  Cobertura de temas
                </span>
                <span>
                  <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 3, marginRight: 5, verticalAlign: -1, background: "var(--pos)" }} />
                  Tasa de implementación
                </span>
              </div>
              <div style={{ padding: "12px 16px 14px" }}>
                <TrendChart points={trend} />
              </div>
            </div>
          )}

          <AuditTabBar />

          {/* ─── Resumen ─── */}
          <AuditTabPanel id="problemas">
            {/* Salud técnica GEO — la lista de problemas (WEB-AUDIT-ISSUES-1
                fase 2, founder-approved 2026-08-02): "una auditoría web es
                para encontrar problemas técnicos" fue la lectura del
                fundador sobre los mockups, así que esta lista —no el antiguo
                resumen de una línea— abre ahora la pestaña. Cada fila sale
                de los checks reales por página/bot de lib/web-audit/issues.ts,
                ordenados por severidad; el delta de puntos de cada una es la
                ganancia exacta de score al arreglar solo ESE check (ver la
                cabecera de ese módulo para el porqué es exacto, no una
                estimación). */}
            {currentTechnicalReport ? (
              <>
                {currentTechnicalReport.totalPointPotential > 0 && (
                  <div
                    className="card"
                    style={{ marginTop: 12, padding: "14px 16px", background: "var(--pos-soft)", border: "1px solid transparent" }}
                  >
                    <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".03em", color: "var(--pos-ink)", textTransform: "uppercase" }}>
                      Si arreglas los {currentTechnicalReport.issues.length}{" "}
                      {currentTechnicalReport.issues.length === 1 ? "problema técnico" : "problemas técnicos"}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 4 }}>
                      <span style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-.02em", color: "var(--ink)", fontVariantNumeric: "tabular-nums" }}>
                        {currentTechnicalReport.actualReadinessScore}
                      </span>
                      <Icon name="arrRight" size={16} />
                      <span
                        style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-.02em", color: "var(--pos-ink)", fontVariantNumeric: "tabular-nums" }}
                      >
                        {currentTechnicalReport.projectedReadinessScore}
                      </span>
                      <span className="badge badge-pos" style={{ marginLeft: "auto", fontSize: 10.5, background: "var(--surface)" }}>
                        calculado
                      </span>
                    </div>
                    {/* Names WHICH score these two numbers are. Founder review
                        2026-08-03: the hero dial reads 58 and this card reads
                        81 — "ya veo que es salud técnica, pero me ha costado
                        identificarlo". They are different measures (global
                        average vs technical only), so the fix is a label, not
                        a shared number. Copy also cut down per the same
                        review ("la frase tiene que ser más pequeña"). */}
                    <div style={{ fontSize: 11, fontWeight: 650, color: "var(--pos-ink)", marginTop: 2 }}>
                      Salud técnica
                    </div>
                    <p style={{ fontSize: 10.5, lineHeight: 1.45, color: "var(--ink-3)", margin: "6px 0 0" }}>
                      Es una valoración técnica. Que la IA acabe citándote depende también de otros factores de
                      GEO, que trabajas en Recomendaciones.
                    </p>
                  </div>
                )}

                <div className="card" style={{ marginTop: 12 }}>
                  <div
                    style={{
                      padding: "13px 16px 0",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      flexWrap: "wrap",
                      gap: 8
                    }}
                  >
                    <div style={{ fontSize: 13.5, fontWeight: 750 }}>Problemas técnicos</div>
                    {technicalScoreDelta !== null && technicalScoreDelta !== 0 && (
                      <span style={{ fontSize: 11.5, fontWeight: 650, display: "flex", alignItems: "center", gap: 4 }}>
                        <Delta value={technicalScoreDelta} suffix=" pt" /> desde la auditoría anterior
                      </span>
                    )}
                  </div>
                  {/* Counts only. The sparklines that used to sit beside each
                      number were struck out by hand in the founder's review
                      screenshot (2026-08-03): "eso hay que eliminarlo, las
                      líneas me refiero. Dejamos solo el conteo de críticos y
                      el conteo de avisos". The same per-audit history is still
                      readable in Evolución/Historial, where it has axes. */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, padding: "12px 16px 0" }}>
                    <div>
                      <span
                        style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".05em", textTransform: "uppercase", color: "var(--ink-4)" }}
                      >
                        Críticos
                      </span>
                      <div style={{ marginTop: 2 }}>
                        <span style={{ fontSize: 22, fontWeight: 800, color: "var(--wa-crit)", fontVariantNumeric: "tabular-nums" }}>
                          {currentTechnicalReport.issues.filter((i) => i.severity === "critical").length}
                        </span>
                      </div>
                    </div>
                    <div>
                      <span
                        style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: ".05em", textTransform: "uppercase", color: "var(--ink-4)" }}
                      >
                        Avisos
                      </span>
                      <div style={{ marginTop: 2 }}>
                        <span style={{ fontSize: 22, fontWeight: 800, color: "var(--warn)", fontVariantNumeric: "tabular-nums" }}>
                          {currentTechnicalReport.issues.filter((i) => i.severity === "warning").length}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div style={{ padding: "14px 16px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
                    {currentTechnicalReport.issues.length > 0 ? (
                      currentTechnicalReport.issues.map((issue) => (
                        <IssueRow
                          key={issue.check}
                          issue={issue}
                          llmsTxt={
                            issue.check === "llms_txt_missing" && llmsTxtFile
                              ? { file: llmsTxtFile, steps: llmsPublishSteps }
                              : null
                          }
                          sitemap={issue.check === "sitemap_missing" ? { steps: sitemapFixSteps } : null}
                        />
                      ))
                    ) : (
                      <p style={{ fontSize: 12.5, color: "var(--ink-3)", margin: 0 }}>
                        Ningún problema técnico detectado en la última auditoría.
                      </p>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <div className="card" style={{ marginTop: 12, padding: "14px 16px" }}>
                <p style={{ fontSize: 12.5, color: "var(--ink-3)", margin: 0 }}>
                  {/* "no has auditado" ya no es cierto: nadie audita a mano
                      desde AUDIT-NO-BUTTON-1. Unconditional now
                      (WEB-AUDIT-TECH-ALL-PLANS-1): this used to only claim
                      "se comprueba sola" for canAudit (Pro) accounts, but the
                      technical half isn't plan-gated at all any more — it
                      auto-checks after every scan on every plan. */}
                  Todavía no se ha auditado la salud técnica de tu web. Se comprueba sola tras cada escaneo.
                </p>
              </div>
            )}

            {/* Plan de acción y Matriz de oportunidad, RETIRADOS de esta
                pantalla (founder-approved 2026-08-02): "toda la tabla de
                plan de acción no tiene sentido aquí... debe estar en la
                página de recomendaciones" y "la matriz no estaba en el
                artefacto". Efecto secundario real, señalado explícitamente:
                los temas content_gap/open_opportunity/capture no tienen hoy
                ninguna recomendación real que los cubra en el motor de
                reglas (ver el comentario histórico que vivía junto a la
                query de matchedRecs, ahora eliminada) — su guía sintetizada
                sólo existía en este bloque. Al quitarlo, esos temas se
                quedan sin ningún sitio en el producto hasta que se decida
                si esa guía migra a Recomendaciones o se descarta. No se
                reconstruye especulativamente aquí; queda como gap conocido
                para la siguiente fase. */}

            {/* "Lo que ya funciona": performing topics have no action, so
                they never belonged in a plan anyway. Plain always-expanded
                `.card`. No longer a matrix-quadrant scroll target (the
                matrix that used to link here is gone) — just a standalone
                confirmation block. */}
            {grouped.performing.length > 0 && (
              <div className="card" style={{ marginTop: 12 }}>
                {/* No "Rindiendo" pill: the heading already says these are
                    working, so the badge only repeated it (founder review
                    2026-08-03: "creo que no aporta nada, yo lo quitaría"). */}
                <div style={{ padding: "13px 16px 0" }}>
                  <div style={{ fontSize: 13.5, fontWeight: 750 }}>Lo que ya funciona ({grouped.performing.length})</div>
                </div>
                <div style={{ padding: "14px 16px 16px" }}>
                  <p style={{ fontSize: 12, color: "var(--ink-3)", margin: "0 0 10px" }}>
                    Contenido propio que la IA ya cita en sus respuestas — sin acción pendiente, solo mantenlo actualizado.
                  </p>
                  <ul style={{ display: "flex", flexDirection: "column", gap: 8, margin: 0, padding: 0, listStyle: "none" }}>
                    {grouped.performing.map((topic) => (
                      <li
                        key={topic.promptId}
                        style={{ padding: "8px 10px", background: "var(--surface-2)", borderRadius: 8, fontSize: 12.5, color: "var(--ink-2)" }}
                      >
                        {topic.topic}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}

            {/* El GRÁFICO de Evolución ya no vive aquí — subido a nivel de
                página, justo bajo el hero (founder review 2026-08-03). Lo que
                queda debajo es sólo el Historial en tabla. */}

            {trend.length >= 2 && (
              <div className="card" style={{ marginTop: 12 }}>
                <div style={{ padding: "13px 16px 0" }}>
                  <div style={{ fontSize: 13.5, fontWeight: 750 }}>Historial de auditorías</div>
                  <div style={{ fontSize: 11.5, color: "var(--ink-3)", marginTop: 2 }}>
                    Una entrada por escaneo auditado (máx. las 8 más recientes).
                  </div>
                </div>
                {/* Each row gets mini bars in the same series colors as the
                    chart above (accent = cobertura, pos = implementación) so
                    the history scans visually, not just numerically
                    (WEB-AUDIT-R4). A null rate renders "—" with no bar —
                    never a 0-width bar, which would read as a measured 0%. */}
                <div style={{ padding: "14px 16px 16px", display: "flex", flexDirection: "column", gap: 6 }}>
                  {[...trend].reverse().map((point) => (
                    <div
                      key={point.scanId}
                      style={{ padding: "8px 10px", borderRadius: 8, background: "var(--surface-2)" }}
                    >
                      <div style={{ fontSize: 12, fontWeight: 650, color: "var(--ink)", marginBottom: 6 }}>
                        {formatDate(point.generatedAt)}
                      </div>
                      {/* n/N always shown next to the % (WEB-AUDIT-R6 phase 1)
                          — the fraction itself is the honesty signal, no
                          separate warning text. */}
                      <div style={{ display: "grid", gridTemplateColumns: "110px minmax(0, 1fr) 92px", gap: 8, alignItems: "center" }}>
                        <span style={{ fontSize: 10.5, color: "var(--ink-4)" }}>Cobertura</span>
                        {point.coveragePct !== null ? (
                          <MiniBar pct={point.coveragePct} color="var(--accent)" />
                        ) : (
                          <span />
                        )}
                        <span style={{ fontSize: 11, color: "var(--ink-3)", fontVariantNumeric: "tabular-nums", textAlign: "right" }}>
                          {point.coveragePct === null
                            ? "—"
                            : `${point.coveragePct}% (${point.coveredCount}/${point.conclusiveCount})`}
                        </span>
                        <span style={{ fontSize: 10.5, color: "var(--ink-4)" }}>Implementado</span>
                        {point.surfacingPct !== null ? (
                          <MiniBar pct={point.surfacingPct} color="var(--pos)" />
                        ) : (
                          <span />
                        )}
                        <span style={{ fontSize: 11, color: "var(--ink-3)", fontVariantNumeric: "tabular-nums", textAlign: "right" }}>
                          {point.surfacingPct === null
                            ? "—"
                            : `${point.surfacingPct}% (${point.surfacedCount}/${point.coveredCount})`}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </AuditTabPanel>

          {/* ─── Correcto ─── */}
          <AuditTabPanel id="correcto">
            {/* Founder request (2026-08-02, tras ver los mockups): "me
                gustaría una sección... donde tenga tachado y con el check de
                verificado todo lo que el usuario tiene bien porque eso da la
                sensación de tienes cosas bien, pero tienes que mejorar
                otras". Cero backend nuevo — issues.ts ya calcula qué checks
                pasan, esta pestaña sólo enseña lo que hoy se descartaba. */}
            {currentTechnicalReport ? (
              <>
                <div className="card" style={{ marginTop: 12, padding: "14px 16px" }}>
                  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".03em", color: "var(--pos-ink)", textTransform: "uppercase" }}>
                    Comprobaciones superadas
                  </div>
                  <div style={{ fontSize: 26, fontWeight: 800, color: "var(--pos-ink)", marginTop: 2, fontVariantNumeric: "tabular-nums" }}>
                    {currentTechnicalReport.passing.reduce((sum, p) => sum + p.passedCount, 0)}
                    <span style={{ fontSize: 14, fontWeight: 650, color: "var(--ink-4)" }}>
                      {" "}
                      / {currentTechnicalReport.passing.reduce((sum, p) => sum + p.applicableCount, 0)}
                    </span>
                  </div>
                  <p style={{ fontSize: 11.5, color: "var(--ink-3)", margin: "8px 0 0" }}>
                    Tu web hace bien la mayoría de las cosas que comprobamos. Lo que falla está en la pestaña
                    Problemas.
                  </p>
                </div>
                <div className="card" style={{ marginTop: 12 }}>
                  <div style={{ padding: "13px 16px 16px", display: "flex", flexDirection: "column", gap: 8, marginTop: 4 }}>
                    {currentTechnicalReport.passing.length > 0 ? (
                      currentTechnicalReport.passing.map((p) => <PassingRow key={p.check} passing={p} />)
                    ) : (
                      <p style={{ fontSize: 12.5, color: "var(--ink-3)", margin: 0 }}>
                        Ninguna comprobación superada todavía en la última auditoría.
                      </p>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <div className="card" style={{ marginTop: 12, padding: "14px 16px" }}>
                <p style={{ fontSize: 12.5, color: "var(--ink-3)", margin: 0 }}>
                  Todavía no has auditado la salud técnica de tu web.
                </p>
              </div>
            )}
          </AuditTabPanel>

          {/* ─── Páginas ─── */}
          <AuditTabPanel id="paginas">
            {/* Salud técnica GEO (WEB-AUDIT-2): deterministic per-page checks +
                AI-bot access, independent from the Gemini-driven coverage
                audit. Renamed from "tecnica" (WEB-AUDIT-ISSUES-1 fase 2) —
                content unchanged, this is still the page-by-page detail the
                aggregated Problemas/Correcto lists summarize.
                RunTechnicalAuditButton retirado de aquí (founder-approved
                2026-08-02: "prefiero que no haya dos botones distintos") —
                "Auditar ahora" ya disparaba la auditoría técnica en el mismo
                clic (WEB-AUDIT-R2, piggyback en web-audit-context.tsx), así
                que este botón era estrictamente redundante, no una segunda
                función real. Desde AUDIT-NO-BUTTON-1 no hay ningún botón: la
                auditoría técnica corre con la automática tras cada escaneo. */}
            <div className="section-head" style={{ marginTop: 16 }}>
              <div className="section-title">Salud técnica GEO</div>
              <div className="section-desc">
                {technicalSnapshot
                  ? `Comprobado ${formatDate(technicalSnapshot.created_at)}`
                  : "Comprueba si tus páginas son técnicamente citables por la IA y si sus bots pueden rastrear tu web."}
              </div>
            </div>
            {technicalSnapshot && new Date(technicalSnapshot.created_at) < TECHNICAL_CRITERIA_EXPANDED_AT && (
              <p style={{ fontSize: 11.5, color: "var(--ink-4)", marginTop: 8 }}>
                Los criterios técnicos se ampliaron el 13 jul 2026 (canonical, indexabilidad, hreflang, listas/tablas,
                contenido, Open Graph). Esta auditoría es de antes de ese cambio — vuelve a auditar para comparar con
                los criterios actuales.
              </p>
            )}
            {technicalSnapshot ? (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 12, marginTop: 12 }}>
                <div className="card">
                  <div style={{ padding: "13px 16px 0" }}>
                    <div style={{ fontSize: 13.5, fontWeight: 750 }}>Salud técnica GEO por página</div>
                    <div style={{ fontSize: 11.5, color: "var(--ink-3)", marginTop: 2 }}>
                      Hasta {technicalSnapshot.pages.length} páginas clave: portada, páginas verificadas y páginas citadas por la IA. Toca una
                      página para ver qué mejorar.
                    </div>
                  </div>
                  <div style={{ padding: "14px 16px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
                    {technicalSnapshot.pages.map((page, i) => (
                      <PageAuditRow key={`${page.url}-${i}`} page={page} fixContext={fixContext} />
                    ))}
                  </div>
                </div>
                <BotAccessCard bots={technicalSnapshot.bots} checkedAt={technicalSnapshot.created_at} />
              </div>
            ) : (
              <p style={{ fontSize: 12.5, color: "var(--ink-3)", marginTop: 8 }}>
                Todavía no has auditado la salud técnica de tu web. Hasta 5 auditorías al día por proyecto.
              </p>
            )}
          </AuditTabPanel>
        </AuditTabsProvider>
      )}

      {/* Footer links */}
      <div
        style={{
          display: "flex",
          gap: 20,
          marginTop: 28,
          paddingTop: 18,
          borderTop: "1px solid var(--line-soft)",
          flexWrap: "wrap"
        }}
      >
        {/* DOMAINS-REDESIGN-1: «Escaneos» ya no es una pantalla de cliente. El
            pie enlaza a Dominios, que es lo que ese enlace le resolvía al
            usuario — cambiar de dominio — y no al historial interno. */}
        <Link
          href="/dashboard/domains"
          style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 13, color: "var(--ink-3)", fontWeight: 600 }}
        >
          <Icon name="globe" size={13} />
          Dominios
        </Link>
        <Link
          href={`/dashboard/projects/${projectId}/recommendations`}
          style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 13, color: "var(--ink-3)", fontWeight: 600 }}
        >
          <Icon name="recs" size={13} />
          Recomendaciones
        </Link>
      </div>
      </div>
    </div>
    </WebAuditProvider>
  );
}
