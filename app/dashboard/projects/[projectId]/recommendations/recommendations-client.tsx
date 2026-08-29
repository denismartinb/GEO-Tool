"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import { DotMeter } from "@/components/ui/dot-meter";
import { categoryForType, labelForType, type AffectedPromptDetail } from "@/lib/recommendations/recommendation-engine";
import { rewriteRecommendationAction, dismissRecommendationAction } from "@/app/dashboard/projects/[projectId]/actions";
import type { GeneratedSolution, GeneratedSolutionExample } from "@/lib/recommendations/generated-solution";
import {
  GROUP_PREVIEW_SIZE,
  MIN_VISIBLE_POINTS,
  formatPoints,
  rankGroupMembers,
  selectPlan
} from "@/lib/recommendations/plan";
import {
  CONTROL_LABEL,
  classifySolutionReadiness,
  deliverableForType,
  pointsCaption,
  readinessLabel
} from "@/lib/recommendations/deliverable";

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
 * Read-time enrichment of a card with already-persisted domain-coverage data
 * (RECS-COVERAGE-OVERLAY-1, extended to increase_brand_visibility in
 * AUDIT-RECS-JOIN-1 Fase B). Defined locally rather than imported from the
 * server-only lib/recommendations/coverage-overlay.ts, same reason
 * GeneratedSolution is defined locally. Absent/null means "render this card
 * exactly as before" — coverage data is optional and sparse by design.
 */
export type CoverageOverlay = {
  state: "confirmed_surfacing_gap" | "possible_content_gap" | "none";
  verifiedPage: { url: string; title: string } | null;
  confidenceOverride: "low" | "medium" | "high" | null;
};

/**
 * Duplicated verbatim from lib/recommendations/coverage-overlay.ts's
 * `overlayCopy` — same reason the type above is duplicated, and same risk:
 * nothing stops the two from drifting except a test. `recommendations-
 * client.test.tsx`'s "overlay copy stays in sync with the server" guards it,
 * comparing every (type, state) pair against the server function directly —
 * same discipline as GROUNDED_PROVIDERS' three-way parity guard
 * (log §130): a duplication with no test is the one that drifts in silence.
 * If you change the wording here, change it there too, or the test will say
 * so.
 */
export function overlayCopyLocal(
  recommendationType: string,
  state: CoverageOverlay["state"]
): { whatWeFound: string; whatToDo: string } | null {
  if (state === "confirmed_surfacing_gap") {
    if (recommendationType === "increase_brand_visibility") {
      return {
        whatWeFound:
          "Buscamos en Google dentro de tu dominio y encontramos contenido tuyo sobre esta consulta. El problema no es que te falte contenido, sino que esa página no está apareciendo en la respuesta de la IA.",
        whatToDo:
          "no crees una página nueva. Refuerza la que ya tienes: responde la pregunta en las dos primeras frases, con el titular en forma de pregunta, para que sea más fácil de extraer."
      };
    }
    if (recommendationType === "add_citation_block") {
      return {
        whatWeFound:
          "Buscamos en Google dentro de tu dominio y encontramos contenido tuyo sobre esta consulta. El problema no es que te falte contenido, sino que la IA no lo está citando como fuente.",
        whatToDo:
          "no crees una página nueva. Refuerza la que ya tienes para que sea fácil de citar — añade un bloque con datos concretos (cifras, fechas, hechos verificables) que la IA pueda referenciar."
      };
    }
    return {
      whatWeFound: "Buscamos en Google dentro de tu dominio y encontramos contenido tuyo sobre esta consulta.",
      whatToDo: "revisa esa página y refuérzala en vez de crear una nueva."
    };
  }

  if (state === "possible_content_gap") {
    if (recommendationType === "increase_brand_visibility") {
      return {
        whatWeFound:
          "Buscamos en Google dentro de tu dominio y no apareció ninguna página tuya sobre esta consulta.",
        whatToDo: "publica una página que responda esta pregunta en las dos primeras frases, con el titular en forma de pregunta."
      };
    }
    if (recommendationType === "add_citation_block") {
      return {
        whatWeFound:
          "Buscamos en Google dentro de tu dominio y no apareció ninguna página tuya sobre esta consulta. Puede que el problema no sea de citación, sino que todavía no has publicado contenido sobre esto.",
        whatToDo:
          "antes de intentar que te citen, plantéate crear una página que responda a esta consulta. Si crees que ya la tienes, puede que Google aún no la haya indexado — revísalo."
      };
    }
    return {
      whatWeFound: "Buscamos en Google dentro de tu dominio y no apareció ninguna página tuya sobre esta consulta.",
      whatToDo: "plantéate crear una página que responda a esta consulta."
    };
  }

  return null;
}

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
  /** The gap's stable identity across runs (RECS-DEDUPE-1) — used to detect
   * whether this exact gap was previously marked done, see
   * previouslyMarkedDoneAt below. Optional/undefined on a host screen that
   * doesn't select it (the web-audit page reuses RecCard). */
  dedupe_key?: string;
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
  /**
   * RECS-LOOP-1 Fase B — set when this exact gap (dedupe_key) was marked
   * done once before and came back: the date it was dismissed, so the card
   * carries that memory instead of silently re-teaching a gap the user
   * already acted on. Null/undefined for a brand-new gap or a host screen
   * that doesn't compute it.
   */
  previouslyMarkedDoneAt?: string | null;
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

