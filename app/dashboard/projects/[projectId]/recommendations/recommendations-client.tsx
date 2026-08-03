"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import { DotMeter } from "@/components/ui/dot-meter";
import { categoryForType, labelForType, type AffectedPromptDetail } from "@/lib/recommendations/recommendation-engine";
import { rewriteRecommendationAction, dismissRecommendationAction } from "@/app/dashboard/projects/[projectId]/actions";
import type { GeneratedSolution, GeneratedSolutionExample } from "@/lib/recommendations/generated-solution";

// Re-exported (not redefined) so every existing `import { type GeneratedSolution } from "./recommendations-client"`
// keeps working unchanged — lib/recommendations/generated-solution.ts is now
// the single source of truth for this shape (WEB-AUDIT-R5: the web-audit
// page parses the same generated_solutions rows and needed the same type
// without a third independent copy).
export type { GeneratedSolution, GeneratedSolutionExample };

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
  /** RECS-REDESIGN-1 — bounded first move for this gap. */
  first_step?: string;
};

/**
 * Read-time enrichment of an `add_citation_block` card with already-persisted
 * domain-coverage data (RECS-COVERAGE-OVERLAY-1). Defined locally rather than
 * imported from the server-only lib/recommendations/coverage-overlay.ts, same
 * reason GeneratedSolution is defined locally. Absent/null means "render this
 * card exactly as before" — coverage data is optional and sparse by design.
 */
