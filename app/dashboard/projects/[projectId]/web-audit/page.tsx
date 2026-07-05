import Link from "next/link";
import { Icon } from "@/components/ui/icon";
import { Delta } from "@/components/ui/delta";
import { requireUser } from "@/lib/auth";
import { requireActiveProject } from "@/lib/project-workspace";
import { isProOrAbove } from "@/lib/billing";
import { parseCoverageMap } from "@/lib/web-audit/coverage-map";
import { buildWebAuditSummary, type PromptResultLite, type ClassifiedTopic, type TopicOutcome } from "@/lib/web-audit/opportunity-matrix";
import { buildCoverageTrend } from "@/lib/web-audit/trend";
import { RunAuditButton } from "./run-audit-button";

// Server Actions invoked from this page (auditDomainCoverageAction) run
// several sequential Gemini grounding calls up to COVERAGE_TOTAL_BUDGET_MS
// (~45s) — same ADR-0003 rationale as the Escaneos page's maxDuration.
export const maxDuration = 60;

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("es-ES", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Europe/Madrid"
  });
}

const OUTCOME_META: Record<TopicOutcome, { label: string; badgeClass: string }> = {
  performing: { label: "Rindiendo", badgeClass: "badge-pos" },
  invisible: { label: "Invisible para la IA", badgeClass: "badge-warn" },
  content_gap: { label: "Hueco de contenido", badgeClass: "badge-neg" },
  open_opportunity: { label: "Oportunidad abierta", badgeClass: "badge-neutral" },
  unverified_cited: { label: "Citado sin contenido verificado", badgeClass: "badge-neutral" },
  inconclusive: { label: "Sin verificar", badgeClass: "badge-outline" }
};

const TOPIC_LIST_ORDER: TopicOutcome[] = [
  "invisible",
  "content_gap",
  "performing",
  "unverified_cited",
  "open_opportunity",
  "inconclusive"
];

function TopicRow({ topic }: { topic: ClassifiedTopic }) {
  const meta = OUTCOME_META[topic.outcome];
  return (
    <div
      style={{
        padding: "12px 14px",
        background: "var(--surface)",
        border: "1px solid var(--line)",
        borderRadius: 10
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
        <span className={`badge ${meta.badgeClass}`}>{meta.label}</span>
        <span style={{ fontSize: 13, fontWeight: 650, color: "var(--ink)", minWidth: 0, overflowWrap: "anywhere" }}>
          {topic.topic}
        </span>
      </div>

      {topic.pages.length > 0 && (
        <ul style={{ fontSize: 12.5, color: "var(--ink-3)", paddingLeft: 16, margin: "0 0 6px" }}>
          {topic.pages.map((page, i) => (
            <li key={i}>
              <a
                href={page.url}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "var(--accent)", overflowWrap: "anywhere" }}
              >
                {page.url}
              </a>
            </li>
          ))}
        </ul>
      )}

      <p style={{ fontSize: 12.5, color: "var(--ink-3)", lineHeight: 1.55, margin: 0, fontStyle: "italic" }}>
        {topic.note}
        {topic.found && (
          <span style={{ color: "var(--ink-4)" }}> (interpretación de la IA, revísala antes de confiar en ella)</span>
        )}
      </p>
    </div>
  );
}

