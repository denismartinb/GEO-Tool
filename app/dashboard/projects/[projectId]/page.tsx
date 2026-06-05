import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { Icon } from "@/components/ui/icon";
import { runProjectScan } from "./actions";
import { ScanLoadingState } from "@/components/scan-loading-state";

const statusLabels: Record<string, string> = {
  pending: "pendiente",
  running: "en curso",
  completed: "completado",
  failed: "fallido",
  cancelled: "cancelado"
};

const confidenceLabels: Record<string, string> = {
  low: "baja",
  medium: "media",
  high: "alta"
};

const sentimentLabels: Record<string, string> = {
  positive: "positivo",
  neutral: "neutral",
  negative: "negativo",
  mixed: "mixto",
  unknown: "desconocido"
};

const feedbackErrorMessages: Record<string, string> = {
  active_run_exists: "Ya hay un escaneo en curso o pendiente para este proyecto.",
  project_archived: "Este proyecto está archivado. Reactívalo antes de lanzar un escaneo.",
  project_not_found: "No hemos encontrado el proyecto solicitado.",
  project_setup_partial: "El proyecto se creó, pero no pudimos guardar todos los prompts o competidores iniciales. Revísalos antes de escanear.",
  prompts_required: "Añade al menos un prompt activo antes de escanear.",
  scan_failed: "No se ha podido completar la preparación o ejecución del escaneo.",
  scan_unavailable: "La ejecución automática del escaneo todavía no está disponible en este entorno.",
  too_many_prompts: "El escaneo está limitado a 10 prompts activos. Desactiva algunos antes de continuar.",
  unauthorized: "No tienes permisos para realizar esta acción.",
  unexpected_error: "Ha ocurrido un error inesperado. Vuelve a intentarlo."
};

const feedbackSuccessMessages: Record<string, string> = {
  project_created: "Proyecto creado. Revisa los prompts y competidores antes de lanzar el primer escaneo.",
  scan_completed: "Escaneo completado. Los resultados ya están disponibles en esta visión general.",
  scan_pending: "Escaneo preparado. La ejecución automática todavía no está activada en este entorno."
};

function getScoreNumber(value: number | string | null | undefined) {
  return Number(value ?? 0);
}

function getRiskLabel(score: number) {
  if (score >= 70) return "Presión competitiva alta";
  if (score >= 40) return "Presión competitiva moderada";
  return "Presión competitiva baja";
}

function getSummaryText({
  brand,
  total,
  brandMentions,
  competitorRisk,
  confidence
}: {
  brand: string;
  total: number;
  brandMentions: number;
  competitorRisk: number;
  confidence: string;
}) {
  const riskText = competitorRisk >= 70
    ? "la presión competitiva es alta"
    : competitorRisk >= 40
      ? "existe una presión competitiva moderada"
      : "la presión competitiva es baja";
  const confidenceText = confidence === "low" || total < 3
    ? " Trata este resultado como direccional por el bajo volumen o calidad de la muestra."
    : "";

  return `${brand} aparece en ${brandMentions} de ${total} prompts analizados y ${riskText}.${confidenceText}`;
}

