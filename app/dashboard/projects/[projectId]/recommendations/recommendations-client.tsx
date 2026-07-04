"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import { DotMeter } from "@/components/ui/dot-meter";
import { categoryForType, labelForType, type AffectedPromptDetail } from "@/lib/recommendations/recommendation-engine";
import { rewriteRecommendationAction, dismissRecommendationAction } from "@/app/dashboard/projects/[projectId]/actions";

type CitationPage = { domain: string; title: string; url: string };

type EvidenceJson = {
  why_this_matters?: string;
  assumptions?: string[];
  affected_prompts?: string[];
  affected_prompt_details?: AffectedPromptDetail[];
  evidence_snippets?: string[];
  stale_signals?: string[];
  sentiment_drivers?: string[];
  mentioned_competitors?: string[];
  citation_domains?: string[];
  citation_pages?: CitationPage[];
  action_suggested?: string;
};

/**
 * Sanitized, copy-paste-ready AI solution for a recommendation, loaded from
 * `generated_solutions`. Defined here (not in the server-only rewrite module)
 * so both the server page and this client component can share the shape.
 */
export type GeneratedSolutionExample = { label: string; content: string };

export type GeneratedSolution = {
  title: string;
  summary: string;
  steps: string[];
  examples: GeneratedSolutionExample[];
};

export type Recommendation = {
  id: string;
  priority_rank: number;
  title: string;
  description: string;
  recommendation_type: string;
  impact: string;
  effort: string;
  confidence: string;
  status: string;
  source_type: string;
  evidence_json: EvidenceJson | null;
  /**
   * The latest AI-generated solution for this recommendation (null until the
   * user generates one). Drives both the button state and the "Plan de acción"
   * block.
   */
  solution: GeneratedSolution | null;
  /**
   * How many scans in a row (including this one) this exact gap
   * (dedupe_key) has been open — RECS-3. 1 for a brand-new gap; only shown
   * to the user once it has persisted across at least one prior scan.
   */
  consecutive_runs_open?: number;
};

type FilterMode = "all" | "high" | "quick" | "content" | "technical" | "authority" | "resolved";

export type ResolvedHistoryItem = {
  id: string;
  title: string;
  description: string;
  recommendation_type: string;
  status: "resolved" | "dismissed";
  updated_at: string;
};

function impactToN(val: string): number {
  if (val === "high") return 5;
  if (val === "medium" || val === "med") return 3;
  return 1;
}

function effortToN(val: string): number {
  if (val === "high") return 5;
  if (val === "medium" || val === "med") return 3;
  return 1;
}

/**
 * Absolute priority of a recommendation, from its own impact and confidence —
 * NOT its position in the list. The old rank-based mapping labelled the top 2
 * cards "Alta" even in a backlog of only mild gaps; this makes "Alta" mean a
 * genuinely high-impact action (with non-low confidence), so a weak backlog no
 * longer shows false "Alta". Cards stay ordered by priority_rank; only the
 * badge/colour reflect absolute importance.
 */
function priorityLevel(rec: Recommendation): "high" | "med" | "low" {
  if (rec.impact === "high" && rec.confidence !== "low") return "high";
  if (rec.impact === "high" || rec.impact === "medium") return "med";
  return "low";
}

function isQuickWin(rec: Recommendation): boolean {
  return rec.impact === "high" && rec.effort === "low";
}

function CopyButton({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Clipboard unavailable (e.g. insecure context) — fail silently.
    }
  }

  return (
    <button
      type="button"
      className="btn btn-ghost btn-sm"
      onClick={handleCopy}
      style={{ fontSize: 12, padding: "4px 10px" }}
    >
      <Icon name={copied ? "check" : "copy"} size={12} />
      {copied ? "Copiado" : label ?? "Copiar"}
    </button>
  );
}

/**
 * Renders the structured, copy-paste-ready AI action plan beneath a
 * recommendation: a specific title, a summary, concrete steps, and an optional
 * ready-to-paste example artifact with its own copy button. All content is
 * already sanitized server-side; it is rendered as plain React text.
 */
