import "server-only";

import { parseCoverageMap, type DomainCoverageMap } from "@/lib/web-audit/coverage-map";
import { isProOrAbove } from "@/lib/billing";
import { buildLlmsTxt, publishSteps, type LlmsTxtResult, type PublishStep } from "@/lib/web-audit/llms-txt";
import { sitemapSteps, type SitemapStep } from "@/lib/web-audit/sitemap";
import {
  buildWebAuditSummary,
  buildCitationWindowCandidates,
  type PromptResultLite,
  type ClassifiedTopic,
  type TopicOutcome,
  type WebAuditSummary
} from "@/lib/web-audit/opportunity-matrix";
import { buildCoverageTrend, type CoverageTrendPoint } from "@/lib/web-audit/trend";
import { buildGlobalScore, type GlobalScore } from "@/lib/web-audit/global-score";
import { isDeltaTrustworthy } from "@/lib/web-audit/sample-confidence";
import { WEB_AUDIT_JOB_TYPE, WEB_AUDIT_STALE_LOCK_MS } from "@/lib/web-audit/audit-job";
import { deriveAuditPillState, isWebAuditJobDue, type AuditPillState } from "@/lib/web-audit/audit-liveness";
import { isAutoWebAuditEnabled } from "@/lib/web-audit/audit-dispatch";
import { buildTechnicalIssuesReport, type TechnicalIssuesReport } from "@/lib/web-audit/issues";
import type { PageAuditEntry } from "@/lib/web-audit/technical-audit";
import type { BotAccessReport } from "@/lib/web-audit/robots";
import type { PageFixContext } from "@/lib/web-audit/page-fixes";
import { withAnalysisProgress } from "@/lib/scan/active-run-progress";
import type { ActiveScanRun } from "@/components/scan-in-progress";

/**
 * PRELAUNCH-HARDENING-1 Fase R7-b — la orquestación de Auditoría web, fuera de
 * su pantalla y por fin testeable.
 *
 * Eran ~330 líneas dentro de `WebAuditPage` **sin una sola aserción**: ocho
 * consultas, cuarenta y dos valores derivados y un efecto secundario, soldados
 * a las ~740 líneas de JSX que los pintan. Mismo diagnóstico que Q1 hizo con
 * `createProject` (log §89) y misma cura: la parte que decide sale a un módulo
 * que devuelve datos, la pantalla se queda con `return (…)`.
 *
 * **El tamaño no era el problema y partir por líneas no habría comprado nada**
 * — el bulto de esa pantalla es maquetado, no lógica. Lo que compra este corte
 * es que las decisiones se puedan ejercitar: la puerta Pro leída en crudo, si
 * un delta es de fiar con la muestra que hay, y sobre todo si abrir la pantalla
 * debe despertar al worker.
 *
 * ## Por qué recibe el cliente en vez de llamar a `requireUser`
 *
 * La autenticación se queda en la pantalla y aquí entra ya resuelta, igual que
 * `createProjectCore` recibe su `AuthenticatedContext`. Así este módulo se
 * puede ejercitar con un cliente falso, que es justamente lo que no se podía
 * hacer antes.
 *
 * ## Por qué NO despacha el worker, sólo lo decide
 *
 * La pantalla despertaba al worker con `after(() => triggerWebAuditRun())`
 * cuando el proyecto tiene una auditoría vencida (ADR 0038). Traerse ese efecto
 * aquí dejaría este módulo tan poco testeable como estaba la pantalla, así que
 * lo que se devuelve es la **decisión** (`shouldDispatchAudit`) y quien actúa
 * sigue siendo la pantalla.
 *
 * Es exactamente lo que `.claude/rules/server-actions.md` ya exige para las
 * actions —«el desenlace se DEVUELVE, no se decide con `redirect()`»— por el
 * mismo motivo: un efecto secundario dentro de la lógica no se puede afirmar,
 * sólo se puede observar que ocurrió algo. Con la decisión separada se puede
 * fijar por test que un job en `retrying` con backoff largo **no** dispara
 * nada, que era imposible de comprobar sin un navegador.
 */

/** Una fila de `web_audit_snapshots`, tal y como la lee esta pantalla. */
export type TechnicalSnapshotRow = {
  readiness_score: number | null;
  pages: PageAuditEntry[];
  bots: BotAccessReport;
  created_at: string;
};

/** El proyecto activo, con lo poco que esta pantalla necesita de él. */
export type WebAuditProject = {
  id: string;
  name: string;
  domain: string;
};

