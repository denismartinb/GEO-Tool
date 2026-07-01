"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import { DotMeter } from "@/components/ui/dot-meter";
import { categoryForType, type AffectedPromptDetail } from "@/lib/recommendations/recommendation-engine";
import { rewriteRecommendationAction } from "@/app/dashboard/projects/[projectId]/actions";

type EvidenceJson = {
  why_this_matters?: string;
  assumptions?: string[];
  affected_prompts?: string[];
  affected_prompt_details?: AffectedPromptDetail[];
  evidence_snippets?: string[];
  stale_signals?: string[];
  mentioned_competitors?: string[];
  citation_domains?: string[];
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
};

type FilterMode = "all" | "high" | "quick" | "content" | "technical" | "authority";

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

function rankClass(rank: number): string {
  if (rank <= 2) return "high";
  if (rank <= 5) return "med";
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

function RecCard({ rec, projectId }: { rec: Recommendation; projectId: string }) {
  const [open, setOpen] = useState(false);
  const [isRewriting, startRewrite] = useTransition();
  const [rewriteError, setRewriteError] = useState<string | null>(null);
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
  const assumptions = ev.assumptions ?? [];
  const quickWin = isQuickWin(rec);
  const rankCls = rankClass(rec.priority_rank);

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
              {rec.recommendation_type.replaceAll("_", " ")}
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
  projectId,
}: {
  recommendations: Recommendation[];
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
  ];

  return (
    <>
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
      {filtered.map((rec) => (
        <RecCard key={rec.id} rec={rec} projectId={projectId} />
      ))}

      {filtered.length === 0 && (
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