/**
 * RECS-LOOP-1 Fase A — mirrors lib/recommendations/prediction-verification.ts
 * `PredictionVerdict` on the client (server-only module, same reason
 * CoverageOverlay/GeneratedSolution are defined locally too). Pure data, no
 * duplicated logic — the server never generates copy text, only these three
 * fields — so there is nothing here that can drift and no parity test is
 * needed, unlike overlayCopyLocal.
 */
export type PredictionVerdict = {
  kind: "presence" | "prominence" | "authority";
  fulfilledCount: number;
  totalCount: number;
};

/** RECS-LOOP-1 Fase B — mirrors lib/recommendations/dismissal-recurrence.ts
 * `RecurrenceVerdict` on the client, same reason PredictionVerdict is
 * mirrored above. */
export type RecurrenceVerdict =
  | { status: "recurred"; anchorRunId: string; anchorRunCreatedAt: string }
  | { status: "did_not_recur"; anchorRunId: string; anchorRunCreatedAt: string }
  | { status: "no_verdict" };

export type ResolvedHistoryItem = {
  id: string;
  title: string;
  description: string;
  recommendation_type: string;
  status: "resolved" | "dismissed";
  updated_at: string;
  /** Only ever set for status="resolved" — the specific-mutation check
   * (RECS-LOOP-1 Fase A), or for a "dismissed" row whose gap did NOT recur
   * (Fase B: recurrence.status === "did_not_recur"). Never both a "came
   * back" recurrence line and a mutation-detail line for the same row —
   * see predictionVerdictLine. */
  verification?: { status: "verified"; verdict: PredictionVerdict } | { status: "no_verdict" } | null;
  /** RECS-LOOP-1 Fase B — only ever set for status="dismissed". */
  recurrence?: RecurrenceVerdict | null;
};

/** Same day/month/year format used for a history row's own dateLabel below —
 * shared so the two never drift into displaying dates in different shapes on
 * the same card. */
function formatHistoryDate(iso: string): string {
  return new Date(iso).toLocaleDateString("es-ES", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Europe/Madrid",
  });
}

/** The presence/prominence/authority clause shared by both a resolved card's
 * verdict ("en el escaneo que lo confirmó, ...") and a dismissed card's whose
 * gap did not recur ("... ya no la encontró. ..." — see predictionVerdictLine).
 * Lowercase-leading: the resolved case appends it after a comma, the
 * dismissed case capitalizes it itself as a new sentence. */
