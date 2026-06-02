import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { requireUser } from "@/lib/auth";
import { requireActiveProject } from "@/lib/project-workspace";

const valueLabels: Record<string, string> = {
  low: "bajo",
  medium: "medio",
  high: "alto",
  active: "activa",
  rule: "regla"
};

function formatValue(value: string) {
  return valueLabels[value] ?? value.replaceAll("_", " ");
}

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

  return (
    <span className={`rounded-full px-2 py-1 text-xs font-semibold ${styles[tone]}`}>
      {children}
    </span>
  );
}

export default async function RecommendationsPage({
  params
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const project = await requireActiveProject(projectId);
  const { supabase } = await requireUser();

  const [{ data: latestRun }, { data: latestCompletedRun }] = await Promise.all([
    supabase
      .from("scan_runs")
      .select("id, status, error_summary, created_at, finished_at")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("scan_runs")
      .select("id, status, created_at, finished_at")
      .eq("project_id", projectId)
      .eq("status", "completed")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
  ]);

  const [{ data: score }, { data: recommendations }] = latestCompletedRun
    ? await Promise.all([
        supabase
          .from("run_scores")
          .select("confidence")
          .eq("project_id", projectId)
          .eq("run_id", latestCompletedRun.id)
          .maybeSingle(),
        supabase
          .from("recommendations")
          .select("id, priority_rank, title, description, recommendation_type, impact, effort, confidence, status, source_type, evidence_json")
          .eq("project_id", projectId)
          .eq("run_id", latestCompletedRun.id)
          .eq("status", "active")
          .order("priority_rank", { ascending: true })
      ])
    : [{ data: null }, { data: null }];

  const latestRunFailed = latestRun?.status === "failed";

  return (
    <div className="page space-y-5">
      <section className="space-y-2">
        <p className="kicker">Actuar</p>
        <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">
          <div>
            <h1 className="title-lg">Recomendaciones</h1>
            <p className="sub mt-1">
              Prioriza acciones basadas en la evidencia extraída del último escaneo de Gemini.
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
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--ink-4)]">Acciones activas</p>
            <p className="mt-1 text-2xl font-bold text-[var(--ink)]">{recommendations?.length ?? 0}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--ink-4)]">Último escaneo completado</p>
            <p className="mt-1 font-semibold text-[var(--ink)]">
              {latestCompletedRun ? "Completado" : "Sin datos"}
            </p>
            <p className="sub">
              {latestCompletedRun
                ? new Date(latestCompletedRun.finished_at ?? latestCompletedRun.created_at).toLocaleString()
                : "Lanza un escaneo desde la visión general."}
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--ink-4)]">Confianza del run</p>
            <p className="mt-1 text-2xl font-bold capitalize text-[var(--ink)]">
              {score?.confidence ? formatValue(score.confidence) : "-"}
            </p>
          </div>
        </CardContent>
      </Card>

      {latestRunFailed && latestCompletedRun ? (
        <p className="rounded-[10px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          El último escaneo falló. Se muestran recomendaciones del último escaneo completado.
        </p>
      ) : null}

      {!latestCompletedRun ? (
        <Card>
          <CardContent className="space-y-4 py-5">
            <EmptyState
              title={latestRunFailed ? "El último escaneo falló" : "Todavía no hay recomendaciones"}
              description={
                latestRunFailed
                  ? "No hay un escaneo completado del que podamos extraer recomendaciones. Revisa el proyecto y vuelve a lanzar el análisis."
                  : "Las recomendaciones aparecerán después de completar el primer escaneo real con Gemini."
              }
            />
            <Link
              className="inline-flex items-center gap-1 text-sm font-semibold text-[var(--accent)]"
              href={`/dashboard/projects/${projectId}`}
            >
              Volver a visión general
              <Icon name="arrRight" size={14} />
            </Link>
          </CardContent>
        </Card>
      ) : !recommendations?.length ? (
        <Card>
          <CardContent className="space-y-4 py-5">
            <EmptyState
              title="No hay recomendaciones activas"
              description="Ninguna regla ha generado acciones para este escaneo completado. Puedes revisar el detalle técnico para auditar la evidencia."
            />
            <Link
              className="inline-flex items-center gap-1 text-sm font-semibold text-[var(--accent)]"
              href={`/dashboard/projects/${projectId}/runs/${latestCompletedRun.id}`}
            >
              Ver detalle técnico del escaneo
              <Icon name="arrRight" size={14} />
            </Link>
          </CardContent>
        </Card>
      ) : (
        <section className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-[var(--ink)]">Backlog priorizado</h2>
            <p className="sub mt-1">
              Recomendaciones direccionales de v0, generadas por reglas y respaldadas por evidencia del último run.
            </p>
          </div>

          {recommendations.map((recommendation) => {
            const evidence = recommendation.evidence_json && typeof recommendation.evidence_json === "object"
              ? (recommendation.evidence_json as {
                  why_this_matters?: string;
                  assumptions?: string[];
                  affected_prompts?: string[];
                  evidence_snippets?: string[];
                  mentioned_competitors?: string[];
                  citation_domains?: string[];
                })
              : {};
            const affectedPrompts = evidence.affected_prompts ?? [];
            const snippets = evidence.evidence_snippets ?? [];
            const competitors = evidence.mentioned_competitors ?? [];
            const domains = evidence.citation_domains ?? [];
            const assumptions = evidence.assumptions ?? [];
            const hasEvidence = Boolean(
              evidence.why_this_matters ||
              affectedPrompts.length ||
              snippets.length ||
              competitors.length ||
              domains.length
            );
            const evidenceLimited = !evidence.why_this_matters || !affectedPrompts.length;

            return (
              <Card key={recommendation.id}>
                <CardContent className="space-y-4 py-5">
                  <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--accent)]">
                        Prioridad #{recommendation.priority_rank}
                      </p>
                      <h3 className="mt-1 text-lg font-semibold leading-7 text-[var(--ink)]">
                        {recommendation.title}
                      </h3>
                      <p className="mt-2 max-w-4xl text-sm leading-6 text-[var(--ink-2)]">
                        {recommendation.description}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2 md:max-w-xs md:justify-end">
                      {recommendation.priority_rank <= 2 ? <Badge tone="warn">Prioridad alta</Badge> : null}
                      {recommendation.impact === "high" && recommendation.effort === "low" ? (
                        <Badge tone="good">Victoria rápida</Badge>
                      ) : null}
                      {recommendation.confidence === "high" ? <Badge tone="info">Alta confianza</Badge> : null}
                      {recommendation.confidence === "low" ? <Badge tone="warn">Revisar evidencia</Badge> : null}
                      {evidenceLimited ? <Badge tone="warn">Evidencia limitada</Badge> : null}
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <Badge>Impacto: {formatValue(recommendation.impact)}</Badge>
                    <Badge>Esfuerzo: {formatValue(recommendation.effort)}</Badge>
                    <Badge>Confianza: {formatValue(recommendation.confidence)}</Badge>
                    <Badge>Estado: {formatValue(recommendation.status)}</Badge>
                    <Badge>Origen: {formatValue(recommendation.source_type)}</Badge>
                    <Badge>Tipo: {formatValue(recommendation.recommendation_type)}</Badge>
                  </div>

                  {hasEvidence || assumptions.length ? (
                    <div className="space-y-3 rounded-[10px] border border-[#e8eaef] bg-[#fbfbfd] p-4 text-sm text-[var(--ink-2)]">
                      {evidence.why_this_matters ? (
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--ink-4)]">Por qué importa</p>
                          <p className="mt-1 leading-6">{evidence.why_this_matters}</p>
                        </div>
                      ) : null}
                      {affectedPrompts.length ? (
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--ink-4)]">
                            Prompts afectados · {affectedPrompts.length}
                          </p>
                          <ul className="mt-1 space-y-1">
                            {affectedPrompts.slice(0, 3).map((prompt) => <li key={prompt}>· {prompt}</li>)}
                          </ul>
                        </div>
                      ) : null}
                      {snippets.length ? (
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--ink-4)]">Evidencia</p>
                          <ul className="mt-1 space-y-1">
                            {snippets.slice(0, 3).map((snippet) => <li key={snippet}>· {snippet}</li>)}
                          </ul>
                        </div>
                      ) : null}
                      {competitors.length ? <p><span className="font-semibold">Competidores mencionados:</span> {competitors.join(", ")}</p> : null}
                      {domains.length ? <p><span className="font-semibold">Dominios citados:</span> {domains.join(", ")}</p> : null}
                      {assumptions.length ? (
                        <p className="text-xs leading-5 text-[var(--ink-3)]">
                          <span className="font-semibold">Supuestos:</span> {assumptions.join(" ")}
                        </p>
                      ) : null}
                    </div>
                  ) : (
                    <p className="text-sm text-amber-800">
                      La evidencia disponible para esta recomendación es limitada. Revísala antes de priorizar su ejecución.
                    </p>
                  )}

                  {affectedPrompts.length ? (
                    <Link
                      className="inline-flex items-center gap-1 text-sm font-semibold text-[var(--accent)]"
                      href={`/dashboard/projects/${projectId}/prompts`}
                    >
                      Ver prompts afectados
                      <Icon name="arrRight" size={14} />
                    </Link>
                  ) : null}
                </CardContent>
              </Card>
            );
          })}
        </section>
      )}

      {latestCompletedRun ? (
        <section className="flex flex-wrap gap-4">
          <Link
            className="inline-flex items-center gap-1 text-sm font-semibold text-[var(--ink-3)] hover:text-[var(--accent)]"
            href={`/dashboard/projects/${projectId}`}
          >
            Volver a visión general
          </Link>
          <Link
            className="inline-flex items-center gap-1 text-sm font-semibold text-[var(--ink-3)] hover:text-[var(--accent)]"
            href={`/dashboard/projects/${projectId}/runs/${latestCompletedRun.id}`}
          >
            Ver detalle técnico del escaneo
            <Icon name="arrRight" size={14} />
          </Link>
        </section>
      ) : null}
    </div>
  );
}
