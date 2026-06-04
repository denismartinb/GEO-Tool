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

function getOperationalState(latestRun: { status: string; finished_at: string | null; created_at: string } | undefined) {
  if (!latestRun) {
    return {
      label: "Sin escaneos",
      title: "Este dominio está configurado, pero todavía no se ha escaneado.",
      description: "Revisa prompts y competidores antes de lanzar el primer escaneo desde la visión general.",
      tone: "neutral" as const
    };
  }

  if (latestRun.status === "pending" || latestRun.status === "running" || latestRun.status === "retrying") {
    return {
      label: "Escaneo en curso",
      title: "Hay un escaneo preparado o en ejecución.",
      description: "Si el escaneo se está ejecutando desde el navegador, mantén esta página abierta y vuelve a revisar el estado al terminar.",
      tone: "info" as const
    };
  }

  if (latestRun.status === "completed") {
    return {
      label: "Último escaneo completado",
      title: "Revisa los resultados y decide la siguiente mejora.",
      description: "Usa las pantallas de prompts, competidores y recomendaciones para convertir el escaneo en acciones concretas.",
      tone: "good" as const
    };
  }

  if (latestRun.status === "failed") {
    return {
      label: "Último escaneo fallido",
      title: "El último escaneo no se completó.",
      description: "Revisa el detalle técnico si necesitas depurar y vuelve a la visión general para preparar un nuevo intento.",
      tone: "warn" as const
    };
  }

  return {
    label: statusLabels[latestRun.status] ?? latestRun.status,
    title: "Estado del escaneo actualizado.",
    description: "Consulta el historial reciente para entender qué ocurrió en este dominio.",
    tone: getStatusTone(latestRun.status)
  };
}

