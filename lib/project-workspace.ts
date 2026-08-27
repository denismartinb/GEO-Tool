import "server-only";

import { cache } from "react";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getPlanForUser } from "@/lib/billing";
import type { Plan } from "@/app/pricing/plans-data";
import { NOTIFICATIONS_BELL_LIMIT, NOTIFICATIONS_PAGE_LIMIT } from "@/lib/notifications/types";
import { readComparableRun, resolveDelta, type ComparableRun } from "@/lib/scoring/score-reliability";
import { resolveGeoScore, type GeoScoreRunRow } from "@/lib/metrics/run-metrics";

export { NOTIFICATIONS_BELL_LIMIT, NOTIFICATIONS_PAGE_LIMIT };

/**
 * Cargador compartido de las pantallas de proyecto (Prompts, Competidores,
 * Páginas citadas, Recomendaciones, Auditoría web y /debug).
 *
 * **No añadas aquí una columna de una migración recién escrita.** Las
 * migraciones de este repo se aplican a mano en el editor SQL de Supabase, así
 * que entre que se mergea el código y alguien pega el SQL hay una ventana en la
 * que la columna no existe — y en esa ventana PostgREST devuelve error, `data`
 * queda `null` y este `notFound()` convierte las SEIS pantallas en un 404.
 *
 * No es hipotético: DOMAINS-REDESIGN-1 añadió aquí `auto_web_audit_enabled` y
 * el piloto encontró exactamente eso en el preview (PR #345, 2026-08-05). Una
 * columna nueva se lee donde se usa, con tolerancia a que todavía no exista.
 *
 * Memoizado con `React.cache()` por petición (PRELAUNCH-HARDENING-1 Fase V,
 * V8), igual que `requireUser`: el layout y la página piden el mismo proyecto
 * en el mismo render, y sin esto eran dos viajes a Supabase para la misma
 * fila. La clave es `projectId`, así que dos proyectos distintos siguen
 * siendo dos consultas.
 */
export const requireActiveProject = cache(async function requireActiveProject(projectId: string) {
  const { supabase } = await requireUser();
  const { data: project } = await supabase
    .from("projects")
    .select("id, name, brand, domain, country, language, recurring_scans_enabled")
    .eq("id", projectId)
    .eq("is_archived", false)
    .single();

  if (!project) notFound();

  return project;
});

export type WorkspaceProjectSummary = {
  id: string;
  name: string;
  domain: string;
  country: string;
  language: string;
};

/**
 * A row from the `notifications` table (NOTIF-SERVER-1a,
 * supabase/migrations/0021_notifications.sql), written server-side at the
 * moment each event happens — see lib/notifications/emit.ts. Rendered into
 * copy by lib/notifications/render.ts, which needs the raw `payloadJson`
 * plus `projectId` (to resolve the project's domain from `projects`, already
 * loaded below, at zero extra query cost).
 */
export type WorkspaceNotification = {
  id: string;
  type: string;
  severity: string;
  projectId: string | null;
  payloadJson: unknown;
  readAt: string | null;
  createdAt: string;
};

/**
 * The bell only ever shows the most recent NOTIFICATIONS_BELL_LIMIT
 * notifications — a deliberate one-query-or-nothing tradeoff (docs/specs/
 * notifications/notifications-v1.md section 5.1), not an oversight. The
 * unread count is derived from these same rows, so if all
 * NOTIFICATIONS_BELL_LIMIT are unread the badge reads "15+" instead of the
 * true count — see components/notification-bell.tsx.
 */
type NotificationSelectRow = {
  id: string;
  type: string;
  severity: string;
  project_id: string | null;
  payload_json: unknown;
  read_at: string | null;
  created_at: string;
};

function mapNotificationRow(n: NotificationSelectRow): WorkspaceNotification {
  return {
    id: n.id,
    type: n.type,
    severity: n.severity,
    projectId: n.project_id,
    payloadJson: n.payload_json,
    readAt: n.read_at,
    createdAt: n.created_at
  };
}

/**
 * DATA-MATURITY-1: how many completed scans a project needs before its
 * trend/comparison surfaces (sparkline, delta, competitor trend) are treated
 * as done — matches the "Escaneo N de 5" banner shown until then. Not tied
 * to `run-scoring.ts`'s per-run `confidence` (that's about sample size
 * *within* one run's results, already high on day one for a healthy scan);
 * this is about *cross-run* history, which needs multiple completed runs no
 * matter how confident any single one is.
 */
export const DATA_MATURITY_TARGET_SCANS = 5;

export type DataMaturityState =
  | { kind: "hidden" }
  | { kind: "free" }
  | { kind: "no_tracking" }
  | { kind: "accumulating"; completed: number; target: number; cadenceUnit: "días" | "semanas"; etaCount: number };