function SolutionPanel({ solution }: { solution: GeneratedSolution }) {
  return (
    <div
      style={{
        marginTop: 4,
        padding: "12px 16px",
        background: "var(--surface-sunk)",
        borderRadius: 10,
        border: "1.5px solid var(--line)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          fontSize: 11,
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.07em",
          color: "var(--ink-4)",
          marginBottom: 6,
        }}
      >
        <Icon name="sparkles" size={12} />
        Plan de acción
      </div>
      <div style={{ fontSize: 13.5, fontWeight: 700, color: "var(--ink)", marginBottom: 4 }}>{solution.title}</div>
      <p style={{ fontSize: 13, color: "var(--ink-2)", lineHeight: 1.6, margin: 0 }}>{solution.summary}</p>

      {solution.steps.length > 0 && (
        <ol
          style={{
            margin: "10px 0 0",
            paddingLeft: 18,
            fontSize: 13,
            color: "var(--ink-2)",
            lineHeight: 1.6,
            display: "flex",
            flexDirection: "column",
            gap: 4,
          }}
        >
          {solution.steps.map((step, i) => (
            <li key={i}>{step}</li>
          ))}
        </ol>
      )}

      {solution.examples.length > 0 && (
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
          {solution.examples.length > 1 && (
            <div style={{ fontSize: 11, color: "var(--ink-4)" }}>
              {solution.examples.length} plantillas generadas por IA — revísalas y adáptalas a tu web antes de
              publicarlas.
            </div>
          )}
          {solution.examples.map((example, i) => (
            <ExampleBlock key={i} example={example} showCaption={solution.examples.length === 1} />
          ))}
        </div>
      )}
    </div>
  );
}

function ExampleBlock({ example, showCaption }: { example: GeneratedSolutionExample; showCaption: boolean }) {
  return (
    <div
      style={{
        padding: "10px 12px",
        background: "var(--surface)",
        borderRadius: 8,
        border: "1px solid var(--line)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          marginBottom: showCaption ? 2 : 8,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0, flexWrap: "wrap" }}>
          <span className="badge badge-outline" style={{ fontSize: 10, flexShrink: 0 }}>
            Ejemplo
          </span>
          <span
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: "var(--ink-3)",
              minWidth: 0,
              overflowWrap: "anywhere",
            }}
          >
            {example.label}
          </span>
        </div>
        <CopyButton text={example.content} />
      </div>
      {showCaption && (
        <div style={{ fontSize: 11, color: "var(--ink-4)", marginBottom: 8 }}>
          Plantilla generada por IA — revísala y adáptala a tu web antes de publicarla.
        </div>
      )}
      <pre
        style={{
          margin: 0,
          fontSize: 12.5,
          color: "var(--ink-2)",
          lineHeight: 1.55,
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          fontFamily: "inherit",
        }}
      >
        {example.content}
      </pre>
    </div>
  );
}

/**
 * Read-only row for the "Resueltas" tab (RECS-3) — no expand, no evidence, no
 * action buttons; this is history, not the active backlog. Covers both
 * automatically-resolved (the gap stopped recurring in a later scan) and
 * manually-dismissed (the user marked it done/not applicable) items.
 */
function ResolvedHistoryCard({ item }: { item: ResolvedHistoryItem }) {
  const dateLabel = new Date(item.updated_at).toLocaleDateString("es-ES", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Europe/Madrid",
  });

  return (
    <div className="rec-card">
      <div className="rec-main" style={{ cursor: "default" }}>
        <div
          className="rec-rank low"
          style={{ background: "var(--pos-soft, #f0faf3)", color: "var(--pos-ink, #1a7a49)" }}
        >
          <Icon name="check" size={16} />
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 7, flexWrap: "wrap" }}>
            <span className="badge badge-pos">
              {item.status === "resolved" ? "Resuelta automáticamente" : "Marcada como hecha"}
            </span>
            <span className="badge badge-outline">{labelForType(item.recommendation_type)}</span>
          </div>
          <div className="rec-title" style={{ textDecoration: "line-through", color: "var(--ink-3)" }}>
            {item.title}
          </div>
          <div className="rec-problem">{dateLabel}</div>
        </div>
      </div>
    </div>
  );
}