export type CoverageOverlay = {
  state: "confirmed_surfacing_gap" | "possible_content_gap" | "none";
  verifiedPage: { url: string; title: string } | null;
  confidenceOverride: "low" | "medium" | "high" | null;
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
  /** RECS-COVERAGE-OVERLAY-1 — null/undefined for every card type except a
   * matched `add_citation_block` card for the current scan. */
  coverageOverlay?: CoverageOverlay | null;
  /**
   * RECS-REDESIGN-1 — real counterfactual score delta for this action (ADR
   * 0017), computed server-side. Null whenever the type isn't quantifiable or
   * the run's confidence is low: the card then shows a qualitative impact
   * instead, never a fabricated number. Undefined when the host screen doesn't
   * compute it at all (the web-audit page reuses RecCard).
   */
  potentialPoints?: number | null;
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
  // A confirmed surfacing gap (RECS-COVERAGE-OVERLAY-1) bumps the effective
  // confidence used everywhere, since the assumption became verified evidence.
  const confidence = rec.coverageOverlay?.confidenceOverride ?? rec.confidence;
  if (rec.impact === "high" && confidence !== "low") return "high";
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

/**
 * Exported (WEB-AUDIT-R5) so the "Auditoría web" page's Plan de acción can
 * embed the SAME interactive card — evidence, "Generar propuesta con IA",
 * "Marcar como hecho" — for a matched recommendation instead of linking out
 * to this page. Self-contained: owns its own open/close state and calls the
 * same server actions regardless of which page renders it.
 */
export function RecCard({
  rec,
  projectId,
  compact = false,
}: {
  rec: Recommendation;
  projectId: string;
  /**
   * Rendered inside a group of same-rule cards, where the description and
   * first step are identical across every member and are already shown once
   * at group level. Suppresses both so the expanded group reads as a list of
   * affected queries rather than N copies of the same paragraph.
   */
  compact?: boolean;
}) {
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
  const effectiveConfidence = rec.coverageOverlay?.confidenceOverride ?? rec.confidence;
  const overlay = rec.coverageOverlay;
  // RECS-REDESIGN-1 — the single bounded first move, emitted by every engine
  // rule. Older rows (persisted before this field existed) simply don't render
  // the block; nothing is invented to fill it.
  const firstStep = ev.first_step ?? null;

  const priorityBadgeCls =
    rankCls === "high"
      ? "badge badge-neg"
      : rankCls === "med"
        ? "badge badge-warn"
        : "badge badge-neutral";

  return (
    <div id={`rec-${rec.id}`} className={`rec-card${open ? " open" : ""}`}>
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
        {/* Center column.
            RECS-REDESIGN-1 simplification: the collapsed card carries exactly
            three things — what to do (title), why (description) and the first
            move (first step). The rank pill, the internal type badge
            ("Perseguir fuentes de citación") and the impact/effort/confidence
            meter trio were all removed from this view: they are engine
            vocabulary, not decisions the user makes at a glance, and with
            15+ cards they were most of the page's ink. Impact, effort and
            confidence still exist — they moved into the expanded detail. */}
        <div style={{ minWidth: 0, flex: 1 }}>
          {(priorityLevel(rec) === "high" || quickWin || (rec.consecutive_runs_open ?? 1) > 1) && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                marginBottom: 6,
                flexWrap: "wrap",
              }}
            >
              {priorityLevel(rec) === "high" && <span className={priorityBadgeCls}>Prioridad alta</span>}
              {quickWin && (
                <span className="badge badge-pos">
                  <Icon name="bolt" size={11} />
                  Victoria rápida
                </span>
              )}
              {(rec.consecutive_runs_open ?? 1) > 1 && (
                <span className="badge badge-outline">Abierta {rec.consecutive_runs_open} escaneos</span>
              )}
            </div>
          )}
          <div className="rec-title">{rec.title}</div>
          {!compact && <div className="rec-problem">{rec.description}</div>}
          {!compact && firstStep && (
            <div className="rec2-step">
              <Icon name="arrRight" size={13} />
              <span>
                <b>Empieza por aquí.</b> {firstStep}
              </span>
            </div>
          )}
        </div>

        {/* Right column — what this action is worth, and nothing else.
            A real counterfactual number when the run supports one (ADR 0017);
            a qualitative impact word when it does not, never an invented
            figure. */}
        <div
          className="rec-side"
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-end",
            justifyContent: "space-between",
            gap: 10,
            flexShrink: 0,
          }}
        >
          <div style={{ textAlign: "right" }}>
            {typeof rec.potentialPoints === "number" && Math.round(rec.potentialPoints) > 0 ? (
              <>
                <div className="rec2-pts">+{Math.round(rec.potentialPoints)} pt</div>
                <div className="rec2-pts-l">potenciales</div>
              </>
            ) : (
              <>
                <div className="rec2-pts" style={{ color: "var(--ink-2)", fontSize: 13 }}>
                  {rec.impact === "high" ? "Impacto alto" : rec.impact === "medium" ? "Impacto medio" : "Impacto bajo"}
                </div>
                {effectiveConfidence === "low" && <div className="rec2-pts-l">confianza baja</div>}
              </>
            )}
          </div>
          <button
            className="btn btn-ghost btn-sm"
            onClick={(e) => {
              e.stopPropagation();
              setOpen((o) => !o);
            }}
          >
            {open ? "Ocultar" : "Ver más"}
            <Icon name={open ? "chevDown" : "chevRight"} size={14} />
          </button>
        </div>
      </div>

      {/* Expandable detail */}
      <div className="rec-detail">
        <div className="rec-detail-inner">
          {/* Impact / effort / confidence, moved here from the collapsed card
              (RECS-REDESIGN-1). They are qualifiers you read while deciding
              whether to take this on — useful once the card is open, pure
              noise multiplied across a 15-card list. */}
          <div
            style={{
              display: "flex",
              gap: 20,
              alignItems: "center",
              flexWrap: "wrap",
              paddingBottom: 12,
              marginBottom: 12,
              borderBottom: "1px solid var(--line-soft)",
            }}
          >
            <div className="rmetric" style={{ textAlign: "left" }}>
              <div className="l">Impacto</div>
              <div className="v" style={{ justifyContent: "flex-start" }}>
                <DotMeter n={impactToN(rec.impact)} tone="h" />
              </div>
            </div>
            <div className="rmetric" style={{ textAlign: "left" }}>
              <div className="l">Esfuerzo</div>
              <div className="v" style={{ justifyContent: "flex-start" }}>
                <DotMeter n={effortToN(rec.effort)} tone="m" />
              </div>
            </div>
            <div className="rmetric" style={{ textAlign: "left" }}>
              <div className="l">Confianza</div>
              <div className="v" style={{ justifyContent: "flex-start", fontSize: 12, fontWeight: 700 }}>
                {effectiveConfidence === "low" ? "Baja" : effectiveConfidence === "high" ? "Alta" : "Media"}
              </div>
            </div>
            <div className="rmetric" style={{ textAlign: "left" }}>
              <div className="l">Tipo</div>
              <div className="v" style={{ justifyContent: "flex-start", fontSize: 12, fontWeight: 700 }}>
                {labelForType(rec.recommendation_type)}
              </div>
            </div>
          </div>

          {/* Auditoría de cobertura del dominio (RECS-COVERAGE-OVERLAY-1) — shown
              FIRST because it reframes what this whole card means. Plain-language
              explanation of what we checked, what we found on the user's own
              site, and what that changes about the fix. */}
          {overlay?.state === "confirmed_surfacing_gap" && (
            <div
              style={{
                marginBottom: 14,
                padding: "12px 16px",
                background: "var(--pos-soft, #f0faf3)",
                borderRadius: 10,
                border: "1px solid var(--pos, #1a9c5c)",
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
                  color: "var(--pos-ink, #1a7a49)",
                  marginBottom: 6,
                }}
              >
                <Icon name="check" size={12} />
                Auditoría de tu web
              </div>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: "var(--ink)", marginBottom: 4 }}>
                Sí tienes una página sobre este tema
              </div>
              <p style={{ fontSize: 13, color: "var(--ink-2)", lineHeight: 1.6, margin: 0 }}>
                Buscamos en Google dentro de tu dominio y encontramos contenido tuyo sobre esta consulta. El problema
                no es que te falte contenido, sino que la IA no lo está citando como fuente.
              </p>
              <p style={{ fontSize: 13, color: "var(--ink)", lineHeight: 1.6, margin: "8px 0 0" }}>
                <b>Qué hacer:</b> no crees una página nueva. Refuerza la que ya tienes para que sea fácil de citar —
                añade un bloque con datos concretos (cifras, fechas, hechos verificables) que la IA pueda referenciar.
              </p>
              {overlay.verifiedPage && (
                <a
                  href={overlay.verifiedPage.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ fontSize: 12.5, color: "var(--accent)", display: "inline-block", marginTop: 8, overflowWrap: "anywhere" }}
                >
                  Tu página: {overlay.verifiedPage.url}
                </a>
              )}
            </div>
          )}
          {overlay?.state === "possible_content_gap" && (
            <div
              style={{
                marginBottom: 14,
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
                <Icon name="info" size={12} />
                Auditoría de tu web
              </div>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: "var(--ink)", marginBottom: 4 }}>
                No encontramos contenido tuyo sobre este tema
              </div>
              <p style={{ fontSize: 13, color: "var(--ink-2)", lineHeight: 1.6, margin: 0 }}>
                Buscamos en Google dentro de tu dominio y no apareció ninguna página tuya sobre esta consulta. Puede
                que el problema no sea de citación, sino que todavía no has publicado contenido sobre esto.
              </p>
              <p style={{ fontSize: 13, color: "var(--ink)", lineHeight: 1.6, margin: "8px 0 0" }}>
                <b>Qué hacer:</b> antes de intentar que te citen, plantéate crear una página que responda a esta
                consulta. Si crees que ya la tienes, puede que Google aún no la haya indexado — revísalo.
              </p>
            </div>
          )}

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

