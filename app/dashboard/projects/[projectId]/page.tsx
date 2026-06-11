import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { EmptyState } from "@/components/empty-state";
import { Gauge } from "@/components/ui/gauge";
import { Sparkline } from "@/components/ui/sparkline";
import { Delta } from "@/components/ui/delta";
import { DotMeter } from "@/components/ui/dot-meter";
import { ScanInProgress } from "@/components/scan-in-progress";
import { ScanTriggerButton } from "@/components/scan-trigger-button";
import { feedbackErrorMessages, feedbackSuccessMessages } from "@/lib/projects/feedback-messages";

/* ---- constants & helpers ---- */

const COMPETITOR_COLORS = ["#0e9488", "#d9772b", "#9333a8", "#3b6fd6", "#e54563"];

const statusLabels: Record<string, string> = {
  pending: "pendiente",
  running: "en curso",
  completed: "completado",
  failed: "fallido",
  cancelled: "cancelado"
};

const confidenceLabels: Record<string, string> = {
  low: "baja",
  medium: "media",
  high: "alta"
};

const sentimentLabels: Record<string, string> = {
  positive: "positivo",
  neutral: "neutral",
  negative: "negativo",
  mixed: "mixto",
  unknown: "desconocido"
};

const priorityLabels: Record<string, string> = {
  high: "alta",
  med: "media",
  low: "baja"
};

function n(v: unknown): number {
  return Number(v ?? 0);
}

function confidenceToPercent(c: string): number {
  return c === "high" ? 90 : c === "medium" ? 70 : 40;
}

function impactEffortToN(v: string): number {
  return v === "high" ? 5 : v === "medium" || v === "med" ? 3 : 1;
}

function getBandLabel(score: number): string {
  if (score >= 70) return "Franja «competitivo»";
  if (score >= 40) return "Franja «emergente»";
  return "Franja «inicial»";
}

function getBandTone(score: number): string {
  if (score >= 70) return "pos";
  if (score >= 40) return "accent";
  return "warn";
}

type ExtractedJsonPartial = {
  competitors?: Array<{ name?: string; mentioned?: boolean }>;
  citations?: Array<{ url?: string | null; domain?: string | null }>;
  brand?: { mentioned?: boolean; evidence?: string[] };
  summary?: string;
};

function parseExt(raw: unknown): ExtractedJsonPartial {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return raw as ExtractedJsonPartial;
}

/* ---- page ---- */