/**
 * Todo lo que el JSX de Auditoría web consume. Nada más y nada menos: si un
 * campo de aquí deja de usarse en la pantalla, sobra; si la pantalla necesita
 * algo nuevo, se calcula aquí y se le escribe su test.
 */
export type WebAuditPageData = {
  /** Puerta Pro, leída en crudo de `profiles.current_plan` (`.claude/rules/web-audit.md`). */
  canAuditCoverage: boolean;

  /**
   * ¿Existe algún escaneo completado? La pantalla entera cuelga de esto: sin
   * escaneo no hay nada que cruzar y se pinta el estado vacío.
   *
   * Va como booleano y no como la fila de `scan_runs` a propósito. La pantalla
   * sólo preguntaba `!latestRunRow`, y devolver la fila entera invitaría a leer
   * de ella campos que este módulo ya ha usado para derivar `auditedScanDate` —
   * dos fuentes para el mismo hecho, que es como empiezan a discrepar.
   */
  hasCompletedScan: boolean;

  /**
   * The pending/running scan for this project, if any — same shape and same
   * `withAnalysisProgress` enrichment as the other four sections
   * (`FirstScanTakeover`'s `LiveRun`). `null` once nothing is in flight.
   *
   * Only meaningful together with `hasCompletedScan`: the screen shows the
   * ascent beat (`FirstScanTakeover`) while this is set and no scan has ever
   * completed, exactly the same rule Prompts/Competidores/Recomendaciones/
   * Páginas citadas already follow (`.claude/rules/mission-rocket.md`,
   * ONBOARDING-ROCKET-1). Once that first scan finishes, `hasCompletedScan`
   * flips and the mission continues into `ReentryMission` below — no new
   * wiring needed there, `auditIsRunning` already covers it.
   */
  activeRun: (ActiveScanRun & { id: string }) | null;

  technicalSnapshot: TechnicalSnapshotRow | null;
  currentTechnicalReport: TechnicalIssuesReport | null;
  technicalScoreDelta: number | null;
  analyzedPagesCount: number;

  summary: WebAuditSummary | null;
  grouped: Record<TopicOutcome, ClassifiedTopic[]>;
  trend: CoverageTrendPoint[];
  latestMap: DomainCoverageMap | null;
  auditedScanDate: string | null;

  coverageDelta: number | null;
  surfacingDelta: number | null;
  globalScore: GlobalScore;
  heroScore: number | null;

  activeCampaignProgress: { covered: number; total: number } | null;
  auditPillState: AuditPillState;
  auditIsRunning: boolean;

  /**
   * ¿Debe la pantalla despertar al worker en este render? La pantalla lo
   * traduce a `after(() => triggerWebAuditRun())`; aquí sólo se decide.
   */
  shouldDispatchAudit: boolean;

  llmsTxtFile: LlmsTxtResult | null;
  llmsPublishSteps: PublishStep[];
  sitemapFixSteps: SitemapStep[];
  fixContext: PageFixContext;
};

/**
 * El cliente de Supabase, reducido a lo que este módulo usa. Tipar el mínimo
 * (en vez de importar el tipo completo) es lo que permite pasarle un doble en
 * los tests sin reimplementar PostgREST entero.
 */
type SupabaseLike = {
  // El `any` es deliberado y está acotado a esta línea: el constructor de
  // PostgREST es encadenable y genérico, y tiparlo de verdad significaría
  // reimplementar su tipo. Lo que importa es que el módulo sólo llama a `from`.
  from: (table: string) => any;
};

/**
 * Two capabilities, not one (WEB-AUDIT-TECH-ALL-PLANS-1, founder-approved
 * 2026-08-05). Coverage (DOMAIN-COVERAGE-1) still reads the raw plan column
 * directly via `isProOrAbove`, never `getPlanForUser`/`resolvePlan` (route
 * rule, `.claude/rules/web-audit.md`) — it runs batched Gemini grounding calls
 * and stays genuinely Pro-only. The technical half (pure fetch + regex, zero
 * LLM) is available on every plan: GEO-SCORE-V4 (`docs/adr/0033`) made
 * `readiness_score` a real .20 GEO Score component, so gating it made the
 * headline metric measure a different number of signals depending on plan.
 *
 * Always true today. Kept as a named capability rather than inlining `true` at
 * every call site so that if a future plan tier ever needs to gate it again,
 * there is one place to flip.
 */
const CAN_AUDIT_TECHNICAL = true;

