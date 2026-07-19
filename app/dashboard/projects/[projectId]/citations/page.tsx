import Link from "next/link";
import { Icon } from "@/components/ui/icon";
import { requireUser } from "@/lib/auth";
import { requireActiveProject } from "@/lib/project-workspace";
import { ScanInProgress } from "@/components/scan-in-progress";
import { CitationsClient } from "./citations-client";
import {
  aggregateCitations,
  compareOpportunityRows,
  normalizeDomain,
  type CitationInputRow,
  type CitationRow
} from "@/lib/citations/aggregate-citations";

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

  const activeRun = recentRuns?.find((r) => r.status === "pending" || r.status === "running");

  const [{ data: results }, { data: score }] = latestRun
    ? await Promise.all([
        supabase
          .from("scan_prompt_results")
          .select("id, prompt_id, prompt_text_snapshot, brand_mentioned, extracted_json, provider")
          .eq("project_id", projectId)
          .eq("run_id", latestRun.id)
          .eq("status", "completed"),
        supabase
          .from("run_scores")
          .select("citation_score")
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

  const { citationRows, promptGroups, hasStructuredCitations, engineTotals } = aggregateCitations({
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
  // reach out to. Ranked by number of distinct engines citing the domain
  // first (ENGINES-VALUE-2), then by cited count — a source both Gemini and
  // ChatGPT cite is a stronger outreach target than one only one engine uses.
  const opportunityRows: CitationRow[] = citationRows
    .filter((r) => r.category === "third_party" && r.brandMentioned === "no" && r.domain)
    .sort(compareOpportunityRows);
  const opportunities = opportunityRows.length;

  const lastScanDate = latestRun
    ? new Date(latestRun.finished_at ?? latestRun.created_at).toLocaleDateString("es-ES", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "Europe/Madrid"
      })
    : null;

  return (
    <div className="page fade-in">
      {/* Sticky header */}
      <div className="ov-sticky-header">
        <div className="ov-sticky-left">
          <span className="kicker">Páginas citadas</span>
          <span
            style={{
              width: 1,
              height: 16,
              background: "var(--line-strong)",
              display: "inline-block",
              margin: "0 2px"
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
              maxWidth: 260
            }}
          >
            {project.domain}
          </span>
        </div>
        <div className="ov-sticky-right">
          {lastScanDate && (
            <span className="badge badge-pos" style={{ fontSize: 11 }}>
              Escaneado {lastScanDate}
            </span>
          )}
          {activeRun && latestRun ? (
            <span className="scan-status">
              <span className="dot run" />
              Escaneo en curso
            </span>
          ) : null}
        </div>
      </div>

      {activeRun && !latestRun ? (
        <ScanInProgress activeRun={activeRun} />
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
          <div className="section-empty-title">Sin citas detectadas en el último escaneo</div>
          <div className="section-empty-desc">
            La IA no devolvió URLs o dominios identificables al responder los prompts de este
            escaneo. Esto puede pasar si las respuestas no incluyen fuentes — vuelve a comprobarlo
            tras el próximo escaneo.
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
          promptGroups={promptGroups}
          totalUrls={totalUrls}
          totalCited={totalCited}
          yours={yours}
          opportunities={opportunities}
          opportunityRows={opportunityRows.slice(0, 5)}
          engineTotals={engineTotals}
          citationScore={score?.citation_score ?? null}
          brandLabel={project.brand}
          projectId={projectId}
        />
      )}
    </div>
  );
}