/**
 * Pure decision function behind the data-maturity banner (`components/
 * data-maturity-banner.tsx`). Kept side-effect-free and separate from the
 * Supabase fetch in `getWorkspaceCounters` so every branch is unit-testable
 * without mocking a client — the DB/plan inputs are already computed there.
 *
 * Order matters: an active run and a full 5-scan history both fully hide the
 * banner (checked first) before the plan/tracking branches, which only ever
 * apply to a project with a real, terminal, partial history.
 */
export function computeDataMaturity({
  completedScans,
  latestStatus,
  recurringEnabled,
  planId
}: {
  completedScans: number;
  latestStatus: string | null | undefined;
  recurringEnabled: boolean;
  planId: string;
}): DataMaturityState {
  const hasActiveRun = latestStatus === "pending" || latestStatus === "running";
  if (hasActiveRun) return { kind: "hidden" };

  // No completed scan yet (project brand-new, or every attempt so far
  // failed): nothing real to report, and `setRecurringScans` itself refuses
  // to enable tracking without a completed run — showing the "no_tracking"
  // CTA here would offer an action that fails.
  if (completedScans <= 0) return { kind: "hidden" };

  if (completedScans >= DATA_MATURITY_TARGET_SCANS) return { kind: "hidden" };

  if (planId === "free") return { kind: "free" };

  if (!recurringEnabled) return { kind: "no_tracking" };

  return {
    kind: "accumulating",
    completed: completedScans,
    target: DATA_MATURITY_TARGET_SCANS,
    // Starter is the only weekly-cadence plan (lib/scan/cron.ts,
    // RECURRING_INTERVAL_MS_BY_PLAN) — free never reaches this branch
    // (returned above), so every other plan id scans daily.
    cadenceUnit: planId === "starter" ? "semanas" : "días",
    etaCount: DATA_MATURITY_TARGET_SCANS - completedScans
  };
}

export type WorkspaceCounters = {
  projects: WorkspaceProjectSummary[];
  promptCountByProject: Record<string, number>;
  competitorCountByProject: Record<string, number>;
  completedRunCountByProject: Record<string, number>;
  recommendationCountByProject: Record<string, number>;
  latestScanStatusByProject: Record<string, string>;
  latestScanDateByProject: Record<string, string | null>;
  latestScoreByProject: Record<string, number | null>;
  /**
   * DELTA-GUARD-1: `null` no significa sólo "no hay escaneo anterior" — también
   * "hay uno, pero la comparación no es afirmable" (muy pocas respuestas, u
   * otra metodología/motores). Pasa por `resolveDelta`, el mismo punto de
   * decisión que usan Visión general y el historial, para que tres pantallas no
   * puedan publicar tres verdades distintas sobre el mismo par de escaneos.
   */
  scoreDeltaByProject: Record<string, number | null>;
  /** Fecha de la última auditoría web persistida, por proyecto. */
  latestAuditDateByProject: Record<string, string | null>;
  /** Proyectos con una campaña de auditoría viva (job encolado o corriendo). */
  auditingByProject: Record<string, boolean>;
  dataMaturityByProject: Record<string, DataMaturityState>;
  /** Account plan, already fetched once here for `dataMaturityByProject` — exposed so callers (e.g. the sidebar's plan badge) don't issue a second `getPlanForUser` round trip. */
  plan: Plan;
  notifications: WorkspaceNotification[];
};

/**
 * Interim cap (PERF-4a, docs/architecture-audit-2026-07.md section 2.1) on the
 * two `getWorkspaceCounters` queries that only ever need the *most recent*
 * row(s) per project, not an exact total: the latest scan status/date, and
 * the latest 2 scores (for the score + its delta). Ordered `created_at`
 * descending, so a project's most recent row always sorts before this cap
 * unless the user has more than WORKSPACE_RECENCY_QUERY_LIMIT more-recent
 * rows across *other* projects — at current beta scale this is generous
 * headroom, not a real limit. If a project's data ever ages out of this
 * window, that project's status/date/score just reads as unknown (graceful
 * degradation), not wrong — unlike a count, which must stay exact. This is a
 * stopgap, not the fix: the correct version is a Postgres aggregate
 * (RPC/view) returning one row per project directly, which needs a schema
 * migration and its own explicit approval.
 *
 * `completedRunCountByProject` below is deliberately NOT capped — it's a
 * displayed count ("N escaneos completados"), and capping it would make that
 * count silently wrong past the cap instead of gracefully stale.
 */
const WORKSPACE_RECENCY_QUERY_LIMIT = 1000;

/**
 * Loads the active projects for the current user along with the counters and
 * status maps shared by the dashboard sidebar/topbar and the Escaneos
 * (domains) grid. Centralized here so both call sites query Supabase once
 * with the same shape instead of duplicating the aggregation logic.
 */
