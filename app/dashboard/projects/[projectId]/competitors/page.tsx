import Link from "next/link";
import { Icon } from "@/components/ui/icon";
import { requireUser } from "@/lib/auth";
import { requireActiveProject } from "@/lib/project-workspace";
import { ScanInProgress } from "@/components/scan-in-progress";
import { CompetitorRow } from "./competitor-row";

/* ---- Helpers ---- */

const COMPETITOR_COLORS = ["#0e9488", "#d9772b", "#9333a8", "#3b6fd6", "#e54563", "#c47e12"];

export type CompetitorRowData = {
  id: string;
  name: string;
  domain: string;
  color: string;
  initial: string;
  mentions: number;
  sov: number;
  mentionRate: number;
  citationRate: number;
  promptCount: number; // unique runs where seen
};

type ExtractedJson = {
  brand?: { mentioned?: boolean };
  competitors?: Array<{ name?: string; mentioned?: boolean }>;
  citations?: Array<{ url?: string | null; domain?: string | null }>;
};

function parseExt(raw: unknown): ExtractedJson {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return raw as ExtractedJson;
}

function getInitial(name: string): string {
  return (name ?? "?").slice(0, 1).toUpperCase();
}

function normKey(name: string): string {
  return name.trim().toLowerCase();
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

/* ---- Page ---- */

export default async function CompetitorsPage({
  params
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const project = await requireActiveProject(projectId);
  const { supabase } = await requireUser();

  /* 1. Configured competitors + all completed runs + recent runs (for activeRun detection) */
  const [{ data: competitors }, { data: allRuns }, { data: recentRuns }] = await Promise.all([
    supabase
      .from("project_competitors")
      .select("id, name, domain, is_active, created_at")
      .eq("project_id", projectId)
      .order("is_active", { ascending: false })
      .order("created_at", { ascending: true }),
    supabase
      .from("scan_runs")
      .select("id, status, created_at")
      .eq("project_id", projectId)
      .eq("status", "completed")
      .order("created_at", { ascending: false }),
    supabase
      .from("scan_runs")
      .select("id, status, total_prompts, successful_prompts, failed_prompts, started_at")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(5)
  ]);

  const configuredCompetitors = competitors ?? [];
  const completedRuns = allRuns ?? [];
  const completedRunIds = completedRuns.map((r) => r.id);
  const activeRun = recentRuns?.find((r) => r.status === "pending" || r.status === "running");

  /* 2. Prompt results across ALL completed runs */
  const { data: allResults } =
    completedRunIds.length > 0
      ? await supabase
          .from("scan_prompt_results")
          .select("extracted_json, run_id")
          .eq("project_id", projectId)
          .eq("status", "completed")
          .in("run_id", completedRunIds)
      : { data: [] };

  const results = allResults ?? [];

  /* 3. Compute SoV correctly:
       SoV(X) = mentions(X) / (brandMentions + Σ competitorMentions) * 100
  */
  let brandMentions = 0;
  const competitorMentionMap = new Map<string, number>();
  const competitorPromptSet = new Map<string, Set<string>>(); // key → Set<run_id>
  const competitorCitationMap = new Map<string, number>(); // key → count of results citing that competitor's domain
  let brandCitations = 0; // prompts where project domain appears in citations
  let totalResultsCount = results.length;

  const projectDomainNorm = normalizeDomain(project.domain ?? "");

  // Map of normalized competitor key → normalized domain, for citation matching
  const competitorDomainMap = new Map<string, string>();
  for (const c of configuredCompetitors) {
    const domain = normalizeDomain(c.domain ?? "");
    if (domain) competitorDomainMap.set(normKey(c.name), domain);
  }

  for (const result of results) {
    const ext = parseExt(result.extracted_json);

    // Brand mentioned
    if (ext.brand?.mentioned) {
      brandMentions += 1;
    }

    // Competitor mentions
    for (const comp of ext.competitors ?? []) {
      if (!comp.name || !comp.mentioned) continue;
      const key = normKey(comp.name);
      competitorMentionMap.set(key, (competitorMentionMap.get(key) ?? 0) + 1);
      if (!competitorPromptSet.has(key)) competitorPromptSet.set(key, new Set());
      competitorPromptSet.get(key)!.add(result.run_id as string);
    }

    // Citation domains for this result
    const citDomains = (ext.citations ?? [])
      .map((c) => normalizeDomain(c.domain ?? c.url ?? ""))
      .filter((d) => d.length > 0);

    // Brand citation rate
    if (citDomains.some((d) => isSameOrSubdomain(d, projectDomainNorm))) {
      brandCitations += 1;
    }

    // Competitor citation rate
    for (const [key, domain] of competitorDomainMap) {
      if (citDomains.some((d) => isSameOrSubdomain(d, domain))) {
        competitorCitationMap.set(key, (competitorCitationMap.get(key) ?? 0) + 1);
      }
    }
  }

  // SoV denominator: brand + all competitor mentions that belong to configured competitors
  const configuredMentionTotal =
    brandMentions +
    configuredCompetitors.reduce((sum, c) => {
      const key = normKey(c.name);
      return sum + (competitorMentionMap.get(key) ?? 0);
    }, 0);

  // Brand SoV
  const brandSov =
    configuredMentionTotal > 0
      ? Math.round((brandMentions / configuredMentionTotal) * 100)
      : 0;

  // Brand mention rate (% of prompts where brand mentioned)
  const brandMentionRate =
    totalResultsCount > 0 ? Math.round((brandMentions / totalResultsCount) * 100) : 0;

  // Brand citation rate
  const brandCitationRate =
    totalResultsCount > 0 ? Math.round((brandCitations / totalResultsCount) * 100) : 0;

  // Build competitor rows
  const competitorRows: CompetitorRowData[] = configuredCompetitors
    .filter((c) => c.is_active)
    .map((c, i) => {
      const key = normKey(c.name);
      const mentions = competitorMentionMap.get(key) ?? 0;
      const sov =
        configuredMentionTotal > 0 ? Math.round((mentions / configuredMentionTotal) * 100) : 0;
      const mentionRate =
        totalResultsCount > 0 ? Math.round((mentions / totalResultsCount) * 100) : 0;
      const promptCount = competitorPromptSet.get(key)?.size ?? 0;
      const citations = competitorCitationMap.get(key) ?? 0;
      const citationRate =
        totalResultsCount > 0 ? Math.round((citations / totalResultsCount) * 100) : 0;

      return {
        id: c.id,
        name: c.name,
        domain: c.domain,
        color: COMPETITOR_COLORS[i % COMPETITOR_COLORS.length],
        initial: getInitial(c.name),
        mentions,
        sov,
        mentionRate,
        citationRate,
        promptCount
      };
    })
    .sort((a, b) => b.sov - a.sov);

  // Max SoV for bar scaling (brand is reference if highest)
  const allSovValues = [brandSov, ...competitorRows.map((c) => c.sov)];
  const maxSov = Math.max(...allSovValues, 1);

  /* Summary text */
  const topCompetitor = competitorRows[0];
  const hasData = completedRuns.length > 0 && totalResultsCount > 0;

  return (
    <div className="page">
      {/* Sticky header */}
      <div className="ov-sticky-header">
        <div className="ov-sticky-left">
          <div>
            <p className="kicker" style={{ marginBottom: 2 }}>Competidores</p>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span
                style={{ fontSize: 15, fontWeight: 750, color: "var(--ink)", letterSpacing: "-.01em" }}
              >
                {project.name}
              </span>
              <span className="badge badge-neutral">
                {configuredCompetitors.filter((c) => c.is_active).length} competidores
              </span>
            </div>
          </div>
        </div>
        <div className="ov-sticky-right">
          {activeRun && completedRuns.length > 0 ? (
            <span className="scan-status">
              <span className="dot run" />
              Escaneo en curso
            </span>
          ) : null}
          <Link
            href={`/dashboard/projects/${projectId}`}
            className="badge badge-outline"
            style={{ fontSize: 12, fontWeight: 650, padding: "5px 10px" }}
          >
            <Icon name="chevronLeft" size={12} />
            Visión general
          </Link>
        </div>
      </div>

      {activeRun && completedRuns.length === 0 ? (
        <ScanInProgress activeRun={activeRun} />
      ) : (
      <>
      {/* Summary banner */}
      <div className="summary mt8">
        <div className="summary-ico">
          <Icon name="competitors" size={20} />
        </div>
        <p className="summary-txt">
          {!hasData ? (
            <>
              Sin datos de competencia todavía.{" "}
              <Link
                href={`/dashboard/projects/${projectId}`}
                style={{ color: "var(--accent)", fontWeight: 700 }}
              >
                Lanza el primer escaneo
              </Link>{" "}
              para ver cómo aparece tu marca frente a la competencia.
            </>
          ) : (
            <>
              <b>{project.brand}</b> aparece en{" "}
              <b className={brandMentionRate >= 50 ? "" : "hl-neg"}>
                {brandMentionRate}% de los prompts
              </b>
              {" "}analizados
              {totalResultsCount > 0 && <> ({totalResultsCount} prompts en total)</>}.
              {topCompetitor && topCompetitor.sov > brandSov ? (
                <>
                  {" "}Tu competidor más fuerte es{" "}
                  <b>{topCompetitor.name}</b> con{" "}
                  <span className="hl-neg">{topCompetitor.sov}% de cuota de voz</span>.
                </>
              ) : topCompetitor ? (
                <>
                  {" "}Lideras con <span style={{ color: "var(--pos-ink)", fontWeight: 700 }}>{brandSov}% de cuota de voz</span>.
                </>
              ) : null}
            </>
          )}
        </p>
      </div>

      {/* Empty: no competitors configured */}
      {configuredCompetitors.length === 0 ? (
        <div style={{ marginTop: 14 }}>
          <div className="section-head">
            <div className="section-title">Panorámica competitiva</div>
          </div>
          <div className="card" style={{ padding: "48px 40px", textAlign: "center" }}>
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: "999px",
                background: "var(--surface-sunk)",
                display: "grid",
                placeItems: "center",
                color: "var(--ink-3)",
                margin: "0 auto 16px"
              }}
            >
              <Icon name="competitors" size={22} />
            </div>
            <div style={{ fontSize: 15, fontWeight: 750, color: "var(--ink)", marginBottom: 8 }}>
              No hay competidores configurados
            </div>
            <div
              style={{ fontSize: 13.5, color: "var(--ink-3)", maxWidth: 380, margin: "0 auto 20px", lineHeight: 1.6 }}
            >
              Añade competidores durante el onboarding para ver el análisis comparativo de cuota de
              voz en IA.
            </div>
            <Link
              href={`/dashboard/projects/${projectId}`}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                fontSize: 13,
                fontWeight: 650,
                color: "var(--accent)"
              }}
            >
              Volver a visión general
              <Icon name="arrRight" size={13} />
            </Link>
          </div>
        </div>
      ) : null}

      {/* Empty: competitors configured but no completed runs */}
      {configuredCompetitors.length > 0 && completedRuns.length === 0 ? (
        <div style={{ marginTop: 14 }}>
          <div className="section-head">
            <div className="section-title">Panorámica competitiva · cuota de voz en IA</div>
          </div>
          <div className="card" style={{ padding: "48px 40px", textAlign: "center" }}>
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: "999px",
                background: "var(--surface-sunk)",
                display: "grid",
                placeItems: "center",
                color: "var(--ink-3)",
                margin: "0 auto 16px"
              }}
            >
              <Icon name="resonance" size={22} />
            </div>
            <div style={{ fontSize: 15, fontWeight: 750, color: "var(--ink)", marginBottom: 8 }}>
              Sin datos de competencia todavía
            </div>
            <div
              style={{ fontSize: 13.5, color: "var(--ink-3)", maxWidth: 380, margin: "0 auto 20px", lineHeight: 1.6 }}
            >
              Las menciones y la cuota de voz de tus competidores aparecerán aquí tras completar el
              primer escaneo real con Gemini.
            </div>
            <Link
              href={`/dashboard/projects/${projectId}`}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                fontSize: 13,
                fontWeight: 650,
                color: "var(--accent)"
              }}
            >
              <Icon name="play" size={13} />
              Lanzar escaneo desde visión general
            </Link>
          </div>
        </div>
      ) : null}

      {/* Main competitive table */}
      {configuredCompetitors.length > 0 && completedRuns.length > 0 ? (
        <>
          <div className="section-head">
            <div className="section-title">Panorámica competitiva · cuota de voz en IA</div>
            <div className="section-desc">
              Basado en{" "}
              <b style={{ color: "var(--ink-2)" }}>
                {completedRuns.length} {completedRuns.length === 1 ? "escaneo completado" : "escaneos completados"}
              </b>{" "}
              · {totalResultsCount} prompts analizados
            </div>
          </div>

          <div className="card">
            <div style={{ padding: "6px 6px 4px", overflowX: "auto" }}>
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Marca</th>
                    <th className="num">Mención</th>
                    <th className="num">Cita</th>
                    <th>Cuota de voz en IA</th>
                    <th className="num">Prompts</th>
                  </tr>
                </thead>
                <tbody>
                  {/* Brand (you) row — always first */}
                  <tr className="you">
                    <td>
                      <div className="ent">
                        <span
                          className="fav"
                          style={{ background: "var(--accent)" }}
                        >
                          {getInitial(project.brand)}
                        </span>
                        <div>
                          <div className="nm">
                            {project.brand}
                            <span
                              style={{
                                fontSize: 11,
                                color: "var(--accent)",
                                fontWeight: 700,
                                marginLeft: 6
                              }}
                            >
                              Tú
                            </span>
                          </div>
                          <div className="dm">{project.domain}</div>
                        </div>
                      </div>
                    </td>
                    <td className="num">
                      <b className="tnum">{brandMentionRate}%</b>
                    </td>
                    <td className="num">
                      <b className="tnum">{brandCitationRate}%</b>
                    </td>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div className="sov-bar comp-tbl-sov">
                          <div
                            className="sov-fill"
                            style={{
                              width: `${(brandSov / maxSov) * 100}%`,
                              background: "var(--accent)"
                            }}
                          />
                        </div>
                        <span
                          className="tnum"
                          style={{ fontSize: 12, fontWeight: 700, width: 34, textAlign: "right" }}
                        >
                          {brandSov}%
                        </span>
                      </div>
                    </td>
                    <td className="num">
                      <span className="tnum" style={{ color: "var(--ink-2)" }}>
                        {brandMentions}
                      </span>
                    </td>
                  </tr>

                  {/* Competitor rows */}
                  {competitorRows.map((c) => (
                    <CompetitorRow key={c.id} projectId={projectId} row={c} maxSov={maxSov} />
                  ))}

                  {/* If no active competitors */}
                  {competitorRows.length === 0 ? (
                    <tr>
                      <td
                        colSpan={5}
                        style={{ textAlign: "center", padding: "28px 20px", color: "var(--ink-4)", fontSize: 13 }}
                      >
                        No hay competidores activos configurados.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>

            {/* Footnote */}
            <div
              style={{
                padding: "10px 16px",
                borderTop: "1px solid var(--line-soft)",
                fontSize: 11.5,
                color: "var(--ink-4)",
                lineHeight: 1.5
              }}
            >
              <b>Mención</b>: % de prompts donde aparece la marca.{" "}
              <b>Cita</b>: % de prompts donde el dominio es fuente citada.{" "}
              <b>Cuota de voz</b>: menciones propias / (menciones marca + Σ menciones competidores).{" "}
              <b>Prompts</b>: total de respuestas donde se menciona al competidor.
            </div>
          </div>

          {/* No detections */}
          {competitorRows.every((c) => c.mentions === 0) && (
            <div
              className="section-empty"
              style={{ marginTop: 14 }}
            >
              <div className="section-empty-title">
                Ningún competidor fue mencionado en los escaneos analizados
              </div>
              <div className="section-empty-desc">
                Revisa si los prompts son suficientemente comparativos o ajusta la lista de
                competidores en el onboarding.
              </div>
            </div>
          )}
        </>
      ) : null}

      {/* Footer links */}
      <div
        style={{
          display: "flex",
          gap: 20,
          marginTop: 28,
          paddingTop: 18,
          borderTop: "1px solid var(--line-soft)",
          flexWrap: "wrap"
        }}
      >
        <Link
          href={`/dashboard/projects/${projectId}`}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            fontSize: 13,
            color: "var(--ink-3)",
            fontWeight: 600
          }}
        >
          <Icon name="overview" size={13} />
          Visión general
        </Link>
        <Link
          href={`/dashboard/projects/${projectId}/runs`}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            fontSize: 13,
            color: "var(--ink-3)",
            fontWeight: 600
          }}
        >
          <Icon name="runs" size={13} />
          Historial de escaneos
        </Link>
        <Link
          href={`/dashboard/projects/${projectId}/prompts`}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 5,
            fontSize: 13,
            color: "var(--ink-3)",
            fontWeight: 600
          }}
        >
          <Icon name="prompts" size={13} />
          Prompts
        </Link>
      </div>
      </>
      )}
    </div>
  );
}
