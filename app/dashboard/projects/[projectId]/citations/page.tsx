import Link from "next/link";
import { Icon } from "@/components/ui/icon";
import { requireUser } from "@/lib/auth";
import { requireActiveProject } from "@/lib/project-workspace";
import { ScanInProgress } from "@/components/scan-in-progress";
import { CitationsClient, type CitationRow, type PromptGroup } from "./citations-client";

type ExtractedJson = {
  brand?: { mentioned?: boolean };
  competitors?: Array<{ name?: string; mentioned?: boolean }>;
  citations?: Array<{
    url?: string | null;
    domain?: string | null;
    title?: string | null;
    source?: "grounding" | "inline";
  }>;
};

type Citation = NonNullable<ExtractedJson["citations"]>[number];

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

/**
 * Resolves a single raw citation into its display/dedup identity.
 *
 * Per docs/adr/0006-grounding-redirect-resolution.md, the raw
 * vertexaisearch.cloud.google.com redirect (`citation.url` for
 * source: "grounding") must never be shown or used as a dedup key — multiple
 * grounding chunks resolving to the same domain are the same cited page and
 * must aggregate into one entry, not one per ephemeral redirect. Inline
 * citations keep their real URL as both display and key since each one is a
 * distinct, genuine page link.
 */
function resolveCitation(citation: Citation): { key: string; title: string; url: string; domain: string } | null {
  const rawDomain = citation.domain?.trim();

  if (citation.source === "grounding") {
    if (rawDomain) {
      const domain = normalizeDomain(rawDomain);
      return { key: domain, title: citation.title?.trim() || domain, url: "", domain };
    }
    const label = citation.title?.trim() || "Fuente sin resolver";
    return { key: `unresolved:${label.toLowerCase()}`, title: label, url: "", domain: "" };
  }

  const inlineUrl = citation.url?.trim();
  const domain = rawDomain ? normalizeDomain(rawDomain) : "";
  if (!inlineUrl && !domain) return null;
  const key = (inlineUrl ?? domain).toLowerCase();
  return { key, title: citation.title?.trim() || inlineUrl || domain, url: inlineUrl ?? "", domain };
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

  const activeRun = recentRuns?.find((r) => r.status === "pending" || r.status === "running");

  const [{ data: results }, { data: score }] = latestRun
    ? await Promise.all([
        supabase
          .from("scan_prompt_results")
          .select("id, prompt_id, prompt_text_snapshot, brand_mentioned, extracted_json")
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

  type PromptGroupAgg = {
    promptId: string;
    promptText: string;
    topic: string | null;
    brandMentioned: boolean;
    citations: Map<string, { title: string; url: string; domain: string; category: Agg["category"]; cited: number }>;
  };

  const agg = new Map<string, Agg>();
  const promptGroupsAgg = new Map<string, PromptGroupAgg>();
  let hasStructuredCitations = false;

  for (const result of results ?? []) {
    const ext = parseExt(result.extracted_json);
    const promptText = result.prompt_text_snapshot ?? "";
    const brandMentioned = Boolean(result.brand_mentioned);
    const mentionedCompetitors = (ext.competitors ?? [])
      .filter((c) => c.mentioned && c.name)
      .map((c) => c.name as string);

    const groupKey = result.prompt_id ?? `text:${promptText.toLowerCase()}`;
    let group = promptGroupsAgg.get(groupKey);
    if (!group) {
      group = {
        promptId: groupKey,
        promptText,
        topic: result.prompt_id ? promptCategoryMap.get(result.prompt_id) ?? null : null,
        brandMentioned: false,
        citations: new Map()
      };
      promptGroupsAgg.set(groupKey, group);
    }
    if (brandMentioned) group.brandMentioned = true;

    for (const citation of ext.citations ?? []) {
      const resolved = resolveCitation(citation);
      if (!resolved) continue;
      const { key, title, url, domain } = resolved;

      hasStructuredCitations = true;

      let category: Agg["category"] = "third_party";
      if (domain) {
        if (isSameOrSubdomain(domain, projectDomain)) {
          category = "brand";
        } else if (competitorDomains.some((c) => isSameOrSubdomain(domain, c.domain))) {
          category = "competitor";
        }
      }

      let row = agg.get(key);
      if (!row) {
        row = {
          id: key,
          title,
          url,
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

      let groupCitation = group.citations.get(key);
      if (!groupCitation) {
        groupCitation = { title, url, domain, category, cited: 0 };
        group.citations.set(key, groupCitation);
      }
      groupCitation.cited += 1;
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

  const promptGroups: PromptGroup[] = Array.from(promptGroupsAgg.values())
    .map((group) => {
      const citations = Array.from(group.citations.values()).sort((a, b) => b.cited - a.cited);
      return {
        id: group.promptId,
        promptText: group.promptText,
        topic: group.topic,
        brandMentioned: group.brandMentioned,
        citations,
        citedUrls: citations.length,
        totalCites: citations.reduce((sum, c) => sum + c.cited, 0)
      };
    })
    .sort((a, b) => b.totalCites - a.totalCites);

  const totalUrls = citationRows.length;
  const totalCited = citationRows.reduce((sum, r) => sum + r.cited, 0);
  const yours = citationRows.filter((r) => r.category === "brand").length;
  // Only neutral/third-party domains are actionable outreach targets.
  // Competitor domains (already tracked in project_competitors) are excluded:
  // a brand will never earn a citation on a rival's own site. Unresolved
  // grounding citations (no domain) are excluded too: there's no address to
  // reach out to.
  const opportunityRows = citationRows.filter(
    (r) => r.category === "third_party" && r.brandMentioned === "no" && r.domain
  );
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
          citationScore={score?.citation_score ?? null}
          brandLabel={project.brand}
        />
      )}
    </div>
  );
}
