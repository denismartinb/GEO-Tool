import Link from "next/link";
import { Icon } from "@/components/ui/icon";
import { requireUser } from "@/lib/auth";
import { getPlanForUser } from "@/lib/billing";
import { feedbackErrorMessages } from "@/lib/projects/feedback-messages";
import { requireActiveProject } from "@/lib/project-workspace";
import { withAnalysisProgress } from "@/lib/scan/active-run-progress";
import { ScanInProgress } from "@/components/scan-in-progress";
import { ScanStatePill } from "@/components/scan-state-pill";
import { PromptsClient } from "./prompts-client";
import { AddPromptsButton } from "./add-prompts-button";

export type ResultRow = {
  id: string;
  prompt_id: string | null;
  prompt_text_snapshot: string | null;
  brand_mentioned: boolean | null;
  citation_found: boolean | null;
  mentioned_competitors_count: number | null;
  citations_count: number | null;
  sentiment: string | null;
  raw_response_text: string | null;
  extracted_json: unknown;
  extraction_error: string | null;
  category: string | null;
  provider: string | null;
};

export type TopicGroup = {
  category: string;
  results: ResultRow[];
  visibilidad: number;
  menciones: number;
  citasTotal: number;
  sentimentDominant: string | null;
};

type ExtractedJson = {
  competitors?: Array<{ name?: string; mentioned?: boolean }>;
};

function parseExt(raw: unknown): ExtractedJson {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return raw as ExtractedJson;
}

function normKey(name: string): string {
  return name.trim().toLowerCase();
}

