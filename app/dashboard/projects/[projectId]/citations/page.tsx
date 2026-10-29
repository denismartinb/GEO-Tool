import Link from "next/link";
import type { Metadata } from "next";
import { requireUser } from "@/lib/auth";
import { requireActiveProject } from "@/lib/project-workspace";
import { withAnalysisProgress } from "@/lib/scan/active-run-progress";
import { projectScreenMetadata } from "@/lib/seo/console-metadata";
import { FirstScanTakeover } from "@/components/first-scan-takeover";
import { Ic } from "@/components/ins/ic";
import { Motion } from "@/components/ins/kit/motion";
import { LiveScanCard } from "@/components/ins/overview/live-scan-card";
import { InsCitations } from "@/components/ins/citations/ins-citations";
import { getLLMScanProviders } from "@/lib/scan/providers";
import { buildOrigins, toPageItems, toReachItems } from "@/lib/ins/citations-model";
import {
  aggregateCitations,
  compareOpportunityRows,
  groupOpportunitiesByDomain,
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

  const { citationRows, hasStructuredCitations, impactBreakdown } =
    aggregateCitations({
      rows: (results ?? []) as CitationInputRow[],
      projectDomain: project.domain ?? "",
      competitorDomains,
      promptCategoryMap
    });

  const totalCited = citationRows.reduce((sum, r) => sum + r.cited, 0);
  // Only neutral/third-party domains are actionable outreach targets.
  // Competitor domains (already tracked in project_competitors) are excluded:
  // a brand will never earn a citation on a rival's own site. Unresolved
  // grounding citations (no domain) are excluded too: there's no address to
  // reach out to.
  //
  // CITATIONS-HONESTY-1 (P0-09): this used to also require
  // `competitors.length > 0` — an actually TRACKED competitor named in the
  // same answer that cited the row. The external audit flagged that as an
  // overstatement: `competitors` is what the ANSWER said, never what the
  // PAGE says (see the field's doc comment in aggregate-citations.ts), so
  // gating "this is a good outreach target" on it read as "this page already
  // covers your rival" when nobody had read the page. A domain now qualifies
  // on the one fact that IS checkable — the AI cites it and your domain is
  // absent from those answers — and the competitor signal survives only as
  // labeled, unverified context inside each group (see `coCitedCompetitors`
  // below). Ranked by number of distinct engines citing the domain first
  // (ENGINES-VALUE-2), then by cited count — a source both Gemini and
  // ChatGPT cite is a stronger outreach target than one only one engine uses.
  const opportunityRows: CitationRow[] = citationRows
    .filter((r) => r.category === "third_party" && r.brandMentioned === "no" && r.domain)
    .sort(compareOpportunityRows);

  // Fase 8 deliverable 5: minimal prioritization of the (now much larger,
  // since the competitor gate above was removed) outreach list — grouped by
  // domain with frequency, engines and associated queries, instead of one
  // row per URL. Full editorial `relevance_score` against sector/market is a
  // later differentiation phase, not this one.
  const opportunityGroups = groupOpportunitiesByDomain(opportunityRows);

  const scoreDetails =
    score?.details_json && typeof score.details_json === "object"
      ? (score.details_json as CitationScoreDetails)
      : {};
  const citationRateAnyDomain =
    typeof scoreDetails.citation_score_any_domain === "number" ? scoreDetails.citation_score_any_domain : null;

  // Mirrors the FirstScanTakeover condition: the mission owns the whole screen
  // (ANIMATION-PARITY-1, log §168), hanging directly off `.page.mrk-fill`.
  const showMissionTakeover = Boolean(activeRun) && !latestRun;
  if (activeRun && showMissionTakeover) {
    return (
      <div className="page mrk-fill">
        <FirstScanTakeover projectId={projectId} activeRun={activeRun} domain={project.domain} />
      </div>
    );
  }

  /* «Instrumento» (CONSOLE-INSTRUMENTO-1 F5c, log §362): every figure was
     already computed above; this only shapes it for the new screen. */
  return (
    <div className="ins">
      <Motion id={`citations:${projectId}`}>
        <div className="page sc-cit-page">
          {activeRun ? (
            <LiveScanCard projectId={projectId} initial={activeRun} providers={getLLMScanProviders()} />
          ) : null}
          {!latestRun ? (
            <div className="empty-s">
              <b>Todavía no hay datos de citas</b>
              <p>
                Las páginas que cita la IA al responder tus prompts aparecerán aquí después de completar el primer
                escaneo.
              </p>
              <Link href={`/dashboard/projects/${projectId}`} className="btn line sm">
                Ir a visión general <Ic n="chevr" sm />
              </Link>
            </div>
          ) : !hasStructuredCitations ? (
            // TRUST-METRICS-1: no link to /runs/[runId]; that route is only reachable from /debug.
            <div className="empty-s">
              <b>Este escaneo respondió sin citar fuentes</b>
              <p>
                No es un fallo: una IA no siempre busca en la web para responder. Cuando contesta desde lo que ya
                sabe (sin consultar el buscador), no hay ninguna URL que citar. Vuelve a comprobarlo tras el próximo
                escaneo.
              </p>
            </div>
          ) : (
            <InsCitations
              projectId={projectId}
              domain={project.domain}
              answersWithCitation={citationRateAnyDomain}
              totalCited={totalCited}
              ownCited={impactBreakdown.own}
              pages={toPageItems(citationRows)}
              origins={buildOrigins(citationRows, project.domain)}
              reach={toReachItems(opportunityGroups)}
            />
          )}
        </div>
      </Motion>
    </div>
  );
}
