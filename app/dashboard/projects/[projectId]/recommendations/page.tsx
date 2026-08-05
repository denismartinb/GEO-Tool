import Link from "next/link";
import { Icon } from "@/components/ui/icon";
import { requireUser } from "@/lib/auth";
import { requireActiveProject } from "@/lib/project-workspace";
import { ScanInProgress } from "@/components/scan-in-progress";
import { ScanStatePill } from "@/components/scan-state-pill";
import { computeCoverageOverlay, type CoverageOverlayEntry } from "@/lib/recommendations/coverage-overlay";
import type { DomainCoverageTopic } from "@/lib/recommendations/domain-coverage";
import { parseGeneratedSolution } from "@/lib/recommendations/generated-solution";
import { withAnalysisProgress } from "@/lib/scan/active-run-progress";
import { RecommendationsClient, type GeneratedSolution, type Recommendation } from "./recommendations-client";

/**
 * Parses a `domain_coverage` generated_solutions row's sanitized_content
 * (DOMAIN-COVERAGE-1's DomainCoverageMap shape) defensively — same pattern as
 * parseGeneratedSolution below. Not imported from lib/recommendations/domain-
 * coverage.ts (server-only module already used for its type + constants here,
 * but this parser mirrors its private one to keep this file's error handling
 * self-contained).
 */
function parseCoverageMap(raw: string | null): { scanId: string; topics: DomainCoverageTopic[] } | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (typeof parsed.scanId !== "string" || !Array.isArray(parsed.topics)) return null;
    const topics = parsed.topics.filter((t): t is DomainCoverageTopic => {
      const c = t as Record<string, unknown> | null;
      return Boolean(c) && typeof c?.promptId === "string" && typeof c?.found === "boolean";
    });
    return { scanId: parsed.scanId, topics };
  } catch {
    return null;
  }
}

// Server Actions inherit the maxDuration of the page they're invoked from.
// Without this, "Mejorar redaccion con IA" (a Gemini call, see
// rewriteRecommendationAction) is bound by Vercel's default function
// duration instead of the 20s in-app Gemini timeout in lib/llm/gemini.ts,
// so a slow call gets killed by the platform before that timeout can ever
// surface a clean, user-visible error.
export const maxDuration = 60;