export async function getWorkspaceCounters(): Promise<WorkspaceCounters> {
  const { supabase, user } = await requireUser();

  const [
    { data: projects },
    { data: runs },
    { data: allPrompts },
    { data: allCompetitors },
    { data: completedRuns },
    { data: allRecs },
    { data: scores },
    { data: auditSnapshots },
    { data: auditJobs },
    { data: notificationRows },
    plan
  ] = await Promise.all([
    supabase
      .from("projects")
      .select("id, name, domain, country, language, recurring_scans_enabled")
      .eq("is_archived", false)
      .order("created_at", { ascending: false }),
    supabase
      .from("scan_runs")
      .select("project_id, status, created_at, finished_at")
      .order("created_at", { ascending: false })
      .limit(WORKSPACE_RECENCY_QUERY_LIMIT),
    supabase
      .from("project_prompts")
      .select("project_id")
      .eq("is_active", true),
    supabase
      .from("project_competitors")
      .select("project_id")
      .eq("is_active", true),
    supabase
      .from("scan_runs")
      .select("project_id, status")
      .eq("status", "completed"),
    supabase
      .from("recommendations")
      .select("project_id")
      .eq("status", "active"),
    supabase
      .from("run_scores")
      // details_json (DELTA-GUARD-1): la huella de comparabilidad que
      // `resolveDelta` necesita — número de respuestas, versión del compuesto,
      // componentes supervivientes y conjunto de motores.
      .select("project_id, run_id, visibility_score, details_json, created_at")
      .order("created_at", { ascending: false })
      .limit(WORKSPACE_RECENCY_QUERY_LIMIT),
    supabase
      .from("web_audit_snapshots")
      .select("project_id, created_at")
      .order("created_at", { ascending: false })
      .limit(WORKSPACE_RECENCY_QUERY_LIMIT),
    // Una campaña de auditoría viva es un `jobs` sin terminar, no un snapshot:
    // el snapshot sólo existe cuando la auditoría YA acabó.
    supabase
      .from("jobs")
      .select("project_id, status")
      .eq("job_type", "web_audit")
      .in("status", ["pending", "running", "retrying"]),
    // No .eq("owner_user_id", ...) — the notifications_select_owner RLS
    // policy (migration 0021) already scopes this to the current user, same
    // as every other query in this function relies on RLS for scoping.
    supabase
      .from("notifications")
      .select("id, type, severity, project_id, payload_json, read_at, created_at")
      .order("created_at", { ascending: false })
      .limit(NOTIFICATIONS_BELL_LIMIT),
    getPlanForUser(supabase, user.id)
  ]);

  const latestScanStatusByProject = (runs ?? []).reduce<Record<string, string>>((statuses, run) => {
    if (!statuses[run.project_id]) statuses[run.project_id] = run.status;
    return statuses;
  }, {});

  const latestScanDateByProject = (runs ?? []).reduce<Record<string, string | null>>((dates, run) => {
    if (!(run.project_id in dates)) {
      dates[run.project_id] = run.finished_at ?? run.created_at ?? null;
    }
    return dates;
  }, {});

  const promptCountByProject = (allPrompts ?? []).reduce<Record<string, number>>((acc, p) => {
    acc[p.project_id] = (acc[p.project_id] ?? 0) + 1;
    return acc;
  }, {});

  const competitorCountByProject = (allCompetitors ?? []).reduce<Record<string, number>>((acc, p) => {
    acc[p.project_id] = (acc[p.project_id] ?? 0) + 1;
    return acc;
  }, {});

  const completedRunCountByProject = (completedRuns ?? []).reduce<Record<string, number>>((acc, r) => {
    acc[r.project_id] = (acc[r.project_id] ?? 0) + 1;
    return acc;
  }, {});

  const recommendationCountByProject = (allRecs ?? []).reduce<Record<string, number>>((acc, r) => {
    acc[r.project_id] = (acc[r.project_id] ?? 0) + 1;
    return acc;
  }, {});

  const latestScoreByProject: Record<string, number | null> = {};
  const scoreDeltaByProject: Record<string, number | null> = {};
  const seenScoresByProject = new Map<string, Array<{ score: number; comparable: ComparableRun }>>();
  // TRUST-METRICS-1: a SEPARATE cap of 3, not 2 — DEFAULT_SCORE_WINDOW_SIZE
  // in lib/scoring/score-window.ts. The delta above only ever compares two
  // raw runs and keeps its own 2-row cap untouched; the headline score is a
  // different quantity (the window median) and needs a third row to be
  // eligible for it. Same `scores` rows, ordered newest-first by the query
  // above — no second round trip to Supabase.
  const rawRunsByProject = new Map<string, GeoScoreRunRow[]>();

  for (const s of scores ?? []) {
    const value = Number(s.visibility_score ?? NaN);
    if (!Number.isFinite(value)) continue;
    const seen = seenScoresByProject.get(s.project_id) ?? [];
    if (seen.length < 2) {
      seen.push({ score: Math.round(value), comparable: readComparableRun(s.details_json) });
      seenScoresByProject.set(s.project_id, seen);
    }

    const raw = rawRunsByProject.get(s.project_id) ?? [];
    if (raw.length < 3) {
      raw.push({
        run_id: s.run_id,
        created_at: s.created_at,
        visibility_score: s.visibility_score,
        details_json: s.details_json
      });
      rawRunsByProject.set(s.project_id, raw);
    }
  }

  for (const [projectId, seen] of seenScoresByProject.entries()) {
    // TRUST-METRICS-1: the headline is `resolveGeoScore` — window-first, the
    // same rule "Puntuación GEO" obeys everywhere else in the product — never
    // the raw `visibility_score` this map used to expose directly. That
    // divergence (6 on Overview, 2 here, same scan) was the audit's P0-01.
    const rawRuns = rawRunsByProject.get(projectId);
    latestScoreByProject[projectId] = rawRuns && rawRuns.length > 0 ? resolveGeoScore(rawRuns).value : null;

    // Antes: `seen[0] - seen[1]`. Una resta cruda de dos puntuaciones no dice
    // nada por sí sola — es un cambio real de visibilidad sólo si los dos
    // escaneos tienen respuestas suficientes Y midieron lo mismo (ADR 0024).
    // Es exactamente el fallo que DELTA-GUARD-1 corrigió en el historial de
    // escaneos, y esta función lo seguía cometiendo. Delta sigue siendo una
    // magnitud distinta de la puntuación de titular (badge de tendencia, no
    // "Puntuación GEO") y queda fuera del alcance de TRUST-METRICS-1.
    if (seen.length < 2) {
      scoreDeltaByProject[projectId] = null;
      continue;
    }

    const verdict = resolveDelta(seen[0].score - seen[1].score, seen[0].comparable, seen[1].comparable);
    scoreDeltaByProject[projectId] = verdict.kind === "publish" ? verdict.value : null;
  }

  const latestAuditDateByProject = (auditSnapshots ?? []).reduce<Record<string, string | null>>((dates, row) => {
    if (!(row.project_id in dates)) dates[row.project_id] = row.created_at ?? null;
    return dates;
  }, {});

  const auditingByProject = (auditJobs ?? []).reduce<Record<string, boolean>>((acc, row) => {
    acc[row.project_id] = true;
    return acc;
  }, {});

  const notifications: WorkspaceNotification[] = (notificationRows ?? []).map(mapNotificationRow);

  const dataMaturityByProject: Record<string, DataMaturityState> = {};
  for (const project of projects ?? []) {
    dataMaturityByProject[project.id] = computeDataMaturity({
      completedScans: completedRunCountByProject[project.id] ?? 0,
      latestStatus: latestScanStatusByProject[project.id],
      recurringEnabled: Boolean(project.recurring_scans_enabled),
      planId: plan.id
    });
  }

  return {
    projects: projects ?? [],
    promptCountByProject,
    competitorCountByProject,
    completedRunCountByProject,
    recommendationCountByProject,
    latestScanStatusByProject,
    latestScanDateByProject,
    latestScoreByProject,
    dataMaturityByProject,
    scoreDeltaByProject,
    latestAuditDateByProject,
    auditingByProject,
    plan,
    notifications
  };
}

/**
 * Data for the full `/dashboard/notifications` page (NOTIF-SERVER-1b) — a
 * separate, lighter query than getWorkspaceCounters (just projects +
 * notifications, no counters), since the page shows up to
 * NOTIFICATIONS_PAGE_LIMIT rows rather than the bell's 15.
 */
export async function getNotificationsPageData(): Promise<{
  projects: WorkspaceProjectSummary[];
  notifications: WorkspaceNotification[];
}> {
  const { supabase } = await requireUser();

  const [{ data: projects }, { data: notificationRows }] = await Promise.all([
    supabase.from("projects").select("id, name, domain, country, language").eq("is_archived", false),
    // No .eq("owner_user_id", ...) — notifications_select_owner RLS scopes this already.
    supabase
      .from("notifications")
      .select("id, type, severity, project_id, payload_json, read_at, created_at")
      .order("created_at", { ascending: false })
      .limit(NOTIFICATIONS_PAGE_LIMIT)
  ]);

  return {
    projects: projects ?? [],
    notifications: (notificationRows ?? []).map(mapNotificationRow)
  };
}