function formatDate(value: string | null | undefined) {
  return value ? new Date(value).toLocaleString() : "Sin fecha";
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
  const latestRun = runs?.[0];
  const operationalState = getOperationalState(latestRun);
  const lastScanDate = latestRun?.finished_at ?? latestRun?.started_at ?? latestRun?.created_at;
  const quickLinks = [
    {
      title: "Gestionar prompts",
      description: "Ajusta las preguntas que Gemini usará para medir visibilidad.",
      href: `/dashboard/projects/${projectId}/prompts`,
      icon: "prompts"
    },
    {
      title: "Revisar competidores",
      description: "Comprueba rivales configurados y menciones detectadas.",
      href: `/dashboard/projects/${projectId}/competitors`,
      icon: "competitors"
    },
    {
      title: "Ver recomendaciones",
      description: "Prioriza acciones basadas en evidencia del último escaneo.",
      href: `/dashboard/projects/${projectId}/recommendations`,
      icon: "recs"
    },
    {
      title: "Ver visión general",
      description: "Lanza escaneos y revisa el resumen principal del proyecto.",
      href: `/dashboard/projects/${projectId}`,
      icon: "overview"
    },
    {
      title: "Añadir otro dominio",
      description: "Abre el wizard para crear un nuevo proyecto de dominio.",
      href: "/dashboard/projects/new",
      icon: "globe"
    }
  ];

  return (
    <div className="page space-y-6">
      <section className="space-y-2">
        <p className="kicker">Analizar</p>
        <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">
          <div>
            <h1 className="title-lg">Escaneos de {project.name}</h1>
            <p className="sub mt-1">
              Hub operativo para entender el estado del dominio, decidir el siguiente paso y entrar al detalle técnico solo cuando haga falta.
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

      <section className="grid gap-4 xl:grid-cols-[1.35fr_0.65fr]">
        <Card className="border-[#e6e9fe] bg-gradient-to-br from-white to-[#fbfbff]">
          <CardContent className="space-y-5 py-5">
            <div className="flex flex-col justify-between gap-4 md:flex-row md:items-start">
              <div className="space-y-2">
                <Badge tone={operationalState.tone}>{operationalState.label}</Badge>
                <div>
                  <h2 className="text-2xl font-bold tracking-[-0.02em] text-[var(--ink)]">{project.domain}</h2>
                  <p className="sub mt-1">
                    {project.brand} · {project.country}/{project.language}
                    {latestRun ? ` · Último movimiento: ${formatDate(lastScanDate)}` : ""}
                  </p>
                </div>
              </div>
              <Link
                className="inline-flex items-center gap-1 rounded-[8px] bg-[var(--accent)] px-3 py-2 text-sm font-semibold text-white hover:opacity-95"
                href={`/dashboard/projects/${projectId}`}
              >
                Ir a visión general
                <Icon name="arrRight" size={14} />
              </Link>
            </div>

            <div className="rounded-[16px] border border-[#e8eaef] bg-white p-4">
              <p className="text-sm font-semibold text-[var(--accent-ink)]">Siguiente paso</p>
              <h3 className="mt-1 text-lg font-semibold text-[var(--ink)]">{operationalState.title}</h3>
              <p className="sub mt-1">{operationalState.description}</p>

              {!latestRun ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  <Link className="inline-flex items-center gap-1 text-sm font-semibold text-[var(--accent)]" href={`/dashboard/projects/${projectId}`}>
                    Visión general
                    <Icon name="arrRight" size={14} />
                  </Link>
                  <Link className="inline-flex items-center gap-1 text-sm font-semibold text-[var(--accent)]" href={`/dashboard/projects/${projectId}/prompts`}>
                    Prompts
                    <Icon name="arrRight" size={14} />
                  </Link>
                  <Link className="inline-flex items-center gap-1 text-sm font-semibold text-[var(--accent)]" href={`/dashboard/projects/${projectId}/competitors`}>
                    Competidores
                    <Icon name="arrRight" size={14} />
                  </Link>
                </div>
              ) : null}

              {latestRun?.status === "completed" ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  <Link className="inline-flex items-center gap-1 text-sm font-semibold text-[var(--accent)]" href={`/dashboard/projects/${projectId}`}>
                    Visión general
                    <Icon name="arrRight" size={14} />
                  </Link>
                  <Link className="inline-flex items-center gap-1 text-sm font-semibold text-[var(--accent)]" href={`/dashboard/projects/${projectId}/prompts`}>
                    Prompts
                    <Icon name="arrRight" size={14} />
                  </Link>
                  <Link className="inline-flex items-center gap-1 text-sm font-semibold text-[var(--accent)]" href={`/dashboard/projects/${projectId}/competitors`}>
                    Competidores
                    <Icon name="arrRight" size={14} />
                  </Link>
                  <Link className="inline-flex items-center gap-1 text-sm font-semibold text-[var(--accent)]" href={`/dashboard/projects/${projectId}/recommendations`}>
                    Recomendaciones
                    <Icon name="arrRight" size={14} />
                  </Link>
                </div>
              ) : null}

              {latestRun?.status === "failed" ? (
                <div className="mt-4 space-y-3">
                  {latestRun.error_summary ? (
                    <p className="rounded-[10px] border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                      El escaneo falló: {latestRun.error_summary}
                    </p>
                  ) : null}
                  <div className="flex flex-wrap gap-2">
                    <Link className="inline-flex items-center gap-1 text-sm font-semibold text-[var(--accent)]" href={`/dashboard/projects/${projectId}/runs/${latestRun.id}`}>
                      Ver detalle técnico
                      <Icon name="arrRight" size={14} />
                    </Link>
                    <Link className="inline-flex items-center gap-1 text-sm font-semibold text-[var(--accent)]" href={`/dashboard/projects/${projectId}`}>
                      Volver a visión general
                      <Icon name="arrRight" size={14} />
                    </Link>
                  </div>
                </div>
              ) : null}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="font-medium">Estado del dominio</h2>
          </CardHeader>
          <CardContent className="grid gap-3 py-4 sm:grid-cols-2 xl:grid-cols-1">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--ink-4)]">Escaneos totales</p>
              <p className="mt-1 text-2xl font-bold text-[var(--ink)]">{runs?.length ?? 0}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--ink-4)]">Completados</p>
              <p className="mt-1 text-2xl font-bold text-[var(--ink)]">{completedRuns.length}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--ink-4)]">En curso</p>
              <p className="mt-1 text-2xl font-bold text-[var(--ink)]">{activeRuns.length}</p>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--ink-4)]">Recomendaciones activas</p>
              <p className="mt-1 text-2xl font-bold text-[var(--ink)]">{recommendationsCount ?? 0}</p>
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold text-[var(--ink)]">Operar este dominio</h2>
          <p className="sub mt-1">Accesos rápidos para ajustar configuración, revisar resultados o añadir otro dominio al workspace.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {quickLinks.map((item) => (
            <Link key={item.title} href={item.href} className="group block rounded-[14px] border border-[#e8eaef] bg-white p-4 transition hover:border-[#dde0e7] hover:bg-[#fbfbfd]">
              <div className="mb-3 grid h-9 w-9 place-items-center rounded-[10px] bg-[var(--accent-soft)] text-[var(--accent)]">
                <Icon name={item.icon} size={17} />
              </div>
              <h3 className="text-sm font-semibold text-[var(--ink)] group-hover:text-[var(--accent)]">{item.title}</h3>
              <p className="sub mt-1 text-xs">{item.description}</p>
            </Link>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-lg font-semibold text-[var(--ink)]">Historial reciente</h2>
          <p className="sub mt-1">Registro compacto de las últimas ejecuciones. El detalle técnico queda disponible para auditoría y soporte.</p>
        </div>

        {!runs?.length ? (
          <Card>
            <CardContent className="space-y-4 py-5">
              <EmptyState
                title="Todavía no hay escaneos para este dominio"
                description="El proyecto ya está configurado, pero aún no tiene respuestas reales. Revisa prompts y competidores, y lanza el primer escaneo desde la visión general."
              />
              <div className="flex flex-wrap gap-2">
                <Link className="inline-flex items-center gap-1 text-sm font-semibold text-[var(--accent)]" href={`/dashboard/projects/${projectId}/prompts`}>
                  Revisar prompts
                  <Icon name="arrRight" size={14} />
                </Link>
                <Link className="inline-flex items-center gap-1 text-sm font-semibold text-[var(--accent)]" href={`/dashboard/projects/${projectId}/competitors`}>
                  Revisar competidores
                  <Icon name="arrRight" size={14} />
                </Link>
                <Link className="inline-flex items-center gap-1 text-sm font-semibold text-[var(--accent)]" href={`/dashboard/projects/${projectId}`}>
                  Lanzar desde visión general
                  <Icon name="arrRight" size={14} />
                </Link>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {runs.map((run) => {
              const processedPrompts = Number(run.successful_prompts ?? 0) + Number(run.failed_prompts ?? 0);

              return (
                <Card key={run.id}>
                  <CardContent className="space-y-3 py-4">
                    <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-base font-semibold text-[var(--ink)]">Escaneo del {formatDate(run.created_at)}</h3>
                          <Badge tone={getStatusTone(run.status)}>{statusLabels[run.status] ?? run.status}</Badge>
                        </div>
                        <p className="sub mt-1">
                          {run.started_at ? `Inicio: ${formatDate(run.started_at)}` : "Pendiente de ejecución"}
                          {run.finished_at ? ` · Fin: ${formatDate(run.finished_at)}` : ""}
                        </p>
                      </div>
                      <Link
                        className="inline-flex items-center gap-1 text-sm font-semibold text-[var(--ink-2)] hover:text-[var(--accent)]"
                        href={`/dashboard/projects/${projectId}/runs/${run.id}`}
                      >
                        Ver detalle técnico
                        <Icon name="arrRight" size={14} />
                      </Link>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-3">
                      <div className="rounded-[10px] border border-[#e8eaef] p-3 text-sm text-[var(--ink-2)]">
                        <p className="font-semibold text-[var(--ink)]">Prompts procesados</p>
                        <p className="mt-1">{processedPrompts} de {run.total_prompts}</p>
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
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
