import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { executeScan } from "../../actions";

const statusLabels: Record<string, string> = {
  pending: "pendiente",
  running: "en curso",
  retrying: "reintentando",
  completed: "completado",
  failed: "fallido",
  cancelled: "cancelado"
};

function formatStatus(status: string) {
  return statusLabels[status] ?? status;
}

export default async function RunDetailPage({
  params,
  searchParams
}: {
  params: Promise<{ projectId: string; runId: string }>;
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const { projectId, runId } = await params;
  const feedback = await searchParams;
  const runIdValidation = z.string().uuid().safeParse(runId);
  if (!runIdValidation.success) notFound();

  const { supabase } = await requireUser();

  const { data: run } = await supabase
    .from("scan_runs")
    .select("id, project_id, status, error_summary, total_prompts, successful_prompts, failed_prompts, extraction_version, scoring_version, created_at, started_at, finished_at")
    .eq("id", runId)
    .eq("project_id", projectId)
    .single();

  if (!run) notFound();

  const { data: jobs } = await supabase
    .from("jobs")
    .select("id, job_type, status, attempt_count, max_attempts, created_at")
    .eq("run_id", runId)
    .eq("project_id", projectId)
    .order("created_at", { ascending: true });

  const [{ data: promptResults }, { data: score }, { data: recommendations }] = await Promise.all([
    supabase
      .from("scan_prompt_results")
      .select("id, prompt_text_snapshot, status, brand_mentioned, citation_found, mentioned_competitors_count, citations_count, sentiment, extracted_json")
      .eq("run_id", runId)
      .eq("project_id", projectId)
      .order("created_at", { ascending: true }),
    supabase
      .from("run_scores")
      .select("visibility_score, citation_score, competitor_gap_score, confidence, scoring_version")
      .eq("run_id", runId)
      .eq("project_id", projectId)
      .maybeSingle(),
    supabase
      .from("recommendations")
      .select("id, priority_rank, title, description, recommendation_type, impact, effort, confidence, evidence_json")
      .eq("run_id", runId)
      .eq("project_id", projectId)
      .eq("status", "active")
      .order("priority_rank", { ascending: true })
  ]);

  return (
    <div className="page space-y-4">
      <p className="kicker">Escaneos</p>
      <div className="flex items-center justify-between gap-3">
        <h1 className="title-lg">Detalle técnico del escaneo</h1>
        <Link href={`/dashboard/projects/${projectId}`} className="inline-flex items-center gap-1 text-sm font-semibold text-[var(--ink-2)]">
          <Icon name="chevronLeft" size={14} />
          Volver al proyecto
        </Link>
      </div>
      {feedback.error ? <p className="feedback error">{feedback.error}</p> : null}
      {feedback.success ? <p className="feedback success">{feedback.success}</p> : null}
      {run.status === "failed" && run.error_summary ? (
        <p className="feedback error">El escaneo de Gemini ha fallado: {run.error_summary}</p>
      ) : null}

      <Card>
        <CardHeader><h2 className="font-medium">Metadatos del escaneo</h2></CardHeader>
        <CardContent className="space-y-1 text-sm text-[var(--ink-2)]">
          <p>Estado: {formatStatus(run.status)}</p>
          <p>Prompts totales: {run.total_prompts}</p>
          <p>Prompts correctos: {run.successful_prompts}</p>
          <p>Prompts fallidos: {run.failed_prompts}</p>
          <p>Versión de extracción: {run.extraction_version}</p>
          <p>Versión de puntuación: {run.scoring_version}</p>
          <p>Creado: {new Date(run.created_at).toLocaleString()}</p>
          <p>Inicio: {run.started_at ? new Date(run.started_at).toLocaleString() : "-"}</p>
          <p>Fin: {run.finished_at ? new Date(run.finished_at).toLocaleString() : "-"}</p>
          {run.status === "pending" ? (
            <form action={executeScan} className="pt-2">
              <input type="hidden" name="projectId" value={projectId} />
              <input type="hidden" name="runId" value={runId} />
              <Button type="submit">Ejecutar manualmente este escaneo</Button>
            </form>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><h2 className="font-medium">Jobs técnicos</h2></CardHeader>
        <CardContent>
          {!jobs?.length ? (
            <EmptyState title="No se han encontrado jobs" description="Los jobs se crean al preparar un escaneo." />
          ) : (
            <div className="space-y-2">
              {jobs.map((job) => (
                <div key={job.id} className="rounded border p-3 text-sm text-[var(--ink-2)]">
                  <p className="font-medium">{job.job_type} · {formatStatus(job.status)}</p>
                  <p>Intentos: {job.attempt_count}/{job.max_attempts}</p>
                  <p>Creado: {new Date(job.created_at).toLocaleString()}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><h2 className="font-medium">Resultados por prompt</h2></CardHeader>
        <CardContent>
          {!promptResults?.length ? (
            <EmptyState title="Todavía no hay resultados" description="Ejecuta Gemini para recoger respuestas reales." />
          ) : (
            <div className="space-y-2">
              {promptResults.map((result, idx) => (
                <div key={result.id} className="rounded border p-3 text-sm text-[var(--ink-2)]">
                  <p className="font-medium">Prompt {idx + 1} · {formatStatus(result.status)}</p>
                  <p>{result.prompt_text_snapshot}</p>
                  <p>
                    Marca mencionada: {result.brand_mentioned ? "sí" : "no"} · Cita encontrada:{" "}
                    {result.citation_found ? "sí" : "no"}
                  </p>
                  <p>
                    Competidores mencionados: {result.mentioned_competitors_count} · Citas: {result.citations_count} · Sentimiento:{" "}
                    {result.sentiment}
                  </p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><h2 className="font-medium">Puntuaciones</h2></CardHeader>
        <CardContent>
          {!score ? (
            <EmptyState title="Todavía no hay puntuaciones" description="Las puntuaciones aparecerán tras completar la extracción estructurada." />
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded border p-3 text-sm text-[var(--ink-2)]">
                <p className="font-medium">Visibilidad: {score.visibility_score}</p>
                <p>Presencia de la marca en los prompts.</p>
              </div>
              <div className="rounded border p-3 text-sm text-[var(--ink-2)]">
                <p className="font-medium">Citas: {score.citation_score}</p>
                <p>Respuestas de IA con fuentes citadas o referenciadas.</p>
              </div>
              <div className="rounded border p-3 text-sm text-[var(--ink-2)]">
                <p className="font-medium">Brecha competitiva: {score.competitor_gap_score}</p>
                <p>Presencia de competidores frente a la marca: cuanto mayor, peor.</p>
              </div>
              <div className="rounded border p-3 text-sm text-[var(--ink-2)]">
                <p className="font-medium">Confianza: {score.confidence}</p>
                <p>Fiabilidad del volumen y la calidad de los datos extraídos.</p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><h2 className="font-medium">Evidencia de extracción</h2></CardHeader>
        <CardContent>
          {!promptResults?.length ? (
            <EmptyState title="Todavía no hay evidencia" description="La evidencia aparecerá tras completar la extracción estructurada." />
          ) : (
            <div className="space-y-2">
              {promptResults.map((result) => {
                const extracted = result.extracted_json && typeof result.extracted_json === "object"
                  ? (result.extracted_json as {
                      brand?: { evidence?: string[] };
                      citations?: Array<{ domain?: string | null }>;
                      competitors?: Array<{ name?: string; mentioned?: boolean }>;
                      confidence?: string;
                    })
                  : null;
                const brandEvidence = extracted?.brand?.evidence ?? [];
                const citationDomains = (extracted?.citations ?? [])
                  .map((item) => item.domain)
                  .filter((domain): domain is string => Boolean(domain));
                const competitorNames = (extracted?.competitors ?? [])
                  .filter((item) => item.mentioned)
                  .map((item) => item.name)
                  .filter((name): name is string => Boolean(name));

                return (
                  <div key={result.id} className="rounded border p-3 text-sm text-[var(--ink-2)]">
                    <p className="font-medium">{result.prompt_text_snapshot}</p>
                    <p>Evidencia de marca: {brandEvidence.length ? brandEvidence.slice(0, 2).join(" | ") : "-"}</p>
                    <p>Dominios citados: {citationDomains.length ? citationDomains.slice(0, 3).join(", ") : "-"}</p>
                    <p>Competidores mencionados: {competitorNames.length ? competitorNames.join(", ") : "-"}</p>
                    <p>Confianza de extracción: {extracted?.confidence ?? "desconocida"}</p>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><h2 className="font-medium">Recomendaciones</h2></CardHeader>
        <CardContent>
          <p className="mb-3 text-xs text-[var(--ink-2)]">Las recomendaciones se basan en reglas y en la evidencia extraída del escaneo.</p>
          {!recommendations?.length ? (
            <EmptyState title="Todavía no hay recomendaciones" description="Ninguna regla se ha activado con la evidencia actual." />
          ) : (
            <div className="space-y-2">
              {recommendations.map((rec) => {
                const evidence = rec.evidence_json && typeof rec.evidence_json === "object"
                  ? (rec.evidence_json as {
                      why_this_matters?: string;
                      affected_prompts?: string[];
                      evidence_snippets?: string[];
                      mentioned_competitors?: string[];
                      citation_domains?: string[];
                    })
                  : {};
                const affectedPrompts = evidence.affected_prompts ?? [];
                const snippets = evidence.evidence_snippets ?? [];
                const mentionedCompetitors = evidence.mentioned_competitors ?? [];
                const citationDomains = evidence.citation_domains ?? [];

                return (
                  <div key={rec.id} className="rounded border p-3 text-sm text-[var(--ink-2)]">
                    <p className="font-medium">
                      #{rec.priority_rank} · {rec.title}
                    </p>
                    <p>{rec.description}</p>
                    {evidence.why_this_matters ? (
                      <p className="mt-1 text-xs text-[var(--ink-3)]">
                        <span className="font-semibold">Por qué importa:</span> {evidence.why_this_matters}
                      </p>
                    ) : null}
                    <p className="mt-2">Tipo: {rec.recommendation_type} · Impacto: {rec.impact} · Esfuerzo: {rec.effort} · Confianza: {rec.confidence}</p>
                    <div className="mt-2 space-y-1 text-xs text-[var(--ink-3)]">
                      <p>Evidencia: {affectedPrompts.length} prompts afectados</p>
                      {affectedPrompts.length ? <p>Ejemplos de prompts: {affectedPrompts.slice(0, 2).join(" | ")}</p> : null}
                      {snippets.length ? <p>Fragmentos de evidencia: {snippets.slice(0, 2).join(" | ")}</p> : null}
                      {mentionedCompetitors.length ? <p>Competidores: {mentionedCompetitors.slice(0, 3).join(", ")}</p> : null}
                      {citationDomains.length ? <p>Dominios: {citationDomains.slice(0, 3).join(", ")}</p> : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
