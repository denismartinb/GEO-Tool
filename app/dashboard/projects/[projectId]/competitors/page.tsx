import type { ReactNode } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/empty-state";
import { Icon } from "@/components/ui/icon";
import { requireUser } from "@/lib/auth";
import { requireActiveProject } from "@/lib/project-workspace";

const MAX_PROMPT_EXAMPLES = 10;

type CompetitorSignal = {
  name: string;
  mentionCount: number;
  prompts: Array<{ text: string; snippet: string }>;
  evidence: string[];
  configured: boolean;
};

function normalize(value: string) {
  return value.trim().toLowerCase();
}

function Badge({
  children,
  tone = "neutral"
}: {
  children: ReactNode;
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

function getSnippet(raw: string | null, evidence: string[]) {
  return evidence[0] ?? raw ?? "Sin fragmento disponible.";
}

export default async function CompetitorsPage({
  params
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const project = await requireActiveProject(projectId);
  const { supabase } = await requireUser();

  const [{ data: competitors }, { data: latestCompletedRun }] = await Promise.all([
    supabase
      .from("project_competitors")
      .select("id, name, domain, is_active, created_at")
      .eq("project_id", projectId)
      .order("is_active", { ascending: false })
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

  const [{ data: promptResults }, { data: runScore }] = latestCompletedRun
    ? await Promise.all([
        supabase
          .from("scan_prompt_results")
          .select("id, prompt_text_snapshot, raw_response_text, mentioned_competitors_count, extracted_json")
          .eq("project_id", projectId)
          .eq("run_id", latestCompletedRun.id)
          .eq("status", "completed")
          .order("created_at", { ascending: true })
          .limit(MAX_PROMPT_EXAMPLES),
        supabase
          .from("run_scores")
          .select("competitor_gap_score, confidence")
          .eq("project_id", projectId)
          .eq("run_id", latestCompletedRun.id)
          .maybeSingle()
      ])
    : [{ data: null }, { data: null }];

  const configuredCompetitors = competitors ?? [];
  const activeCompetitors = configuredCompetitors.filter((competitor) => competitor.is_active);
  const inactiveCompetitors = configuredCompetitors.filter((competitor) => !competitor.is_active);
  const configuredKeys = new Set(
    configuredCompetitors.flatMap((competitor) => [normalize(competitor.name), normalize(competitor.domain)])
  );
  const signalMap = new Map<string, CompetitorSignal>();
  let promptsWithCompetitors = 0;
  let totalMentionedCompetitors = 0;

  for (const result of promptResults ?? []) {
    if (result.mentioned_competitors_count > 0) promptsWithCompetitors += 1;
    totalMentionedCompetitors += Math.max(0, result.mentioned_competitors_count ?? 0);

    const extracted = result.extracted_json && typeof result.extracted_json === "object"
      ? (result.extracted_json as {
          competitors?: Array<{ name?: string; mentioned?: boolean; evidence?: string[] }>;
        })
      : null;

    for (const competitor of extracted?.competitors ?? []) {
      if (!competitor.mentioned || !competitor.name) continue;

      const name = competitor.name.trim();
      const key = normalize(name);
      const evidence = (competitor.evidence ?? []).filter(Boolean);
      const existing = signalMap.get(key) ?? {
        name,
        mentionCount: 0,
        prompts: [],
        evidence: [],
        configured: configuredKeys.has(key)
      };

      existing.mentionCount += 1;
      existing.prompts.push({
        text: result.prompt_text_snapshot,
        snippet: getSnippet(result.raw_response_text, evidence).slice(0, 220)
      });
      existing.evidence.push(...evidence.slice(0, 2));
      signalMap.set(key, existing);
    }
  }

  const detectedCompetitors = Array.from(signalMap.values()).sort((a, b) => b.mentionCount - a.mentionCount);
  const totalAnalyzedPrompts = promptResults?.length ?? 0;

  return (
    <div className="page space-y-5">
      <section className="space-y-2">
        <p className="kicker">Analizar</p>
        <div className="flex flex-col justify-between gap-3 md:flex-row md:items-start">
          <div>
            <h1 className="title-lg">Competidores</h1>
            <p className="sub mt-1">
              Revisa qué competidores aparecen en las respuestas de Gemini y en qué prompts están ganando visibilidad.
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
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--ink-4)]">Competidores activos</p>
            <p className="mt-1 text-2xl font-bold text-[var(--ink)]">{activeCompetitors.length}</p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--ink-4)]">Último escaneo completado</p>
            <p className="mt-1 font-semibold text-[var(--ink)]">{latestCompletedRun ? "Completado" : "Sin datos"}</p>
            <p className="sub">
              {latestCompletedRun
                ? new Date(latestCompletedRun.finished_at ?? latestCompletedRun.created_at).toLocaleString()
                : "Lanza un escaneo desde la visión general."}
            </p>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--ink-4)]">Riesgo competitivo</p>
            <p className="mt-1 text-2xl font-bold text-[var(--ink)]">
              {runScore?.competitor_gap_score ?? "-"}
            </p>
            <p className="sub">Más alto implica mayor presión.</p>
          </div>
        </CardContent>
      </Card>

      {!configuredCompetitors.length ? (
        <Card>
          <CardContent className="space-y-4 py-5">
            <EmptyState
              title="No hay competidores configurados"
              description="Añadir competidores mejora el análisis competitivo, pero no bloquea el primer escaneo."
            />
            <Link
              className="inline-flex items-center gap-1 text-sm font-semibold text-[var(--accent)]"
              href={`/dashboard/projects/${projectId}#configuracion-prompts`}
            >
              Ir a configuración del proyecto
              <Icon name="arrRight" size={14} />
            </Link>
          </CardContent>
        </Card>
      ) : null}

      {!latestCompletedRun && configuredCompetitors.length ? (
        <Card>
          <CardContent className="space-y-4 py-5">
            <EmptyState
              title="Todavía no hay señales competitivas"
              description="Las menciones de competidores aparecerán después de completar el primer escaneo real con Gemini."
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
      ) : null}

      {latestCompletedRun ? (
        <section className="space-y-3">
          <div>
            <h2 className="text-lg font-semibold text-[var(--ink)]">Señales competitivas del último escaneo</h2>
            <p className="sub mt-1">Resumen determinista a partir de las respuestas estructuradas de Gemini.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { label: "Prompts analizados", value: totalAnalyzedPrompts },
              { label: "Prompts con competidores", value: promptsWithCompetitors },
              { label: "Competidores detectados", value: detectedCompetitors.length },
              { label: "Menciones totales", value: totalMentionedCompetitors }
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
      ) : null}

      {latestCompletedRun && !detectedCompetitors.length ? (
        <Card>
          <CardContent className="space-y-4 py-5">
            <EmptyState
              title="No se detectaron menciones de competidores"
              description="Ningún competidor apareció en los resultados analizados. Revisa si los prompts son suficientemente comparativos o si falta ajustar la lista de competidores."
            />
            <Link
              className="inline-flex items-center gap-1 text-sm font-semibold text-[var(--accent)]"
              href={`/dashboard/projects/${projectId}/prompts`}
            >
              Ver prompts
              <Icon name="arrRight" size={14} />
            </Link>
          </CardContent>
        </Card>
      ) : null}

      {detectedCompetitors.length ? (
        <section className="space-y-3">
          <div>
            <h2 className="text-lg font-semibold text-[var(--ink)]">Competidores detectados</h2>
            <p className="sub mt-1">No se añaden automáticamente a tu configuración; revísalos antes de actuar.</p>
          </div>
          {detectedCompetitors.map((competitor) => {
            const highPresence =
              competitor.mentionCount >= 2 ||
              (totalAnalyzedPrompts <= 3 && totalAnalyzedPrompts > 0 && competitor.mentionCount === totalAnalyzedPrompts);

            return (
              <Card key={competitor.name}>
                <CardContent className="space-y-3 py-4">
                  <div className="flex flex-col justify-between gap-2 md:flex-row md:items-start">
                    <div>
                      <h3 className="text-lg font-semibold text-[var(--ink)]">{competitor.name}</h3>
                      <p className="sub mt-1">{competitor.mentionCount} {competitor.mentionCount === 1 ? "prompt mencionado" : "prompts mencionados"}</p>
                    </div>
                    <div className="flex flex-wrap gap-2 md:justify-end">
                      <Badge tone={competitor.configured ? "good" : "warn"}>
                        {competitor.configured ? "Competidor configurado" : "Competidor no configurado"}
                      </Badge>
                      <Badge tone="info">Competidor detectado</Badge>
                      {highPresence ? <Badge tone="warn">Alta presencia</Badge> : null}
                    </div>
                  </div>
                  {competitor.evidence.length ? (
                    <div className="rounded-[10px] border border-[#e8eaef] bg-[#fbfbfd] p-3 text-sm text-[var(--ink-2)]">
                      <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--ink-4)]">Evidencia</p>
                      <ul className="mt-1 space-y-1">
                        {competitor.evidence.slice(0, 3).map((item) => <li key={item}>· {item}</li>)}
                      </ul>
                    </div>
                  ) : null}
                  <div className="space-y-2 text-sm text-[var(--ink-2)]">
                    <p className="font-semibold text-[var(--ink)]">Prompts donde aparece</p>
                    {competitor.prompts.slice(0, 3).map((prompt) => (
                      <div key={`${competitor.name}-${prompt.text}`} className="rounded-[10px] border border-[#e8eaef] p-3">
                        <p className="font-medium leading-6 text-[var(--ink)]">{prompt.text}</p>
                        <p className="mt-1 text-xs leading-5 text-[var(--ink-3)]">{prompt.snippet}</p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </section>
      ) : null}

      <section className="space-y-3 pt-2">
        <div>
          <p className="kicker">Configuración</p>
          <h2 className="mt-1 text-lg font-semibold text-[var(--ink)]">Competidores configurados</h2>
          <p className="sub mt-1">Gestiona altas, cambios y desactivaciones desde la configuración central del proyecto.</p>
        </div>
        <Card>
          <CardHeader>
            <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
              <p className="font-medium">Inventario competitivo</p>
              <Link
                className="inline-flex items-center gap-1 text-sm font-semibold text-[var(--accent)]"
                href={`/dashboard/projects/${projectId}#configuracion-prompts`}
              >
                Gestionar competidores
                <Icon name="arrRight" size={14} />
              </Link>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {!configuredCompetitors.length ? (
              <EmptyState title="No hay competidores configurados" description="Añade competidores manualmente desde la configuración del proyecto." />
            ) : (
              <>
                <div className="space-y-2">
                  {activeCompetitors.map((competitor) => {
                    const mentions = signalMap.get(normalize(competitor.name))?.mentionCount ?? signalMap.get(normalize(competitor.domain))?.mentionCount ?? 0;

                    return (
                      <div key={competitor.id} className="flex flex-col justify-between gap-2 rounded-[10px] border border-[#e8eaef] p-3 sm:flex-row sm:items-center">
                        <div>
                          <p className="text-sm font-medium leading-6 text-[var(--ink)]">{competitor.name}</p>
                          <p className="sub">{competitor.domain} · activo · creado {new Date(competitor.created_at).toLocaleDateString()}</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Badge tone={mentions ? "info" : "neutral"}>
                            {mentions ? `${mentions} menciones` : "Sin menciones"}
                          </Badge>
                          <Badge tone="good">Competidor configurado</Badge>
                        </div>
                      </div>
                    );
                  })}
                </div>
                {inactiveCompetitors.length ? (
                  <div className="space-y-2 border-t border-[#e8eaef] pt-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[var(--ink-4)]">Inactivos</p>
                    {inactiveCompetitors.map((competitor) => (
                      <div key={competitor.id} className="rounded-[10px] border border-[#e8eaef] p-3">
                        <p className="text-sm font-medium leading-6 text-[var(--ink)]">{competitor.name}</p>
                        <p className="sub">{competitor.domain} · inactivo</p>
                      </div>
                    ))}
                  </div>
                ) : null}
              </>
            )}
          </CardContent>
        </Card>
      </section>

      <section className="flex flex-wrap gap-4">
        <Link className="inline-flex items-center gap-1 text-sm font-semibold text-[var(--ink-3)] hover:text-[var(--accent)]" href={`/dashboard/projects/${projectId}`}>
          Volver a visión general
        </Link>
        <Link className="inline-flex items-center gap-1 text-sm font-semibold text-[var(--ink-3)] hover:text-[var(--accent)]" href={`/dashboard/projects/${projectId}/prompts`}>
          Ver prompts
        </Link>
        {latestCompletedRun ? (
          <Link className="inline-flex items-center gap-1 text-sm font-semibold text-[var(--ink-3)] hover:text-[var(--accent)]" href={`/dashboard/projects/${projectId}/runs/${latestCompletedRun.id}`}>
            Ver detalle técnico del escaneo
            <Icon name="arrRight" size={14} />
          </Link>
        ) : null}
      </section>
    </div>
  );
}