export default async function PromptsPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ competitor?: string; promptsAdded?: string; scanLaunched?: string; scanWarning?: string }>;
}) {
  const { projectId } = await params;
  const { competitor, promptsAdded, scanLaunched, scanWarning } = await searchParams;
  const competitorFilter = competitor?.trim() || null;

  const promptsAddedCount = promptsAdded ? Number(promptsAdded) : null;
  const promptsAddedMessage =
    promptsAddedCount && promptsAddedCount > 0
      ? `Se ${promptsAddedCount === 1 ? "ha añadido 1 prompt nuevo" : `han añadido ${promptsAddedCount} prompts nuevos`}. ${
          scanLaunched === "true"
            ? "Se ha lanzado un escaneo restringido a estos prompts nuevos."
            : scanWarning ?? ""
        }`.trim()
      : null;
  const project = await requireActiveProject(projectId);
  const { supabase, user } = await requireUser();

  // Checked up front (not just inside addPromptsCore on submit) so the
  // "Añadir prompts" button never opens the generation flow — and never
  // triggers the Gemini call — for an account already at its plan's prompt
  // cap. Account-wide count, same scope as getUsageSummary()/addPromptsCore
  // (RLS limits this to the owner's prompts across all their projects).
  const [{ count: activePromptCount }, plan] = await Promise.all([
    supabase.from("project_prompts").select("id", { count: "exact", head: true }).eq("is_active", true),
    getPlanForUser(supabase, user.id)
  ]);
  const atPromptLimit = (activePromptCount ?? 0) >= plan.caps.prompts;

  // 1. Último run completado
  const { data: latestRun } = await supabase
    .from("scan_runs")
    .select("id, status, created_at, finished_at")
    .eq("project_id", projectId)
    .eq("status", "completed")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // 1b. Escaneo en curso (pending|running) — si existe, sustituye el contenido normal
  const { data: recentRuns } = await supabase
    .from("scan_runs")
    .select("id, status, total_prompts, successful_prompts, failed_prompts, started_at")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(5);

  const rawActiveRun = recentRuns?.find((r) => r.status === "pending" || r.status === "running");
  // EXTRACTION-RELIABILITY-1 Fase C: carries the analysis-stage counters, so
  // the progress bar keeps moving once generation is done instead of pinning
  // at 100% while extraction is still working.
  const activeRun = rawActiveRun ? await withAnalysisProgress(supabase, projectId, rawActiveRun) : rawActiveRun;

  // 2. Prompts configurados (para category + is_active)
  const { data: projectPrompts } = await supabase
    .from("project_prompts")
    .select("id, prompt_text, category, is_active")
    .eq("project_id", projectId)
    .eq("is_active", true);

  // 3. Resultados del último run
  const { data: rawResults, error: rawResultsError } = latestRun
    ? await supabase
        .from("scan_prompt_results")
        .select(
          "id, prompt_id, prompt_text_snapshot, brand_mentioned, citation_found, mentioned_competitors_count, citations_count, sentiment, raw_response_text, extracted_json, extraction_error, provider"
        )
        .eq("project_id", projectId)
        .eq("run_id", latestRun.id)
    : { data: [], error: null };

  if (rawResultsError) {
    console.error(
      "[prompts] Error al cargar scan_prompt_results:",
      rawResultsError.message
    );
  }

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

  const allResults: ResultRow[] = (rawResults ?? []).map((r) => ({
    ...r,
    category: promptCategoryMap.get(r.prompt_id ?? "") ?? null,
  }));

  // Filtro opcional por competidor (drilldown desde la página de Competidores)
  const results: ResultRow[] = competitorFilter
    ? allResults.filter((r) => {
        const ext = parseExt(r.extracted_json);
        return (ext.competitors ?? []).some(
          (c) => c.mentioned && c.name && normKey(c.name) === normKey(competitorFilter)
        );
      })
    : allResults;

  // Lógica de Topics
  const UNCATEGORIZED_LABEL = "Sin categoría";
  const distinctCategories = [
    ...new Set(
      results
        .map((r) => r.category)
        .filter((c): c is string => c !== null && c.trim() !== "")
    ),
  ];
  const hasTopics = distinctCategories.length >= 2;
  // Prompts without a category (e.g. a categorization gap) must still appear
  // somewhere in Topics mode rather than silently vanishing — give them their
  // own grouping bucket instead of dropping them from distinctCategories.
  const hasUncategorized = hasTopics && results.some((r) => !r.category || r.category.trim() === "");
  const categoriesForGrouping = hasTopics
    ? [...distinctCategories, ...(hasUncategorized ? [UNCATEGORIZED_LABEL] : [])]
    : [];

  // Sort: brand-absent first en modo flat
  const sortedResults = [...results].sort((a, b) => {
    if (a.brand_mentioned === b.brand_mentioned) return 0;
    return a.brand_mentioned ? 1 : -1;
  });

  // Topics con agregados
  const topicGroups: TopicGroup[] = hasTopics
    ? categoriesForGrouping
        .map((cat) => {
          const catResults =
            cat === UNCATEGORIZED_LABEL
              ? results.filter((r) => !r.category || r.category.trim() === "")
              : results.filter((r) => r.category === cat);
          const menciones = catResults.filter((r) => r.brand_mentioned).length;
          const visibilidad =
            catResults.length > 0
              ? Math.round((menciones / catResults.length) * 100)
              : 0;
          const citasTotal = catResults.reduce(
            (sum, r) => sum + (r.citations_count ?? 0),
            0
          );
          const sentimentCounts = new Map<string, number>();
          for (const r of catResults) {
            if (!r.sentiment) continue;
            sentimentCounts.set(r.sentiment, (sentimentCounts.get(r.sentiment) ?? 0) + 1);
          }
          let sentimentDominant: string | null = null;
          let topCount = 0;
          for (const [sentiment, count] of sentimentCounts) {
            if (count > topCount) {
              topCount = count;
              sentimentDominant = sentiment;
            }
          }
          return {
            category: cat,
            results: catResults,
            visibilidad,
            menciones,
            citasTotal,
            sentimentDominant,
          };
        })
        .sort((a, b) => b.visibilidad - a.visibilidad)
    : [];

  const totalPrompts = projectPrompts?.length ?? 0;
  const scannedPrompts = results.length;
  const totalTopics = topicGroups.length;

  const hasActivePrompts = (projectPrompts?.length ?? 0) > 0;
  const hasCompletedRun = latestRun !== null;
  const hasResults = results.length > 0;

  return (
    <div className="page" style={{ paddingTop: 0 }}>
      <header className="ov-sticky-header">
        <div className="ov-sticky-left">
          <div>
            <p className="kicker" style={{ marginBottom: 2 }}>Prompts</p>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 15, fontWeight: 750, color: "var(--ink)", letterSpacing: "-.01em" }}>
                {project.name}
              </span>
              <span className="badge badge-neutral" style={{ fontFamily: "var(--mono)", fontSize: 11 }}>
                {project.domain}
              </span>
              <span className="meta-pill">{project.country}/{project.language}</span>
            </div>
          </div>
        </div>
        <div className="ov-sticky-right">
          <ScanStatePill
            activeRun={activeRun}
            lastScanLabel={
              latestRun
                ? new Date(latestRun.finished_at ?? latestRun.created_at).toLocaleDateString("es-ES", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                    timeZone: "Europe/Madrid"
                  })
                : null
            }
          />
        </div>
      </header>

      {promptsAddedMessage ? (
        <p className="feedback success" style={{ marginTop: 20 }}>
          {promptsAddedMessage}
        </p>
      ) : null}

      <div style={{ paddingTop: promptsAddedMessage ? 16 : 20 }}>
        {competitorFilter && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              marginBottom: 16,
              padding: "10px 14px",
              borderRadius: 10,
              border: "1px solid var(--line-strong)",
              background: "var(--surface-2)",
              fontSize: 13,
            }}
          >
            <Icon name="competitors" size={15} />
            <span style={{ color: "var(--ink-3)" }}>
              Mostrando solo prompts donde aparece{" "}
              <b style={{ color: "var(--ink)" }}>{competitorFilter}</b> en el último escaneo.
            </span>
            <Link
              href={`/dashboard/projects/${projectId}/prompts`}
              className="btn btn-ghost btn-sm"
              style={{ marginLeft: "auto" }}
            >
              Quitar filtro
            </Link>
          </div>
        )}
        {activeRun && !hasCompletedRun ? (
          <ScanInProgress activeRun={activeRun} />
        ) : !hasActivePrompts ? (
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
              Añade tus primeros prompts para empezar a analizar la
              visibilidad de tu marca.
            </p>
            <div style={{ display: "inline-block" }}>
              <AddPromptsButton
                projectId={projectId}
                disabled={Boolean(activeRun) || atPromptLimit}
                disabledReason={
                  activeRun
                    ? "Espera a que termine el escaneo en curso."
                    : atPromptLimit
                      ? feedbackErrorMessages.prompt_limit_reached
                      : undefined
                }
              />
            </div>
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
              {competitorFilter
                ? `${competitorFilter} no aparece mencionado en el último escaneo`
                : "Sin resultados disponibles"}
            </p>
            <p
              style={{ fontSize: 13, color: "var(--ink-3)", marginBottom: 16 }}
            >
              {competitorFilter
                ? "Quita el filtro para ver todos los prompts del último escaneo."
                : "El escaneo está completado pero no hay respuestas disponibles."}
            </p>
            <Link
              href={
                competitorFilter
                  ? `/dashboard/projects/${projectId}/prompts`
                  : `/dashboard/projects/${projectId}`
              }
              style={{
                fontSize: 13,
                fontWeight: 600,
                color: "var(--accent)",
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              {competitorFilter ? "Quitar filtro →" : "Volver a visión general →"}
            </Link>
          </div>
        ) : (
          <PromptsClient
            projectId={projectId}
            projectDomain={project.domain}
            projectBrand={project.brand}
            results={sortedResults}
            hasTopics={hasTopics}
            topicGroups={topicGroups}
            competitors={configuredCompetitors ?? []}
            totalPrompts={totalPrompts}
            scannedPrompts={scannedPrompts}
            totalTopics={totalTopics}
            addPromptsDisabled={Boolean(activeRun) || atPromptLimit}
            addPromptsDisabledReason={
              activeRun
                ? "Espera a que termine el escaneo en curso."
                : atPromptLimit
                  ? feedbackErrorMessages.prompt_limit_reached
                  : undefined
            }
          />
        )}
      </div>
    </div>
  );
}
