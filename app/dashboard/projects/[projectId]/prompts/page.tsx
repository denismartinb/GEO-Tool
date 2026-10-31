import Link from "next/link";
import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { getPlanForUser } from "@/lib/billing";
import { feedbackErrorMessages } from "@/lib/projects/feedback-messages";
import { requireActiveProject } from "@/lib/project-workspace";
import { withAnalysisProgress } from "@/lib/scan/active-run-progress";
import { resolveScanProvidersForPlan, getLLMScanProviders } from "@/lib/scan/providers";
import { projectScreenMetadata } from "@/lib/seo/console-metadata";
import { FirstScanTakeover } from "@/components/first-scan-takeover";
import { Ic } from "@/components/ins/ic";
import { PageHead } from "@/components/ins/page-head";
import { Motion } from "@/components/ins/kit/motion";
import { LiveScanCard } from "@/components/ins/overview/live-scan-card";
import { InsPrompts } from "@/components/ins/prompts/ins-prompts";
import { InsAddPrompts } from "@/components/ins/prompts/add-prompts";
import type { PendingPrompt } from "@/lib/ins/prompts-model";

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

// ROOT-METADATA-1: el dominio va en la pestaña. Sin esto las pantallas de
// consola heredaban `title: "GenScore"` del layout raíz y eran indistinguibles
// entre sí y entre proyectos. `requireActiveProject` está memoizada por
// petición, así que esto no añade ninguna consulta.
export async function generateMetadata({
  params
}: {
  params: Promise<{ projectId: string }>;
}): Promise<Metadata> {
  const { projectId } = await params;
  return projectScreenMetadata("Prompts", async () => (await requireActiveProject(projectId)).domain);
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
          "id, prompt_id, prompt_text_snapshot, brand_mentioned, citation_found, mentioned_competitors_count, citations_count, sentiment, raw_response_text, extracted_json, extraction_error, provider, sample_index, brand_snapshot, brand_aliases_snapshot"
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

  // The last run still holds rows for prompts deactivated since it ran. Those
  // are gone from the user's point of view ("Borrar prompt"), so they must not
  // render — and without an active prompt there is no category to look up, so
  // they used to fall into "Sin categoría" instead of disappearing.
  const allResults = (rawResults ?? [])
    .filter((r) => promptCategoryMap.has(r.prompt_id ?? ""))
    .map((r) => ({
      ...r,
      category: promptCategoryMap.get(r.prompt_id ?? "") ?? null,
    }));

  // Filtro opcional por competidor (drilldown desde la página de Competidores)
  const results = competitorFilter
    ? allResults.filter((r) => {
        const ext = parseExt(r.extracted_json);
        return (ext.competitors ?? []).some(
          (c) => c.mentioned && c.name && normKey(c.name) === normKey(competitorFilter)
        );
      })
    : allResults;

  const hasActivePrompts = (projectPrompts?.length ?? 0) > 0;
  const hasCompletedRun = latestRun !== null;
  const hasResults = results.length > 0;
  const addDisabled = Boolean(activeRun) || atPromptLimit;
  const addDisabledReason = activeRun
    ? "Espera a que termine el escaneo en curso."
    : atPromptLimit
      ? feedbackErrorMessages.prompt_limit_reached
      : undefined;
  // Mirrors the FirstScanTakeover condition: the mission owns the whole screen.
  const showMissionTakeover = Boolean(activeRun) && !hasCompletedRun;

  if (activeRun && showMissionTakeover) {
    // Hangs DIRECTLY off `.page.mrk-fill`, like the other five sections
    // (ANIMATION-PARITY-1, log §168).
    return (
      <div className="page mrk-fill">
        <FirstScanTakeover projectId={projectId} activeRun={activeRun} domain={project.domain} />
      </div>
    );
  }

  // Active prompts the last scan did not cover (added after it ran): listed
  // as pending, never as absent. Not with a competitor filter, which narrows
  // to scanned rows.
  const scannedIds = new Set(allResults.map((r) => r.prompt_id));
  const pendingPrompts: PendingPrompt[] =
    hasCompletedRun && !competitorFilter
      ? (projectPrompts ?? [])
          .filter((p) => !scannedIds.has(p.id))
          .map((p) => ({ id: p.id, text: p.prompt_text, category: p.category as string | null }))
      : [];

  const providers = resolveScanProvidersForPlan(plan);
  const promptsHref = `/dashboard/projects/${projectId}/prompts`;

  return (
    <div className="ins">
      <Motion id={`prompts:${projectId}`}>
        <div className="page sc-prompts">
          <PageHead
            title="Prompts"
            action={
              <InsAddPrompts
                projectId={projectId}
                used={activePromptCount ?? 0}
                limit={plan.caps.prompts}
                disabled={addDisabled}
                disabledReason={addDisabledReason}
              />
            }
          />

          {promptsAddedMessage ? (
            <p className="alert pos" role="status" style={{ marginTop: 20 }}>
              <Ic n="checkc" />
              <span className="tx">{promptsAddedMessage}</span>
            </p>
          ) : null}

          {/* One poller per screen: the card owns the refresh when the run ends. */}
          {activeRun ? (
            <LiveScanCard projectId={projectId} initial={activeRun} providers={getLLMScanProviders()} />
          ) : null}

          {competitorFilter ? (
            <div className="pr-filter">
              <Ic n="users" sm />
              <span>
                Mostrando solo prompts donde aparece <b>{competitorFilter}</b> en el último escaneo.
              </span>
              <Link href={promptsHref} className="btn ghost sm">
                Quitar filtro
              </Link>
            </div>
          ) : null}

          {!hasActivePrompts ? (
            <div className="empty-s">
              <b>No hay prompts activos</b>
              <p>Añade tus primeros prompts para empezar a analizar la visibilidad de tu marca.</p>
            </div>
          ) : !hasCompletedRun ? (
            <div className="empty-s">
              <b>Todavía no hay resultados</b>
              <p>Los resultados aparecerán después de lanzar el primer escaneo.</p>
              <Link href={`/dashboard/projects/${projectId}`} className="btn line sm">
                Ir a visión general <Ic n="chevr" sm />
              </Link>
            </div>
          ) : !hasResults ? (
            <div className="empty-s">
              <b>
                {competitorFilter
                  ? `${competitorFilter} no aparece mencionado en el último escaneo`
                  : "Sin resultados disponibles"}
              </b>
              <p>
                {competitorFilter
                  ? "Quita el filtro para ver todos los prompts del último escaneo."
                  : "El escaneo está completado pero no hay respuestas disponibles."}
              </p>
              <Link href={competitorFilter ? promptsHref : `/dashboard/projects/${projectId}`} className="btn line sm">
                {competitorFilter ? "Quitar filtro" : "Volver a visión general"}
              </Link>
            </div>
          ) : (
            <InsPrompts
              projectId={projectId}
              projectDomain={project.domain}
              projectBrand={project.brand}
              results={results}
              pending={pendingPrompts}
              competitors={configuredCompetitors ?? []}
              providers={providers}
              capUsed={activePromptCount ?? 0}
              capLimit={plan.caps.prompts}
            />
          )}
        </div>
      </Motion>
    </div>
  );
}