/**
 * How many actions the plan proposes per scan. Three is a deliberate product
 * choice, not a layout constant: the research behind this redesign found the
 * competition's failure mode is a 100-row list nobody starts, and every guide
 * reviewed prescribes a small, bounded set of next moves. Everything else
 * stays one scroll below in "Más recomendaciones" — nothing is hidden.
 */
const PLAN_SIZE = 3;

/**
 * Actions the plan should surface first: highest real potential, and among
 * equals the cheapest to do. Recommendations without a quantified delta fall
 * back to their qualitative impact so a low-confidence run still gets a
 * sensible plan instead of an empty one.
 */
function planScore(rec: Recommendation): number {
  const points = typeof rec.potentialPoints === "number" ? rec.potentialPoints : null;
  const impactFallback = rec.impact === "high" ? 4 : rec.impact === "medium" ? 2 : 1;
  const base = points !== null && points > 0 ? points * 10 : impactFallback;
  const effortBonus = rec.effort === "low" ? 3 : rec.effort === "medium" ? 1 : 0;
  const stalenessBonus = Math.min(3, Math.max(0, (rec.consecutive_runs_open ?? 1) - 1));
  return base + effortBonus + stalenessBonus;
}

/**
 * Groups the leftovers by recommendation type so fifteen "Aparece en …" cards
 * collapse into one expandable row with a count. This is the density fix the
 * redesign exists for, and it is deliberately done HERE rather than in the
 * engine: merging them at generation time would change each gap's dedupe_key,
 * and per-prompt keys are what let a scan resolve gaps one at a time
 * (RECS-3). Grouping is presentation; resolution stays per prompt.
 */
