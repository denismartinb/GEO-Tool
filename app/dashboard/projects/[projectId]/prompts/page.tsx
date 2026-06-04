import Link from "next/link";
import { EmptyState } from "@/components/empty-state";
import { Icon } from "@/components/ui/icon";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { requireUser } from "@/lib/auth";
import { requireActiveProject } from "@/lib/project-workspace";

const MAX_PROMPT_RESULTS = 10;

const sentimentLabels: Record<string, string> = {
  positive: "positivo",
  neutral: "neutral",
  negative: "negativo",
  mixed: "mixto",
  unknown: "desconocido"
};

const confidenceLabels: Record<string, string> = {
  low: "baja",
  medium: "media",
  high: "alta"
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

  return (
    <span className={`rounded-full px-2 py-1 text-xs font-semibold ${styles[tone]}`}>
      {children}
    </span>
  );
}

export default async function PromptsPage({
  params
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const project = await requireActiveProject(projectId);
  const { supabase } = await requireUser();

  const [{ data: prompts }, { data: latestCompletedRun }] = await Promise.all([
    supabase
      .from("project_prompts")
      .select("id, prompt_text, category, is_active, sort_order")
      .eq("project_id", projectId)
      .order("is_active", { ascending: false })
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true }),
    supabase
      .from("scan_runs")
      .select("id, status, created_at, finished_at")
      .eq("project_id", projectId)
      .eq("status", "completed")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle()
  ]);

  const { data: promptResults } = latestCompletedRun
    ? await supabase
        .from("scan_prompt_results")
        .select("id, prompt_text_snapshot, raw_response_text, brand_mentioned, citation_found, mentioned_competitors_count, citations_count, sentiment, extracted_json, extraction_error")
        .eq("project_id", projectId)
        .eq("run_id", latestCompletedRun.id)
        .eq("status", "completed")
        .order("created_at", { ascending: true })
        .limit(MAX_PROMPT_RESULTS)
    : { data: null };

  const activePrompts = prompts?.filter((prompt) => prompt.is_active) ?? [];
  const inactivePrompts = prompts?.filter((prompt) => !prompt.is_active) ?? [];
  const brandAbsentCount = promptResults?.filter((result) => !result.brand_mentioned).length ?? 0;
  const citedCount = promptResults?.filter((result) => result.citation_found).length ?? 0;
  const competitorCount = promptResults?.filter((result) => result.mentioned_competitors_count > 0).length ?? 0;
  const extractionErrorCount = promptResults?.filter((result) => result.extraction_error).length ?? 0;
  const latestRunTimestamp = latestCompletedRun
    ? new Date(latestCompletedRun.finished_at ?? latestCompletedRun.created_at).toLocaleString()
    : null;

  return (
    <div className="page space-y-5">
      <section className="space-y-2">
        <p className="kicker">Analizar</p>
        <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">
          <div>
            <h1 className="title-lg">Prompts monitorizados</h1>
            <p className="sub mt-1">
              Define las preguntas que GEO Studio lanza a Gemini para medir si tu marca aparece, si se citan fuentes y qué competidores ganan terreno.
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
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--ink-4)]">Prompts activos</p>
            <p className="mt-1 text-2xl font-bold text-[var(--ink)]">{activePrompts.length}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--ink-4)]">Último escaneo completado</p>
            <p className="mt-1 font-semibold text-[var(--ink)]">
              {latestCompletedRun ? "Completado" : "Sin datos"}
            </p>
            <p className="sub">{latestRunTimestamp ?? "Lanza un escaneo desde la visión general."}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--ink-4)]">Cobertura analizada</p>
            <p className="mt-1 text-2xl font-bold text-[var(--ink)]">{promptResults?.length ?? 0}</p>
            <p className="sub">Resultados del último run</p>
          </div>
        </CardContent>
      </Card>

      <section className="grid gap-3 lg:grid-cols-[1.3fr_0.9fr]">
        <Card>
          <CardHeader>
            <div>
              <h2 className="font-medium">Qué papel juegan los prompts</h2>
              <p className="sub mt-1">Cada prompt representa un escenario real en el que quieres que tu marca sea visible.</p>
            </div>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-[var(--ink-2)]">
            <p>
              Usa prompts claros, comparativos y cercanos a preguntas reales de tus usuarios. Cuanto mejor representen tu mercado,
              más útil será la lectura de visibilidad y competencia.
            </p>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-[10px] border border-[#e8eaef] p-3">
                <p className="font-semibold text-[var(--ink)]">Antes del escaneo</p>
                <p className="mt-1 text-xs leading-5 text-[var(--ink-3)]">Revisa prompts repetidos, demasiado genéricos o alejados de tu propuesta real.</p>
              </div>
              <div className="rounded-[10px] border border-[#e8eaef] p-3">
                <p className="font-semibold text-[var(--ink)]">Durante el análisis</p>
                <p className="mt-1 text-xs leading-5 text-[var(--ink-3)]">Gemini responde a cada prompt y GEO Studio extrae menciones, citas y señales competitivas.</p>
              </div>
              <div className="rounded-[10px] border border-[#e8eaef] p-3">
                <p className="font-semibold text-[var(--ink)]">Después</p>
                <p className="mt-1 text-xs leading-5 text-[var(--ink-3)]">Prioriza los prompts donde tu marca no aparece o donde los competidores dominan la respuesta.</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div>
              <h2 className="font-medium">Siguiente paso recomendado</h2>
              <p className="sub mt-1">Mantén el flujo de trabajo simple y repetible para la beta.</p>
            </div>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-[var(--ink-2)]">
            {!activePrompts.length ? (
              <>
                <p>No hay prompts activos todavía. Empieza por definir de 5 a 10 preguntas que realmente usaría tu cliente ideal.</p>
                <Link
                  className="inline-flex items-center gap-1 text-sm font-semibold text-[var(--accent)]"
                  href={`/dashboard/projects/${projectId}#configuracion-prompts`}
                >
                  Configurar prompts
                  <Icon name="arrRight" size={14} />
                </Link>
              </>
            ) : !latestCompletedRun ? (
              <>
                <p>Tus prompts ya están listos. Revisa que sigan reflejando la intención de búsqueda correcta y lanza el primer escaneo manual.</p>
                <Link
                  className="inline-flex items-center gap-1 text-sm font-semibold text-[var(--accent)]"
                  href={`/dashboard/projects/${projectId}`}
                >
                  Volver a visión general
                  <Icon name="arrRight" size={14} />
                </Link>
              </>
            ) : (
              <>
                <p>Ya tienes resultados recientes. Usa esta pantalla para detectar preguntas débiles y luego revisa Recomendaciones para priorizar acciones.</p>
                <div className="flex flex-wrap gap-3">
                  <Link
                    className="inline-flex items-center gap-1 text-sm font-semibold text-[var(--accent)]"
                    href={`/dashboard/projects/${projectId}/recommendations`}
                  >
                    Ver recomendaciones
                    <Icon name="arrRight" size={14} />
                  </Link>
                  <Link
                    className="inline-flex items-center gap-1 text-sm font-semibold text-[var(--ink-3)] hover:text-[var(--accent)]"
                    href={`/dashboard/projects/${projectId}/runs`}
                  >
                    Ver historial de escaneos
                  </Link>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </section>

      {!activePrompts.length ? (
        <Card>
          <CardContent className="space-y-4 py-5">
            <EmptyState
              title="No hay prompts activos"
              description="Añade prompts monitorizados desde la configuración del proyecto antes de lanzar un análisis. Empieza por preguntas que describan tu categoría, comparen alternativas o busquen una recomendación directa."
            />
            <Link
              className="inline-flex items-center gap-1 text-sm font-semibold text-[var(--accent)]"
              href={`/dashboard/projects/${projectId}#configuracion-prompts`}
            >
              Ir a configuración de prompts
              <Icon name="arrRight" size={14} />
            </Link>
          </CardContent>
        </Card>
      ) : null}

      {!latestCompletedRun && activePrompts.length ? (
        <Card>
          <CardContent className="space-y-4 py-5">
            <EmptyState
              title="Todavía no hay resultados"
              description="Los resultados por prompt aparecerán después de lanzar el primer escaneo real con Gemini. Antes de hacerlo, confirma que tus prompts cubren casos de marca, comparación y decisión."
            />
            <Link
              className="inline-flex items-center gap-1 text-sm font-semibold text-[var(--accent)]"
              href={`/dashboard/projects/${projectId}`}
            >
              Volver a visión general para lanzar el escaneo
              <Icon name="arrRight" size={14} />
            </Link>
          </CardContent>
        </Card>
      ) : latestCompletedRun && !promptResults?.length ? (
        <Card>
          <CardContent className="space-y-4 py-5">
            <EmptyState
              title="No se han encontrado resultados por prompt"
              description="El escaneo está completado, pero no hay respuestas disponibles para esta vista. Revisa el detalle técnico del run para entender qué ha ocurrido."
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
      ) : latestCompletedRun && promptResults?.length ? (
        <>
          <section className="space-y-3">
            <div>
              <h2 className="text-lg font-semibold text-[var(--ink)]">Señales del último escaneo</h2>
              <p className="sub mt-1">Prioriza los prompts donde tu marca está ausente, faltan citas o la extracción necesita revisión.</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {[
                { label: "Resultados", value: promptResults.length },
                { label: "Marca ausente", value: brandAbsentCount },
                { label: "Con citas", value: citedCount },
                { label: "Con competidores", value: competitorCount }
              ].map((metric) => (
                <Card key={metric.label}>
                  <CardContent className="py-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--ink-4)]">{metric.label}</p>
                    <p className="mt-1 text-2xl font-bold text-[var(--ink)]">{metric.value}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
            {extractionErrorCount ? (
              <p className="feedback error">
                {extractionErrorCount} {extractionErrorCount === 1 ? "prompt requiere" : "prompts requieren"} revisión por errores de extracción.
              </p>
            ) : null}
          </section>

          <section className="space-y-3">
            <div>
              <h2 className="text-lg font-semibold text-[var(--ink)]">Lectura prompt a prompt</h2>
              <p className="sub mt-1">Hasta diez respuestas reales del último escaneo completado, resumidas para ayudarte a decidir qué ajustar primero.</p>
            </div>
            {promptResults.map((result) => {
              const extracted = result.extracted_json && typeof result.extracted_json === "object"
                ? (result.extracted_json as {
                    brand?: { evidence?: string[] };
                    competitors?: Array<{ name?: string; mentioned?: boolean }>;
                    citations?: Array<{ domain?: string | null }>;
                    summary?: string;
                    confidence?: string;
                  })
                : null;
              const competitors = (extracted?.competitors ?? [])
                .filter((competitor) => competitor.mentioned && competitor.name)
                .map((competitor) => competitor.name as string);
              const citationDomains = (extracted?.citations ?? [])
                .map((citation) => citation.domain)
                .filter((domain): domain is string => Boolean(domain));
              const snippet =
                extracted?.summary ??
                extracted?.brand?.evidence?.[0] ??
                result.raw_response_text ??
                "Sin fragmento disponible.";
              const requiresReview = !result.brand_mentioned || Boolean(result.extraction_error);

              return (
                <Card key={result.id}>
                  <CardContent className="space-y-3 py-4">
                    <div className="flex flex-col justify-between gap-2 md:flex-row md:items-start">
                      <p className="max-w-4xl text-sm font-semibold leading-6 text-[var(--ink)]">
                        {result.prompt_text_snapshot}
                      </p>
                      {requiresReview ? <Badge tone="warn">Revisar</Badge> : <Badge tone="good">Estable</Badge>}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Badge tone={result.brand_mentioned ? "good" : "warn"}>
                        {result.brand_mentioned ? "Marca visible" : "Marca ausente"}
                      </Badge>
                      <Badge tone={result.citation_found ? "info" : "neutral"}>
                        {result.citation_found ? "Con citas" : "Sin citas"}
                      </Badge>
                      {result.mentioned_competitors_count > 0 ? (
                        <Badge tone="warn">Competidores detectados</Badge>
                      ) : null}
                      <Badge>Sentimiento: {sentimentLabels[result.sentiment] ?? result.sentiment}</Badge>
                      <Badge>
                        Confianza: {confidenceLabels[extracted?.confidence ?? ""] ?? extracted?.confidence ?? "desconocida"}
                      </Badge>
                    </div>
                    <p className="text-sm leading-6 text-[var(--ink-2)]">{snippet.slice(0, 280)}</p>
                    <div className="space-y-1 text-xs text-[var(--ink-3)]">
                      <p>
                        Competidores: {competitors.length ? competitors.join(", ") : result.mentioned_competitors_count || "ninguno"}
                      </p>
                      <p>
                        Citas: {result.citations_count}{citationDomains.length ? ` · ${citationDomains.slice(0, 3).join(", ")}` : ""}
                      </p>
                    </div>
                    {result.extraction_error ? (
                      <p className="feedback error">Error de extracción: {result.extraction_error}</p>
                    ) : null}
                  </CardContent>
                </Card>
              );
            })}
          </section>

          <section className="flex flex-wrap gap-4">
            <Link
              className="inline-flex items-center gap-1 text-sm font-semibold text-[var(--accent)]"
              href={`/dashboard/projects/${projectId}/recommendations`}
            >
              Ver recomendaciones relacionadas
              <Icon name="arrRight" size={14} />
            </Link>
            <Link
              className="inline-flex items-center gap-1 text-sm font-semibold text-[var(--ink-3)] hover:text-[var(--accent)]"
              href={`/dashboard/projects/${projectId}/runs/${latestCompletedRun.id}`}
            >
              Ver detalle técnico del escaneo
            </Link>
          </section>
        </>
      ) : null}

      <section className="space-y-3 pt-2">
        <div>
          <p className="kicker">Configuración</p>
          <h2 className="mt-1 text-lg font-semibold text-[var(--ink)]">Prompts configurados</h2>
          <p className="sub mt-1">Gestiona altas, categorías y desactivaciones desde la configuración central del proyecto.</p>
        </div>
        <Card>
          <CardHeader>
            <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
              <p className="font-medium">Inventario monitorizado</p>
              <Link
                className="inline-flex items-center gap-1 text-sm font-semibold text-[var(--accent)]"
                href={`/dashboard/projects/${projectId}#configuracion-prompts`}
              >
                Gestionar prompts
                <Icon name="arrRight" size={14} />
              </Link>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {!prompts?.length ? (
              <EmptyState title="No hay prompts configurados" description="Añade tus primeros prompts desde la configuración del proyecto." />
            ) : (
              <>
                <div className="space-y-2">
                  {activePrompts.map((prompt) => (
                    <div key={prompt.id} className="rounded-[10px] border border-[#e8eaef] p-3">
                      <p className="text-sm font-medium leading-6 text-[var(--ink)]">{prompt.prompt_text}</p>
                      <p className="sub mt-1">{prompt.category || "Sin categoría"} · activo</p>
                    </div>
                  ))}
                </div>
                {inactivePrompts.length ? (
                  <p className="text-xs text-[var(--ink-3)]">
                    {inactivePrompts.length} {inactivePrompts.length === 1 ? "prompt inactivo permanece" : "prompts inactivos permanecen"} fuera de los próximos escaneos.
                  </p>
                ) : null}
              </>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
