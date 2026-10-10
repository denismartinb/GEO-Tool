import "server-only";

import { parseCoverageMap } from "@/lib/web-audit/coverage-map";
import { buildLlmsTxt, publishSteps, type LlmsTxtResult, type PublishStep } from "@/lib/web-audit/llms-txt";
import { sitemapSteps, type SitemapStep } from "@/lib/web-audit/sitemap";
import { WEB_AUDIT_JOB_TYPE, WEB_AUDIT_STALE_LOCK_MS } from "@/lib/web-audit/audit-job";
import { isWebAuditJobDue } from "@/lib/web-audit/audit-liveness";
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

  /**
   * El mapa de cobertura, sus deltas y su campaña se fueron a Páginas citadas
   * con SEARCH-SEO-1 Fase 1b (`coverage-section-data.ts`, log §271). De la
   * cobertura aquí sólo queda lo que necesita el llms.txt generado.
   */
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
  project
}: {
  supabase: SupabaseLike;
  project: WebAuditProject;
}): Promise<WebAuditPageData> {
  const projectId = project.id;

  // Las lecturas independientes de esta pantalla, en paralelo
  // (PRELAUNCH-HARDENING-1 Fase V, V7). Lo que sí depende de algo (el `jobs`
  // de abajo necesita `latestRunRow`) sigue detrás.
  const [{ data: latestRunRow }, { data: recentRunRows }, { data: latestCoverageRow }, { data: technicalHistoryRows }] =
    await Promise.all([
      supabase
        .from("scan_runs")
        .select("id, finished_at, created_at")
        .eq("project_id", projectId)
        .eq("status", "completed")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      // Recent runs to detect an in-progress scan (pending|running) — same
      // query the other sections run, for the same reason (`activeRun`).
      supabase
        .from("scan_runs")
        .select("id, status, total_prompts, successful_prompts, failed_prompts, started_at")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false })
        .limit(5),
      // Sólo el último mapa de cobertura: el llms.txt generado se construye
      // con sus páginas verificadas (fase 3a). El resto de la cobertura vive en
      // Páginas citadas desde SEARCH-SEO-1 Fase 1b.
      supabase
        .from("generated_solutions")
        .select("sanitized_content, created_at")
        .eq("project_id", projectId)
        .eq("generation_type", "domain_coverage")
        .is("recommendation_id", null)
        .eq("status", "completed")
        .eq("is_sanitized", true)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      // WEB-AUDIT-2: technical-audit snapshots, most recent first. The last
      // 8, because the readiness-score delta needs more than the latest one.
      // Queried for every plan (WEB-AUDIT-TECH-ALL-PLANS-1); the ternary stays
      // so a future gate has one line to change, not this query's shape.
      CAN_AUDIT_TECHNICAL
        ? supabase
            .from("web_audit_snapshots")
            .select("readiness_score, pages, bots, created_at")
            .eq("project_id", projectId)
            .order("created_at", { ascending: false })
            .limit(8)
        : { data: [] }
    ]);

  const rawActiveRun =
    (recentRunRows as Array<ActiveScanRun & { id: string }> | null)?.find(
      (r) => r.status === "pending" || r.status === "running"
    ) ?? null;
  // EXTRACTION-RELIABILITY-1 Fase C: carries the analysis-stage counters, so
  // the takeover's progress reflects extraction too, not just generation.
  const activeRun = rawActiveRun ? await withAnalysisProgress(supabase, projectId, rawActiveRun) : null;

  const technicalHistory = (technicalHistoryRows ?? []) as TechnicalSnapshotRow[];
  const technicalSnapshot = technicalHistory[0] ?? null;

  // Pure aggregation (`lib/web-audit/issues.ts`) run over each loaded
  // snapshot — cheap, no I/O, no new query per point.
  const currentTechnicalReport: TechnicalIssuesReport | null = technicalHistory[0]
    ? buildTechnicalIssuesReport(technicalHistory[0].pages, technicalHistory[0].bots)
    : null;
  const previousTechnicalReport: TechnicalIssuesReport | null = technicalHistory[1]
    ? buildTechnicalIssuesReport(technicalHistory[1].pages, technicalHistory[1].bots)
    : null;
  const technicalScoreDelta =
    currentTechnicalReport?.actualReadinessScore != null && previousTechnicalReport?.actualReadinessScore != null
      ? currentTechnicalReport.actualReadinessScore - previousTechnicalReport.actualReadinessScore
      : null;

  // WEB-AUDIT-DRIVE-1: the audit job for this run, read through RLS
  // (`jobs_select_owner`) rather than the service client — this is a render
  // path and the owner is entitled to its own job's state.
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
     this page already fetches — no extra query. The technical half runs on
     every plan, so a Free project's first audit is real work and deserves the
     beat as much as a Pro one's. */
  const auditIsRunning = ["pending", "running", "retrying"].includes(String(auditJobRow?.status ?? ""));

  // Wake the worker when this project has an audit owed to it (ADR 0038).
  // Safe to fire on a render: the worker claims jobs with an atomic
  // conditional UPDATE, so a duplicate dispatch is a no-op, and the predicate
  // only passes for a job that is genuinely due or genuinely abandoned.
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

  // Brand + domain for the copyable fixes (fase 3b). `project.domain` is
  // already the normalized host used everywhere else on this page.
  const fixContext: PageFixContext = { projectName: project.name, domainNormalized: project.domain };

  // Fase 3a: the llms.txt the user can publish, built from the latest coverage
  // campaign. Null when no campaign has ever produced a verified page — the
  // builder refuses to emit a file that would be nothing but placeholders.
  const latestMap = parseCoverageMap(
    (latestCoverageRow as { sanitized_content?: string | null } | null)?.sanitized_content ?? null
  );
  const llmsTxtFile = buildLlmsTxt({
    brand: project.name,
    domainNormalized: project.domain,
    coverage: latestMap
  });
  const llmsPublishSteps = publishSteps(project.domain);
  const sitemapFixSteps = sitemapSteps(project.domain);

  const analyzedPagesCount = technicalSnapshot
    ? technicalSnapshot.pages.filter((p) => p.status === "analyzed").length
    : 0;

  return {
    hasCompletedScan: Boolean(latestRunRow),
    activeRun,
    technicalSnapshot,
    currentTechnicalReport,
    technicalScoreDelta,
    analyzedPagesCount,
    auditIsRunning,
    shouldDispatchAudit,
    llmsTxtFile,
    llmsPublishSteps,
    sitemapFixSteps,
    fixContext
  };
}
