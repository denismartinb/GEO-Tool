import Link from "next/link";
import { Icon } from "@/components/ui/icon";
import { requireUser } from "@/lib/auth";
import { requireActiveProject } from "@/lib/project-workspace";
import { ScanInProgress } from "@/components/scan-in-progress";
import { CitationsClient, type CitationRow } from "./citations-client";

type ExtractedJson = {
  brand?: { mentioned?: boolean };
  competitors?: Array<{ name?: string; mentioned?: boolean }>;
  citations?: Array<{ url?: string | null; domain?: string | null; label?: string | null }>;
};

function parseExt(raw: unknown): ExtractedJson {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return raw as ExtractedJson;
}

function normalizeDomain(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/.*$/, "");
}

function isSameOrSubdomain(domain: string, root: string): boolean {
  if (!domain || !root) return false;
  return domain === root || domain.endsWith(`.${root}`);
}

export default async function CitationsPage({
  params
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const project = await requireActiveProject(projectId);
  const { supabase } = await requireUser();

  const [{ data: latestRun }, { data: recentRuns }, { data: competitors }] = await Promise.all([
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
      .eq("is_active", true)
  ]);

  const activeRun = recentRuns?.find((r) => r.status === "pending" || r.status === "running");

  const [{ data: results }, { data: score }] = latestRun
    ? await Promise.all([
        supabase
          .from("scan_prompt_results")
          .select("prompt_text_snapshot, brand_mentioned, extracted_json")
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

  const projectDomain = normalizeDomain(project.domain ?? "");
  const competitorDomains = (competitors ?? [])
    .map((c) => ({ name: c.name, domain: normalizeDomain(c.domain ?? "") }))
    .filter((c) => c.domain.length > 0);

  type Agg = {
    id: string;
    title: string;
    url: string;
    domain: string;
    category: "brand" | "competitor" | "third_party";
    cited: number;
    brandMentionedYes: number;
    brandMentionedNo: number;
    competitors: Set<string>;
    prompts: Array<{ text: string; brandMentioned: boolean }>;
  };

  const agg = new Map<string, Agg>();
  let hasStructuredCitations = false;

  for (const result of results ?? []) {
    const ext = parseExt(result.extracted_json);
    const promptText = result.prompt_text_snapshot ?? "";
    const brandMentioned = Boolean(result.brand_mentioned);
    const mentionedCompetitors = (ext.competitors ?? [])
      .filter((c) => c.mentioned && c.name)
      .map((c) => c.name as string);

    for (const citation of ext.citations ?? []) {
      const domain = normalizeDomain(citation.domain ?? citation.url ?? "");
      if (!domain) continue;
      hasStructuredCitations = true;

      const key = (citation.url ?? domain).trim().toLowerCase();
      let category: Agg["category"] = "third_party";
      if (isSameOrSubdomain(domain, projectDomain)) {
        category = "brand";
      } else if (competitorDomains.some((c) => isSameOrSubdomain(domain, c.domain))) {
        category = "competitor";
      }

      let row = agg.get(key);
      if (!row) {
        row = {
          id: key,
          title: citation.label?.trim() || domain,
          url: citation.url ?? domain,
          domain,
          category,
          cited: 0,
          brandMentionedYes: 0,
          brandMentionedNo: 0,
          competitors: new Set(),
          prompts: []
        };
        agg.set(key, row);
      }

      row.cited += 1;
      if (brandMentioned) row.brandMentionedYes += 1;
      else row.brandMentionedNo += 1;
      for (const name of mentionedCompetitors) row.competitors.add(name);
      row.prompts.push({ text: promptText, brandMentioned });
    }
  }

  const citationRows: CitationRow[] = Array.from(agg.values())
    .map((row) => ({
      id: row.id,
      title: row.title,
      url: row.url,
      domain: row.domain,
      category: row.category,
      brandMentioned: (row.category === "brand"
        ? "na"
        : row.brandMentionedYes > 0
          ? "yes"
          : "no") as CitationRow["brandMentioned"],
      competitors: Array.from(row.competitors),
      cited: row.cited,
      prompts: row.prompts
    }))
    .sort((a, b) => b.cited - a.cited);

  const totalUrls = citationRows.length;
  const totalCited = citationRows.reduce((sum, r) => sum + r.cited, 0);
  const yours = citationRows.filter((r) => r.category === "brand").length;
  const opportunities = citationRows.filter(
    (r) => r.category !== "brand" && r.brandMentioned === "no"
  ).length;

  const lastScanDate = latestRun
    ? new Date(latestRun.finished_at ?? latestRun.created_at).toLocaleDateString("es-ES", {
        day: "numeric",
        month: "short",
        year: "numeric"
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
          {activeRun && latestRun ? (
            <span className="scan-status">
              <span className="dot run" />
              Escaneo en curso
            </span>
          ) : lastScanDate ? (
            <span style={{ fontSize: 12, color: "var(--ink-4)", fontWeight: 500 }}>
              Último escaneo: {lastScanDate}
            </span>
          ) : null}
          <Link href={`/dashboard/projects/${projectId}`} className="btn btn-ghost btn-sm">
            <Icon name="chevronLeft" size={14} />
            Visión general
          </Link>
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
          rows={citationRows}
          totalUrls={totalUrls}
          totalCited={totalCited}
          yours={yours}
          opportunities={opportunities}
          citationScore={score?.citation_score ?? null}
          brandLabel={project.brand}
        />
      )}
    </div>
  );
}