function RecCard({ rec, projectId }: { rec: Recommendation; projectId: string }) {
  const [open, setOpen] = useState(false);
  const [isRewriting, startRewrite] = useTransition();
  const [rewriteError, setRewriteError] = useState<string | null>(null);
  const [isDismissing, startDismiss] = useTransition();
  const [dismissError, setDismissError] = useState<string | null>(null);
  const router = useRouter();

  function handleRewrite(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setRewriteError(null);
    startRewrite(async () => {
      try {
        const result = await rewriteRecommendationAction({ projectId, recommendationId: rec.id });
        if (!result.success) {
          setRewriteError(result.error);
          return;
        }
        router.refresh();
      } catch {
        setRewriteError("No se ha podido generar la propuesta en este momento. Inténtalo de nuevo en unos minutos.");
      }
    });
  }

  function handleDismiss(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setDismissError(null);
    startDismiss(async () => {
      try {
        const result = await dismissRecommendationAction({ projectId, recommendationId: rec.id });
        if (!result.success) {
          setDismissError(result.error);
          return;
        }
        router.refresh();
      } catch {
        setDismissError("No se ha podido actualizar la recomendación en este momento. Inténtalo de nuevo en unos minutos.");
      }
    });
  }

  const ev: EvidenceJson = rec.evidence_json ?? {};
  const promptDetails = ev.affected_prompt_details ?? [];
  const affectedPrompts = ev.affected_prompts ?? [];
  const snippets = ev.evidence_snippets ?? [];
  const staleSignals = ev.stale_signals ?? [];
  // For the stale-content rec, show the actual stale text that triggered the
  // flag rather than unrelated brand-mention quotes.
  const displaySnippets =
    rec.recommendation_type === "update_stale_content" && staleSignals.length > 0
      ? staleSignals
      : snippets;
  const competitors = ev.mentioned_competitors ?? [];
  const domains = ev.citation_domains ?? [];
  const citationPages = ev.citation_pages ?? [];
  const sentimentDrivers = ev.sentiment_drivers ?? [];
  const assumptions = ev.assumptions ?? [];
  const quickWin = isQuickWin(rec);
  const rankCls = priorityLevel(rec);

  const priorityLabel =
    rankCls === "high" ? "Alta" : rankCls === "med" ? "Media" : "Baja";
  const priorityBadgeCls =
    rankCls === "high"
      ? "badge badge-neg"
      : rankCls === "med"
        ? "badge badge-warn"
        : "badge badge-neutral";

  return (
    <div className={`rec-card${open ? " open" : ""}`}>
      <div
        className="rec-main"
        onClick={() => setOpen((o) => !o)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen((o) => !o);
          }
        }}
        aria-expanded={open}
      >
        {/* Rank pill */}
        <div className={`rec-rank ${rankCls}`}>{rec.priority_rank}</div>

        {/* Center column */}
        <div style={{ minWidth: 0, flex: 1 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 7,
              marginBottom: 7,
              flexWrap: "wrap",
            }}
          >
            <span className={priorityBadgeCls}>Prioridad {priorityLabel}</span>
            <span className="badge badge-outline">
              {labelForType(rec.recommendation_type)}
            </span>
            {quickWin && (
              <span className="badge badge-pos">
                <Icon name="bolt" size={11} />
                Victoria rápida
              </span>
            )}
            {rec.confidence === "low" && (
              <span className="badge badge-warn">
                <Icon name="info" size={11} />
                Baja confianza
              </span>
            )}
            {(rec.consecutive_runs_open ?? 1) > 1 && (
              <span className="badge badge-outline">
                Abierto desde hace {rec.consecutive_runs_open} escaneos
              </span>
            )}
          </div>
          <div className="rec-title">{rec.title}</div>
          <div className="rec-problem">{rec.description}</div>
        </div>

        {/* Right column */}
        <div
          className="rec-side"
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-end",
            gap: 14,
            flexShrink: 0,
          }}
        >
          <div className="rec-metrics">
            <div className="rmetric">
              <div className="l">Impacto</div>
              <div className="v">
                <DotMeter n={impactToN(rec.impact)} tone="h" />
              </div>
            </div>
            <div className="rmetric">
              <div className="l">Esfuerzo</div>
              <div className="v">
                <DotMeter n={effortToN(rec.effort)} tone="m" />
              </div>
            </div>
            <div className="rmetric">
              <div className="l">Confianza</div>
              <div className="v" style={{ fontSize: 12, fontWeight: 700 }}>
                {rec.confidence === "low" ? (
                  <span className="badge badge-warn" style={{ fontSize: 10 }}>
                    Baja
                  </span>
                ) : rec.confidence === "high" ? (
                  "Alta"
                ) : (
                  "Media"
                )}
              </div>
            </div>
          </div>
          <button
            className="btn btn-ghost btn-sm"
            onClick={(e) => {
              e.stopPropagation();
              setOpen((o) => !o);
            }}
          >
            {open ? "Ocultar" : "Ver"} recomendación
            <Icon name={open ? "chevDown" : "chevRight"} size={14} />
          </button>
        </div>
      </div>

      {/* Expandable detail */}
      <div className="rec-detail">
        <div className="rec-detail-inner">
          {/* Two-column evidence grid */}
          <div className="rec-evidence-grid">
            {/* Columna izquierda — Por qué importa */}
            <div className="rec-evidence-col">
              <div className="rec-evidence-col-label">Por qué importa</div>
              {ev.why_this_matters ? (
                <p style={{ fontSize: 13, color: "var(--ink-2)", lineHeight: 1.6, margin: 0 }}>
                  {ev.why_this_matters}
                </p>
              ) : (
                <p style={{ fontSize: 13, color: "var(--ink-4)", fontStyle: "italic", margin: 0 }}>
                  Sin datos de razonamiento disponibles.
                </p>
              )}
              {promptDetails.length > 0 ? (
                <div>
                  <div style={{ fontSize: 12, color: "var(--ink-4)", fontWeight: 600, marginBottom: 4 }}>
                    {promptDetails.length} prompt{promptDetails.length !== 1 ? "s" : ""} afectado{promptDetails.length !== 1 ? "s" : ""}
                  </div>
                  <ul style={{ fontSize: 12.5, color: "var(--ink-3)", paddingLeft: 16, margin: 0, listStyle: "none" }}>
                    {promptDetails.slice(0, 4).map((p) => (
                      <li key={p.id} style={{ marginBottom: 6 }}>
                        <div>{p.prompt}</div>
                        {(p.competitors.length > 0 || p.domains.length > 0) && (
                          <div style={{ fontSize: 11.5, color: "var(--ink-4)", marginTop: 2 }}>
                            {p.competitors.length > 0 && <span>Gana: {p.competitors.join(", ")}</span>}
                            {p.competitors.length > 0 && p.domains.length > 0 && <span> · </span>}
                            {p.domains.length > 0 && <span>Cita: {p.domains.join(", ")}</span>}
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : affectedPrompts.length > 0 && (
                <div>
                  <div style={{ fontSize: 12, color: "var(--ink-4)", fontWeight: 600, marginBottom: 4 }}>
                    {affectedPrompts.length} prompt{affectedPrompts.length !== 1 ? "s" : ""} afectado{affectedPrompts.length !== 1 ? "s" : ""}
                  </div>
                  <ul style={{ fontSize: 12.5, color: "var(--ink-3)", paddingLeft: 16, margin: 0 }}>
                    {affectedPrompts.slice(0, 4).map((p, i) => (
                      <li key={i}>{p}</li>
                    ))}
                  </ul>
                </div>
              )}
              {assumptions.length > 0 && (
                <p style={{ fontSize: 11.5, color: "var(--ink-4)", lineHeight: 1.5, margin: 0 }}>
                  <span style={{ fontWeight: 600 }}>Supuestos: </span>
                  {assumptions.join(" ")}
                </p>
              )}
            </div>

            {/* Columna derecha — Evidencia */}
            <div className="rec-evidence-col">
              <div className="rec-evidence-col-label">Evidencia</div>
              {displaySnippets.length > 0 ? (
                displaySnippets.slice(0, 3).map((snippet, i) => (
                  <div key={i} className="rec-snippet">&ldquo;{snippet}&rdquo;</div>
                ))
              ) : (
                <p style={{ fontSize: 12.5, color: "var(--ink-4)", margin: 0 }}>
                  Sin fragmentos de evidencia disponibles.
                </p>
              )}
              {sentimentDrivers.length > 0 && (
                <p style={{ fontSize: 12.5, color: "var(--ink-3)", margin: 0 }}>
                  <span style={{ fontWeight: 600 }}>Temas recurrentes: </span>
                  {sentimentDrivers.join(", ")}
                </p>
              )}
              {competitors.length > 0 && (
                <p style={{ fontSize: 12.5, color: "var(--ink-3)", margin: 0 }}>
                  <span style={{ fontWeight: 600 }}>Competidores: </span>
                  {competitors.join(", ")}
                </p>
              )}
              {domains.length > 0 && (
                <p style={{ fontSize: 12.5, color: "var(--ink-3)", margin: 0 }}>
                  <span style={{ fontWeight: 600 }}>Dominios: </span>
                  {domains.join(", ")}
                </p>
              )}
              {citationPages.length > 0 && (
                <div style={{ fontSize: 12.5, color: "var(--ink-3)" }}>
                  <span style={{ fontWeight: 600 }}>Páginas citadas: </span>
                  <ul style={{ margin: "4px 0 0", paddingLeft: 16 }}>
                    {citationPages.slice(0, 4).map((page, i) => (
                      <li key={i}>
                        &ldquo;{page.title}&rdquo; <span style={{ color: "var(--ink-4)" }}>({page.domain})</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>

          {/* Mejorar redacción con IA — el botón solo aparece mientras no haya
              una solución generada; una vez generada, se muestra la insignia. */}
          <div style={{ marginTop: 4, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            {!rec.solution ? (
              <>
                <button type="button" className="btn btn-ghost btn-sm" onClick={handleRewrite} disabled={isRewriting}>
                  {isRewriting ? (
                    <>
                      <span className="btn-spinner" /> Generando propuesta…
                    </>
                  ) : (
                    <>
                      <Icon name="sparkles" size={13} />
                      Generar propuesta con IA
                    </>
                  )}
                </button>
                {rewriteError && (
                  <p className="feedback error" style={{ margin: 0 }}>
                    {rewriteError}
                  </p>
                )}
              </>
            ) : (
              <span className="badge badge-outline">
                <Icon name="sparkles" size={11} />
                Propuesta generada
              </span>
            )}

            {/* Marcar como hecho (RECS-3) — dismisses the recommendation;
                router.refresh() removes it from view since the page only
                fetches status='active' rows. */}
            <button type="button" className="btn btn-ghost btn-sm" onClick={handleDismiss} disabled={isDismissing}>
              {isDismissing ? (
                <>
                  <span className="btn-spinner" /> Actualizando…
                </>
              ) : (
                <>
                  <Icon name="check" size={13} />
                  Marcar como hecho
                </>
              )}
            </button>
            {dismissError && (
              <p className="feedback error" style={{ margin: 0 }}>
                {dismissError}
              </p>
            )}
          </div>

          {/* Plan de acción — asset saneado generado por IA, aditivo: no
              sustituye el título/descripción de la regla, que sigue siendo el
              planteamiento del problema. */}
          {rec.solution && <SolutionPanel solution={rec.solution} />}

          {/* Acción sugerida — solo si existe en evidence_json */}
          {ev.action_suggested && (
            <div
              style={{
                marginTop: 4,
                padding: "12px 16px",
                background: "var(--surface-sunk)",
                borderRadius: 10,
                border: "1.5px solid var(--line)",
              }}
            >
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.07em",
                  color: "var(--ink-4)",
                  marginBottom: 6,
                }}
              >
                Acción sugerida
              </div>
              <p style={{ fontSize: 13, color: "var(--ink)", lineHeight: 1.6, margin: 0 }}>
                {ev.action_suggested}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function RecommendationsClient({
  recommendations,
  resolvedHistory = [],
  recentWinsCount = 0,
  projectId,
}: {
  recommendations: Recommendation[];
  resolvedHistory?: ResolvedHistoryItem[];
  recentWinsCount?: number;
  projectId: string;
}) {
  const [filter, setFilter] = useState<FilterMode>("all");

  // Detect which type filters have data
  const hasContent = recommendations.some((r) => categoryForType(r.recommendation_type) === "content");
  const hasTechnical = recommendations.some((r) => categoryForType(r.recommendation_type) === "technical");
  const hasAuthority = recommendations.some((r) => categoryForType(r.recommendation_type) === "authority");

  const filtered = recommendations.filter((r) => {
    if (filter === "high") return r.priority_rank <= 3;
    if (filter === "quick") return isQuickWin(r);
    if (filter === "content") return categoryForType(r.recommendation_type) === "content";
    if (filter === "technical") return categoryForType(r.recommendation_type) === "technical";
    if (filter === "authority") return categoryForType(r.recommendation_type) === "authority";
    return true;
  });

  const tabs: [FilterMode, string][] = [
    ["all", "Todas"],
    ["high", "Alta prioridad"],
    ["quick", "Victorias rápidas"],
    ...(hasContent ? [["content", "Contenido"] as [FilterMode, string]] : []),
    ...(hasTechnical ? [["technical", "Técnico"] as [FilterMode, string]] : []),
    ...(hasAuthority ? [["authority", "Autoridad"] as [FilterMode, string]] : []),
    ...(resolvedHistory.length > 0 ? [["resolved", "Resueltas"] as [FilterMode, string]] : []),
  ];

  return (
    <>
      {/* Victorias recientes (RECS-3) — compact, clickable summary that jumps
          straight to the "Resueltas" tab instead of listing every title inline. */}
      {recentWinsCount > 0 && (
        <button
          type="button"
          onClick={() => setFilter("resolved")}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            width: "100%",
            marginBottom: 16,
            padding: "10px 16px",
            background: "var(--pos-soft, #f0faf3)",
            border: "1px solid var(--pos, #1a9c5c)",
            borderRadius: "var(--r-md)",
            fontSize: 13,
            fontWeight: 700,
            color: "var(--pos-ink, #1a7a49)",
            cursor: "pointer",
            textAlign: "left",
          }}
        >
          <Icon name="check" size={14} />
          {recentWinsCount === 1
            ? "1 recomendación resuelta recientemente"
            : `${recentWinsCount} recomendaciones resueltas recientemente`}
          <span style={{ marginLeft: "auto", display: "flex" }}>
            <Icon name="arrRight" size={14} />
          </span>
        </button>
      )}

      {/* Filters */}
      <div className="filters">
        <div className="seg">
          {tabs.map(([key, label]) => (
            <button
              key={key}
              className={filter === key ? "on" : ""}
              onClick={() => setFilter(key)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Cards */}
      {filter === "resolved"
        ? resolvedHistory.map((item) => <ResolvedHistoryCard key={item.id} item={item} />)
        : filtered.map((rec) => <RecCard key={rec.id} rec={rec} projectId={projectId} />)}

      {filter === "resolved"
        ? resolvedHistory.length === 0 && (
            <div className="section-empty">
              <div className="section-empty-title">Todavía no hay recomendaciones resueltas</div>
              <div className="section-empty-desc">
                Aquí aparecerán las que se resuelvan solas en un escaneo futuro o que marques como hechas.
              </div>
            </div>
          )
        : filtered.length === 0 && (
            <div className="section-empty">
              <div className="section-empty-title">
                No hay recomendaciones con este filtro
              </div>
              <div className="section-empty-desc">
                Prueba con &ldquo;Todas&rdquo; para ver el backlog completo.
              </div>
            </div>
          )}
    </>
  );
}