export default async function RecommendationsPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const project = await requireActiveProject(projectId);
  const { supabase } = await requireUser();

  // Latest completed run
  const { data: latestCompletedRun } = await supabase
    .from("scan_runs")
    .select("id, status, created_at, finished_at")
    .eq("project_id", projectId)
    .eq("status", "completed")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Also fetch latest run of any status for "failed" banner
  const { data: latestRun } = await supabase
    .from("scan_runs")
    .select("id, status, created_at")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Recent runs to detect an in-progress scan (pending|running)
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

  const [{ data: recommendations }, { data: resolvedRecommendations }, { data: history }] = latestCompletedRun
    ? await Promise.all([
        supabase
          .from("recommendations")
          .select(
            "id, priority_rank, title, description, recommendation_type, impact, effort, confidence, status, source_type, evidence_json, consecutive_runs_open",
          )
          .eq("project_id", projectId)
          .eq("run_id", latestCompletedRun.id)
          .eq("status", "active")
          .order("priority_rank", { ascending: true }),
        // RECS-3 "Victorias recientes": gaps that were open last run and were
        // confirmed gone by this run's scan — resolved_in_run_id (not run_id,
        // which stays the run where the gap still existed) scopes this to the
        // latest completed run specifically.
        supabase
          .from("recommendations")
          .select("id, title, recommendation_type")
          .eq("project_id", projectId)
          .eq("status", "resolved")
          .eq("resolved_in_run_id", latestCompletedRun.id)
          .order("title", { ascending: true }),
        // "Resueltas" tab: full history (any run), both auto-resolved and
        // manually dismissed, so there's a persistent place to browse past
        // wins/actions instead of only the latest-run-scoped banner above.
        // Capped — these rows accumulate indefinitely (accepted for beta,
        // cleaned up via project hard-delete).
        supabase
          .from("recommendations")
          .select("id, title, description, recommendation_type, status, updated_at")
          .eq("project_id", projectId)
          .in("status", ["resolved", "dismissed"])
          .order("updated_at", { ascending: false })
          .limit(30),
      ])
    : [{ data: null }, { data: null }, { data: null }];

  const baseRecs = (recommendations ?? []) as Recommendation[];

  // A single logical prompt scanned by multiple LLM engines (Gemini + Claude)
  // produces one scan_prompt_results row per engine, so per-prompt gap cards
  // (increase_brand_visibility/add_citation_block) can generate two
  // near-identical titles for the same underlying query. The active backlog has
  // no count cap of its own either (RECS-CAP-REMOVE), so these two lists would
  // show the duplicates raw — dedupe by normalized title, keeping the first
  // (most relevant/most recent) row.
  function dedupeByTitle<T extends { title: string }>(rows: T[]): T[] {
    const seen = new Set<string>();
    const out: T[] = [];
    for (const row of rows) {
      const key = row.title.trim().toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(row);
    }
    return out;
  }

  const recentWins = dedupeByTitle(
    (resolvedRecommendations ?? []) as Array<{
      id: string;
      title: string;
      recommendation_type: string;
    }>,
  );
  const resolvedHistory = dedupeByTitle(
    (history ?? []) as Array<{
      id: string;
      title: string;
      description: string;
      recommendation_type: string;
      status: "resolved" | "dismissed";
      updated_at: string;
    }>,
  );

  // Attach the latest sanitized AI-generated solution (if any) for each
  // recommendation. These live in `generated_solutions` (never on the
  // recommendation row); the owner SELECT policy on that table makes this a
  // plain user-context read. Only completed + sanitized rows are renderable.
  const solutionByRecId = new Map<string, GeneratedSolution>();
  if (baseRecs.length > 0) {
    const { data: solutionRows } = await supabase
      .from("generated_solutions")
      .select("recommendation_id, sanitized_content, created_at")
      .eq("project_id", projectId)
      .eq("status", "completed")
      .eq("is_sanitized", true)
      .in(
        "recommendation_id",
        baseRecs.map((r) => r.id),
      )
      .order("created_at", { ascending: false });

    for (const row of (solutionRows ?? []) as Array<{
      recommendation_id: string;
      sanitized_content: string | null;
    }>) {
      // Newest-first order means the first row seen per recommendation wins.
      if (solutionByRecId.has(row.recommendation_id) || !row.sanitized_content) continue;
      const parsed = parseGeneratedSolution(row.sanitized_content);
      if (parsed) solutionByRecId.set(row.recommendation_id, parsed);
    }
  }

  // RECS-COVERAGE-OVERLAY-1: read-time enrichment of add_citation_block cards
  // with already-persisted domain-coverage data (DOMAIN-COVERAGE-1) for the
  // CURRENT scan only — never the recommendation engine or scan pipeline. See
  // lib/recommendations/coverage-overlay.ts for the join/degradation rules.
  const addCitationRecs = baseRecs.filter((r) => r.recommendation_type === "add_citation_block");
  const coverageOverlayByRecId = new Map<string, CoverageOverlayEntry>();
  if (addCitationRecs.length > 0 && latestCompletedRun) {
    const resultIds = addCitationRecs
      .map((r) => r.evidence_json?.affected_prompt_details?.[0]?.id)
      .filter((id): id is string => Boolean(id));

    const [{ data: resultRows }, { data: coverageRow }] = await Promise.all([
      resultIds.length > 0
        ? supabase
            .from("scan_prompt_results")
            .select("id, prompt_id")
            .eq("project_id", projectId)
            .eq("run_id", latestCompletedRun.id)
            .in("id", resultIds)
        : Promise.resolve({ data: [] as Array<{ id: string; prompt_id: string | null }> }),
      supabase
        .from("generated_solutions")
        .select("sanitized_content")
        .eq("project_id", projectId)
        .eq("generation_type", "domain_coverage")
        .is("recommendation_id", null)
        .eq("status", "completed")
        .eq("is_sanitized", true)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    const resultIdToPromptId = new Map(
      ((resultRows ?? []) as Array<{ id: string; prompt_id: string | null }>)
        .filter((row): row is { id: string; prompt_id: string } => Boolean(row.prompt_id))
        .map((row) => [row.id, row.prompt_id]),
    );

    const coverage = parseCoverageMap(
      (coverageRow as { sanitized_content: string | null } | null)?.sanitized_content ?? null,
    );
    // Only a coverage row derived from THIS scan counts — a cached row from an
    // older scan (before the user re-ran "Auditar cobertura") never enriches.
    const coverageTopics = coverage && coverage.scanId === latestCompletedRun.id ? coverage.topics : [];

    for (const [recId, entry] of computeCoverageOverlay({
      recommendations: baseRecs.map((r) => ({
        id: r.id,
        recommendationType: r.recommendation_type,
        resultId: r.evidence_json?.affected_prompt_details?.[0]?.id ?? null,
        confidence: r.confidence as "low" | "medium" | "high",
      })),
      resultIdToPromptId,
      coverageTopics,
    })) {
      coverageOverlayByRecId.set(recId, entry);
    }
  }

  const recs: Recommendation[] = baseRecs.map((r) => ({
    ...r,
    solution: solutionByRecId.get(r.id) ?? null,
    coverageOverlay: coverageOverlayByRecId.get(r.id) ?? null,
  }));

  // Computed stats
  const highPriority = recs.filter((r) => r.priority_rank <= 3).length;
  const quickWins = recs.filter(
    (r) => r.impact === "high" && r.effort === "low",
  ).length;
  const total = recs.length;

  const latestRunFailed = latestRun?.status === "failed";

  const lastScanDate = latestCompletedRun
    ? new Date(
        latestCompletedRun.finished_at ?? latestCompletedRun.created_at,
      ).toLocaleDateString("es-ES", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "Europe/Madrid",
      })
    : null;

  return (
    <div className="page fade-in">
      {/* Sticky header */}
      <div className="ov-sticky-header">
        <div className="ov-sticky-left">
          <span className="kicker">Actuar</span>
          <span
            style={{
              width: 1,
              height: 16,
              background: "var(--line-strong)",
              display: "inline-block",
              margin: "0 2px",
            }}
          />
          <span
            style={{
              fontSize: 14,
              fontWeight: 700,
              color: "var(--ink)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              maxWidth: 260,
            }}
          >
            {project.domain}
          </span>
          {total > 0 && (
            <span className="badge badge-accent">
              {total} acciones
            </span>
          )}
        </div>
        <div className="ov-sticky-right">
          {/* "Exportar plan" retirado (2026-08-02): era un botón permanentemente
              deshabilitado (sin onClick, sin función real) que además violaba
              la regla de cabecera compartida (docs/brand/design-decisions-log.md
              §3 — solo badges/pills informativos, nunca controles) — la
              detectó el check mecánico nuevo de tests/pilot/support/journey.ts
              al correr contra esta pantalla desde el PR de Auditoría web.
              Ningún otro sitio del código lo referenciaba: no había función
              que reconectar. Si se implementa exportar de verdad, el control
              va en el cuerpo, como el resto de acciones de página. */}
          <ScanStatePill activeRun={activeRun} lastScanLabel={lastScanDate} />
        </div>
      </div>

      {/* Alineada con Prompts, Competidores y Páginas citadas: el overlay a
          pantalla completa sólo sustituye a la pantalla cuando NO hay nada que
          enseñar. Esconder las recomendaciones que ya tienes detrás de un
          overlay porque hay un refresco en marcha era la única pantalla de
          datos que lo hacía, y la causa del PILOT FAIL repetido de
          "recommendations: estado vacío" (2026-08-04/05) — que no era una
          carrera con los datos, sino esta condición. Con datos, el estado del
          escaneo lo lleva la pastilla del sticky-header. */}
      {activeRun && !latestCompletedRun ? (
        <ScanInProgress activeRun={activeRun} />
      ) : (
      <>
      {/* Failed run notice */}
      {latestRunFailed && latestCompletedRun && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "10px 14px",
            background: "var(--warn-soft)",
            border: "1px solid #f3d086",
            borderRadius: "var(--r-md)",
            fontSize: 13,
            color: "var(--warn-ink)",
            marginBottom: 16,
          }}
        >
          <Icon name="info" size={14} />
          El último escaneo falló. Se muestran recomendaciones del escaneo
          anterior completado.
        </div>
      )}

      {/* Summary banner — only if there are recs */}
      {latestCompletedRun && recs.length > 0 && (
        <div className="summary mt8" style={{ flexWrap: "wrap", rowGap: 10 }}>
          <div className="summary-ico">
            <Icon name="recs" size={20} />
          </div>
          <div className="summary-txt" style={{ flex: "1 1 150px" }}>
            GenScore ha convertido tu último escaneo en{" "}
            <b>{total} {total === 1 ? "acción concreta" : "acciones concretas"}</b> para{" "}
            <b>{project.domain}</b>.
            {highPriority > 0 ? (
              <>
                {" "}Empieza por las <b>{highPriority} de alta prioridad</b>: son las que más pueden
                mover tu puntuación GEO.
              </>
            ) : (
              <> Ninguna es de alta prioridad ahora mismo — son mejoras incrementales.</>
            )}
            {" "}Pulsa cualquier acción para ver la evidencia y el plan paso a paso.
          </div>
          <div
            style={{
              display: "flex",
              gap: 16,
              paddingLeft: 16,
              borderLeft: "1px solid var(--line)",
              alignItems: "center",
              flex: "0 0 auto",
            }}
          >
            <div style={{ textAlign: "center" }}>
              <div
                className="tnum"
                style={{
                  fontSize: 22,
                  fontWeight: 800,
                  color: "var(--neg)",
                  lineHeight: 1,
                }}
              >
                {highPriority}
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: "var(--ink-4)",
                  fontWeight: 600,
                  marginTop: 3,
                  whiteSpace: "nowrap",
                }}
              >
                Alta prioridad
              </div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div
                className="tnum"
                style={{
                  fontSize: 22,
                  fontWeight: 800,
                  color: "var(--pos)",
                  lineHeight: 1,
                }}
              >
                {quickWins}
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: "var(--ink-4)",
                  fontWeight: 600,
                  marginTop: 3,
                  whiteSpace: "nowrap",
                }}
              >
                Victorias rápidas
              </div>
            </div>
            <div style={{ textAlign: "center" }}>
              <div
                className="tnum"
                style={{
                  fontSize: 22,
                  fontWeight: 800,
                  color: "var(--ink)",
                  lineHeight: 1,
                }}
              >
                {total}
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: "var(--ink-4)",
                  fontWeight: 600,
                  marginTop: 3,
                  whiteSpace: "nowrap",
                }}
              >
                Total
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Empty states */}
      {!latestCompletedRun ? (
        <div className="section-empty" style={{ marginTop: 20 }}>
          <div className="section-empty-title">
            {latestRunFailed
              ? "El último escaneo falló"
              : "Todavía no hay recomendaciones"}
          </div>
          <div className="section-empty-desc">
            {latestRunFailed
              ? "No hay un escaneo completado del que extraer recomendaciones. Revisa el dominio y vuelve a lanzar el análisis."
              : "Las recomendaciones aparecerán después de completar el primer escaneo real con Gemini."}
          </div>
          <Link
            href={`/dashboard/projects/${projectId}`}
            className="btn btn-ghost btn-sm"
            style={{ marginTop: 14, display: "inline-flex" }}
          >
            Volver a visión general
            <Icon name="arrRight" size={14} />
          </Link>
        </div>
      ) : recs.length === 0 ? (
        <div className="section-empty" style={{ marginTop: 20 }}>
          <div className="section-empty-title">No hay recomendaciones activas</div>
          <div className="section-empty-desc">
            Ninguna regla generó acciones para este escaneo. Puedes revisar el
            detalle del escaneo para ver la evidencia.
          </div>
          <Link
            href={`/dashboard/projects/${projectId}/runs/${latestCompletedRun.id}`}
            className="btn btn-ghost btn-sm"
            style={{ marginTop: 14, display: "inline-flex" }}
          >
            Ver detalle del escaneo
            <Icon name="arrRight" size={14} />
          </Link>
        </div>
      ) : (
        <>
          {/* Section head */}
          <div className="section-head" style={{ marginTop: 24 }}>
            <div className="section-title">Backlog de acciones</div>
            <div className="section-desc">
              Pulsa cualquier acción para ver la evidencia
            </div>
          </div>

          {/* Client component handles filters + cards */}
          <RecommendationsClient
            recommendations={recs}
            resolvedHistory={resolvedHistory}
            recentWinsCount={recentWins.length}
            projectId={projectId}
          />
        </>
      )}
      </>
      )}
    </div>
  );
}
