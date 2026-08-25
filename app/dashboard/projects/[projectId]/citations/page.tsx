import Link from "next/link";
import type { Metadata } from "next";
import { Icon } from "@/components/ui/icon";
import { requireUser } from "@/lib/auth";
import { requireActiveProject } from "@/lib/project-workspace";
import { withAnalysisProgress } from "@/lib/scan/active-run-progress";
import { projectScreenMetadata } from "@/lib/seo/console-metadata";
import { ScanInProgress } from "@/components/scan-in-progress";
import { FirstScanTakeover } from "@/components/first-scan-takeover";
import { ScanStatePill } from "@/components/scan-state-pill";
import { CitationsClient } from "./citations-client";
import {
  aggregateCitations,
  compareOpportunityRows,
  normalizeDomain,
  type CitationInputRow,
  type CitationRow
} from "@/lib/citations/aggregate-citations";

/** Subset of run_scores.details_json this page reads — same access pattern
 * as the Overview page (app/dashboard/projects/[projectId]/page.tsx). */
type CitationScoreDetails = {
  citation_score_any_domain?: number;
  citation_by_provider?: Record<string, { total: number; citation_found_count: number }>;
};

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
  return projectScreenMetadata("Páginas citadas", async () => (await requireActiveProject(projectId)).domain);
}