function verdictClause(kind: PredictionVerdict["kind"], fulfilledCount: number, totalCount: number): string {
  const scope = totalCount === 1 ? "la consulta de esta tarjeta" : `${totalCount} consultas de esta tarjeta`;
  const of = totalCount === 1 ? "" : ` (${fulfilledCount} de ${totalCount})`;

  if (kind === "presence") {
    return fulfilledCount === totalCount
      ? `la IA te nombró en ${scope}`
      : fulfilledCount === 0
        ? `la IA no te nombró en ${scope}`
        : `la IA te nombró${of}`;
  }
  if (kind === "prominence") {
    return fulfilledCount === totalCount
      ? `dejaste de aparecer por detrás en ${scope}`
      : fulfilledCount === 0
        ? `seguiste apareciendo por detrás en ${scope}`
        : `dejaste de aparecer por detrás${of}`;
  }
  // authority
  return fulfilledCount === totalCount
    ? `tu web quedó citada en ${scope}`
    : fulfilledCount === 0
      ? `tu web no quedó citada en ${scope}`
      : `tu web quedó citada${of}`;
}

/**
 * Observational, dated copy — never "ya apareces" (a permanent-sounding
 * present tense the next scan's non-determinism could contradict). A
 * resolved row reads "en el escaneo que lo confirmó, ..." (docs/adr/0017 §5's
 * promised verification, RECS-LOOP-1 Fase A) — something WAS confirmed there,
 * the system detected the gap gone. A dismissed row never uses that phrase
 * (RECS-LOOP-1 Fase B): nothing was confirmed by a manual click, only
 * observed later, so it names the anchor scan's own date instead — a date
 * distinct from the card's dateLabel (the dismissal date), and that
 * difference is the point: "El escaneo del 25 ago 2026 ya no la encontró"
 * next to a card dated "12 ago 2026" tells you two things happened on two
 * different days. Silent (returns null) for anything short of a real
 * verdict — a history row with nothing to show says nothing, never an
 * invented or placeholder line.
 */
