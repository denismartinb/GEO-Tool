import Link from "next/link";
import { Icon } from "@/components/ui/icon";
import { requireUser } from "@/lib/auth";
import { requireActiveProject } from "@/lib/project-workspace";
import {
  RecommendationsClient,
  type Recommendation,
} from "./recommendations-client";

export default async function RecommendationsPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const project = await requireActiveProject(projectId);
  const { supabase } = await requireUser();

  // Latest completed run
  const { data: latestCompletedRun } = await supabase
    .from("scan_runs")
    .select("id, status, created_at, finished_at")
    .eq("project_id", projectId)
    .eq("status", "completed")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Also fetch latest run of any status for "failed" banner
  const { data: latestRun } = await supabase
    .from("scan_runs")
    .select("id, status, created_at")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const [{ data: recommendations }] = latestCompletedRun
    ? await Promise.all([
        supabase
          .from("recommendations")
          .select(
            "id, priority_rank, title, description, recommendation_type, impact, effort, confidence, status, source_type, evidence_json",
          )
          .eq("project_id", projectId)
          .eq("run_id", latestCompletedRun.id)
          .eq("status", "active")
          .order("priority_rank", { ascending: true }),
      ])
    : [{ data: null }];

  const recs: Recommendation[] = (recommendations ?? []) as Recommendation[];

  // Computed stats
  const highPriority = recs.filter((r) => r.priority_rank <= 3).length;
  const quickWins = recs.filter(
    (r) => r.impact === "high" && r.effort === "low",
  ).length;
  const total = recs.length;

  const latestRunFailed = latestRun?.status === "failed";

  const lastScanDate = latestCompletedRun
    ? new Date(
        latestCompletedRun.finished_at ?? latestCompletedRun.created_at,
      ).toLocaleDateString("es-ES", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : null;

  return (
    <div className="page fade-in">
      {/* Sticky header */}
      <div className="ov-sticky-header">
        <div className="ov-sticky-left">
          <span className="kicker">Actuar</span>
          <span
            style={{
              width: 1,
              height: 16,
              background: "var(--line-strong)",
              display: "inline-block",
              margin: "0 2px",
            }}
          />
          <span
            style={{
              fontSize: 14,
              fontWeight: 700,
              color: "var(--ink)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              maxWidth: 260,
            }}
          >
            {project.domain}
          </span>
          {total > 0 && (
            <span className="badge badge-accent">
              {total} acciones
            </span>
          )}
        </div>
        <div className="ov-sticky-right">
          {lastScanDate && (
            <span style={{ fontSize: 12, color: "var(--ink-4)", fontWeight: 500 }}>
              Último escaneo: {lastScanDate}
            </span>
          )}
          <Link
            href={`/dashboard/projects/${projectId}`}
            className="btn btn-ghost btn-sm"
          >
            <Icon name="chevronLeft" size={14} />
            Visión general
          </Link>
        </div>
      </div>

      {/* Failed run notice */}
      {latestRunFailed && latestCompletedRun && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "10px 14px",
            background: "var(--warn-soft)",
            border: "1px solid #f3d086",
            borderRadius: "var(--r-md)",
            fontSize: 13,
            color: "var(--warn-ink)",
            marginBottom: 16,
          }}
        >
          <Icon name="info" size={14} />
          El último escaneo falló. Se muestran recomendaciones del escaneo
          anterior completado.
        </div>
      )}

      {/* Summary banner — only if there are recs */}
      {latestCompletedRun && recs.length > 0 && (
        <div className="summary mt8">
          <div className="summary-ico">
            <Icon name="recs" size={20} />
          </div>
          <div className="summary-txt" style={{ flex: 1 }}>
            Lumira encontró{" "}
            <b>{total} acciones</b> para{" "}
            <b>{project.domain}</b>.
          </div>
          <div
            style={{
              display: "flex",
              gap: 20,
              paddingLeft: 20,
              borderLeft: "1px solid var(--line)",
              alignItems: "center",
              flexShrink: 0,
            }}
          >
            <div style={{ textAlign: "center" }}>
              <div
                className="tnum"
                style={{
                  fontSize: 22,
                  fontWeight: 800,
                  color: "var(--neg)",
                  lineHeight: 1,
                }}
              >
                {highPriority}
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: "var(--ink-4)",
                  fontWeight: 600,
                  marginTop: 3,
                  whiteSpace: "nowrap",
                }}
              >
                Alta prioridad
              </div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div
                className="tnum"
                style={{
                  fontSize: 22,
                  fontWeight: 800,
                  color: "var(--pos)",
                  lineHeight: 1,
                }}
              >
                {quickWins}
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: "var(--ink-4)",
                  fontWeight: 600,
                  marginTop: 3,
                  whiteSpace: "nowrap",
                }}
              >
                Victorias rápidas
              </div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div
                className="tnum"
                style={{
                  fontSize: 22,
                  fontWeight: 800,
                  color: "var(--ink)",
                  lineHeight: 1,
                }}
              >
                {total}
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: "var(--ink-4)",
                  fontWeight: 600,
                  marginTop: 3,
                  whiteSpace: "nowrap",
                }}
              >
                Total
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Empty states */}
      {!latestCompletedRun ? (
        <div className="section-empty" style={{ marginTop: 20 }}>
          <div className="section-empty-title">
            {latestRunFailed
              ? "El último escaneo falló"
              : "Todavía no hay recomendaciones"}
          </div>
          <div className="section-empty-desc">
            {latestRunFailed
              ? "No hay un escaneo completado del que extraer recomendaciones. Revisa el proyecto y vuelve a lanzar el análisis."
              : "Las recomendaciones aparecerán después de completar el primer escaneo real con Gemini."}
          </div>
          <Link
            href={`/dashboard/projects/${projectId}`}
            className="btn btn-ghost btn-sm"
            style={{ marginTop: 14, display: "inline-flex" }}
          >
            Volver a visión general
            <Icon name="arrRight" size={14} />
          </Link>
        </div>
      ) : recs.length === 0 ? (
        <div className="section-empty" style={{ marginTop: 20 }}>
          <div className="section-empty-title">No hay recomendaciones activas</div>
          <div className="section-empty-desc">
            Ninguna regla generó acciones para este escaneo. Puedes revisar el
            detalle técnico para auditar la evidencia.
          </div>
          <Link
            href={`/dashboard/projects/${projectId}/runs/${latestCompletedRun.id}`}
            className="btn btn-ghost btn-sm"
            style={{ marginTop: 14, display: "inline-flex" }}
          >
            Ver detalle técnico
            <Icon name="arrRight" size={14} />
          </Link>
        </div>
      ) : (
        <>
          {/* Section head */}
          <div className="section-head" style={{ marginTop: 24 }}>
            <div className="section-title">Backlog de acciones</div>
            <div className="section-desc">
              Pulsa cualquier acción para ver la evidencia
            </div>
          </div>

          {/* Client component handles filters + cards */}
          <RecommendationsClient recommendations={recs} />
        </>
      )}

      {/* Footer links */}
      {latestCompletedRun && (
        <div
          style={{
            display: "flex",
            gap: 20,
            marginTop: 28,
            flexWrap: "wrap",
          }}
        >
          <Link
            href={`/dashboard/projects/${projectId}`}
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: "var(--ink-3)",
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            <Icon name="chevronLeft" size={13} />
            Visión general
          </Link>
          <Link
            href={`/dashboard/projects/${projectId}/runs/${latestCompletedRun.id}`}
            style={{
              fontSize: 13,
              fontWeight: 600,
              color: "var(--ink-3)",
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            Ver detalle técnico del escaneo
            <Icon name="arrRight" size={13} />
          </Link>
        </div>
      )}
    </div>
  );
}