export default async function CitationsPage({
  params
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const project = await requireActiveProject(projectId);
  const { supabase } = await requireUser();

  const [{ data: latestRun }, { data: recentRuns }, { data: competitors }, { data: projectPrompts }] =
    await Promise.all([
      supabase
        .from("scan_runs")
        .select("id, status, created_at, finished_at")
        .eq("project_id", projectId)
        .eq("status", "completed")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("scan_runs")
        .select("id, status, total_prompts, successful_prompts, failed_prompts, started_at")
        .eq("project_id", projectId)
        .order("created_at", { ascending: false })
        .limit(5),
      supabase
        .from("project_competitors")
        .select("id, name, domain")
        .eq("project_id", projectId)
        .eq("is_active", true),
      supabase
        .from("project_prompts")
        .select("id, category")
        .eq("project_id", projectId)
        .eq("is_active", true)
    ]);

  const rawActiveRun = recentRuns?.find((r) => r.status === "pending" || r.status === "running");
  // EXTRACTION-RELIABILITY-1 Fase C: carries the analysis-stage counters, so
  // the progress bar keeps moving once generation is done instead of pinning
  // at 100% while extraction is still working.
  const activeRun = rawActiveRun ? await withAnalysisProgress(supabase, projectId, rawActiveRun) : rawActiveRun;

  const [{ data: results }, { data: score }] = latestRun
    ? await Promise.all([
        supabase
          .from("scan_prompt_results")
          .select(
            "id, prompt_id, prompt_text_snapshot, brand_mentioned, extracted_json, provider, raw_response_text"
          )
          .eq("project_id", projectId)
          .eq("run_id", latestRun.id)
          .eq("status", "completed"),
        supabase
          .from("run_scores")
          .select("citation_score, details_json")
          .eq("project_id", projectId)
          .eq("run_id", latestRun.id)
          .maybeSingle()
      ])
    : [{ data: [] }, { data: null }];

  const promptCategoryMap = new Map(
    (projectPrompts ?? []).map((p) => [p.id, p.category as string | null])
  );

  const competitorDomains = (competitors ?? [])
    .map((c) => ({ name: c.name, domain: normalizeDomain(c.domain ?? "") }))
    .filter((c) => c.domain.length > 0);

  const { citationRows, hasStructuredCitations, impactBreakdown, sourceTypeBreakdown } =
    aggregateCitations({
      rows: (results ?? []) as CitationInputRow[],
      projectDomain: project.domain ?? "",
      competitorDomains,
      promptCategoryMap
    });

  const totalUrls = citationRows.length;
  const totalCited = citationRows.reduce((sum, r) => sum + r.cited, 0);
  const yours = citationRows.filter((r) => r.category === "brand").length;
  // Only neutral/third-party domains are actionable outreach targets.
  // Competitor domains (already tracked in project_competitors) are excluded:
  // a brand will never earn a citation on a rival's own site. Unresolved
  // grounding citations (no domain) are excluded too: there's no address to
  // reach out to. `competitors.length > 0` requires an actually TRACKED
  // competitor to have been named in the evidence — founder review,
  // 2026-08-02: rows that only mentioned an untracked "other brand" were
  // slipping in here too, padding the list and forcing the row's "Cita a un
  // competidor" fallback text to paper over having nothing real to name.
  // Ranked by number of distinct engines citing the domain first
  // (ENGINES-VALUE-2), then by cited count — a source both Gemini and
  // ChatGPT cite is a stronger outreach target than one only one engine uses.
  const opportunityRows: CitationRow[] = citationRows
    .filter(
      (r) => r.category === "third_party" && r.brandMentioned === "no" && r.domain && r.competitors.length > 0
    )
    .sort(compareOpportunityRows);

  const scoreDetails =
    score?.details_json && typeof score.details_json === "object"
      ? (score.details_json as CitationScoreDetails)
      : {};
  const citationRateAnyDomain =
    typeof scoreDetails.citation_score_any_domain === "number" ? scoreDetails.citation_score_any_domain : null;

  const lastScanDate = latestRun
    ? new Date(latestRun.finished_at ?? latestRun.created_at).toLocaleDateString("es-ES", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "Europe/Madrid"
      })
    : null;

  // Mirrors the FirstScanTakeover condition below — hidden while the mission
  // takeover owns the screen, so the rocket animation reads as full screen
  // instead of sitting under a second chrome band (founder, 2026-08-25).
  const showMissionTakeover = Boolean(activeRun) && !latestRun;

  return (
    <div className={`page fade-in${showMissionTakeover ? " mrk-fill" : ""}`}>
      {/* Sticky header. HEADER-FULL-WIDTH-1 (2026-08-25): esta pantalla se
          había quedado con un layout de una sola línea (kicker + separador +
          dominio) de antes de que el resto de la consola convergiera en
          kicker arriba / nombre+badge de dominio abajo — Visión general,
          Prompts, Competidores, Recomendaciones, Auditoría web y Debug ya lo
          usan (Recomendaciones incluso dice explícitamente "alineada con...
          Páginas citadas", que nunca lo estuvo). Resultado: aquí la banda
          salía más baja que en el resto y con una tipografía distinta
          (fundador, 2026-08-25). Mismo patrón, letra por letra. Se oculta
          mientras la misión del primer escaneo ocupa la pantalla entera. */}
      {!showMissionTakeover && (
        <div className="ov-sticky-header">
          <div className="ov-sticky-left">
            <div>
              <p className="kicker" style={{ marginBottom: 2 }}>Páginas citadas</p>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: 15, fontWeight: 750, color: "var(--ink)", letterSpacing: "-.01em" }}>
                  {project.name}
                </span>
                <span className="badge badge-neutral" style={{ fontFamily: "var(--mono)", fontSize: 11 }}>
                  {project.domain}
                </span>
              </div>
            </div>
          </div>
          <div className="ov-sticky-right">
            <ScanStatePill activeRun={activeRun} lastScanLabel={lastScanDate} />
          </div>
        </div>
      )}

      {activeRun && showMissionTakeover ? (
        <FirstScanTakeover projectId={projectId} activeRun={activeRun} domain={project.domain} />
      ) : !latestRun ? (
        <div className="section-empty" style={{ marginTop: 20 }}>
          <div className="section-empty-title">Todavía no hay datos de citas</div>
          <div className="section-empty-desc">
            Las páginas que cita la IA al responder tus prompts aparecerán aquí después de
            completar el primer escaneo con Gemini.
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
      ) : !hasStructuredCitations ? (
        <div className="section-empty" style={{ marginTop: 20 }}>
          <div className="section-empty-title">Este escaneo respondió sin citar fuentes</div>
          <div className="section-empty-desc">
            No es un fallo: una IA no siempre busca en la web para responder. Cuando contesta desde
            lo que ya sabe (sin consultar el buscador), no hay ninguna URL que citar. Vuelve a
            comprobarlo tras el próximo escaneo.
          </div>
          <Link
            href={`/dashboard/projects/${projectId}/runs/${latestRun.id}`}
            className="btn btn-ghost btn-sm"
            style={{ marginTop: 14, display: "inline-flex" }}
          >
            Ver detalle del escaneo
            <Icon name="arrRight" size={14} />
          </Link>
        </div>
      ) : (
        <CitationsClient
          citationRows={citationRows}
          opportunityRows={opportunityRows}
          impactBreakdown={impactBreakdown}
          sourceTypeBreakdown={sourceTypeBreakdown}
          totalUrls={totalUrls}
          totalCited={totalCited}
          yours={yours}
          citationRateAnyDomain={citationRateAnyDomain}
          brandLabel={project.brand}
        />
      )}
    </div>
  );
}