export default async function ProjectDetailPage({
  params,
  searchParams
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const { projectId } = await params;
  const feedback = await searchParams;
  const { supabase } = await requireUser();

  const { data: project } = await supabase
    .from("projects")
    .select("id, name, domain, brand, country, language, created_at")
    .eq("id", projectId)
    .eq("is_archived", false)
    .single();

  if (!project) notFound();

  const [{ data: prompts }, { data: competitors }, { data: runs }] = await Promise.all([
    supabase
      .from("project_prompts")
      .select("id, prompt_text, category, is_active")
      .eq("project_id", projectId)
      .eq("is_active", true)
      .order("created_at", { ascending: false }),
    supabase
      .from("project_competitors")
      .select("id, name, domain, is_active")
      .eq("project_id", projectId)
      .eq("is_active", true)
      .order("created_at", { ascending: false }),
    supabase
      .from("scan_runs")
      .select("id, status, total_prompts, successful_prompts, failed_prompts, created_at, started_at, finished_at")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
  ]);

  const latestRun = runs?.[0];
  const latestCompletedRun = runs?.find((run) => run.status === "completed");
  const completedRunsCount = runs?.filter((run) => run.status === "completed").length ?? 0;
  const latestFailedRun = latestRun?.status === "failed" ? latestRun : null;
  const activeRun = runs?.find((run) => run.status === "pending" || run.status === "running");
  const feedbackErrorMessage = feedback.error
    ? feedbackErrorMessages[feedback.error] ?? feedbackErrorMessages.unexpected_error
    : null;
  const successMessage = feedback.success ? feedbackSuccessMessages[feedback.success] ?? null : null;
  const [{ data: latestScore }, { data: promptInsights }, { data: latestRecommendations }] = latestCompletedRun
    ? await Promise.all([
        supabase
          .from("run_scores")
          .select("visibility_score, citation_score, competitor_gap_score, confidence, details_json")
          .eq("project_id", projectId)
          .eq("run_id", latestCompletedRun.id)
          .maybeSingle(),
        supabase
          .from("scan_prompt_results")
          .select("id, prompt_text_snapshot, brand_mentioned, citation_found, mentioned_competitors_count, sentiment, raw_response_text, extracted_json")
          .eq("project_id", projectId)
          .eq("run_id", latestCompletedRun.id)
          .eq("status", "completed")
          .order("created_at", { ascending: true })
          .limit(5),
        supabase
          .from("recommendations")
          .select("id, priority_rank, title, impact, effort, confidence, evidence_json")
          .eq("project_id", projectId)
          .eq("run_id", latestCompletedRun.id)
          .eq("status", "active")
          .order("priority_rank", { ascending: true })
          .limit(3)
      ])
    : [{ data: null }, { data: null }, { data: null }];

  const scoreDetails = latestScore?.details_json && typeof latestScore.details_json === "object"
    ? (latestScore.details_json as { total_results?: number; brand_mentioned_count?: number })
    : {};
  const totalResults = Number(scoreDetails.total_results ?? latestCompletedRun?.successful_prompts ?? 0);
  const brandMentions = Number(scoreDetails.brand_mentioned_count ?? promptInsights?.filter((result) => result.brand_mentioned).length ?? 0);
  const visibilityScore = getScoreNumber(latestScore?.visibility_score);
  const citationScore = getScoreNumber(latestScore?.citation_score);
  const competitorRiskScore = getScoreNumber(latestScore?.competitor_gap_score);
  const runConfidence = latestScore?.confidence ?? "low";

  return (
    <div className="page space-y-6">
      <section className="space-y-2">
        <p className="kicker">Visión general</p>
        <h1 className="title-lg">{project.name}</h1>
        <p className="sub">
          {project.domain} · {project.country}/{project.language} · Marca: {project.brand}
        </p>
      </section>

      {feedbackErrorMessage ? <p className="feedback error">{feedbackErrorMessage}</p> : null}
      {successMessage ? <p className="feedback success">{successMessage}</p> : null}

      {activeRun ? (
        <section className="space-y-4">
          {/* Scan-in-progress banner */}
          <div
            className="flex items-center gap-3 rounded-[14px] border px-4 py-3"
            style={{ borderColor: "var(--accent-soft-2)", backgroundColor: "var(--accent-soft)" }}
          >
            <div
              className="h-2.5 w-2.5 shrink-0 animate-pulse rounded-full"
              style={{ backgroundColor: "var(--accent)" }}
            />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold" style={{ color: "var(--accent-ink)" }}>
                Analizando{" "}
                <span style={{ fontFamily: "ui-monospace, monospace" }}>{project.domain}</span>{" "}
                en Gemini
              </p>
              <p className="text-xs" style={{ color: "var(--ink-3)" }}>
                Puedes salir de esta página — el escaneo continúa en segundo plano.
              </p>
            </div>
          </div>

          {/* Animated scan steps */}
          <ScanLoadingState domain={project.domain} />
        </section>
      ) : (
        <>
          {/* Launch card */}
          <section>
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between gap-4">
                  <h2 className="font-medium">Nuevo análisis</h2>
                  <form action={runProjectScan}>
                    <input type="hidden" name="projectId" value={projectId} />
                    <Button type="submit" disabled={!prompts?.length}>
                      <Icon name="play" size={14} />
                      Lanzar escaneo
                    </Button>
                  </form>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                <p className="sub">
                  Prepara un escaneo con los prompts activos. Si la ejecución automática está habilitada en este
                  entorno, el análisis se lanzará al momento; si no, quedará pendiente para una ejecución posterior.
                </p>
                {!prompts?.length ? (
                  <p className="feedback error">Añade al menos un prompt activo antes de escanear.</p>
                ) : null}
              </CardContent>
            </Card>
          </section>

          {!competitors?.length ? (
            <p className="rounded-[10px] border border-[#e8eaef] bg-[#fbfbfd] px-4 py-3 text-sm text-[var(--ink-2)]">
              Añadir competidores mejora la calidad del análisis, pero no bloquea el primer escaneo.{" "}
              <Link
                className="font-semibold text-[var(--accent)]"
                href={`/dashboard/projects/${projectId}/competitors`}
              >
                Gestionar competidores
              </Link>
            </p>
          ) : null}

          {latestFailedRun ? (
            <section className="rounded-[10px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <p className="font-semibold">
                {latestCompletedRun
                  ? "El último escaneo falló. Se muestran los últimos resultados completados."
                  : "El último escaneo falló. Puedes revisar el detalle técnico y volver a intentarlo."}
              </p>
              <Link
                className="mt-2 inline-flex items-center gap-1 font-semibold underline"
                href={`/dashboard/projects/${projectId}/runs/${latestFailedRun.id}`}
              >
                Ver detalle técnico del escaneo fallido
                <Icon name="arrRight" size={14} />
              </Link>
            </section>
          ) : null}

      {latestCompletedRun && latestScore ? (
        <>
          <section>
            <Card className="border-[#e6e9fe] bg-gradient-to-br from-white to-[#fbfbff]">
              <CardContent className="flex flex-col gap-4 py-5 md:flex-row md:items-start">
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-[10px] bg-[var(--accent-soft)] text-[var(--accent)]">
                  <Icon name="recs" size={19} />
                </div>
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-[var(--accent-ink)]">Resumen del último escaneo completado</p>
                  <p className="max-w-4xl text-base leading-7 text-[var(--ink)]">
                    {getSummaryText({
                      brand: project.brand,
                      total: totalResults,
                      brandMentions,
                      competitorRisk: competitorRiskScore,
                      confidence: runConfidence
                    })}
                  </p>
                  <p className="text-xs text-[var(--ink-3)]">
                    {totalResults} prompts analizados · {latestCompletedRun.successful_prompts} correctos · {latestCompletedRun.failed_prompts} fallidos · Confianza {confidenceLabels[runConfidence] ?? runConfidence}
                  </p>
                </div>
              </CardContent>
            </Card>
          </section>

          {totalResults < 3 ? (
            <p className="rounded-[10px] border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              Este escaneo usa una muestra pequeña. Interpreta los resultados como direccionales, no concluyentes.
            </p>
          ) : null}

          <section className="space-y-3">
            <div>
              <h2 className="text-lg font-semibold text-[var(--ink)]">Visibilidad de un vistazo</h2>
              <p className="sub mt-1">Señales reales extraídas del último escaneo completado con Gemini.</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {[
                {
                  label: "Visibilidad de marca",
                  value: visibilityScore,
                  suffix: "%",
                  description: "Prompts donde aparece tu marca."
                },
                {
                  label: "Tasa de cita",
                  value: citationScore,
                  suffix: "%",
                  description: "Prompts con fuentes citadas."
                },
                {
                  label: "Riesgo competitivo",
                  value: competitorRiskScore,
                  suffix: "/100",
                  description: getRiskLabel(competitorRiskScore)
                },
                {
                  label: "Confianza",
                  value: confidenceLabels[runConfidence] ?? runConfidence,
                  suffix: "",
                  description: "Fiabilidad de la muestra extraída."
                }
              ].map((metric) => (
                <Card key={metric.label}>
                  <CardContent className="space-y-3 py-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--ink-4)]">{metric.label}</p>
                    <p className="text-3xl font-bold tracking-[-0.03em] text-[var(--ink)]">
                      {metric.value}<span className="ml-1 text-sm font-semibold text-[var(--ink-3)]">{metric.suffix}</span>
                    </p>
                    {typeof metric.value === "number" ? (
                      <div className="h-1.5 overflow-hidden rounded-full bg-[#f1f3f6]">
                        <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${Math.min(100, metric.value)}%` }} />
                      </div>
                    ) : null}
                    <p className="text-xs leading-5 text-[var(--ink-3)]">{metric.description}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
            <p className="text-xs text-[var(--ink-3)]">
              En esta métrica, más alto significa mayor presión competitiva.
            </p>
            {completedRunsCount < 2 ? (
              <p className="text-xs text-[var(--ink-4)]">
                La tendencia estará disponible cuando existan al menos dos escaneos completados.
              </p>
            ) : null}
          </section>

          <section className="grid gap-4 xl:grid-cols-[1.35fr_1fr]">
            <Card>
              <CardHeader>
                <div>
                  <h2 className="font-medium">Resultados destacados por prompt</h2>
                  <p className="sub mt-1">Hasta cinco respuestas del último escaneo completado.</p>
                </div>
              </CardHeader>
              <CardContent>
                {!promptInsights?.length ? (
                  <EmptyState title="No hay resultados por prompt" description="No se han encontrado respuestas completadas para este escaneo." />
                ) : (
                  <div className="space-y-3">
                    {promptInsights.map((result) => {
                      const extracted = result.extracted_json && typeof result.extracted_json === "object"
                        ? (result.extracted_json as {
                            brand?: { evidence?: string[] };
                            competitors?: Array<{ name?: string; mentioned?: boolean }>;
                            summary?: string;
                          })
                        : null;
                      const mentionedCompetitors = (extracted?.competitors ?? [])
                        .filter((competitor) => competitor.mentioned && competitor.name)
                        .map((competitor) => competitor.name as string);
                      const snippet =
                        extracted?.brand?.evidence?.[0] ??
                        extracted?.summary ??
                        result.raw_response_text ??
                        "Sin fragmento disponible.";

                      return (
                        <article key={result.id} className="rounded-[10px] border border-[#e8eaef] p-3">
                          <p className="text-sm font-semibold leading-6 text-[var(--ink)]">{result.prompt_text_snapshot}</p>
                          <div className="mt-2 flex flex-wrap gap-2 text-xs">
                            <span className={`rounded-full px-2 py-1 font-semibold ${result.brand_mentioned ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>
                              Marca: {result.brand_mentioned ? "sí" : "no"}
                            </span>
                            <span className={`rounded-full px-2 py-1 font-semibold ${result.citation_found ? "bg-indigo-50 text-indigo-700" : "bg-slate-100 text-slate-600"}`}>
                              Cita: {result.citation_found ? "sí" : "no"}
                            </span>
                            <span className="rounded-full bg-slate-100 px-2 py-1 font-semibold text-slate-600">
                              Sentimiento: {sentimentLabels[result.sentiment] ?? result.sentiment}
                            </span>
                          </div>
                          <p className="mt-2 text-xs leading-5 text-[var(--ink-3)]">{snippet.slice(0, 220)}</p>
                          <p className="mt-2 text-xs text-[var(--ink-4)]">
                            Competidores: {mentionedCompetitors.length ? mentionedCompetitors.join(", ") : result.mentioned_competitors_count || "ninguno"}
                          </p>
                        </article>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <div>
                  <h2 className="font-medium">Qué hacer primero</h2>
                  <p className="sub mt-1">Acciones priorizadas y respaldadas por evidencia.</p>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {!latestRecommendations?.length ? (
                  <EmptyState title="No hay recomendaciones activas" description="Ninguna regla se ha activado con la evidencia actual." />
                ) : (
                  latestRecommendations.map((recommendation) => {
                    const evidence = recommendation.evidence_json && typeof recommendation.evidence_json === "object"
                      ? (recommendation.evidence_json as { why_this_matters?: string })
                      : {};

                    return (
                      <article key={recommendation.id} className="rounded-[10px] border border-[#e8eaef] p-3">
                        <p className="text-sm font-semibold leading-5 text-[var(--ink)]">
                          #{recommendation.priority_rank} · {recommendation.title}
                        </p>
                        <p className="mt-2 text-xs text-[var(--ink-3)]">
                          Impacto: {recommendation.impact} · Esfuerzo: {recommendation.effort} · Confianza: {recommendation.confidence}
                        </p>
                        {evidence.why_this_matters ? (
                          <p className="mt-2 text-xs leading-5 text-[var(--ink-2)]">
                            <span className="font-semibold">Por qué importa:</span> {evidence.why_this_matters}
                          </p>
                        ) : null}
                      </article>
                    );
                  })
                )}
                <Link
                  className="inline-flex items-center gap-1 text-sm font-semibold text-[var(--accent)]"
                  href={`/dashboard/projects/${projectId}/recommendations`}
                >
                  Ver todas las recomendaciones
                  <Icon name="arrRight" size={14} />
                </Link>
              </CardContent>
            </Card>
          </section>

          <section className="flex justify-end">
            <Link
              className="inline-flex items-center gap-1 text-sm font-semibold text-[var(--ink-3)] hover:text-[var(--accent)]"
              href={`/dashboard/projects/${projectId}/runs/${latestCompletedRun.id}`}
            >
              Ver detalle técnico del escaneo
              <Icon name="arrRight" size={14} />
            </Link>
          </section>
        </>
      ) : (
        <section>
          <Card>
            <CardContent className="space-y-4 py-6">
              <EmptyState
                title={
                  latestCompletedRun
                    ? "No hay puntuaciones disponibles"
                    : prompts?.length
                      ? "Lanza tu primer escaneo"
                      : "Añade tus primeros prompts"
                }
                description={
                  latestCompletedRun
                    ? "El escaneo terminó, pero no se encontraron métricas calculadas. Revisa el detalle técnico del run."
                    : prompts?.length
                      ? "Prepara un escaneo con tus prompts activos para dejar listo el siguiente análisis de visibilidad."
                      : "Necesitas al menos un prompt activo antes de ejecutar el primer análisis."
                }
              />
              {latestCompletedRun ? (
                <Link
                  className="inline-flex text-sm font-semibold text-[var(--accent)]"
                  href={`/dashboard/projects/${projectId}/runs/${latestCompletedRun.id}`}
                >
                  Revisar detalle técnico
                </Link>
              ) : prompts?.length && !activeRun ? (
                <form action={runProjectScan}>
                  <input type="hidden" name="projectId" value={projectId} />
                  <Button type="submit">
                    <Icon name="play" size={14} />
                    Lanzar escaneo
                  </Button>
                </form>
              ) : null}
              {!prompts?.length ? (
                <Link className="inline-flex text-sm font-semibold text-[var(--accent)]" href={`/dashboard/projects/${projectId}/prompts`}>
                  Añadir prompts
                </Link>
              ) : null}
            </CardContent>
          </Card>
        </section>
      )}
        </>
      )}

    </div>
  );
}
