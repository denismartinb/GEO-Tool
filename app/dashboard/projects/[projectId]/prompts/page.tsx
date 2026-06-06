import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { requireActiveProject } from "@/lib/project-workspace";
import { PromptsClient } from "./prompts-client";

export type ResultRow = {
  id: string;
  prompt_id: string | null;
  prompt_text_snapshot: string | null;
  brand_mentioned: boolean | null;
  citation_found: boolean | null;
  mentioned_competitors_count: number | null;
  citations_count: number | null;
  sentiment: string | null;
  confidence: string | null;
  raw_response_text: string | null;
  extracted_json: unknown;
  extraction_error: string | null;
  category: string | null;
};

export type TopicGroup = {
  category: string;
  results: ResultRow[];
  visibilidad: number;
  menciones: number;
};

export default async function PromptsPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const project = await requireActiveProject(projectId);
  const { supabase } = await requireUser();

  // 1. Último run completado
  const { data: latestRun } = await supabase
    .from("scan_runs")
    .select("id, status, created_at, finished_at")
    .eq("project_id", projectId)
    .eq("status", "completed")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // 2. Prompts configurados (para category + is_active)
  const { data: projectPrompts } = await supabase
    .from("project_prompts")
    .select("id, prompt_text, category, is_active")
    .eq("project_id", projectId)
    .eq("is_active", true);

  // 3. Resultados del último run
  const { data: rawResults } = latestRun
    ? await supabase
        .from("scan_prompt_results")
        .select(
          "id, prompt_id, prompt_text_snapshot, brand_mentioned, citation_found, mentioned_competitors_count, citations_count, sentiment, confidence, raw_response_text, extracted_json, extraction_error"
        )
        .eq("project_id", projectId)
        .eq("run_id", latestRun.id)
    : { data: [] };

  // 4. Competidores configurados
  const { data: configuredCompetitors } = await supabase
    .from("project_competitors")
    .select("id, name, domain")
    .eq("project_id", projectId)
    .eq("is_active", true);

  // Enriquecer resultados con category (join en JS)
  const promptCategoryMap = new Map(
    (projectPrompts ?? []).map((p) => [p.id, p.category as string | null])
  );

  const results: ResultRow[] = (rawResults ?? []).map((r) => ({
    ...r,
    category: promptCategoryMap.get(r.prompt_id ?? "") ?? null,
  }));

  // Lógica de Topics
  const distinctCategories = [
    ...new Set(
      results
        .map((r) => r.category)
        .filter((c): c is string => c !== null && c.trim() !== "")
    ),
  ];
  const hasTopics = distinctCategories.length >= 2;

  // Sort: brand-absent first en modo flat
  const sortedResults = [...results].sort((a, b) => {
    if (a.brand_mentioned === b.brand_mentioned) return 0;
    return a.brand_mentioned ? 1 : -1;
  });

  // Topics con agregados
  const topicGroups: TopicGroup[] = hasTopics
    ? distinctCategories
        .map((cat) => {
          const catResults = results.filter((r) => r.category === cat);
          const menciones = catResults.filter((r) => r.brand_mentioned).length;
          const visibilidad =
            catResults.length > 0
              ? Math.round((menciones / catResults.length) * 100)
              : 0;
          return { category: cat, results: catResults, visibilidad, menciones };
        })
        .sort((a, b) => b.visibilidad - a.visibilidad)
    : [];

  const totalPrompts = projectPrompts?.length ?? 0;
  const totalTopics = distinctCategories.length;

  const hasActivePrompts = (projectPrompts?.length ?? 0) > 0;
  const hasCompletedRun = latestRun !== null;
  const hasResults = results.length > 0;

  return (
    <div className="page" style={{ paddingTop: 0 }}>
      <header className="ov-sticky-header">
        <div className="ov-sticky-left">
          <p style={{ fontSize: 12, color: "var(--ink-4)", fontWeight: 600 }}>
            {project.name} · {project.domain}
          </p>
          <h1
            style={{
              fontSize: 18,
              fontWeight: 760,
              color: "var(--ink)",
              marginTop: 2,
            }}
          >
            Prompts
          </h1>
        </div>
        <div className="ov-sticky-right">
          {latestRun && (
            <span className="badge badge-pos" style={{ fontSize: 11 }}>
              Escaneado{" "}
              {new Date(
                latestRun.finished_at ?? latestRun.created_at
              ).toLocaleDateString("es-ES", {
                day: "numeric",
                month: "short",
                year: "numeric",
              })}
            </span>
          )}
        </div>
      </header>

      <div style={{ paddingTop: 20 }}>
        {!hasActivePrompts ? (
          <div
            className="card"
            style={{ padding: "32px 24px", textAlign: "center" }}
          >
            <p
              style={{
                fontSize: 15,
                fontWeight: 700,
                color: "var(--ink)",
                marginBottom: 8,
              }}
            >
              No hay prompts activos
            </p>
            <p
              style={{ fontSize: 13, color: "var(--ink-3)", marginBottom: 16 }}
            >
              Añade prompts desde la configuración del proyecto antes de lanzar
              un análisis.
            </p>
            <Link
              href={`/dashboard/projects/${projectId}`}
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: "var(--accent)",
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              Volver a visión general →
            </Link>
          </div>
        ) : !hasCompletedRun ? (
          <div
            className="card"
            style={{ padding: "32px 24px", textAlign: "center" }}
          >
            <p
              style={{
                fontSize: 15,
                fontWeight: 700,
                color: "var(--ink)",
                marginBottom: 8,
              }}
            >
              Todavía no hay resultados
            </p>
            <p
              style={{ fontSize: 13, color: "var(--ink-3)", marginBottom: 16 }}
            >
              Los resultados aparecerán después de lanzar el primer escaneo con
              Gemini.
            </p>
            <Link
              href={`/dashboard/projects/${projectId}`}
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: "var(--accent)",
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              Ir a visión general para lanzar el escaneo →
            </Link>
          </div>
        ) : !hasResults ? (
          <div
            className="card"
            style={{ padding: "32px 24px", textAlign: "center" }}
          >
            <p
              style={{
                fontSize: 15,
                fontWeight: 700,
                color: "var(--ink)",
                marginBottom: 8,
              }}
            >
              Sin resultados disponibles
            </p>
            <p
              style={{ fontSize: 13, color: "var(--ink-3)", marginBottom: 16 }}
            >
              El escaneo está completado pero no hay respuestas disponibles.
            </p>
            <Link
              href={`/dashboard/projects/${projectId}`}
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: "var(--accent)",
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              Volver a visión general →
            </Link>
          </div>
        ) : (
          <PromptsClient
            results={sortedResults}
            hasTopics={hasTopics}
            topicGroups={topicGroups}
            competitors={configuredCompetitors ?? []}
            totalPrompts={totalPrompts}
            totalTopics={totalTopics}
          />
        )}
      </div>
    </div>
  );
}