export function predictionVerdictLine(item: ResolvedHistoryItem): string | null {
  if (item.status === "resolved") {
    if (!item.verification || item.verification.status !== "verified") return null;
    const { kind, fulfilledCount, totalCount } = item.verification.verdict;
    return `En el escaneo que lo confirmó, ${verdictClause(kind, fulfilledCount, totalCount)}.`;
  }

  // dismissed
  if (!item.recurrence || item.recurrence.status === "no_verdict") return null;
  const anchorDate = formatHistoryDate(item.recurrence.anchorRunCreatedAt);

  if (item.recurrence.status === "recurred") {
    return `El escaneo del ${anchorDate} volvió a encontrarla.`;
  }

  // did_not_recur — the mutation detail is a second sentence, only when there
  // is one; never paired with "recurred" above (see the type doc).
  if (item.verification?.status !== "verified") {
    return `El escaneo del ${anchorDate} ya no la encontró.`;
  }
  const { kind, fulfilledCount, totalCount } = item.verification.verdict;
  const clause = verdictClause(kind, fulfilledCount, totalCount);
  return `El escaneo del ${anchorDate} ya no la encontró. ${clause.charAt(0).toUpperCase()}${clause.slice(1)}.`;
}

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
export function SolutionPanel({ solution }: { solution: GeneratedSolution }) {
  // RECS-ACCION-1 — cuánto trabajo queda antes de poder publicar esto. NO es
  // una estimación: el prompt de reescritura obliga a marcar con un
  // placeholder todo valor que no esté en la evidencia en vez de inventarlo,
  // así que los huecos se cuentan sobre el texto real que se enseña abajo.
  const readiness = classifySolutionReadiness(solution);
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
        <span
          className={readiness.kind === "ready" ? "badge badge-pos" : "badge badge-warn"}
          style={{ marginLeft: "auto", textTransform: "none", letterSpacing: 0 }}
        >
          {readinessLabel(readiness)}
        </span>
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
  const dateLabel = formatHistoryDate(item.updated_at);
  const verdictLine = predictionVerdictLine(item);

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
          {verdictLine && (
            <div className="rec-problem" style={{ marginTop: 4, color: "var(--ink-3)" }}>
              {verdictLine}
            </div>
          )}
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
  priorityRank,
}: {
  rec: Recommendation;
  projectId: string;
  /**
   * 1-based position when this card is one of the scan's priority actions.
   * Gives the card the accent treatment and a numbered chip, so the three
   * that matter carry visible weight instead of looking like the rest.
   */
  priorityRank?: number;
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
  // RECS-ACCION-1 — qué artefacto promete el botón y de quién depende el
  // resultado. Ambos derivan del tipo, igual que labelForType/categoryForType.
  const { cta: deliverableCta, control } = deliverableForType(rec.recommendation_type);
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
    <div
      id={priorityRank ? undefined : `rec-${rec.id}`}
      className={`rec-card${open ? " open" : ""}${priorityRank ? " rec2-priority" : ""}`}
    >
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
          {(priorityRank ||
            priorityLevel(rec) === "high" ||
            quickWin ||
            (rec.consecutive_runs_open ?? 1) > 1 ||
            Boolean(rec.previouslyMarkedDoneAt) ||
            control === "third_party" ||
            control === "in_app") && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                marginBottom: 6,
                flexWrap: "wrap",
              }}
            >
              {priorityRank && <span className="rec2-rank">{priorityRank}</span>}
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
              {/* RECS-LOOP-1 Fase B — this exact gap was marked done before and
                  came back. Without this the card looks brand new, and the
                  user who already clicked "Marcar como hecho" once gets no
                  memory of having done so. */}
              {rec.previouslyMarkedDoneAt && (
                <span className="badge badge-outline">
                  <Icon name="clock" size={11} />
                  La marcaste como hecha el {formatHistoryDate(rec.previouslyMarkedDoneAt)}
                </span>
              )}
              {/* RECS-ACCION-1 — sólo se marca la EXCEPCIÓN. "En tu web" es lo
                  que el usuario ya da por supuesto en 11 de los 15 tipos, y
                  repetirlo en cada tarjeta sería justo la tinta que
                  RECS-REDESIGN-1 quitó de aquí (log §115). Lo que cambia una
                  decisión de un vistazo es lo contrario: que esto NO dependa
                  de él. La ausencia de chip significa "es tuyo". */}
              {control === "third_party" && (
                <span className="badge badge-outline">
                  <Icon name="globe" size={11} />
                  {CONTROL_LABEL.third_party}
                </span>
              )}
              {control === "in_app" && (
                <span className="badge badge-outline">
                  <Icon name="robot" size={11} />
                  {CONTROL_LABEL.in_app}
                </span>
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
            {typeof rec.potentialPoints === "number" && rec.potentialPoints >= MIN_VISIBLE_POINTS ? (
              <>
                <div className="rec2-pts">+{formatPoints(rec.potentialPoints)} pt</div>
                <div className="rec2-pts-l">{pointsCaption(rec.recommendation_type)}</div>
              </>
            ) : (
              /* Confidence deliberately NOT shown here (founder review): repeated
                 down a list it read as the product hedging on every single card.
                 It still qualifies the number — that is why a low-confidence run
                 shows this qualitative label instead of a figure — and it stays
                 visible inside the expanded detail. */
              <div className="rec2-pts" style={{ color: "var(--ink-2)", fontSize: 13 }}>
                {rec.impact === "high" ? "Impacto alto" : rec.impact === "medium" ? "Impacto medio" : "Impacto bajo"}
              </div>
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
                {overlayCopyLocal(rec.recommendation_type, "confirmed_surfacing_gap")?.whatWeFound}
              </p>
              <p style={{ fontSize: 13, color: "var(--ink)", lineHeight: 1.6, margin: "8px 0 0" }}>
                <b>Qué hacer:</b> {overlayCopyLocal(rec.recommendation_type, "confirmed_surfacing_gap")?.whatToDo}
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
                {overlayCopyLocal(rec.recommendation_type, "possible_content_gap")?.whatWeFound}
              </p>
              <p style={{ fontSize: 13, color: "var(--ink)", lineHeight: 1.6, margin: "8px 0 0" }}>
                <b>Qué hacer:</b> {overlayCopyLocal(rec.recommendation_type, "possible_content_gap")?.whatToDo}
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
                      <span className="btn-spinner" /> Generando…
                    </>
                  ) : (
                    <>
                      <Icon name="sparkles" size={13} />
                      {deliverableCta}
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
            {/* RECURRING-VALUE-1 (docs/external-audit-2026-08.md, Fase 3):
                closes the loop this button opens — RECS-LOOP-1 already
                verifies on the next comparable scan whether a dismissed gap
                actually closed (pestaña "Resueltas"), but nothing on the
                active card said that check was coming. No date: the exact
                schedule is a separate deliverable (calendario visible), this
                is just the promise that a scan will judge it. */}
            {!dismissError && (
              <p style={{ margin: 0, fontSize: 11.5, color: "var(--ink-4)" }}>
                La verás reflejada en tu próximo escaneo.
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
  // RECS-ACCION-1c — dentro del grupo se enseñan primero las que más mueven la
  // aguja, y el resto queda tras un clic. Un grupo de 30 tarjetas idénticas
  // salvo la consulta no es una lista de trabajo, es un muro.
  const [showAll, setShowAll] = useState(false);
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
  // A single-member group has nothing repeated to hoist, so its one card keeps
  // its own description and step.
  const single = items.length === 1;

  const ranked = rankGroupMembers(items);
  const visible = showAll ? ranked : ranked.slice(0, GROUP_PREVIEW_SIZE);
  const hiddenCount = ranked.length - visible.length;

  return (
    <div className="rec2-group">
      <button type="button" className="rec2-group-h" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <Icon name={open ? "chevDown" : "chevRight"} size={15} />
        <span className="rec2-group-t">{labelForType(type)}</span>
        {joint !== null && joint >= MIN_VISIBLE_POINTS && (
          <span className="rec2-pts" style={{ fontSize: 13 }}>
            +{formatPoints(joint)} pt
          </span>
        )}
        <span className="rec2-group-c">{items.length}</span>
      </button>
      {open && (
        <div className="rec2-group-body">
          {!single && (
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
          )}
          {visible.map((rec) => (
            <RecCard key={rec.id} rec={rec} projectId={projectId} compact={!single} />
          ))}
          {hiddenCount > 0 && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              style={{ margin: "6px 4px 2px" }}
              onClick={() => setShowAll(true)}
            >
              <Icon name="chevDown" size={13} />
              Ver las otras {hiddenCount}
            </button>
          )}
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
  planIds = [],
  planPoints = null,
  domain = "",
}: {
  recommendations: Recommendation[];
  resolvedHistory?: ResolvedHistoryItem[];
  recentWinsCount?: number;
  projectId: string;
  jointPoints?: number | null;
  /** Joint counterfactual per recommendation type, computed server-side. */
  jointPointsByType?: Record<string, number | null>;
  /** Ids de las acciones del plan, en orden, seleccionadas en el servidor. */
  planIds?: string[];
  /** Techo CONJUNTO del plan (nunca la suma de sus tarjetas). */
  planPoints?: number | null;
  domain?: string;
}) {
  const [filter, setFilter] = useState<FilterMode>("all");

  const hasTechnical = recommendations.some((r) => categoryForType(r.recommendation_type) === "technical");

  // El plan y su techo de puntos se calculan en el servidor (selectPlan +
  // un contrafactual conjunto sobre esas mismas acciones). Sumar aqui los
  // deltas de cada tarjeta contaria dos veces los prompts que comparten
  // (ADR 0017 §3), que es justo el error que se corrigio en los grupos.
  const plan = planIds.length > 0
    ? (planIds.map((id) => recommendations.find((r) => r.id === id)).filter(Boolean) as Recommendation[])
    : selectPlan(recommendations);
  const planIdSet = new Set(plan.map((r) => r.id));
  const rest = recommendations.filter((r) => !planIdSet.has(r.id));

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
        typeof rec.potentialPoints === "number" && rec.potentialPoints >= MIN_VISIBLE_POINTS
          ? ` (+${formatPoints(rec.potentialPoints)} pt ${pointsCaption(rec.recommendation_type)})`
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

  // "Todas" is exactly that: every active recommendation, including the ones
  // already shown above as priority actions.
  //
  // "Alta prioridad" returns THE PLAN — the same three cards shown above, not a
  // separate impact×confidence selection. Two different answers to "what is
  // high priority here?" on one screen is the contradiction this redesign set
  // out to remove, and it had crept back in through the filter (founder
  // review). Repetition is fine; disagreement is not.
  const filtered =
    filter === "high"
      ? plan
      : recommendations.filter((r) =>
          filter === "technical" ? categoryForType(r.recommendation_type) === "technical" : true,
        );

  // Four filters, no more (founder review). "Victorias rápidas", "Contenido" y
  // "Autoridad" salieron: con las categorías ya visibles como acordeones en la
  // lista, duplicaban la misma navegación en dos sitios distintos.
  const tabs: [FilterMode, string][] = [
    ["all", "Todas"],
    ["high", "Alta prioridad"],
    ...(hasTechnical ? [["technical", "Técnico"] as [FilterMode, string]] : []),
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

      {/* 4 · The priority actions — always on top, whatever the filter, in the
          accent treatment so the three that matter carry visible weight. They
          are NOT removed from the list below: "Todas" means all of them, and a
          repeat costs nothing next to the confusion of a list that silently
          hides its three most important rows (founder review). */}
      {plan.length > 0 && (
        <>
          <div className="rec2-plan">
            {/* Sin punto final: cuando no hay cifra de puntos (una corrida de
                confianza baja, que hoy es lo normal) el titular se quedaba en
                "3 acciones prioritarias." y ese punto huérfano cantaba. */}
            <div className="rec2-plan-t">
              {plan.length} {plan.length === 1 ? "acción prioritaria" : "acciones prioritarias"}
              {planPoints !== null && planPoints >= MIN_VISIBLE_POINTS ? `. Hasta +${formatPoints(planPoints)} puntos` : ""}
            </div>
          </div>
          {plan.map((rec, i) => (
            <RecCard key={`plan-${rec.id}`} rec={rec} projectId={projectId} priorityRank={i + 1} />
          ))}
        </>
      )}

      {/* 5 · Filters, directly under the priority actions. */}
      <div className="rec2-sec">
        <span className="rec2-sec-t">Todas las recomendaciones</span>
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

      {/* 6 · The list.
          Accordions ONLY under "Todas": grouping exists to tame 20+ mixed
          recommendations, and a filtered view is already narrow and already
          named. Filtering to "Técnico" and then having to open an accordion
          labelled by category to reach the actions is the same choice asked
          twice (founder review). Filtered views list their actions directly. */}
      {filter !== "resolved" &&
        (filtered.length === 0 ? (
          <div className="section-empty">
            <div className="section-empty-title">Nada con este filtro</div>
            <div className="section-empty-desc">Vuelve a &ldquo;Todas&rdquo; para verlo todo.</div>
          </div>
        ) : filter === "all" ? (
          groupByType(filtered).map(({ type, items }) => (
            <GroupedRecs
              key={type}
              type={type}
              items={items}
              projectId={projectId}
              jointPointsByType={jointPointsByType}
            />
          ))
        ) : (
          filtered.map((rec) => <RecCard key={`f-${rec.id}`} rec={rec} projectId={projectId} />)
        ))}

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
    </>
  );
}