export async function loadWebAuditPageData({
  supabase,
  userId,
  project
}: {
  supabase: SupabaseLike;
  userId: string;
  project: WebAuditProject;
}): Promise<WebAuditPageData> {
  const projectId = project.id;

  // Las cinco lecturas independientes de esta pantalla, en paralelo
  // (PRELAUNCH-HARDENING-1 Fase V, V7). Estaban encadenadas una tras otra
  // aunque ninguna consume el resultado de la anterior: el usuario pagaba la
  // suma de cinco viajes a Supabase en vez del más lento de los cinco. Lo que
  // sí depende de algo (el `jobs` de abajo necesita `latestRunRow`) sigue
  // detrás, que es exactamente donde tiene que estar.
  const [
    { data: profileRow },
    { data: latestRunRow },
    { data: recentRunRows },
    { data: historyRows },
    { data: technicalHistoryRows },
    { data: activeCampaignRow }
  ] = await Promise.all([
    supabase.from("profiles").select("current_plan").eq("id", userId).maybeSingle(),
    supabase
      .from("scan_runs")
      .select("id, finished_at, created_at")
      .eq("project_id", projectId)
      .eq("status", "completed")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    // Recent runs to detect an in-progress scan (pending|running) — same
    // query the other four sections run, for the same reason (`activeRun`
    // above).
    supabase
      .from("scan_runs")
      .select("id, status, total_prompts, successful_prompts, failed_prompts, started_at")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(5),
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
    // WEB-AUDIT-2: technical-audit snapshots, most recent first. Rendered
    // as-is — this page never re-triggers the audit itself.
    //
    // WEB-AUDIT-ISSUES-1 fase 2: widened from a single row to the last 8 — the
    // "Problemas" tab's críticos/avisos counts and the readiness-score delta
    // both need more than the latest snapshot.
    //
    // WEB-AUDIT-TECH-ALL-PLANS-1: queried for every plan now — this used to be
    // skipped entirely under the old single Pro gate, which made a non-Pro
    // project's technical snapshot null by construction even on a project that
    // had one. The ternary stays so a future gate has one line to change, not
    // this query's shape.
    CAN_AUDIT_TECHNICAL
      ? supabase
          .from("web_audit_snapshots")
          .select("readiness_score, pages, bots, created_at")
          .eq("project_id", projectId)
          .order("created_at", { ascending: false })
          .limit(8)
      : { data: [] },
    // WEB-AUDIT-CHAIN: a campaign left "running" for the current scan, read
    // server-side (not from client-only state) so it survives a full reload.
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

  const rawActiveRun =
    (recentRunRows as Array<ActiveScanRun & { id: string }> | null)?.find(
      (r) => r.status === "pending" || r.status === "running"
    ) ?? null;
  // EXTRACTION-RELIABILITY-1 Fase C: carries the analysis-stage counters, so
  // the takeover's progress reflects extraction too, not just generation —
  // same call the other four sections make.
  const activeRun = rawActiveRun ? await withAnalysisProgress(supabase, projectId, rawActiveRun) : null;

  const canAuditCoverage = isProOrAbove(profileRow?.current_plan as string | undefined);

  const technicalHistory = (technicalHistoryRows ?? []) as TechnicalSnapshotRow[];
  const technicalSnapshot = technicalHistory[0] ?? null;

  // Pure aggregation (`lib/web-audit/issues.ts`, WEB-AUDIT-ISSUES-1 fase 1) run
  // over each loaded snapshot — cheap, no I/O, no new query per point.
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

  /* SCAN-STATES-3: is an audit actually moving right now? Read off the job row
     this page already fetches — no extra query. Deliberately NOT
     `auditPillState`, which is gated on `canAuditCoverage`: the technical half
     runs on every plan, so a Free project's first audit is real work and
     deserves the beat as much as a Pro one's. */
  const auditIsRunning = ["pending", "running", "retrying"].includes(String(auditJobRow?.status ?? ""));

  const auditPillState = deriveAuditPillState({
    campaignUpdatedAt: hasActiveCampaign ? activeCampaignRow?.updated_at : null,
    jobStatus: auditJobRow?.status
  });

  // Wake the worker when this project has an audit owed to it. Until WEB-AUDIT-
  // DRIVE-1 the only things that could start one were the `after()` dispatch at
  // the end of a scan and the 07:00 daily cron, so a lost dispatch meant the
  // screen sat on "Auditando…" until the next morning — and on a preview
  // deployment, where Vercel runs no crons at all, forever (2026-08-07).
  //
  // Safe to fire on a render: the worker claims jobs with the same atomic
  // conditional UPDATE the scan batches use, so a duplicate dispatch is a no-op
  // rather than a second audit, and the predicate only passes for a job that is
  // genuinely due or genuinely abandoned.
  const shouldDispatchAudit = Boolean(
    auditJobRow &&
      isAutoWebAuditEnabled() &&
      isWebAuditJobDue({
        status: auditJobRow.status as string,
        nextAttemptAt: auditJobRow.next_attempt_at as string | null,
        lockedAt: auditJobRow.locked_at as string | null,
        staleLockMs: WEB_AUDIT_STALE_LOCK_MS
      })
  );

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

  // WEB-AUDIT-R6 phase 2: citation is classified over a fixed window of recent
  // scans, not just the latest one (see `opportunity-matrix.ts`) — the same
  // deduped candidates list drives both this current summary and every
  // historical trend point (`buildCoverageTrend`), so they stay consistent.
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
  // El `?? null` de la cola es la ÚNICA normalización de este corte, y es
  // inobservable: sin escaneo la comparación es `undefined === undefined`, así
  // que la expresión original devolvía `undefined` bajo un tipo que promete
  // `string | null`. El único consumidor lo usa como condición de verdad
  // (`{auditedScanDate ? … : ""}`), donde `undefined` y `null` no se distinguen.
  // Se normaliza para que el tipo declarado sea cierto.
  const auditedScanDate =
    auditedScan?.scanId === latestRunRow?.id
      ? (latestRunRow?.finished_at ?? latestRunRow?.created_at ?? null)
      : null;

  // WEB-AUDIT-R6 phase 1 (geo-strategy methodology review 2026-07-17):
  // coverage/citation are both sampled fresh per scan from Gemini's Google
  // Search grounding — a noisy sensor. With a small denominator, a single
  // sampling flip swings the percentage by double digits; showing that swing as
  // a bare "+17 pt" delta reads as precision the sample doesn't support. A
  // delta is only shown when BOTH the current and previous point clear
  // SMALL_SAMPLE_THRESHOLD (`isDeltaTrustworthy`) — never fabricated, never
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
  // available (see `lib/web-audit/global-score.ts`). Its breakdown renders right
  // next to it, so the composite is never a black box; a component that has
  // never been computed (e.g. technical audit not yet run) is excluded, not
  // faked as 0.
  const globalScore = buildGlobalScore({
    coveragePct: summary?.coveragePct ?? null,
    surfacingPct: summary?.surfacingPct ?? null,
    technicalScore: technicalSnapshot?.readiness_score ?? null
  });

  // WEB-AUDIT-TECH-ALL-PLANS-1 (Director's call, 2026-08-05): a non-Pro account
  // can never populate coverage/surfacing, so `globalScore.score` would silently
  // equal the technical score anyway (mean of one value is itself) — the actual
  // problem was never the number, it was the caption ("Media de 1 señal
  // disponible… audita el resto para completarla"), which reads as "not run yet"
  // when the true fact is "not included in your plan". Rather than keep the
  // composite framing with a patched caption, the non-Pro headline IS the
  // technical score — one named signal, not a same-valued disguised average.
  // Pro's composite is untouched.
  const heroScore = canAuditCoverage ? globalScore.score : (technicalSnapshot?.readiness_score ?? null);

  // WEB-AUDIT-ISSUES-1 fase 2 (founder-approved 2026-08-02): el Plan de acción
  // se retiró de esta pantalla entero — "no tiene sentido aquí, debe estar en
  // la página de recomendaciones" — y su módulo se borró en R8-b (log §102).
  // `grouped` sigue haciendo falta para "Lo que ya funciona" y la pista de la
  // tarjeta hero.
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

  const analyzedPagesCount = technicalSnapshot
    ? technicalSnapshot.pages.filter((p) => p.status === "analyzed").length
    : 0;

  return {
    canAuditCoverage,
    hasCompletedScan: Boolean(latestRunRow),
    activeRun,
    technicalSnapshot,
    currentTechnicalReport,
    technicalScoreDelta,
    analyzedPagesCount,
    summary,
    grouped,
    trend,
    latestMap,
    auditedScanDate,
    coverageDelta,
    surfacingDelta,
    globalScore,
    heroScore,
    activeCampaignProgress,
    auditPillState,
    auditIsRunning,
    shouldDispatchAudit,
    llmsTxtFile,
    llmsPublishSteps,
    sitemapFixSteps,
    fixContext
  };
}
