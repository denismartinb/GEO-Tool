import Link from "next/link";
import { Icon } from "@/components/ui/icon";
import { Delta } from "@/components/ui/delta";
import { requireUser } from "@/lib/auth";
import { requireActiveProject } from "@/lib/project-workspace";

/* ---- Status helpers ---- */

const statusLabels: Record<string, string> = {
  pending: "Pendiente",
  running: "En curso",
  retrying: "Reintentando",
  completed: "Completado",
  failed: "Fallido",
  cancelled: "Cancelado"
};

function getStatusBadgeClass(status: string): string {
  if (status === "completed") return "badge badge-pos";
  if (status === "failed") return "badge badge-neg";
  if (status === "cancelled") return "badge badge-neutral";
  if (status === "running" || status === "retrying") return "badge badge-accent";
  return "badge badge-neutral";
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("es-ES", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function formatDateShort(value: string | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("es-ES", {
    day: "numeric",
    month: "short",
    year: "numeric"
  });
}

/* ---- Page ---- */

export default async function RunsPage({
  params
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const project = await requireActiveProject(projectId);
  const { supabase } = await requireUser();

  /* Fetch all runs */
  const { data: runs } = await supabase
    .from("scan_runs")
    .select(
      "id, status, error_summary, total_prompts, successful_prompts, failed_prompts, created_at, started_at, finished_at"
    )
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(50);

  const allRuns = runs ?? [];
  const completedRuns = allRuns.filter((r) => r.status === "completed");
  const completedRunIds = completedRuns.map((r) => r.id);

  /* Fetch scores only for completed runs */
  const { data: scores } =
    completedRunIds.length > 0
      ? await supabase
          .from("run_scores")
          .select("run_id, visibility_score")
          .eq("project_id", projectId)
          .in("run_id", completedRunIds)
      : { data: [] };

  const scoreByRunId = new Map<string, number>(
    (scores ?? []).map((s) => [s.run_id, Math.round(Number(s.visibility_score ?? 0))])
  );

  /* Summary stats */
  const totalCompletedRuns = completedRuns.length;
  const totalSuccessfulPrompts = completedRuns.reduce(
    (acc, r) => acc + Number(r.successful_prompts ?? 0),
    0
  );
  const lastCompletedRun = completedRuns[0]; // runs are sorted desc already
  const latestRun = allRuns[0];

  /* Build ordered list for delta computation (oldest first for completed runs) */
  const completedRunsOldestFirst = [...completedRuns].reverse();

  /* Compute delta for each completed run vs its predecessor */
  const scoreDeltas = new Map<string, number | null>();
  for (let i = 0; i < completedRunsOldestFirst.length; i++) {
    const run = completedRunsOldestFirst[i];
    if (i === 0) {
      scoreDeltas.set(run.id, null); // first ever run — no previous
    } else {
      const prevRun = completedRunsOldestFirst[i - 1];
      const curr = scoreByRunId.get(run.id) ?? null;
      const prev = scoreByRunId.get(prevRun.id) ?? null;
      if (curr !== null && prev !== null) {
        scoreDeltas.set(run.id, curr - prev);
      } else {
        scoreDeltas.set(run.id, null);
      }
    }
  }

  /* Assign run number (1 = oldest) */
  const runNumberByRunId = new Map<string, number>();
  const runsOldestFirst = [...allRuns].reverse();
  runsOldestFirst.forEach((r, i) => {
    runNumberByRunId.set(r.id, i + 1);
  });

  /* Active run detection */
  const activeRun = allRuns.find(
    (r) => r.status === "pending" || r.status === "running" || r.status === "retrying"
  );

  const hasMultipleCompleted = completedRuns.length >= 2;

  return (
    <div className="page">
      {/* Sticky header */}
      <div className="ov-sticky-header">
        <div className="ov-sticky-left">
          <div>
            <p className="kicker" style={{ marginBottom: 2 }}>Escaneos</p>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span
                style={{ fontSize: 15, fontWeight: 750, color: "var(--ink)", letterSpacing: "-.01em" }}
              >
                {project.name}
              </span>
              <span
                className="badge badge-neutral"
                style={{ fontFamily: "var(--mono)", fontSize: 11 }}
              >
                {project.domain}
              </span>
              {activeRun ? (
                <span className="scan-status">
                  <span className="dot run" />
                  Escaneo en curso
                </span>
              ) : null}
            </div>
          </div>
        </div>
        <div className="ov-sticky-right">
          <Link
            href={`/dashboard/projects/${projectId}`}
            className="badge badge-outline"
            style={{ fontSize: 12, fontWeight: 650, padding: "5px 10px" }}
          >
            <Icon name="chevronLeft" size={12} />
            Visión general
          </Link>
        </div>
      </div>

      {/* Summary banner */}
      <div className="summary mt8">
        <div className="summary-ico">
          <Icon name="runs" size={20} />
        </div>
        <p className="summary-txt">
          {totalCompletedRuns === 0 ? (
            <>
              Este dominio todavía no tiene escaneos completados.{" "}
              <b>Lanza el primer escaneo</b> desde la{" "}
              <Link
                href={`/dashboard/projects/${projectId}`}
                style={{ color: "var(--accent)", fontWeight: 700 }}
              >
                visión general
              </Link>
              .
            </>
          ) : (
            <>
              <b>{totalCompletedRuns} {totalCompletedRuns === 1 ? "escaneo completado" : "escaneos completados"}</b>
              {" · "}
              <b>{totalSuccessfulPrompts} {totalSuccessfulPrompts === 1 ? "prompt procesado" : "prompts procesados"}</b>
              {lastCompletedRun ? (
                <>
                  {" · "}Último:{" "}
                  <b>{formatDateShort(lastCompletedRun.finished_at ?? lastCompletedRun.created_at)}</b>
                </>
              ) : null}
              {!hasMultipleCompleted && totalCompletedRuns > 0 && (
                <span style={{ color: "var(--ink-4)", fontStyle: "italic", fontSize: 13 }}>
                  {" "}— La tendencia de score estará disponible con ≥2 escaneos completados.
                </span>
              )}
            </>
          )}
        </p>
      </div>

      {/* Section header */}
      <div className="section-head">
        <div className="section-title">Historial de escaneos</div>
        <div className="section-desc">
          {allRuns.length > 0
            ? `${allRuns.length} ${allRuns.length === 1 ? "escaneo" : "escaneos"} en total`
            : "Sin escaneos todavía"}
        </div>
        <div className="right">
          <Link
            href={`/dashboard/projects/${projectId}`}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              fontSize: 12.5,
              fontWeight: 650,
              color: "var(--accent)"
            }}
          >
            <Icon name="play" size={13} />
            Lanzar escaneo
          </Link>
        </div>
      </div>

      {/* Empty state */}
      {allRuns.length === 0 ? (
        <div className="card" style={{ padding: "48px 40px", textAlign: "center" }}>
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: "999px",
              background: "var(--surface-sunk)",
              display: "grid",
              placeItems: "center",
              color: "var(--ink-3)",
              margin: "0 auto 16px"
            }}
          >
            <Icon name="runs" size={22} />
          </div>
          <div style={{ fontSize: 15, fontWeight: 750, color: "var(--ink)", marginBottom: 8 }}>
            Todavía no hay escaneos
          </div>
          <div
            style={{ fontSize: 13.5, color: "var(--ink-3)", maxWidth: 380, margin: "0 auto 20px", lineHeight: 1.6 }}
          >
            El proyecto ya está configurado. Revisa los prompts y competidores, y lanza el primer
            escaneo desde la visión general.
          </div>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
            <Link
              href={`/dashboard/projects/${projectId}`}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                fontSize: 13,
                fontWeight: 650,
                color: "var(--accent)"
              }}
            >
              <Icon name="play" size={13} />
              Lanzar escaneo
            </Link>
            <Link
              href={`/dashboard/projects/${projectId}/prompts`}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                fontSize: 13,
                fontWeight: 650,
                color: "var(--ink-2)"
              }}
            >
              <Icon name="prompts" size={13} />
              Revisar prompts
            </Link>
            <Link
              href={`/dashboard/projects/${projectId}/competitors`}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                fontSize: 13,
                fontWeight: 650,
                color: "var(--ink-2)"
              }}
            >
              <Icon name="competitors" size={13} />
              Revisar competidores
            </Link>
          </div>
        </div>
      ) : (
        /* Run history table */
        <div className="card">
          <div style={{ padding: "6px 6px 4px", overflowX: "auto" }}>
            <table className="run-tbl">
              <thead>
                <tr>
                  <th style={{ width: 40 }}>#</th>
                  <th>Fecha</th>
                  <th>Estado</th>
                  <th>Prompts</th>
                  <th className="num">GEO Score</th>
                  {hasMultipleCompleted ? <th className="num">Δ Score</th> : null}
                </tr>
              </thead>
              <tbody>
                {allRuns.map((run) => {
                  const runNum = runNumberByRunId.get(run.id) ?? 1;
                  const total = Number(run.total_prompts ?? 0);
                  const ok = Number(run.successful_prompts ?? 0);
                  const okPct = total > 0 ? (ok / total) * 100 : 0;
                  const hasFailed = run.status === "failed" || Number(run.failed_prompts ?? 0) > 0;
                  const barColor =
                    run.status === "failed"
                      ? "var(--warn)"
                      : run.status === "completed"
                      ? "var(--pos)"
                      : "var(--accent)";

                  const geoScore =
                    run.status === "completed" ? (scoreByRunId.get(run.id) ?? null) : null;
                  const delta = hasMultipleCompleted ? (scoreDeltas.get(run.id) ?? null) : null;

                  return (
                    <>
                      <tr key={run.id}>
                        {/* # */}
                        <td
                          className="num"
                          style={{ color: "var(--ink-4)", fontWeight: 700, fontSize: 12 }}
                        >
                          {runNum}
                        </td>

                        {/* Date */}
                        <td>
                          <div
                            style={{ fontSize: 12.5, fontWeight: 650, color: "var(--ink)" }}
                          >
                            {formatDateShort(run.created_at)}
                          </div>
                          <div style={{ fontSize: 11, color: "var(--ink-4)", marginTop: 1 }}>
                            {run.finished_at
                              ? `Fin: ${formatDate(run.finished_at)}`
                              : run.started_at
                              ? `Inicio: ${formatDate(run.started_at)}`
                              : "Pendiente de inicio"}
                          </div>
                        </td>

                        {/* Status badge */}
                        <td>
                          <span className={getStatusBadgeClass(run.status)}>
                            {statusLabels[run.status] ?? run.status}
                          </span>
                        </td>

                        {/* Prompts progress bar */}
                        <td>
                          <div className="run-bar-wrap">
                            <div className="run-bar">
                              <div
                                className="run-bar-fill"
                                style={{ width: `${Math.min(100, okPct)}%`, background: barColor }}
                              />
                            </div>
                            <span
                              className="tnum"
                              style={{ fontSize: 12, fontWeight: 650, color: "var(--ink-2)", whiteSpace: "nowrap" }}
                            >
                              {ok}/{total}
                            </span>
                          </div>
                          {hasFailed && Number(run.failed_prompts ?? 0) > 0 && (
                            <div
                              style={{ fontSize: 11, color: "var(--neg-ink)", marginTop: 2, fontWeight: 650 }}
                            >
                              {run.failed_prompts} {Number(run.failed_prompts) === 1 ? "fallo" : "fallos"}
                            </div>
                          )}
                        </td>

                        {/* GEO Score */}
                        <td className="num">
                          {geoScore !== null ? (
                            <b className="tnum" style={{ fontSize: 14, color: "var(--ink)" }}>
                              {geoScore}
                            </b>
                          ) : (
                            <span style={{ color: "var(--ink-4)" }}>—</span>
                          )}
                        </td>

                        {/* Delta (only if >=2 completed runs) */}
                        {hasMultipleCompleted ? (
                          <td className="num">
                            {delta !== null ? (
                              <Delta value={delta} suffix=" pt" />
                            ) : (
                              <span
                                style={{ fontSize: 11.5, color: "var(--ink-4)" }}
                                title="Sin histórico previo"
                              >
                                —
                              </span>
                            )}
                          </td>
                        ) : null}
                      </tr>

                      {/* Error detail sub-row */}
                      {run.status === "failed" && run.error_summary ? (
                        <tr key={`${run.id}-err`} className="run-error-row">
                          <td colSpan={hasMultipleCompleted ? 6 : 5}>
                            <div className="run-error-pill">
                              <Icon name="info" size={14} />
                              <span>
                                <b>Error:</b> {run.error_summary}
                              </span>
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
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
        <Link
          href={`/dashboard/projects/${projectId}`}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            fontSize: 13,
            color: "var(--ink-3)",
            fontWeight: 600
          }}
        >
          <Icon name="overview" size={13} />
          Visión general
        </Link>
        <Link
          href={`/dashboard/projects/${projectId}/competitors`}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            fontSize: 13,
            color: "var(--ink-3)",
            fontWeight: 600
          }}
        >
          <Icon name="competitors" size={13} />
          Competidores
        </Link>
        <Link
          href={`/dashboard/projects/${projectId}/prompts`}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            fontSize: 13,
            color: "var(--ink-3)",
            fontWeight: 600
          }}
        >
          <Icon name="prompts" size={13} />
          Prompts
        </Link>
        <Link
          href="/dashboard/projects/new"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            fontSize: 13,
            color: "var(--ink-3)",
            fontWeight: 600
          }}
        >
          <Icon name="globe" size={13} />
          Añadir dominio
        </Link>
      </div>
    </div>
  );
}