function groupByType(recs: Recommendation[]): Array<{ type: string; items: Recommendation[] }> {
  const byType = new Map<string, Recommendation[]>();
  for (const rec of recs) {
    const bucket = byType.get(rec.recommendation_type) ?? [];
    bucket.push(rec);
    byType.set(rec.recommendation_type, bucket);
  }
  return Array.from(byType.entries()).map(([type, items]) => ({ type, items }));
}

function GroupedRecs({
  type,
  items,
  projectId,
  jointPointsByType,
}: {
  type: string;
  items: Recommendation[];
  projectId: string;
  jointPointsByType?: Record<string, number | null>;
}) {
  const [open, setOpen] = useState(false);
  // Never the SUM of the members' deltas: two gaps of the same type can share
  // affected prompts and summing double-counts them (ADR 0017 §3). The number
  // shown here is a single joint counterfactual computed server-side over the
  // whole group; absent it, the group shows no figure at all.
  const joint = jointPointsByType?.[type] ?? null;

  // Members of a group are, by construction, the same rule fired on different
  // prompts — so their description and first step are word-for-word identical.
  // Showing them once here and suppressing them on the cards is what keeps an
  // expanded group readable instead of eight copies of the same two sentences.
  const shared = items[0];
  const sharedStep = shared.evidence_json?.first_step ?? null;

  return (
    <div className="rec2-group">
      <button type="button" className="rec2-group-h" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <Icon name={open ? "chevDown" : "chevRight"} size={15} />
        <span className="rec2-group-t">{labelForType(type)}</span>
        {joint !== null && joint > 0 && (
          <span className="rec2-pts" style={{ fontSize: 13 }}>
            +{joint} pt
          </span>
        )}
        <span className="rec2-group-c">{items.length}</span>
      </button>
      {open && (
        <div className="rec2-group-body">
          <div style={{ padding: "12px 4px 2px" }}>
            <div className="rec-problem" style={{ marginTop: 0 }}>
              {shared.description}
            </div>
            {sharedStep && (
              <div className="rec2-step">
                <Icon name="arrRight" size={13} />
                <span>
                  <b>Empieza por aquí.</b> {sharedStep}
                </span>
              </div>
            )}
            <div
              style={{
                fontSize: 11,
                fontWeight: 800,
                letterSpacing: ".08em",
                textTransform: "uppercase",
                color: "var(--ink-4)",
                margin: "14px 0 2px",
              }}
            >
              Consultas afectadas
            </div>
          </div>
          {items.map((rec) => (
            <RecCard key={rec.id} rec={rec} projectId={projectId} compact />
          ))}
        </div>
      )}
    </div>
  );
}