export default async function ProjectDetailPage({
  params,
  searchParams
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const { projectId } = await params;
  const feedback = await searchParams;
  const { supabase } = await requireUser();

  const { data: project } = await supabase
    .from("projects")
    .select("id, name, domain, brand, country, language, created_at")
    .eq("id", projectId)
    .eq("is_archived", false)
    .single();

  if (!project) notFound();

  const [{ data: prompts }, { data: competitors }, { data: runs }] = await Promise.all([
    supabase
      .from("project_prompts")
      .select("id, prompt_text, category, is_active")
      .eq("project_id", projectId)
      .eq("is_active", true)
      .order("created_at", { ascending: false }),
    supabase
      .from("project_competitors")
      .select("id, name, domain, is_active")
      .eq("project_id", projectId)
      .eq("is_active", true)
      .order("created_at", { ascending: false }),
    supabase
      .from("scan_runs")
      .select("id, status, total_prompts, successful_prompts, failed_prompts, created_at, started_at, finished_at")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
  ]);

  const latestRun = runs?.[0];
  const latestCompletedRun = runs?.find((r) => r.status === "completed");
  const completedRunsCount = runs?.filter((r) => r.status === "completed").length ?? 0;
  const latestFailedRun = latestRun?.status === "failed" ? latestRun : null;
  const activeRun = runs?.find((r) => r.status === "pending" || r.status === "running");
  const feedbackErrorMessage = feedback.error
    ? feedbackErrorMessages[feedback.error] ?? feedbackErrorMessages.unexpected_error
    : null;
  const successMessage = feedback.success ? feedbackSuccessMessages[feedback.success] ?? null : null;

  /* ---- queries that require a completed run ---- */
  const [
    { data: latestScore },
    { data: allPromptResults },
    { data: latestRecommendations },
    { data: trendHistory }
  ] = latestCompletedRun
    ? await Promise.all([
        supabase
          .from("run_scores")
          .select("visibility_score, citation_score, competitor_gap_score, confidence, details_json")
          .eq("project_id", projectId)
          .eq("run_id", latestCompletedRun.id)
          .maybeSingle(),
        supabase
          .from("scan_prompt_results")
          .select("brand_mentioned, citation_found, sentiment, extracted_json")
          .eq("project_id", projectId)
          .eq("run_id", latestCompletedRun.id)
          .eq("status", "completed"),
        supabase
          .from("recommendations")
          .select("id, priority_rank, title, impact, effort, confidence, recommendation_type, evidence_json")
          .eq("project_id", projectId)
          .eq("run_id", latestCompletedRun.id)
          .eq("status", "active")
          .order("priority_rank", { ascending: true })
          .limit(3),
        supabase
          .from("run_scores")
          .select("visibility_score, citation_score, competitor_gap_score, created_at")
          .eq("project_id", projectId)
          .order("created_at", { ascending: true })
          .limit(7)
      ])
    : [{ data: null }, { data: null }, { data: null }, { data: null }];

  /* ---- derived values ---- */
  const scoreDetails =
    latestScore?.details_json && typeof latestScore.details_json === "object"
      ? (latestScore.details_json as { total_results?: number; brand_mentioned_count?: number })
      : {};
  const totalResults = n(scoreDetails.total_results ?? latestCompletedRun?.successful_prompts);
  const brandMentions = n(
    scoreDetails.brand_mentioned_count ??
      allPromptResults?.filter((r) => r.brand_mentioned).length
  );
  const visibilityScore = n(latestScore?.visibility_score);
  const citationScore = n(latestScore?.citation_score);
  const competitorRiskScore = n(latestScore?.competitor_gap_score);
  const runConfidence = latestScore?.confidence ?? "low";

  const computedMentionRate = allPromptResults?.length
    ? Math.round((allPromptResults.filter((r) => r.brand_mentioned).length / allPromptResults.length) * 100)
    : Math.round((totalResults > 0 ? (brandMentions / totalResults) * 100 : visibilityScore));

  const computedCitationRate = allPromptResults?.length
    ? Math.round((allPromptResults.filter((r) => r.citation_found).length / allPromptResults.length) * 100)
    : citationScore;

  /* ---- trend sparklines ---- */
  const visTrend = (trendHistory ?? []).map((r) => n(r.visibility_score));
  const citTrend = (trendHistory ?? []).map((r) => n(r.citation_score));
  const gapTrend = (trendHistory ?? []).map((r) => n(r.competitor_gap_score));
  const confTrend = (trendHistory ?? []).map(() => confidenceToPercent(runConfidence));

  const prevScore = trendHistory && trendHistory.length >= 2 ? trendHistory[trendHistory.length - 2] : null;
  const visDelta = prevScore ? visibilityScore - n(prevScore.visibility_score) : 0;
  const citDelta = prevScore ? computedCitationRate - n(prevScore.citation_score) : 0;
  const gapDelta = prevScore ? competitorRiskScore - n(prevScore.competitor_gap_score) : 0;

  /* ---- competitor breakdown from extracted_json ---- */
  const competitorMentionCounts: Record<string, number> = {};
  const citedUrlCounts: Record<string, { display: string; domain: string; count: number }> = {};

  for (const result of allPromptResults ?? []) {
    const ext = parseExt(result.extracted_json);

    for (const comp of ext.competitors ?? []) {
      if (comp.name && comp.mentioned) {
        const key = comp.name.toLowerCase().trim();
        competitorMentionCounts[key] = (competitorMentionCounts[key] ?? 0) + 1;
      }
    }
    for (const cit of ext.citations ?? []) {
      const url = cit.url?.trim() || cit.domain?.trim();
      if (!url) continue;
      const domain = cit.domain?.trim() || url.replace(/^https?:\/\//, "").split("/")[0];
      if (!citedUrlCounts[url]) citedUrlCounts[url] = { display: url, domain, count: 0 };
      citedUrlCounts[url].count++;
    }
  }

  const totalForSov =
    brandMentions +
    (competitors ?? []).reduce((sum, c) => sum + (competitorMentionCounts[c.name.toLowerCase().trim()] ?? 0), 0);

  const competitorRows = (competitors ?? []).map((comp, i) => {
    const key = comp.name.toLowerCase().trim();
    const mentionCount = competitorMentionCounts[key] ?? 0;
    const mentionRate = allPromptResults?.length
      ? Math.round((mentionCount / allPromptResults.length) * 100)
      : 0;
    const sov = totalForSov > 0 ? Math.round((mentionCount / totalForSov) * 100) : 0;
    return {
      name: comp.name,
      domain: comp.domain,
      color: COMPETITOR_COLORS[i % COMPETITOR_COLORS.length],
      initial: comp.name.slice(0, 1).toUpperCase(),
      mentionRate,
      sov,
      isLeader: false
    };
  });

  const brandSov = totalForSov > 0 ? Math.round((brandMentions / totalForSov) * 100) : 0;
  const maxMentionRate = Math.max(computedMentionRate, ...competitorRows.map((c) => c.mentionRate));

  const citedPages = Object.values(citedUrlCounts)
    .sort((a, b) => b.count - a.count)
    .slice(0, 5)
    .map((p) => ({
      ...p,
      isYours: p.domain.replace(/^www\./, "").includes(project.domain.replace(/^www\./, ""))
    }));

  const hasData = Boolean(latestCompletedRun && latestScore);
  const confidencePercent = confidenceToPercent(runConfidence);

  const topCompetitor = competitorRows.sort((a, b) => b.mentionRate - a.mentionRate)[0];

  /* ---- render ---- */
  return (
    <div className="page">
      {/* Sticky page header */}
      <div className="ov-sticky-header">
        <div className="ov-sticky-left">
          <div>
            <p className="kicker" style={{ marginBottom: 2 }}>Visión general</p>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 15, fontWeight: 750, color: "var(--ink)", letterSpacing: "-.01em" }}>{project.name}</span>
              <span className="badge badge-neutral" style={{ fontFamily: "var(--mono)", fontSize: 11 }}>{project.domain}</span>
              <span className="meta-pill">{project.country}/{project.language}</span>
            </div>
          </div>
        </div>
        <div className="ov-sticky-right">
          {latestCompletedRun && (
            <span className="badge badge-pos" style={{ fontSize: 11 }}>
              Escaneado {new Date(latestCompletedRun.finished_at ?? latestCompletedRun.created_at)
                .toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" })}
            </span>
          )}
          <button type="button" className="header-bell" aria-label="Notificaciones" title="Próximamente: notificaciones">
            <Icon name="bell" size={16} />
          </button>
          {activeRun ? (
            <span className="scan-status">
              <span className="dot run" />
              Escaneo en curso
            </span>
          ) : null}
          <ScanTriggerButton
            projectId={projectId}
            disabled={Boolean(activeRun) || !prompts?.length}
            label={latestCompletedRun ? "Repetir escaneo" : "Lanzar escaneo"}
          />
        </div>
      </div>

      {/* Feedback */}
      {feedbackErrorMessage && (
        <p className="feedback error" style={{ marginBottom: 16 }}>{feedbackErrorMessage}</p>
      )}
      {successMessage && (
        <p className="feedback success" style={{ marginBottom: 16 }}>{successMessage}</p>
      )}
      {latestFailedRun && (
        <div className="feedback" style={{ background: "var(--warn-soft)", color: "var(--warn-ink)", borderColor: "#f3d086", marginBottom: 16 }}>
          <p style={{ fontWeight: 650 }}>
            {latestCompletedRun
              ? "El último escaneo no se pudo completar. Se muestran los últimos resultados completados."
              : "El último escaneo no se pudo completar. Vuelve a intentarlo con el botón de arriba."}
          </p>
        </div>
      )}
      {!prompts?.length && (
        <p className="feedback" style={{ background: "var(--warn-soft)", color: "var(--warn-ink)", borderColor: "#f3d086", marginBottom: 16 }}>
          Añade al menos un prompt activo antes de escanear.{" "}
          <Link href={`/dashboard/projects/${projectId}/prompts`} style={{ fontWeight: 700, textDecoration: "underline" }}>Añadir prompts</Link>
        </p>
      )}

      {/* ===== DATA STATE ===== */}
      {hasData ? (
        <>
          {/* 1 · Executive summary banner */}
          <div className="summary">
            <div className="summary-ico">
              <Icon name="sparkles" size={18} />
            </div>
            <p className="summary-txt">
              <b>{project.brand}</b> aparece en{" "}
              <b>{brandMentions} de {totalResults} prompts</b> analizados.
              {topCompetitor && topCompetitor.mentionRate > computedMentionRate ? (
                <>
                  {" "}Tu competidor más visible,{" "}
                  <b>{topCompetitor.name}</b>, aparece en{" "}
                  <span className="hl-neg">{topCompetitor.mentionRate}% de los prompts</span>.
                </>
              ) : null}
              {latestRecommendations?.length ? (
                <>
                  {" "}Lumira encontró{" "}
                  <b>{latestRecommendations.length} acciones prioritarias</b> para mejorar tu visibilidad.
                </>
              ) : null}
              {completedRunsCount < 2 && (
                <span style={{ color: "var(--ink-4)", fontStyle: "italic", fontSize: 13 }}>
                  {" "}(Muestra inicial — la tendencia estará disponible con ≥2 escaneos.)
                </span>
              )}
            </p>
          </div>

          {/* 2 · Section: Visibilidad de un vistazo */}
          <div className="section-head" style={{ marginTop: 28 }}>
            <div className="section-title">Visibilidad de un vistazo</div>
            <div className="section-desc">
              Señales reales · último escaneo{" "}
              {new Date(latestCompletedRun!.finished_at ?? latestCompletedRun!.created_at).toLocaleDateString("es-ES", { day: "numeric", month: "short" })}
            </div>
            <div className="right">
              <span className={`badge badge-${getBandTone(visibilityScore)}`}>
                {getBandLabel(visibilityScore)}
              </span>
            </div>
          </div>

          {/* Hero card */}
          <div className="hero-v2">
            {/* Gauge */}
            <div className="hv-gauge">
              <Gauge value={visibilityScore} size={140} stroke={14} />
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".06em", color: "var(--ink-4)", marginBottom: 6 }}>
                  Puntuación GEO
                </div>
                <span className={`badge badge-${getBandTone(visibilityScore)}`}>
                  {getBandLabel(visibilityScore)}
                </span>
              </div>
            </div>

            <div className="hv-divider" />

            {/* Composition */}
            <div className="hv-compose">
              <div className="hv-block-label">Cómo se compone tu puntuación</div>
              {[
                { l: "Tasa de mención", v: computedMentionRate, color: "var(--accent)" },
                { l: "Tasa de cita", v: computedCitationRate, color: "#7c3aed" },
                { l: "Riesgo competitivo", v: Math.min(100, competitorRiskScore), color: "#0d9488" }
              ].map((c) => (
                <div className="compose-row" key={c.l}>
                  <div className="compose-top">
                    <span className="compose-l">{c.l}</span>
                    <span className="compose-v tnum">{c.v}%</span>
                  </div>
                  <div className="sov-bar" style={{ height: 7 }}>
                    <div className="sov-fill" style={{ width: `${Math.min(100, c.v)}%`, background: c.color }} />
                  </div>
                </div>
              ))}
            </div>

            <div className="hv-divider" />

            {/* Trend */}
            <div className="hv-trend">
              <div className="hv-block-label">Tendencia · {visTrend.length} escaneos</div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginTop: 2 }}>
                <span className="tnum" style={{ fontSize: 32, fontWeight: 800, letterSpacing: "-.03em" }}>
                  {visibilityScore}
                </span>
                {visDelta !== 0 && <Delta value={visDelta} suffix=" pt" />}
                <span className="stat-hint">{visTrend.length > 1 ? "vs. anterior" : "primer escaneo"}</span>
              </div>
              <div style={{ marginTop: 10 }}>
                {visTrend.length >= 2 ? (
                  <Sparkline data={visTrend} w={220} h={80} />
                ) : (
                  <div className="section-empty" style={{ padding: "14px 12px" }}>
                    <div className="section-empty-desc">La tendencia estará disponible con ≥2 escaneos</div>
                  </div>
                )}
              </div>
              <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 8, lineHeight: 1.5 }}>
                Por encima de <b style={{ color: "var(--ink-2)" }}>70</b> es competitivo para tu categoría.
              </div>
            </div>
          </div>

          {/* 3 · 4 wide metric cards */}
          <div className="metrics-2col" style={{ marginTop: 12 }}>
            {[
              {
                key: "mention",
                label: "Tasa de mención",
                value: computedMentionRate,
                unit: "%",
                trend: visTrend,
                delta: visDelta,
                color: "var(--accent)",
                hint: "Prompts donde aparece tu marca."
              },
              {
                key: "citation",
                label: "Tasa de cita",
                value: computedCitationRate,
                unit: "%",
                trend: citTrend,
                delta: citDelta,
                color: "#7c3aed",
                hint: "Prompts donde tu dominio es fuente citada."
              },
              {
                key: "gap",
                label: "Riesgo competitivo",
                value: competitorRiskScore,
                unit: "/100",
                trend: gapTrend,
                delta: gapDelta,
                color: "#e54563",
                hint: "Presión del competidor más fuerte. Más alto = más presión.",
                invert: true
              },
              {
                key: "confidence",
                label: "Confianza",
                value: confidencePercent,
                unit: "%",
                trend: confTrend,
                delta: 0,
                color: "#0d9488",
                hint: `Fiabilidad de la muestra: ${confidenceLabels[runConfidence] ?? runConfidence}.`
              }
            ].map((m) => (
              <div key={m.key} className="wide-stat">
                <div className="ws-left">
                  <div className="stat-label">{m.label}</div>
                  <div className="stat-value tnum">
                    {m.value}<span className="unit">{m.unit}</span>
                  </div>
                  <div className="ws-delta">
                    {m.delta !== 0 ? (
                      <Delta value={m.delta} suffix=" pt" invert={m.invert} />
                    ) : (
                      <span className="delta flat">— sin cambio</span>
                    )}
                    <span className="stat-hint">vs. escaneo anterior</span>
                  </div>
                  <p style={{ fontSize: 11, color: "var(--ink-4)", marginTop: 2 }}>{m.hint}</p>
                </div>
                <div className="ws-spark">
                  {m.trend.length >= 2 ? (
                    <Sparkline data={m.trend} w={160} h={64} color={m.color} />
                  ) : (
                    <div style={{ width: 160, height: 64, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <span style={{ fontSize: 11, color: "var(--ink-4)" }}>Sin tendencia aún</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* 4 · Dónde estás */}
          <div className="section-head">
            <div className="section-title">Dónde estás</div>
            <div className="section-desc">Cuota de voz en IA en tus prompts monitorizados</div>
          </div>

          <div className="grid-2-1">
            {/* Competitive table */}
            <div className="card">
              <div className="card-head" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                <div className="card-title">Panorámica competitiva</div>
                {competitors?.length ? (
                  <span className="badge badge-neutral">{competitors.length} competidores</span>
                ) : null}
              </div>
              {competitorRows.length > 0 ? (
                <div style={{ padding: "4px 6px 6px" }}>
                  <table className="tbl">
                    <thead>
                      <tr>
                        <th>Marca</th>
                        <th className="num">Mención</th>
                        <th>Cuota de voz en IA</th>
                      </tr>
                    </thead>
                    <tbody>
                      {/* Brand row */}
                      <tr className="you">
                        <td>
                          <div className="ent">
                            <span
                              className="fav"
                              style={{ background: "var(--accent)", fontSize: 11, fontWeight: 800 }}
                            >
                              {project.brand.slice(0, 1).toUpperCase()}
                            </span>
                            <div>
                              <div className="nm">
                                {project.brand}
                                <span style={{ fontSize: 11, color: "var(--accent)", fontWeight: 700, marginLeft: 6 }}>Tú</span>
                              </div>
                              <div className="dm">{project.domain}</div>
                            </div>
                          </div>
                        </td>
                        <td className="num">
                          <b className="tnum">{computedMentionRate}%</b>
                        </td>
                        <td>
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <div className="sov-bar">
                              <div
                                className="sov-fill"
                                style={{
                                  width: maxMentionRate > 0 ? `${(computedMentionRate / maxMentionRate) * 100}%` : "0%",
                                  background: "var(--accent)"
                                }}
                              />
                            </div>
                            <span className="tnum" style={{ fontSize: 12, fontWeight: 700, width: 32, textAlign: "right" }}>
                              {brandSov}%
                            </span>
                          </div>
                        </td>
                      </tr>
                      {/* Competitor rows */}
                      {competitorRows.map((c) => (
                        <tr key={c.name} className="hoverable">
                          <td>
                            <div className="ent">
                              <span className="fav" style={{ background: c.color }}>
                                {c.initial}
                              </span>
                              <div>
                                <div className="nm">{c.name}</div>
                                <div className="dm">{c.domain}</div>
                              </div>
                            </div>
                          </td>
                          <td className="num">
                            <b className="tnum">{c.mentionRate}%</b>
                          </td>
                          <td>
                            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                              <div className="sov-bar">
                                <div
                                  className="sov-fill"
                                  style={{
                                    width: maxMentionRate > 0 ? `${(c.mentionRate / maxMentionRate) * 100}%` : "0%",
                                    background: c.color
                                  }}
                                />
                              </div>
                              <span className="tnum" style={{ fontSize: 12, fontWeight: 700, width: 32, textAlign: "right" }}>
                                {c.sov}%
                              </span>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div style={{ padding: "16px 18px" }}>
                  <EmptyState
                    title="Sin datos de competidores"
                    description="Añade competidores para ver cómo se compara tu visibilidad en IA."
                  />
                  <Link
                    href={`/dashboard/projects/${projectId}/competitors`}
                    style={{ display: "inline-flex", alignItems: "center", gap: 4, marginTop: 10, fontSize: 13, fontWeight: 650, color: "var(--accent)" }}
                  >
                    Añadir competidores <Icon name="arrRight" size={13} />
                  </Link>
                </div>
              )}
            </div>

            {/* LLM distribution — placeholder */}
            <div className="card">
              <div className="card-head">
                <div className="card-title">Distribución por motor de IA</div>
              </div>
              <div style={{ padding: "24px 18px" }}>
                <div className="section-empty">
                  <div className="section-empty-title">Próximamente</div>
                  <div className="section-empty-desc">
                    La distribución por motor de IA (ChatGPT, Google AI Overviews, Perplexity…) estará disponible en una próxima actualización.
                  </div>
                </div>
                <div className="why-callout">
                  <Icon name="bolt" size={15} />
                  <div>
                    <div className="why-t">Por qué importa</div>
                    <div className="why-b">Diferentes motores citan fuentes distintas. Saber dónde estás más débil es el punto de partida para actuar.</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 5 · Oportunidades */}
          <div className="section-head">
            <div className="section-title">Oportunidades</div>
            <div className="section-desc">Prompts donde ganan los competidores y puedes mejorar</div>
          </div>

          <div className="grid-2-1">
            {/* Prompt opportunities */}
            <div className="card">
              <div className="card-head">
                <div className="card-title">Oportunidades de prompts</div>
              </div>
              <div style={{ padding: "16px 18px" }}>
                <div className="section-empty">
                  <div className="section-empty-title">Detección de oportunidades en desarrollo</div>
                  <div className="section-empty-desc">
                    Las oportunidades de prompts (prompts donde los competidores ganan y tu marca no aparece) se calcularán automáticamente en la próxima actualización.
                  </div>
                </div>
              </div>
            </div>

            {/* Cited pages */}
            <div className="card">
              <div className="card-head" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <div className="card-title">Páginas fuente más citadas</div>
                {citedPages.length > 0 && (
                  <span className="badge badge-neutral">{citedPages.length}</span>
                )}
              </div>
              {citedPages.length > 0 ? (
                <div style={{ padding: "4px 0" }}>
                  {citedPages.map((p, i) => (
                    <div
                      key={p.display}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        padding: "11px 18px",
                        borderBottom: i < citedPages.length - 1 ? "1px solid var(--line-soft)" : "none"
                      }}
                    >
                      <span style={{ color: p.isYours ? "var(--accent)" : "var(--ink-4)", flexShrink: 0, display: "flex" }}>
                        <Icon name={p.isYours ? "link" : "globe"} size={14} />
                      </span>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div
                          style={{
                            fontFamily: "var(--mono)",
                            fontSize: 11.5,
                            fontWeight: 600,
                            color: p.isYours ? "var(--accent-ink)" : "var(--ink-2)",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis"
                          }}
                        >
                          {p.display}
                        </div>
                        <div style={{ fontSize: 11, color: "var(--ink-4)", marginTop: 2 }}>
                          citada {p.count} {p.count === 1 ? "vez" : "veces"}
                        </div>
                      </div>
                      <div style={{ textAlign: "right", flexShrink: 0 }}>
                        <div className="tnum" style={{ fontSize: 15, fontWeight: 750, color: "var(--ink)" }}>{p.count}</div>
                        <div style={{ fontSize: 10, color: "var(--ink-4)", fontWeight: 600, textTransform: "uppercase", letterSpacing: ".04em" }}>citas</div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ padding: "16px 18px" }}>
                  <div className="section-empty">
                    <div className="section-empty-title">Sin fuentes detectadas</div>
                    <div className="section-empty-desc">
                      Las páginas citadas por los motores de IA aparecerán aquí cuando el escaneo las extraiga.
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* 6 · Qué hacer primero */}
          <div className="section-head">
            <div className="section-title">Qué hacer primero</div>
            <div className="section-desc">Acciones ordenadas por impacto en la visibilidad en IA</div>
            <div className="right">
              <Link
                href={`/dashboard/projects/${projectId}/recommendations`}
                style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 13, fontWeight: 650, color: "var(--accent)" }}
              >
                Abrir todas las recomendaciones <Icon name="arrRight" size={13} />
              </Link>
            </div>
          </div>

          {latestRecommendations?.length ? (
            <div className="recs-3col">
              {latestRecommendations.map((rec) => {
                const evidence = rec.evidence_json && typeof rec.evidence_json === "object"
                  ? (rec.evidence_json as { why_this_matters?: string })
                  : {};
                const priority = (rec.priority_rank ?? 1) <= 2 ? "high" : (rec.priority_rank ?? 1) <= 4 ? "med" : "low";
                return (
                  <Link
                    key={rec.id}
                    href={`/dashboard/projects/${projectId}/recommendations`}
                    className="rec-card-preview"
                  >
                    <div className="rec-meta">
                      <span className={`rec-rank ${priority}`}>{rec.priority_rank}</span>
                      <span className={`badge badge-${priority === "high" ? "neg" : priority === "med" ? "warn" : "neutral"}`}>
                        Prioridad {priorityLabels[priority] ?? priority}
                      </span>
                      {rec.recommendation_type && (
                        <span className="badge badge-outline">{rec.recommendation_type.replaceAll("_", " ")}</span>
                      )}
                    </div>
                    <div className="rec-title">{rec.title}</div>
                    {evidence.why_this_matters && (
                      <p style={{ fontSize: 12, color: "var(--ink-3)", lineHeight: 1.55, flexGrow: 1 }}>
                        {String(evidence.why_this_matters).slice(0, 140)}{String(evidence.why_this_matters).length > 140 ? "…" : ""}
                      </p>
                    )}
                    <div className="rec-metrics">
                      <div className="rmetric">
                        <div className="l">Impacto</div>
                        <div className="v"><DotMeter n={impactEffortToN(rec.impact ?? "low")} tone="h" /></div>
                      </div>
                      <div className="rmetric">
                        <div className="l">Esfuerzo</div>
                        <div className="v"><DotMeter n={impactEffortToN(rec.effort ?? "low")} tone="m" /></div>
                      </div>
                      <div style={{ marginLeft: "auto", textAlign: "right" }}>
                        <div className="l" style={{ fontSize: 10, fontWeight: 700, letterSpacing: ".05em", textTransform: "uppercase", color: "var(--ink-4)" }}>
                          Confianza
                        </div>
                        <div className="tnum" style={{ fontSize: 13, fontWeight: 750, marginTop: 4 }}>
                          {confidenceToPercent(rec.confidence ?? "low")}%
                        </div>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          ) : (
            <div className="section-empty">
              <div className="section-empty-title">Sin recomendaciones activas</div>
              <div className="section-empty-desc">Las recomendaciones se generan al completar un escaneo con suficiente evidencia.</div>
            </div>
          )}

          {/* Link to scan detail */}
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
            <Link
              href={`/dashboard/projects/${projectId}/runs/${latestCompletedRun!.id}`}
              style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 13, color: "var(--ink-3)", fontWeight: 600 }}
            >
              Ver detalle del escaneo
              <Icon name="arrRight" size={13} />
            </Link>
          </div>
        </>
      ) : (
        /* ===== EMPTY STATE ===== */
        activeRun ? (
          /* Estado A — Escaneo en curso (componente compartido pixel-perfect) */
          <ScanInProgress activeRun={activeRun} />
        ) : prompts?.length ? (
          /* Estado B — Listo para lanzar */
          <div style={{ display: "flex", justifyContent: "center", padding: "60px 20px" }}>
            <div style={{
              background: "var(--surface)", border: "1px solid var(--line)", borderRadius: "var(--r-xl)",
              padding: "40px 36px", maxWidth: 520, width: "100%", textAlign: "center",
              boxShadow: "var(--sh-2)"
            }}>
              <div style={{
                width: 56, height: 56, borderRadius: "999px", margin: "0 auto 20px",
                background: "var(--accent-soft)", display: "grid", placeItems: "center", color: "var(--accent)"
              }}>
                <Icon name="overview" size={24} />
              </div>
              <h2 style={{ fontSize: 18, fontWeight: 750, color: "var(--ink)", marginBottom: 10, letterSpacing: "-.01em" }}>
                Lanza tu primer escaneo de visibilidad en IA
              </h2>
              <p style={{ fontSize: 14, color: "var(--ink-3)", lineHeight: 1.65, marginBottom: 24 }}>
                Analiza cómo aparece <b style={{ color: "var(--ink-2)" }}>{project.brand}</b> en los motores de IA con tus <b style={{ color: "var(--ink-2)" }}>{prompts.length} prompts</b> activos.
              </p>
              <div style={{ display: "inline-block" }}>
                <ScanTriggerButton projectId={projectId} label="Lanzar escaneo" />
              </div>
              <p style={{ fontSize: 12, color: "var(--ink-4)", marginTop: 14 }}>
                Primer escaneo · {prompts.length} prompts · Gemini
              </p>
            </div>
          </div>
        ) : (
          /* Estado C — Sin prompts */
          <div style={{ display: "flex", justifyContent: "center", padding: "60px 20px" }}>
            <div style={{
              background: "var(--surface)", border: "1px solid var(--line)", borderRadius: "var(--r-xl)",
              padding: "40px 36px", maxWidth: 520, width: "100%", textAlign: "center",
              boxShadow: "var(--sh-2)"
            }}>
              <div style={{
                width: 56, height: 56, borderRadius: "999px", margin: "0 auto 20px",
                background: "var(--surface-sunk)", display: "grid", placeItems: "center", color: "var(--ink-3)"
              }}>
                <Icon name="prompts" size={24} />
              </div>
              <h2 style={{ fontSize: 18, fontWeight: 750, color: "var(--ink)", marginBottom: 10, letterSpacing: "-.01em" }}>
                Configura tus primeros prompts
              </h2>
              <p style={{ fontSize: 14, color: "var(--ink-3)", lineHeight: 1.65, marginBottom: 24 }}>
                Añade entre 5 y 10 preguntas de alta intención que tus potenciales clientes hacen a la IA. Son la base de tu análisis de visibilidad.
              </p>
              <Link href={`/dashboard/projects/${projectId}/prompts`}>
                <Button variant="outline">
                  <Icon name="prompts" size={14} />
                  Ir a Prompts
                </Button>
              </Link>
            </div>
          </div>
        )
      )}

      {/* ===== QUICK LINKS ===== */}
      <div style={{ display: "flex", gap: 16, marginTop: 32, paddingTop: 20, borderTop: "1px solid var(--line-soft)" }}>
        <Link
          href={`/dashboard/projects/${projectId}/prompts`}
          style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 13, color: "var(--ink-3)", fontWeight: 600 }}
        >
          <Icon name="prompts" size={14} />
          Gestionar prompts ({prompts?.length ?? 0} activos)
        </Link>
        <Link
          href={`/dashboard/projects/${projectId}/competitors`}
          style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 13, color: "var(--ink-3)", fontWeight: 600 }}
        >
          <Icon name="competitors" size={14} />
          Gestionar competidores ({competitors?.length ?? 0} activos)
        </Link>
        <Link
          href={`/dashboard/projects/${projectId}/runs`}
          style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 13, color: "var(--ink-3)", fontWeight: 600 }}
        >
          <Icon name="runs" size={14} />
          Ver escaneos ({runs?.length ?? 0})
        </Link>
      </div>
    </div>
  );
}