function Quadrant({
  title,
  count,
  tone,
  hint,
  topics
}: {
  title: string;
  count: number;
  tone: "pos" | "warn" | "neg" | "neutral";
  hint: string;
  topics: ClassifiedTopic[];
}) {
  const toneVars: Record<string, { bg: string; fg: string; border: string }> = {
    pos: { bg: "var(--pos-soft)", fg: "var(--pos-ink)", border: "var(--pos-soft)" },
    warn: { bg: "var(--warn-soft)", fg: "var(--warn-ink)", border: "var(--warn-soft)" },
    neg: { bg: "var(--neg-soft)", fg: "var(--neg-ink)", border: "var(--neg-soft)" },
    neutral: { bg: "var(--surface-2)", fg: "var(--ink-3)", border: "var(--line)" }
  };
  const v = toneVars[tone];

  return (
    <div style={{ borderRadius: 10, padding: "10px 12px", border: `1px solid ${v.border}`, background: v.bg, minHeight: 108 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, fontWeight: 750, color: v.fg }}>
        {title}
        <span style={{ marginLeft: "auto", fontSize: 16, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{count}</span>
      </div>
      <div style={{ fontSize: 10.5, color: "var(--ink-3)", margin: "2px 0 7px" }}>{hint}</div>
      {topics.slice(0, 6).map((t) => (
        <span
          key={t.promptId}
          title={t.topic}
          style={{
            display: "inline-block",
            fontSize: 10.5,
            fontWeight: 600,
            background: "var(--surface)",
            border: "1px solid var(--line)",
            color: "var(--ink-2)",
            borderRadius: 999,
            padding: "2px 8px",
            margin: "0 4px 4px 0",
            maxWidth: "100%",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            verticalAlign: "top"
          }}
        >
          {t.topic}
        </span>
      ))}
      {topics.length > 6 && (
        <span style={{ fontSize: 10.5, color: "var(--ink-4)" }}>+{topics.length - 6} más</span>
      )}
    </div>
  );
}

function TrendChart({ points }: { points: { generatedAt: string; coveragePct: number | null; surfacingPct: number | null }[] }) {
  const W = 440;
  const H = 190;
  const padL = 42;
  const padR = 12;
  const top = 18;
  const bottom = 170;
  const stepX = points.length > 1 ? (W - padL - padR) / (points.length - 1) : 0;
  const yFor = (pct: number) => bottom - (pct / 100) * (bottom - top);
  const xFor = (i: number) => padL + i * stepX;

  function pathFor(key: "coveragePct" | "surfacingPct"): string | null {
    const coords: string[] = [];
    points.forEach((p, i) => {
      const v = p[key];
      if (v === null) return;
      coords.push(`${i === 0 || coords.length === 0 ? "M" : "L"} ${xFor(i)} ${yFor(v)}`);
    });
    return coords.length > 0 ? coords.join(" ") : null;
  }

  const covPath = pathFor("coveragePct");
  const surPath = pathFor("surfacingPct");
  const lastCov = [...points].reverse().find((p) => p.coveragePct !== null);
  const lastSur = [...points].reverse().find((p) => p.surfacingPct !== null);

  const ariaLabel = `Cobertura ${points[0]?.coveragePct ?? "sin dato"}% a ${lastCov?.coveragePct ?? "sin dato"}%; aprovechamiento ${points[0]?.surfacingPct ?? "sin dato"}% a ${lastSur?.surfacingPct ?? "sin dato"}% en ${points.length} auditorías.`;

  return (
    <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={ariaLabel}>
      <g stroke="var(--line-soft)" strokeWidth={1}>
        {[0, 25, 50, 75, 100].map((pct) => (
          <line key={pct} x1={padL} y1={yFor(pct)} x2={W - padR} y2={yFor(pct)} />
        ))}
      </g>
      <g fontSize={10} fill="var(--ink-4)" textAnchor="end">
        {[100, 75, 50, 25, 0].map((pct) => (
          <text key={pct} x={padL - 6} y={yFor(pct) + 3}>
            {pct}%
          </text>
        ))}
      </g>
      <g fontSize={10} fill="var(--ink-4)" textAnchor="middle">
        {points.map((p, i) => (
          <text key={p.generatedAt} x={xFor(i)} y={H - 4}>
            {formatDate(p.generatedAt)}
          </text>
        ))}
      </g>
      {covPath && <path d={covPath} fill="none" stroke="var(--accent)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />}
      {surPath && <path d={surPath} fill="none" stroke="var(--pos)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />}
      {lastCov && <circle cx={xFor(points.indexOf(lastCov))} cy={yFor(lastCov.coveragePct!)} r={4} fill="var(--accent)" stroke="var(--surface)" strokeWidth={2} />}
      {lastSur && <circle cx={xFor(points.indexOf(lastSur))} cy={yFor(lastSur.surfacingPct!)} r={4} fill="var(--pos)" stroke="var(--surface)" strokeWidth={2} />}
    </svg>
  );
}

export default async function WebAuditPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const project = await requireActiveProject(projectId);
  const { supabase, user } = await requireUser();

  // Pro+-gated (DOMAIN-COVERAGE-1): read the raw plan column directly via
  // isProOrAbove, never via getPlanForUser/resolvePlan.
  const { data: profileRow } = await supabase
    .from("profiles")
    .select("current_plan")
    .eq("id", user.id)
    .maybeSingle();
  const canAudit = isProOrAbove(profileRow?.current_plan as string | undefined);

  const { data: latestRunRow } = await supabase
    .from("scan_runs")
    .select("id, finished_at, created_at")
    .eq("project_id", projectId)
    .eq("status", "completed")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { data: historyRows } = await supabase
    .from("generated_solutions")
    .select("sanitized_content, created_at")
    .eq("project_id", projectId)
    .eq("generation_type", "domain_coverage")
    .is("recommendation_id", null)
    .eq("status", "completed")
    .eq("is_sanitized", true)
    .order("created_at", { ascending: false })
    .limit(12);

  const maps = ((historyRows ?? []) as Array<{ sanitized_content: string | null }>)
    .map((row) => parseCoverageMap(row.sanitized_content))
    .filter((m): m is NonNullable<typeof m> => m !== null);

  const scanIds = Array.from(new Set(maps.map((m) => m.scanId)));

  const { data: resultRows } =
    scanIds.length > 0
      ? await supabase
          .from("scan_prompt_results")
          .select("prompt_id, run_id, extracted_json, provider, mentioned_competitors_count")
          .eq("project_id", projectId)
          .in("run_id", scanIds)
          .eq("status", "completed")
      : { data: [] };

  const resultsByScanId = new Map<string, PromptResultLite[]>();
  for (const row of (resultRows ?? []) as Array<PromptResultLite & { run_id: string }>) {
    const list = resultsByScanId.get(row.run_id) ?? [];
    list.push(row);
    resultsByScanId.set(row.run_id, list);
  }

  const latestMap = maps.length > 0 ? maps.reduce((a, b) => (a.generatedAt > b.generatedAt ? a : b)) : null;
  const summary = latestMap
    ? buildWebAuditSummary({ coverage: latestMap, results: resultsByScanId.get(latestMap.scanId) ?? [], projectDomain: project.domain })
    : null;
  const trend = buildCoverageTrend({ maps, resultsByScanId, projectDomain: project.domain });

  const auditedScan = latestMap ? maps.find((m) => m.scanId === latestMap.scanId) : null;
  const auditedScanDate = auditedScan?.scanId === latestRunRow?.id ? latestRunRow?.finished_at ?? latestRunRow?.created_at : null;

  const previousCoveragePct = trend.length >= 2 ? trend[trend.length - 2].coveragePct : null;
  const coverageDelta =
    summary?.coveragePct !== null && summary?.coveragePct !== undefined && previousCoveragePct !== null
      ? summary.coveragePct - previousCoveragePct
      : null;

  const grouped: Record<TopicOutcome, ClassifiedTopic[]> = {
    performing: [],
    invisible: [],
    content_gap: [],
    open_opportunity: [],
    unverified_cited: [],
    inconclusive: []
  };
  for (const topic of summary?.topics ?? []) {
    grouped[topic.outcome].push(topic);
  }

  return (
    <div className="page">
      {/* Sticky header */}
      <div className="ov-sticky-header">
        <div className="ov-sticky-left">
          <div>
            <p className="kicker" style={{ marginBottom: 2 }}>Auditoría web</p>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 15, fontWeight: 750, color: "var(--ink)", letterSpacing: "-.01em" }}>
                {project.name}
              </span>
              <span className="badge badge-neutral" style={{ fontFamily: "var(--mono)", fontSize: 11 }}>
                {project.domain}
              </span>
              <span className="badge badge-accent" style={{ fontSize: 10 }}>PRO</span>
            </div>
          </div>
        </div>
        <div className="ov-sticky-right" style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {latestMap && (
            <span style={{ fontSize: 11, color: "var(--ink-4)" }}>
              Última auditoría: {formatDate(latestMap.generatedAt)}
              {auditedScanDate ? ` · sobre el escaneo del ${formatDate(auditedScanDate)}` : ""}
            </span>
          )}
          <RunAuditButton projectId={projectId} canAudit={canAudit} />
        </div>
      </div>

      <div className="summary mt8">
        <div className="summary-ico">
          <Icon name="search" size={20} />
        </div>
        <p className="summary-txt">
          Tu dominio visto como lo ve la IA: qué contenido tienes y si las respuestas de IA lo aprovechan.
        </p>
      </div>

      {/* Gated / empty states */}
      {!canAudit ? (
        <div className="card" style={{ marginTop: 14, padding: "24px 22px", textAlign: "center" }}>
          <div style={{ fontSize: 15, fontWeight: 750, color: "var(--ink)", marginBottom: 8 }}>
            Disponible en el plan Pro
          </div>
          <p style={{ fontSize: 13.5, color: "var(--ink-3)", maxWidth: 460, margin: "0 auto 16px", lineHeight: 1.6 }}>
            Auditar la cobertura y el aprovechamiento de tu web es una función del plan Pro. Compara lo que publicas
            con lo que la IA realmente cita en sus respuestas.
          </p>
          <Link href="/dashboard/settings/billing" className="btn btn-primary btn-sm">
            Ver planes
          </Link>
        </div>
      ) : !latestRunRow ? (
        <div className="card" style={{ marginTop: 14, padding: "24px 22px", textAlign: "center" }}>
          <div style={{ fontSize: 15, fontWeight: 750, color: "var(--ink)", marginBottom: 8 }}>
            Todavía no hay ningún escaneo completado
          </div>
          <p style={{ fontSize: 13.5, color: "var(--ink-3)", maxWidth: 460, margin: "0 auto 16px", lineHeight: 1.6 }}>
            La auditoría web necesita al menos un escaneo completado para cruzar tus prompts con lo que la IA cita.
          </p>
          <Link href={`/dashboard/projects/${projectId}`} className="btn btn-primary btn-sm">
            Ir a la visión general
          </Link>
        </div>
      ) : !summary ? (
        <div className="card" style={{ marginTop: 14, padding: "24px 22px", textAlign: "center" }}>
          <div style={{ fontSize: 15, fontWeight: 750, color: "var(--ink)", marginBottom: 8 }}>
            Todavía no has auditado tu web
          </div>
          <p style={{ fontSize: 13.5, color: "var(--ink-3)", maxWidth: 460, margin: "0 auto 16px", lineHeight: 1.6 }}>
            La auditoría comprueba, tema a tema, si tu dominio publica contenido que Google encuentra, y lo cruza con
            las citas de tu último escaneo.
          </p>
          <p style={{ fontSize: 11.5, color: "var(--ink-4)", marginBottom: 16 }}>Hasta 5 auditorías al día por proyecto.</p>
          <div style={{ display: "flex", justifyContent: "center" }}>
            <RunAuditButton projectId={projectId} canAudit={canAudit} />
          </div>
        </div>
      ) : (
        <>
          {/* KPI row */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12, marginTop: 14 }}>
            <div className="card" style={{ padding: "13px 15px 11px" }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".05em", textTransform: "uppercase", color: "var(--ink-4)" }}>
                Cobertura de temas
              </div>
              <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-.02em", marginTop: 4, fontVariantNumeric: "tabular-nums" }}>
                {summary.coveragePct === null ? "—" : `${summary.coveredCount} / ${summary.conclusiveCount}`}
                <small style={{ fontSize: 13, color: "var(--ink-4)", fontWeight: 600, marginLeft: 6 }}>temas</small>
                {coverageDelta !== null && <Delta value={coverageDelta} suffix=" pt" />}
              </div>
              <div style={{ fontSize: 10.5, color: "var(--ink-4)", marginTop: 6 }}>
                temas de tus prompts con contenido propio verificado
              </div>
            </div>
            <div className="card" style={{ padding: "13px 15px 11px" }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: ".05em", textTransform: "uppercase", color: "var(--ink-4)" }}>
                Tasa de aprovechamiento
              </div>
              <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-.02em", marginTop: 4, fontVariantNumeric: "tabular-nums" }}>
                {summary.surfacingPct === null ? "—" : `${summary.surfacingPct}`}
                {summary.surfacingPct !== null && <small style={{ fontSize: 13, color: "var(--ink-4)", fontWeight: 600 }}>%</small>}
              </div>
              <div style={{ fontSize: 10.5, marginTop: 6, color: grouped.invisible.length > 0 ? "var(--warn-ink)" : "var(--ink-4)", fontWeight: grouped.invisible.length > 0 ? 650 : 400 }}>
                {grouped.invisible.length > 0
                  ? `${grouped.invisible.length} ${grouped.invisible.length === 1 ? "tema con contenido no se cita" : "temas con contenido no se citan"}`
                  : "de los temas con contenido, cuántos cita la IA"}
              </div>
            </div>
          </div>

          {/* Opportunity matrix + trend */}
          <div style={{ display: "grid", gridTemplateColumns: trend.length >= 2 ? "minmax(0, 1.15fr) minmax(0, 1fr)" : "1fr", gap: 12, marginTop: 12 }}>
            <div className="card">
              <div style={{ padding: "13px 16px 0" }}>
                <div style={{ fontSize: 13.5, fontWeight: 750 }}>Matriz de oportunidad</div>
                <div style={{ fontSize: 11.5, color: "var(--ink-3)", marginTop: 2 }}>
                  Cada tema de tus prompts, cruzando contenido propio verificado × citas en el último escaneo.
                </div>
              </div>
              <div style={{ padding: "14px 16px 16px" }}>
                <div style={{ display: "grid", gridTemplateColumns: "18px 1fr 1fr", gridTemplateRows: "1fr 1fr 18px", gap: 6 }}>
                  <div style={{ writingMode: "vertical-rl", transform: "rotate(180deg)", gridRow: "1 / 3", fontSize: 10, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--ink-4)", display: "grid", placeItems: "center" }}>
                    Con contenido propio
                  </div>
                  <Quadrant
                    title="⚠ Invisible para la IA"
                    count={grouped.invisible.length}
                    tone="warn"
                    hint="Tienes página, pero la IA no la cita → optimizar"
                    topics={grouped.invisible}
                  />
                  <Quadrant
                    title="✓ Rindiendo"
                    count={grouped.performing.length}
                    tone="pos"
                    hint="Contenido propio citado por la IA → mantener"
                    topics={grouped.performing}
                  />
                  <div style={{ borderRadius: 10, padding: "10px 12px", border: "1px solid var(--neg-soft)", background: "var(--neg-soft)", minHeight: 108 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11.5, fontWeight: 750, color: "var(--neg-ink)" }}>
                      ✕ Sin contenido propio
                      <span style={{ marginLeft: "auto", fontSize: 16, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>
                        {grouped.content_gap.length + grouped.open_opportunity.length}
                      </span>
                    </div>
                    <div style={{ fontSize: 10.5, color: "var(--ink-3)", margin: "2px 0 7px" }}>
                      Sin página propia y sin citas → crear contenido
                    </div>
                    {grouped.content_gap.length > 0 && (
                      <div style={{ marginBottom: 4 }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: "var(--neg-ink)" }}>
                          Compite un rival ({grouped.content_gap.length})
                        </div>
                        {grouped.content_gap.slice(0, 4).map((t) => (
                          <span key={t.promptId} title={t.topic} style={{ display: "inline-block", fontSize: 10.5, background: "var(--surface)", border: "1px solid var(--line)", color: "var(--ink-2)", borderRadius: 999, padding: "2px 8px", margin: "2px 4px 0 0" }}>
                            {t.topic}
                          </span>
                        ))}
                      </div>
                    )}
                    {grouped.open_opportunity.length > 0 && (
                      <div>
                        <div style={{ fontSize: 10, fontWeight: 700, color: "var(--ink-3)" }}>
                          Nadie destaca aún ({grouped.open_opportunity.length})
                        </div>
                        {grouped.open_opportunity.slice(0, 4).map((t) => (
                          <span key={t.promptId} title={t.topic} style={{ display: "inline-block", fontSize: 10.5, background: "var(--surface)", border: "1px solid var(--line)", color: "var(--ink-2)", borderRadius: 999, padding: "2px 8px", margin: "2px 4px 0 0" }}>
                            {t.topic}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <Quadrant
                    title="◌ Citado sin contenido verificado"
                    count={grouped.unverified_cited.length}
                    tone="neutral"
                    hint="La IA te cita por otra vía, sin página verificada → capturar"
                    topics={grouped.unverified_cited}
                  />
                  <div style={{ gridColumn: "2 / 4", fontSize: 10, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--ink-4)", display: "grid", placeItems: "center" }}>
                    La IA no te cita → sí te cita
                  </div>
                </div>
                {grouped.inconclusive.length > 0 && (
                  <p style={{ fontSize: 11.5, color: "var(--ink-4)", marginTop: 12, marginBottom: 0 }}>
                    {grouped.inconclusive.length}{" "}
                    {grouped.inconclusive.length === 1 ? "tema sin verificar en esta auditoría" : "temas sin verificar en esta auditoría"}{" "}
                    (no cuentan para los KPIs).
                  </p>
                )}
              </div>
            </div>

            {trend.length >= 2 && (
              <div className="card">
                <div style={{ padding: "13px 16px 0" }}>
                  <div style={{ fontSize: 13.5, fontWeight: 750 }}>Evolución entre auditorías</div>
                  <div style={{ fontSize: 11.5, color: "var(--ink-3)", marginTop: 2 }}>
                    Cobertura y aprovechamiento a lo largo de los últimos escaneos.
                  </div>
                </div>
                <div style={{ display: "flex", gap: 14, fontSize: 11, color: "var(--ink-3)", fontWeight: 600, padding: "10px 16px 0" }}>
                  <span>
                    <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 3, marginRight: 5, verticalAlign: -1, background: "var(--accent)" }} />
                    Cobertura de temas
                  </span>
                  <span>
                    <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: 3, marginRight: 5, verticalAlign: -1, background: "var(--pos)" }} />
                    Tasa de aprovechamiento
                  </span>
                </div>
                <div style={{ padding: "12px 16px 14px" }}>
                  <TrendChart points={trend} />
                </div>
              </div>
            )}
          </div>

          {/* Topic detail list, grouped by outcome */}
          <div className="section-head" style={{ marginTop: 20 }}>
            <div className="section-title">Detalle por tema</div>
            <div className="section-desc">{summary.topics.length} temas auditados</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {TOPIC_LIST_ORDER.flatMap((outcome) => grouped[outcome]).map((topic) => (
              <TopicRow key={topic.promptId} topic={topic} />
            ))}
          </div>
        </>
      )}

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
          href={`/dashboard/projects/${projectId}/runs`}
          style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 13, color: "var(--ink-3)", fontWeight: 600 }}
        >
          <Icon name="runs" size={13} />
          Escaneos
        </Link>
        <Link
          href={`/dashboard/projects/${projectId}/recommendations`}
          style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 13, color: "var(--ink-3)", fontWeight: 600 }}
        >
          <Icon name="recs" size={13} />
          Recomendaciones
        </Link>
      </div>
    </div>
  );
}