export function RecommendationsClient({
  recommendations,
  resolvedHistory = [],
  recentWinsCount = 0,
  projectId,
  jointPoints = null,
  jointPointsByType,
  domain = "",
}: {
  recommendations: Recommendation[];
  resolvedHistory?: ResolvedHistoryItem[];
  recentWinsCount?: number;
  projectId: string;
  jointPoints?: number | null;
  /** Joint counterfactual per recommendation type, computed server-side. */
  jointPointsByType?: Record<string, number | null>;
  domain?: string;
}) {
  const [filter, setFilter] = useState<FilterMode>("all");

  // Detect which type filters have data
  const hasContent = recommendations.some((r) => categoryForType(r.recommendation_type) === "content");
  const hasTechnical = recommendations.some((r) => categoryForType(r.recommendation_type) === "technical");
  const hasAuthority = recommendations.some((r) => categoryForType(r.recommendation_type) === "authority");

  // The plan: the highest-yield actions of this scan, in the order the engine
  // would tackle them. Computed before filtering — the plan is the scan's
  // answer to "what now", not a view of the current tab.
  const plan = [...recommendations].sort((a, b) => planScore(b) - planScore(a)).slice(0, PLAN_SIZE);
  const planIds = new Set(plan.map((r) => r.id));
  const rest = recommendations.filter((r) => !planIds.has(r.id));
  const planPoints = Math.round(
    plan.reduce((sum, r) => sum + (typeof r.potentialPoints === "number" ? r.potentialPoints : 0), 0),
  );

  function handleExport() {
    const lines: string[] = [
      `# Plan de acción GEO — ${domain}`,
      "",
      `Generado por GenScore · ${new Date().toLocaleDateString("es-ES", { timeZone: "Europe/Madrid" })}`,
      "",
      `## Prioritarias (${plan.length})`,
      "",
    ];
    const write = (rec: Recommendation, i: number) => {
      const pts =
        typeof rec.potentialPoints === "number" && Math.round(rec.potentialPoints) > 0
          ? ` (+${Math.round(rec.potentialPoints)} pt potenciales)`
          : "";
      lines.push(`${i + 1}. **${rec.title}**${pts}`);
      lines.push(`   ${rec.description}`);
      const step = rec.evidence_json?.first_step;
      if (step) lines.push(`   Empieza por aquí: ${step}`);
      lines.push("");
    };
    plan.forEach(write);
    if (rest.length > 0) {
      lines.push(`## Resto (${rest.length})`, "");
      rest.forEach(write);
    }

    const blob = new Blob([lines.join("\n")], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `plan-geo-${domain || "genscore"}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  const filtered = recommendations.filter((r) => {
    if (filter === "high") return priorityLevel(r) === "high";
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

      {/* 4 · The plan. Shown only on the unfiltered view: once the user picks
          a filter they are browsing deliberately, and a fixed "start here"
          block on top of a filtered list is noise. */}
      {filter === "all" && plan.length > 0 && (
        <>
          <div className="rec2-plan">
            <div className="rec2-plan-t">
              {plan.length} {plan.length === 1 ? "acción prioritaria" : "acciones prioritarias"}.
              {planPoints > 0 ? ` Hasta +${planPoints} puntos.` : ""}
            </div>
            <div className="rec2-plan-d">
              {recommendations.length > plan.length
                ? `Las de mayor rendimiento de ${recommendations.length}.`
                : "Ordenadas por lo que más mueve tu puntuación."}
            </div>
          </div>
          {plan.map((rec) => (
            <RecCard key={rec.id} rec={rec} projectId={projectId} />
          ))}
        </>
      )}

      {/* 5 · Everything else, grouped by action type so repeats collapse. */}
      {filter === "all" && rest.length > 0 && (
        <>
          <div className="rec2-sec">
            <span className="rec2-sec-t">Más recomendaciones</span>
            <span className="rec2-sec-n">
              {rest.length}
              {jointPoints !== null && planPoints > 0 && jointPoints > planPoints
                ? ` · +${jointPoints - planPoints} pt`
                : ""}
            </span>
          </div>
          {groupByType(rest).map(({ type, items }) =>
            items.length > 1 ? (
              <GroupedRecs
                key={type}
                type={type}
                items={items}
                projectId={projectId}
                jointPointsByType={jointPointsByType}
              />
            ) : (
              <RecCard key={items[0].id} rec={items[0]} projectId={projectId} />
            ),
          )}
        </>
      )}

      {/* Filters + filtered list. Kept below the plan so the default view
          answers "what now" before it offers ways to browse. */}
      <div className="rec2-sec">
        <span className="rec2-sec-t">{filter === "all" ? "Filtrar" : "Filtradas"}</span>
        <button
          type="button"
          onClick={handleExport}
          className="btn btn-ghost btn-sm"
          style={{ padding: "5px 11px", fontSize: 12 }}
        >
          <Icon name="download" size={13} />
          Exportar plan
        </button>
      </div>
      <div className="filters">
        <div className="seg">
          {tabs.map(([key, label]) => (
            <button key={key} className={filter === key ? "on" : ""} onClick={() => setFilter(key)}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {filter === "resolved" &&
        (resolvedHistory.length > 0 ? (
          resolvedHistory.map((item) => <ResolvedHistoryCard key={item.id} item={item} />)
        ) : (
          <div className="section-empty">
            <div className="section-empty-title">Todavía no hay nada resuelto</div>
            <div className="section-empty-desc">
              Aquí aparecerá lo que un escaneo confirme como resuelto y lo que marques como hecho.
            </div>
          </div>
        ))}

      {filter !== "all" &&
        filter !== "resolved" &&
        (filtered.length > 0 ? (
          filtered.map((rec) => <RecCard key={rec.id} rec={rec} projectId={projectId} />)
        ) : (
          <div className="section-empty">
            <div className="section-empty-title">Nada con este filtro</div>
            <div className="section-empty-desc">Vuelve a &ldquo;Todas&rdquo; para verlo todo.</div>
          </div>
        ))}
    </>
  );
}
