import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { requireUser } from "@/lib/auth";
import { requireActiveProject } from "@/lib/project-workspace";

const statusLabels: Record<string, string> = {
  pending: "Pendiente",
  running: "En curso",
  retrying: "Reintentando",
  completed: "Completado",
  failed: "Fallido",
  cancelled: "Cancelado"
};

function Badge({
  children,
  tone = "neutral"
}: {
  children: React.ReactNode;
  tone?: "neutral" | "good" | "warn" | "info";
}) {
  const styles = {
    neutral: "bg-slate-100 text-slate-600",
    good: "bg-emerald-50 text-emerald-700",
    warn: "bg-amber-50 text-amber-800",
    info: "bg-indigo-50 text-indigo-700"
  };

  return <span className={`rounded-full px-2 py-1 text-xs font-semibold ${styles[tone]}`}>{children}</span>;
}

function getStatusTone(status: string): "neutral" | "good" | "warn" | "info" {
  if (status === "completed") return "good";
  if (status === "failed" || status === "cancelled") return "warn";
  if (status === "running" || status === "retrying") return "info";
  return "neutral";
}

export default async function RunsPage({
  params
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const project = await requireActiveProject(projectId);
  const { supabase } = await requireUser();

  const [{ data: runs }, { count: recommendationsCount }] = await Promise.all([
    supabase
      .from("scan_runs")
      .select("id, status, error_summary, total_prompts, successful_prompts, failed_prompts, created_at, started_at, finished_at")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("recommendations")
      .select("id", { count: "exact", head: true })
      .eq("project_id", projectId)
      .eq("status", "active")
  ]);

  const completedRuns = runs?.filter((run) => run.status === "completed") ?? [];
  const activeRuns = runs?.filter((run) => run.status === "pending" || run.status === "running" || run.status === "retrying") ?? [];
  const failedRuns = runs?.filter((run) => run.status === "failed") ?? [];

  return (
    <div className="page space-y-5">
      <section className="space-y-2">
        <p className="kicker">Analizar</p>
        <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">
          <div>
            <h1 className="title-lg">Escaneos</h1>
            <p className="sub mt-1">
              Consulta el historial reciente de ejecuciones y entra en el detalle técnico solo cuando necesites auditar o depurar.
            </p>
          </div>
          <Link
            className="inline-flex items-center gap-1 text-sm font-semibold text-[var(--ink-2)] hover:text-[var(--accent)]"
            href={`/dashboard/projects/${projectId}`}
          >
            <Icon name="chevronLeft" size={14} />
            Volver a visión general
          </Link>
        </div>
      </section>

      <Card>
        <CardContent className="grid gap-4 py-4 sm:grid-cols-2 xl:grid-cols-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--ink-4)]">Proyecto</p>
            <p className="mt-1 font-semibold text-[var(--ink)]">{project.name}</p>
            <p className="sub">{project.brand} · {project.domain}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--ink-4)]">Escaneos totales</p>
            <p className="mt-1 text-2xl font-bold text-[var(--ink)]">{runs?.length ?? 0}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--ink-4)]">Completados</p>
            <p className="mt-1 text-2xl font-bold text-[var(--ink)]">{completedRuns.length}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--ink-4)]">Recomendaciones activas</p>
            <p className="mt-1 text-2xl font-bold text-[var(--ink)]">{recommendationsCount ?? 0}</p>
          </div>
        </CardContent>
      </Card>

      {!runs?.length ? (
        <Card>
          <CardContent className="space-y-4 py-5">
            <EmptyState
              title="Todavía no hay escaneos"
              description="Lanza el primer escaneo desde la visión general para empezar a recoger respuestas reales de Gemini."
            />
            <Link
              className="inline-flex items-center gap-1 text-sm font-semibold text-[var(--accent)]"
              href={`/dashboard/projects/${projectId}`}
            >
              Ir a visión general
              <Icon name="arrRight" size={14} />
            </Link>
          </CardContent>
        </Card>
      ) : (
        <>
          <section className="space-y-3">
            <div>
              <h2 className="text-lg font-semibold text-[var(--ink)]">Señales del historial reciente</h2>
              <p className="sub mt-1">Un vistazo rápido para saber si el proyecto está generando resultados estables para la beta privada.</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {[
                { label: "Activos", value: activeRuns.length },
                { label: "Fallidos", value: failedRuns.length },
                { label: "Completados", value: completedRuns.length },
                {
                  label: "Último estado",
                  value: runs[0] ? statusLabels[runs[0].status] ?? runs[0].status : "-"
                }
              ].map((metric) => (
                <Card key={metric.label}>
                  <CardContent className="py-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--ink-4)]">{metric.label}</p>
                    <p className="mt-1 text-2xl font-bold text-[var(--ink)]">{metric.value}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>

          <section className="space-y-3">
            <div>
              <h2 className="text-lg font-semibold text-[var(--ink)]">Historial reciente</h2>
              <p className="sub mt-1">Los detalles técnicos quedan disponibles por run, pero el seguimiento principal debe ocurrir en el overview y las pantallas de resultados.</p>
            </div>
            <div className="space-y-3">
              {runs.map((run) => (
                <Card key={run.id}>
                  <CardContent className="space-y-3 py-4">
                    <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-base font-semibold text-[var(--ink)]">Escaneo del {new Date(run.created_at).toLocaleString()}</h3>
                          <Badge tone={getStatusTone(run.status)}>{statusLabels[run.status] ?? run.status}</Badge>
                        </div>
                        <p className="sub mt-1">
                          {run.started_at ? `Inicio: ${new Date(run.started_at).toLocaleString()}` : "Pendiente de ejecución"}
                          {run.finished_at ? ` · Fin: ${new Date(run.finished_at).toLocaleString()}` : ""}
                        </p>
                      </div>
                      <Link
                        className="inline-flex items-center gap-1 text-sm font-semibold text-[var(--accent)]"
                        href={`/dashboard/projects/${projectId}/runs/${run.id}`}
                      >
                        Ver detalle técnico
                        <Icon name="arrRight" size={14} />
                      </Link>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-3">
                      <div className="rounded-[10px] border border-[#e8eaef] p-3 text-sm text-[var(--ink-2)]">
                        <p className="font-semibold text-[var(--ink)]">Prompts totales</p>
                        <p className="mt-1">{run.total_prompts}</p>
                      </div>
                      <div className="rounded-[10px] border border-[#e8eaef] p-3 text-sm text-[var(--ink-2)]">
                        <p className="font-semibold text-[var(--ink)]">Correctos</p>
                        <p className="mt-1">{run.successful_prompts}</p>
                      </div>
                      <div className="rounded-[10px] border border-[#e8eaef] p-3 text-sm text-[var(--ink-2)]">
                        <p className="font-semibold text-[var(--ink)]">Fallidos</p>
                        <p className="mt-1">{run.failed_prompts}</p>
                      </div>
                    </div>

                    {run.status === "failed" && run.error_summary ? (
                      <p className="rounded-[10px] border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                        El escaneo falló: {run.error_summary}
                      </p>
                    ) : null}
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
