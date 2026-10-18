"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import { EngineGlyph } from "@/components/ui/engine-glyph";
import { useActionFeedback, ActionAnnouncement } from "@/components/ui/action-feedback";
import { getEngineMeta } from "@/lib/scan/engine-meta";
import { categoryForType, labelForType, type AffectedPromptDetail } from "@/lib/recommendations/recommendation-engine";
import {
  rewriteRecommendationAction,
  dismissRecommendationAction,
  restoreRecommendationAction,
  addEmergingCompetitorAction
} from "@/app/dashboard/projects/[projectId]/actions";
import type { GeneratedSolution, GeneratedSolutionExample } from "@/lib/recommendations/generated-solution";
import { groupPromptDetails } from "@/lib/recommendations/prompt-details";
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
import { adviceSignal, dataSignal, emergingCompetitorReach, scopeLine } from "@/lib/recommendations/card-signals";
import { domainForBrandName } from "@/lib/recommendations/anchored-domains";
import { parseCompetitorDomain } from "@/lib/competitors/competitor-domain";
import { plainSnippet, shortDomainList } from "@/lib/recommendations/plain-snippet";
import {
  DEFINITION_LEVER_NOTE,
  LEVER_TYPE,
  leverFirstStep,
  leverPointsCaption,
  leverReach,
  leverTitle,
  type LeverView
} from "@/lib/recommendations/levers";
import { planGoal } from "./_components/google-rec-copy";
import { GooglePlanReport, type GooglePlanKind, type GooglePlanState } from "./_components/google-plan-state";

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
  /** log §292 — "definition" for a «qué significa X» query. */
  query_shape?: string;
  /** track_emerging_competitor: the brand the AI named (RECS-4A). */
  emerging_competitor?: string;
  /** RECS-ADD-COMPETITOR-1 — its website, when a cited source matched the name. */
  emerging_competitor_domain?: string | null;
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
  state: "confirmed_surfacing_gap" | "possible_content_gap" | "home_only" | "no_editable_page" | "listing_only" | "none";
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
/**
 * GS-03 (log §278): the step a card shows. With a coverage verdict it comes
 * from the overlay, so the card, its detail and the report say the same
 * thing ("refuerza tu página" vs. "publica una página"); otherwise it is the
 * engine's own `first_step`.
 */
export function effectiveFirstStep(rec: {
  recommendation_type: string;
  coverageOverlay?: CoverageOverlay | null;
  evidence_json?: { first_step?: string } | null;
}): string | null {
  const overlay = rec.coverageOverlay;
  const fromOverlay = overlay ? overlayCopyLocal(rec.recommendation_type, overlay.state)?.firstStep : null;
  return fromOverlay ?? rec.evidence_json?.first_step ?? null;
}

export function overlayCopyLocal(
  recommendationType: string,
  state: CoverageOverlay["state"]
): { whatWeFound: string; whatToDo: string; firstStep: string } | null {
  if (state === "confirmed_surfacing_gap") {
    if (recommendationType === "increase_brand_visibility") {
      return {
        whatWeFound:
          "Buscamos en Google dentro de tu dominio y encontramos contenido tuyo sobre esta consulta. El problema no es que te falte contenido, sino que esa página no está apareciendo en la respuesta de la IA.",
        whatToDo:
          "no crees una página nueva. Refuerza la que ya tienes: responde la pregunta en las dos primeras frases, con el titular en forma de pregunta, para que sea más fácil de extraer.",
        firstStep:
          "Refuerza tu página sobre este tema: responde la pregunta en las dos primeras frases, con el titular en forma de pregunta."
      };
    }
    if (recommendationType === "add_citation_block") {
      return {
        whatWeFound:
          "Buscamos en Google dentro de tu dominio y encontramos contenido tuyo sobre esta consulta. El problema no es que te falte contenido, sino que la IA no lo está citando como fuente.",
        whatToDo:
          "no crees una página nueva. Refuerza la que ya tienes para que sea fácil de citar — añade un bloque con datos concretos (cifras, fechas, hechos verificables) que la IA pueda referenciar.",
        firstStep: "Añade a tu página sobre este tema un dato concreto con fecha y fuente (precio, cifra, plazo)."
      };
    }
    if (recommendationType === "close_competitor_gap" || recommendationType === "add_comparison_content") {
      return {
        whatWeFound:
          "El mapa de tu web (sitemap) incluye una comparativa tuya con este competidor. El problema no es que te falte, sino que la IA no la está usando en estas respuestas.",
        whatToDo:
          "no publiques otra. Refuerza la que ya tienes: una tabla con criterios claros, datos con fecha y la respuesta a la pregunta en las dos primeras frases.",
        firstStep:
          "Refuerza tu comparativa: una tabla con criterios claros y la respuesta a la pregunta en sus dos primeras frases."
      };
    }
    return {
      whatWeFound: "Buscamos en Google dentro de tu dominio y encontramos contenido tuyo sobre esta consulta.",
      whatToDo: "revisa esa página y refuérzala en vez de crear una nueva.",
      firstStep: "Revisa tu página sobre este tema y refuérzala en vez de crear una nueva."
    };
  }

  if (state === "possible_content_gap") {
    if (recommendationType === "increase_brand_visibility") {
      return {
        whatWeFound:
          "Buscamos en Google dentro de tu dominio y no apareció ninguna página tuya sobre esta consulta.",
        whatToDo: "publica una página que responda esta pregunta en las dos primeras frases, con el titular en forma de pregunta.",
        firstStep:
          "Publica una página que responda esta pregunta en las dos primeras frases, con el titular en forma de pregunta."
      };
    }
    if (recommendationType === "add_citation_block") {
      return {
        whatWeFound:
          "Buscamos en Google dentro de tu dominio y no apareció ninguna página tuya sobre esta consulta. Puede que el problema no sea de citación, sino que todavía no has publicado contenido sobre esto.",
        whatToDo:
          "antes de intentar que te citen, plantéate crear una página que responda a esta consulta. Si crees que ya la tienes, puede que Google aún no la haya indexado — revísalo.",
        firstStep:
          "Publica una página que responda esta consulta e incluye en ella un dato concreto con fecha y fuente (precio, cifra, plazo)."
      };
    }
    return {
      whatWeFound: "Buscamos en Google dentro de tu dominio y no apareció ninguna página tuya sobre esta consulta.",
      whatToDo: "plantéate crear una página que responda a esta consulta.",
      firstStep: "Publica una página que responda a esta consulta."
    };
  }

  if (state === "home_only") {
    return {
      whatWeFound:
        "Buscamos en Google dentro de tu dominio y sólo apareció tu portada. Una portada rara vez responde a una pregunta concreta, así que no la damos por cubierta.",
      whatToDo:
        "publica una página propia que responda esta pregunta en las dos primeras frases, con el titular en forma de pregunta. Si ya tienes una, revisa que Google la tenga indexada.",
      firstStep:
        recommendationType === "add_citation_block"
          ? "Publica una página que responda esta consulta e incluye en ella un dato concreto con fecha y fuente (precio, cifra, plazo)."
          : "Publica una página que responda esta pregunta en las dos primeras frases, con el titular en forma de pregunta."
    };
  }

  if (state === "no_editable_page") {
    return {
      whatWeFound:
        "Buscamos en Google dentro de tu dominio y sólo apareció contenido de foros o de tu comunidad de usuarios. No es una página que tú escribas, así que no la damos por cubierta.",
      whatToDo:
        "publica una página propia que responda esta pregunta en las dos primeras frases, con el titular en forma de pregunta. Si ya tienes una, revisa que Google la tenga indexada.",
      firstStep:
        recommendationType === "add_citation_block"
          ? "Publica una página que responda esta consulta e incluye en ella un dato concreto con fecha y fuente (precio, cifra, plazo)."
          : "Publica una página que responda esta pregunta en las dos primeras frases, con el titular en forma de pregunta."
    };
  }

  if (state === "listing_only") {
    return {
      whatWeFound:
        "Buscamos en Google dentro de tu dominio y sólo apareció una página índice, como la portada de tu blog o un listado. Un índice enlaza a otras páginas pero no responde la pregunta, así que no la damos por cubierta.",
      whatToDo:
        "si ya tienes un artículo que responda esta pregunta, refuérzalo: la respuesta en las dos primeras frases y el titular en forma de pregunta. Si no lo tienes, publícalo.",
      firstStep:
        recommendationType === "add_citation_block"
          ? "Busca tu artículo sobre este tema y añádele un dato concreto con fecha y fuente; si no existe, publícalo."
          : "Busca tu artículo sobre este tema y responde la pregunta en sus dos primeras frases; si no existe, publícalo."
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

type FilterMode = "all" | "technical" | "resolved";

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
  /** "covered" (RECS-ALREADY-DONE-1, log §339): an active card whose page
   * coverage already found. Computed at read time, never a stored status. */
  status: "resolved" | "dismissed" | "covered";
  updated_at: string;
  /** Only for status="covered": the page coverage found. */
  coveredPageUrl?: string | null;
  /** Only ever set for status="resolved" — the specific-mutation check
   * (RECS-LOOP-1 Fase A), or for a "dismissed" row whose gap did NOT recur
   * (Fase B: recurrence.status === "did_not_recur"). Never both a "came
   * back" recurrence line and a mutation-detail line for the same row —
   * see predictionVerdictLine. */
  verification?: { status: "verified"; verdict: PredictionVerdict } | { status: "no_verdict" } | null;
  /** RECS-LOOP-1 Fase B — only ever set for status="dismissed". */
  recurrence?: RecurrenceVerdict | null;
  /**
   * ACTIONS-OBSERVABLE-1 slice 4a (docs/external-audit-2026-08.md, Fase 4) —
   * gates the durable "Deshacer" on a dismissed row. The active list filters
   * `run_id = latestCompletedRun.id AND status='active'`
   * (recommendations/page.tsx), so restoring a row whose `run_id` belongs to
   * an OLDER run flips its status but leaves it invisible everywhere — not
   * in the current active list (wrong run_id), not in history anymore
   * (status changed). "Deshacer" only ever renders when this matches the
   * screen's own `latestCompletedRunId` prop.
   */
  run_id: string;
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
  if (item.status === "covered") return null;
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
  // RECS-LABELS-1 (log §336): what depends on a third party is never «Prioridad
  // alta», the same ceiling `planScore` already applies to its place (P38).
  if (rec.impact === "high" && confidence !== "low" && !dependsOnThirdParty(rec)) return "high";
  if (rec.impact === "high" || rec.impact === "medium") return "med";
  return "low";
}

function isQuickWin(rec: Recommendation): boolean {
  // RECS-LABELS-1 (log §336): nothing that waits on someone else is quick.
  return rec.impact === "high" && rec.effort === "low" && !dependsOnThirdParty(rec);
}

function dependsOnThirdParty(rec: Recommendation): boolean {
  return deliverableForType(rec.recommendation_type).control === "third_party";
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
export function SolutionPanel({
  solution,
  recommendationType
}: {
  solution: GeneratedSolution;
  /** Decides whether a ready plan reads "Listo para copiar" or "Plan listo" (log §326). */
  recommendationType?: string;
}) {
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
          {readinessLabel(readiness, recommendationType ? deliverableForType(recommendationType).control : "own_site")}
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

/** What coverage found, in the words of the card it closes (log §339). */
export function coveredPageLead(recommendationType: string): string {
  return recommendationType === "increase_brand_visibility"
    ? "Ya tienes una página que responde a esta pregunta:"
    : "Ya tienes una comparativa con este competidor:";
}

/** "genscore.es/geo" for "https://www.genscore.es/geo/". */
export function displayPageUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.hostname.replace(/^www\./, "")}${parsed.pathname.replace(/\/+$/, "")}`;
  } catch {
    return url;
  }
}

/**
 * Read-only row for the "Resueltas" tab (RECS-3) — no expand, no evidence.
 * Covers both automatically-resolved (the gap stopped recurring in a later
 * scan) and manually-dismissed (the user marked it done/not applicable)
 * items. The one action it DOES carry — "Deshacer" on a dismissed row — is
 * deliberately here and not on the active card: it's the durable landing
 * spot for the action that just moved this row here, not an ephemeral flash
 * that vanishes the moment the user does anything else (ACTIONS-OBSERVABLE-1
 * slice 4a, founder feedback 2026-09-07).
 */
export function ResolvedHistoryCard({
  item,
  projectId,
  latestCompletedRunId
}: {
  item: ResolvedHistoryItem;
  projectId: string;
  /** See ResolvedHistoryItem.run_id's own doc comment for why this gates it. */
  latestCompletedRunId: string | null;
}) {
  const dateLabel = formatHistoryDate(item.updated_at);
  const verdictLine = predictionVerdictLine(item);
  const router = useRouter();
  const restoreFeedback = useActionFeedback();
  const canUndo = item.status === "dismissed" && item.run_id === latestCompletedRunId;

  function handleRestore() {
    restoreFeedback.run(() => restoreRecommendationAction({ projectId, recommendationId: item.id }), {
      successMessage: "Restaurada.",
      onSuccess: () => router.refresh()
    });
  }

  return (
    <div className="rec-card">
      {/* Single `.rec-main` child, matching RecCard's contract since
          RECS-REDESIGN-1 dropped the rank chip: `.rec2-scope .rec-main` is a
          one-column grid now, sized for exactly one grid item. This card was
          the one place still passing the check icon as a SECOND child —
          landing it in its own implicit row/column instead of beside the
          text, which is what threw the badges/title/date far to the right
          with a dead gap where the icon used to sit (founder screenshot,
          2026-08-29). The icon moves inside the single child, inline with
          the badges, instead of being its own grid item. */}
      <div className="rec-main" style={{ cursor: "default" }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 7, flexWrap: "wrap" }}>
            <span
              className="rec-rank low"
              style={{
                width: 20,
                height: 20,
                background: "var(--pos-soft, #f0faf3)",
                color: "var(--pos-ink, #1a7a49)",
                flexShrink: 0
              }}
            >
              <Icon name="check" size={12} />
            </span>
            <span className="badge badge-pos">
              {item.status === "covered"
                ? "Ya lo tienes"
                : item.status === "resolved"
                  ? "Resuelta automáticamente"
                  : "Marcada como hecha"}
            </span>
            <span className="badge badge-outline">{labelForType(item.recommendation_type)}</span>
          </div>
          <div className="rec-title" style={{ textDecoration: "line-through", color: "var(--ink-3)" }}>
            {item.title}
          </div>
          <div className="rec-problem">{dateLabel}</div>
          {item.status === "covered" && item.coveredPageUrl && /^https?:\/\//i.test(item.coveredPageUrl) && (
            <div className="rec-problem" style={{ marginTop: 4, color: "var(--ink-3)" }}>
              {coveredPageLead(item.recommendation_type)}{" "}
              <a href={item.coveredPageUrl} target="_blank" rel="noopener noreferrer">
                {displayPageUrl(item.coveredPageUrl)}
              </a>
            </div>
          )}
          {verdictLine && (
            <div className="rec-problem" style={{ marginTop: 4, color: "var(--ink-3)" }}>
              {verdictLine}
            </div>
          )}
        </div>
      </div>
      {/* Sibling of `.rec-main`, never a second child inside it — that grid
          expects exactly one (see the comment above). Only rendered for a
          dismissed row from the CURRENT run; see canUndo's own doc comment
          on ResolvedHistoryItem.run_id for why an older run can't offer this
          safely. */}
      {canUndo && (
        <div style={{ padding: "0 16px 14px", display: "flex", alignItems: "center", gap: 10 }}>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={handleRestore}
            disabled={restoreFeedback.isPending}
          >
            {restoreFeedback.isPending ? (
              <>
                <span className="btn-spinner" /> Deshaciendo…
              </>
            ) : (
              "Deshacer"
            )}
          </button>
          <ActionAnnouncement state={restoreFeedback.state} />
        </div>
      )}
    </div>
  );
}

/**
 * RECS-ADD-COMPETITOR-1 — a `track_emerging_competitor` card is one action, so
 * it renders as one button: no "Ver cómo", no generated plan, no points
 * (founder, 2026-10-18; mockup approved the same day). The website comes from
 * the cited sources when one matches the brand exactly; otherwise the card
 * asks for it rather than guessing. After a success the card stays green for
 * a moment, then the refresh moves it to "Resueltas".
 */
export const EMERGING_SUCCESS_HOLD_MS = 4000;

export function EmergingCompetitorCard({ rec, projectId }: { rec: Recommendation; projectId: string }) {
  const router = useRouter();
  const ev: EvidenceJson = rec.evidence_json ?? {};
  const name = (ev.emerging_competitor ?? "").trim();
  const knownDomain = ev.emerging_competitor_domain ?? (name ? domainForBrandName(name, ev.citation_domains ?? []) : null);
  const [editing, setEditing] = useState(!knownDomain);
  const [domainInput, setDomainInput] = useState(knownDomain ?? "");
  const [done, setDone] = useState<{ alreadyTracked: boolean } | null>(null);
  const feedback = useActionFeedback();

  useEffect(() => {
    if (!done) return;
    const timer = window.setTimeout(() => router.refresh(), EMERGING_SUCCESS_HOLD_MS);
    return () => window.clearTimeout(timer);
  }, [done, router]);

  const domain = parseCompetitorDomain(domainInput);
  const pending = feedback.state.status === "pending";
  const providers = Array.from(new Set(groupPromptDetails(ev.affected_prompt_details ?? []).flatMap((p) => p.providers)));
  const questionCount = groupPromptDetails(ev.affected_prompt_details ?? []).length;
  const reach = emergingCompetitorReach(questionCount);
  const inputId = `rec-web-${rec.id}`;
  const competitorsHref = `/dashboard/projects/${projectId}/competitors`;

  function handleAdd() {
    if (!domain || !name) return;
    feedback.run(
      async () => {
        const result = await addEmergingCompetitorAction({ projectId, recommendationId: rec.id, domain });
        if (result.success) setDone({ alreadyTracked: result.alreadyTracked });
        return result;
      },
      { successMessage: `${name} añadida a tus competidores.` }
    );
  }

  if (done) {
    return (
      <div className="rec-card rec2-addcomp rec2-addcomp-ok" role="status" aria-live="polite">
        <div className="rec2-addcomp-okh">
          <Icon name="check" size={15} />
          {done.alreadyTracked ? `Ya seguías a ${name}` : `${name} ya está en tus competidores`}
        </div>
        <div className="rec2-addcomp-meta">
          {done.alreadyTracked ? "Damos esta tarjeta por hecha." : "El próximo escaneo medirá cuánto aparece frente a ti."}
        </div>
        <a className="rec2-addcomp-link" href={competitorsHref}>
          Ver competidores
        </a>
      </div>
    );
  }

  return (
    <div id={`rec-${rec.id}`} className="rec-card rec2-addcomp">
      <div className="rec2-addcomp-main">
        <div className="rec2-addcomp-info">
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <span className="rec2-kind">{labelForType(rec.recommendation_type)}</span>
            <span className="badge badge-outline">
              <Icon name="robot" size={11} />
              {CONTROL_LABEL.in_app}
            </span>
          </div>
          <div className="rec-title">{rec.title}</div>
          {reach && (
            <div className="rec2-reach" style={{ marginTop: 0 }}>
              {providers.length > 0 && (
                <span className="rec2-reach-g" aria-hidden="true">
                  {providers.map((provider) => (
                    <span key={provider} style={{ color: getEngineMeta(provider).color }} title={getEngineMeta(provider).label}>
                      <EngineGlyph provider={provider} />
                    </span>
                  ))}
                </span>
              )}
              <span>{reach}</span>
            </div>
          )}
        </div>
        <div className="rec2-addcomp-act">
          {editing && (
            <div className="rec2-addcomp-field">
              <label htmlFor={inputId}>Web de {name}</label>
              <input
                id={inputId}
                type="text"
                inputMode="url"
                autoComplete="off"
                placeholder="ejemplo.com"
                value={domainInput}
                disabled={pending}
                onChange={(e) => {
                  setDomainInput(e.target.value);
                  if (feedback.state.status === "error") feedback.reset();
                }}
              />
            </div>
          )}
          {editing && domainInput.trim() !== "" && !domain && (
            <div className="rec2-addcomp-err" role="alert">
              El dominio no es válido.
            </div>
          )}
          <button type="button" className="btn btn-primary rec2-addcomp-btn" disabled={!domain || !name || pending} onClick={handleAdd}>
            {pending ? (
              <>
                <span className="btn-spinner" aria-hidden="true" />
                Añadiendo {name}…
              </>
            ) : (
              `Añadir ${name} a competidores`
            )}
          </button>
          {!editing && domain && !pending && (
            <div className="rec2-addcomp-meta">
              Con su web {domain} ·{" "}
              <button type="button" className="rec2-addcomp-link" onClick={() => setEditing(true)}>
                Cambiar
              </button>
            </div>
          )}
          {feedback.state.status === "error" && (
            <div className="rec2-addcomp-err" role="alert">
              {feedback.state.message}
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
export function RecCard(props: RecCardProps) {
  // RECS-ADD-COMPETITOR-1: this type is a button, not a plan.
  if (props.rec.recommendation_type === "track_emerging_competitor") {
    return <EmergingCompetitorCard rec={props.rec} projectId={props.projectId} />;
  }
  return <StandardRecCard {...props} />;
}

type RecCardProps = {
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
  /** Inside a group whose members do NOT share a step (GS-03): show this card's own. */
  showOwnStep?: boolean;
};

function StandardRecCard({ rec, projectId, compact = false, showOwnStep = false, priorityRank }: RecCardProps) {
  const [open, setOpen] = useState(false);
  const router = useRouter();

  // ACTIONS-OBSERVABLE-1 slice 4a (docs/external-audit-2026-08.md, Fase 4,
  // P0-04) — both actions on this card now go through the shared contract
  // (pending / success with acknowledgement / categorized error, never
  // nothing) instead of a hand-rolled useState+useTransition pair each.
  const rewriteFeedback = useActionFeedback();
  const dismissFeedback = useActionFeedback();

  function handleRewrite(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    rewriteFeedback.run(() => rewriteRecommendationAction({ projectId, recommendationId: rec.id }), {
      successMessage: "Propuesta generada.",
      onSuccess: () => router.refresh()
    });
  }

  function handleDismiss(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    // Same pattern as handleRewrite: an ephemeral "Deshacer" that lived only
    // on THIS card (no refresh, until navigation) tested confusing — it read
    // as "gone after a second" the moment the user did anything else, and a
    // deshacer that doesn't survive leaving the screen isn't one (founder,
    // 2026-09-07). The durable "Deshacer" now lives on the tarjeta's landing
    // spot instead — ResolvedHistoryCard, under "Resueltas" — gated to the
    // current run so it can't restore a row the active list can no longer
    // show (see that component's own comment for the exact condition).
    dismissFeedback.run(() => dismissRecommendationAction({ projectId, recommendationId: rec.id }), {
      successMessage: "Marcada como hecha.",
      onSuccess: () => router.refresh()
    });
  }

  const ev: EvidenceJson = rec.evidence_json ?? {};
  const promptDetails = groupPromptDetails(ev.affected_prompt_details ?? []);
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
  const firstStep = effectiveFirstStep(rec);

  const priorityBadgeCls =
    rankCls === "high"
      ? "badge badge-neg"
      : rankCls === "med"
        ? "badge badge-warn"
        : "badge badge-neutral";

  // RECS-SHORT-CARD-1 (log §303) — the two confidences, kept apart. "Lo que
  // vimos" reads the data (run confidence + what the evidence observed);
  // "Por qué funciona" reads who controls the move. One "Confianza" label
  // used to mix both.
  const providers = Array.from(new Set(promptDetails.flatMap((p) => p.providers)));
  const questionCount =
    promptDetails.length > 0
      ? promptDetails.length
      : new Set(affectedPrompts.map((p) => p.trim().toLowerCase())).size;
  const reach = scopeLine(questionCount, providers);
  const data = dataSignal({
    confidence: effectiveConfidence,
    questionCount,
    providers,
    runsOpen: rec.consecutive_runs_open ?? 1
  });
  const advice = adviceSignal(control, ev.query_shape);
  const showKind = !compact;
  const hasBadges =
    Boolean(priorityRank) ||
    priorityLevel(rec) === "high" ||
    quickWin ||
    (rec.consecutive_runs_open ?? 1) > 1 ||
    Boolean(rec.previouslyMarkedDoneAt) ||
    control === "third_party" ||
    control === "in_app";
  const hasEvidence =
    displaySnippets.length > 0 ||
    sentimentDrivers.length > 0 ||
    competitors.length > 0 ||
    domains.length > 0 ||
    citationPages.length > 0 ||
    assumptions.length > 0;

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
        {/* Center column. RECS-SHORT-CARD-1 (log §303): the collapsed card
            says what kind of move this is, what to do (title), the one
            instruction to start with, and where it was seen. The description
            moved into "Lo que vimos": it is the finding, read once the card
            is open. */}
        <div style={{ minWidth: 0, flex: 1 }}>
          {(showKind || hasBadges) && (
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
              {/* RECS-ONE-QUEUE-1 (log §307): one queue for AI and Google, so a
                  plan card says where it comes from. */}
              {priorityRank && <span className="rec2-src rec2-src-ia"><Icon name="sparkles" size={11} />IA</span>}
              {showKind && <span className="rec2-kind">{labelForType(rec.recommendation_type)}</span>}
              {priorityLevel(rec) === "high" && <span className={priorityBadgeCls}>Prioridad alta</span>}
              {quickWin && (
                <span className="badge badge-pos">
                  <Icon name="bolt" size={11} />
                  Victoria rápida
                </span>
              )}
              {/* RECS-OUTREACH-TARGETS-1 (log §335): on work that depends on a
                  third party the age only blames the user for what they cannot
                  close (P30). */}
              {(rec.consecutive_runs_open ?? 1) > 1 && control !== "third_party" && (
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
              {/* RECS-ACCION-1 — sólo se marca la EXCEPCIÓN. La ausencia de
                  chip significa "es tuyo" (log §127). */}
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
          {(!compact || showOwnStep) && firstStep && (
            <div className="rec2-step">
              <Icon name="arrRight" size={13} />
              <span>
                <b>Haz esto.</b> {firstStep}
              </span>
            </div>
          )}
          {reach && (
            <div className="rec2-reach">
              {providers.length > 0 && (
                <span className="rec2-reach-g" aria-hidden="true">
                  {providers.map((provider) => (
                    <span key={provider} style={{ color: getEngineMeta(provider).color }} title={getEngineMeta(provider).label}>
                      <EngineGlyph provider={provider} />
                    </span>
                  ))}
                </span>
              )}
              <span>{reach}</span>
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
                <div className="rec2-pts-l">{pointsCaption(rec.recommendation_type, ev.query_shape)}</div>
              </>
            ) : (
              <>
                <div className="rec2-pts" style={{ color: "var(--ink-2)", fontSize: 13 }}>
                  {rec.impact === "high" ? "Impacto alto" : rec.impact === "medium" ? "Impacto medio" : "Impacto bajo"}
                </div>
                {/* RECS-LABELS-1 (log §336): next to cards with «+N pt» a bare
                    word read as the same scale (P13). It says why it has no
                    figure. */}
                <div className="rec2-pts-l">sin cifra calculable</div>
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
            {open ? "Ocultar" : "Ver cómo"}
            <Icon name={open ? "chevDown" : "chevRight"} size={14} />
          </button>
        </div>
      </div>

      {/* Expandable detail. RECS-SHORT-CARD-1 (log §303): no block renders
          empty — a block without data is left out, never filled with
          "Sin datos disponibles". */}
      <div className="rec-detail">
        <div className="rec-detail-inner">
          <div className="rec2-why">
            <div className="rec2-why-box">
              <div className="rec2-why-h">
                <span className="rec2-label">Lo que vimos</span>
                <span className={`rec2-chip rec2-chip-${data.tone}`}>{data.label}</span>
              </div>
              {!compact && rec.description && <p className="rec2-why-p">{rec.description}</p>}
              {data.note && <div className="rec2-why-note">{data.note}</div>}
            </div>
            {(ev.why_this_matters || advice) && (
              <div className="rec2-why-box">
                <div className="rec2-why-h">
                  <span className="rec2-label">Por qué funciona</span>
                  {advice && <span className="rec2-chip rec2-chip-advice">{advice.label}</span>}
                </div>
                {ev.why_this_matters && <p className="rec2-why-p">{ev.why_this_matters}</p>}
                {advice && <div className="rec2-why-note">{advice.note}</div>}
              </div>
            )}
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
          {(overlay?.state === "home_only" || overlay?.state === "no_editable_page" || overlay?.state === "listing_only") && (
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
                {overlay.state === "home_only"
                  ? "Sólo encontramos tu portada"
                  : overlay.state === "listing_only"
                    ? "Sólo encontramos una página índice"
                    : "Sólo encontramos foros o comunidad"}
              </div>
              <p style={{ fontSize: 13, color: "var(--ink-2)", lineHeight: 1.6, margin: 0 }}>
                {overlayCopyLocal(rec.recommendation_type, overlay.state)?.whatWeFound}
              </p>
              <p style={{ fontSize: 13, color: "var(--ink)", lineHeight: 1.6, margin: "8px 0 0" }}>
                <b>Qué hacer:</b> {overlayCopyLocal(rec.recommendation_type, overlay.state)?.whatToDo}
              </p>
            </div>
          )}

          {(promptDetails.length > 0 || affectedPrompts.length > 0) && (
            <div className="rec2-block">
              <div className="rec2-label">{questionCount === 1 ? "La pregunta" : "Las preguntas"}</div>
              {promptDetails.length > 0 ? (
                <ul className="rec2-qs">
                  {promptDetails.slice(0, 4).map((p) => (
                    <li key={p.id} className="rec2-q">
                      <div className="rec2-q-t">
                        {/* RECS-EVIDENCE-2 — de qué motor viene esta evidencia
                            concreta. Sin `provider` (filas antiguas) no se
                            pinta nada, nunca se asume Gemini. */}
                        {p.providers.map((provider) => (
                          <span
                            key={provider}
                            className="rec2-q-g"
                            style={{ color: getEngineMeta(provider).color }}
                            title={getEngineMeta(provider).label}
                          >
                            <EngineGlyph provider={provider} />
                          </span>
                        ))}
                        <span>{p.prompt}</span>
                      </div>
                      {(p.competitors.length > 0 || p.domains.length > 0) && (
                        <div className="rec2-q-m">
                          {p.competitors.length > 0 && <span>Gana: {p.competitors.join(", ")}</span>}
                          {p.competitors.length > 0 && p.domains.length > 0 && <span> · </span>}
                          {p.domains.length > 0 && <span>Cita: {p.domains.join(", ")}</span>}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <ul className="rec2-qs">
                  {affectedPrompts.slice(0, 4).map((p, i) => (
                    <li key={i} className="rec2-q">
                      <div className="rec2-q-t">
                        <span>{p}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              {questionCount > 4 && <div className="rec2-why-note">y {questionCount - 4} más</div>}
            </div>
          )}

          {hasEvidence && (
            <div className="rec2-block">
              <div className="rec2-label">Evidencia</div>
              {displaySnippets.slice(0, 3).map((snippet, i) => (
                <div key={i} className="rec-snippet">&ldquo;{plainSnippet(snippet)}&rdquo;</div>
              ))}
              {sentimentDrivers.length > 0 && (
                <p className="rec2-ev-p">
                  <span style={{ fontWeight: 600 }}>Temas recurrentes: </span>
                  {sentimentDrivers.join(", ")}
                </p>
              )}
              {competitors.length > 0 && (
                <p className="rec2-ev-p">
                  <span style={{ fontWeight: 600 }}>Competidores: </span>
                  {competitors.join(", ")}
                </p>
              )}
              {domains.length > 0 && (
                <p className="rec2-ev-p">
                  <span style={{ fontWeight: 600 }}>Dominios: </span>
                  {shortDomainList(domains).shown.join(", ")}
                  {shortDomainList(domains).hidden > 0 && ` y ${shortDomainList(domains).hidden} más`}
                </p>
              )}
              {citationPages.length > 0 && (
                <div className="rec2-ev-p">
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
              {assumptions.length > 0 && (
                <p className="rec2-ev-p" style={{ color: "var(--ink-4)" }}>
                  <span style={{ fontWeight: 600 }}>Supuestos: </span>
                  {assumptions.join(" ")}
                </p>
              )}
            </div>
          )}

          {/* Mejorar redacción con IA — el botón solo aparece mientras no haya
              una solución generada; una vez generada, se muestra la insignia.
              El acuse de éxito (ActionAnnouncement) se enseña en el mismo
              punto del clic, no sólo en el resultado que aparece más abajo
              (ACTIONS-OBSERVABLE-1 slice 4a — "generar" era invisible según
              la clasificación de la Fase 0, docs/external-audit-2026-08.md
              Fase 4, P0-04). */}
          <div style={{ marginTop: 4, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            {!rec.solution ? (
              <>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={handleRewrite}
                  disabled={rewriteFeedback.isPending}
                >
                  {rewriteFeedback.isPending ? (
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
                <ActionAnnouncement state={rewriteFeedback.state} />
              </>
            ) : (
              <span className="badge badge-outline">
                <Icon name="sparkles" size={11} />
                Propuesta generada
              </span>
            )}

            {/* Marcar como hecho (RECS-3). El acuse de éxito se ve en el
                punto del clic (ActionAnnouncement) antes de que
                router.refresh() la quite de la lista de activas — mismo
                patrón que "Generar". El deshacer NO vive aquí: una versión
                efímera que sólo sobrevivía mientras la tarjeta seguía
                montada resultó confusa ("aparece un segundo y ya está en
                Resueltas", founder 2026-09-07) — vive de forma durable en
                ResolvedHistoryCard, bajo la pestaña "Resueltas", donde de
                verdad sigue disponible después de refrescar. */}
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={handleDismiss}
              disabled={dismissFeedback.isPending}
            >
              {dismissFeedback.isPending ? (
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
            <ActionAnnouncement state={dismissFeedback.state} />
            {/* RECURRING-VALUE-1 (docs/external-audit-2026-08.md, Fase 3):
                closes the loop this button opens — RECS-LOOP-1 already
                verifies on the next comparable scan whether a dismissed
                gap actually closed (pestaña "Resueltas"), but nothing on
                the active card said that check was coming. No date: the
                exact schedule is a separate deliverable (calendario
                visible), this is just the promise that a scan will judge
                it. */}
            {dismissFeedback.state.status === "idle" && (
              <p style={{ margin: 0, fontSize: 11.5, color: "var(--ink-4)" }}>
                La verás reflejada en tu próximo escaneo.
              </p>
            )}
          </div>

          {/* Plan de acción — asset saneado generado por IA, aditivo: no
              sustituye el título/descripción de la regla, que sigue siendo el
              planteamiento del problema. */}
          {rec.solution && <SolutionPanel solution={rec.solution} recommendationType={rec.recommendation_type} />}

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
 * One question of a lever, as the lever card lists it: the prompt once, every
 * engine that left the brand out, and how long its card has been open.
 */
export type LeverQuestion = { key: string; prompt: string; providers: string[]; runsOpen: number };

export function leverQuestions(members: Recommendation[]): LeverQuestion[] {
  const byPrompt = new Map<string, LeverQuestion>();
  for (const rec of members) {
    const ev: EvidenceJson = rec.evidence_json ?? {};
    const details = groupPromptDetails(ev.affected_prompt_details ?? []);
    const entries =
      details.length > 0
        ? details.map((d) => ({ prompt: d.prompt, providers: d.providers }))
        : (ev.affected_prompts ?? []).map((prompt) => ({ prompt, providers: [] as string[] }));
    for (const entry of entries) {
      const key = entry.prompt.trim().toLowerCase();
      if (!key) continue;
      const runsOpen = rec.consecutive_runs_open ?? 1;
      const seen = byPrompt.get(key);
      if (seen) {
        seen.providers = Array.from(new Set([...seen.providers, ...entry.providers]));
        seen.runsOpen = Math.max(seen.runsOpen, runsOpen);
      } else {
        byPrompt.set(key, { key, prompt: entry.prompt, providers: entry.providers, runsOpen });
      }
    }
  }
  // Longest-open first: those are the questions the lever has failed longest.
  return [...byPrompt.values()].sort((a, b) => b.runsOpen - a.runsOpen);
}

/**
 * RECS-ONE-LEVER-1 — the card for a whole lever: every visibility card of one
 * topic, shown as one task with its questions inside, one plan and one joint
 * figure. «Marcar como hecho» closes every member; «Resueltas» still checks
 * them one by one.
 */
export function LeverCard({
  lever,
  members,
  projectId,
  priorityRank,
  solution,
}: {
  lever: LeverView;
  members: Recommendation[];
  projectId: string;
  priorityRank?: number;
  /** The plan for this lever: a lever plan with 2+ members, else the card's own. */
  solution: GeneratedSolution | null;
}) {
  const [open, setOpen] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const router = useRouter();
  const rewriteFeedback = useActionFeedback();
  const dismissFeedback = useActionFeedback();

  const others = lever.memberIds.filter((id) => id !== lever.representativeId);
  const questions = leverQuestions(members);
  const providers = Array.from(new Set(questions.flatMap((q) => q.providers)));
  const visible = showAll ? questions : questions.slice(0, GROUP_PREVIEW_SIZE);
  const hiddenCount = questions.length - visible.length;
  const isDefinition = lever.theme.kind === "definition";
  const { cta } = deliverableForType(LEVER_TYPE);
  const toggleLabel = questions.length === 1 ? "Ver la pregunta y el plan" : `Ver las ${questions.length} preguntas y el plan`;

  function handleRewrite(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    rewriteFeedback.run(
      () =>
        rewriteRecommendationAction({
          projectId,
          recommendationId: lever.representativeId,
          ...(others.length > 0 ? { leverMemberIds: others } : {}),
        }),
      { successMessage: "Propuesta generada.", onSuccess: () => router.refresh() },
    );
  }

  function handleDismiss(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    dismissFeedback.run(
      () =>
        dismissRecommendationAction({
          projectId,
          recommendationId: lever.representativeId,
          ...(others.length > 0 ? { leverMemberIds: others } : {}),
        }),
      { successMessage: "Marcada como hecha.", onSuccess: () => router.refresh() },
    );
  }

  const impact = members.some((m) => m.impact === "medium" || m.impact === "high") ? "Impacto medio" : "Impacto bajo";

  return (
    <div
      id={priorityRank ? undefined : `lever-${lever.key}`}
      className={`rec-card rec2-lever${open ? " open" : ""}${priorityRank ? " rec2-priority" : ""}`}
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
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6, flexWrap: "wrap" }}>
            {priorityRank && <span className="rec2-rank">{priorityRank}</span>}
            <span className="rec2-src rec2-src-ia">
              <Icon name="sparkles" size={11} />
              IA
            </span>
            <span className="rec2-kind">Contenido en tu web</span>
          </div>
          <div className="rec-title">{leverTitle(lever.theme)}</div>
          <div className="rec2-step">
            <Icon name="arrRight" size={13} />
            <span>
              <b>Haz esto.</b> {leverFirstStep(lever.theme)}
            </span>
          </div>
          <div className="rec2-reach">
            {providers.length > 0 && (
              <span className="rec2-reach-g" aria-hidden="true">
                {providers.map((provider) => (
                  <span key={provider} style={{ color: getEngineMeta(provider).color }} title={getEngineMeta(provider).label}>
                    <EngineGlyph provider={provider} />
                  </span>
                ))}
              </span>
            )}
            <span>{leverReach(lever.theme, questions.length)}</span>
          </div>
          {isDefinition && <div className="rec2-lever-note">{DEFINITION_LEVER_NOTE}</div>}
        </div>

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
            {lever.points !== null && lever.points >= MIN_VISIBLE_POINTS ? (
              <>
                <div className="rec2-pts">hasta +{formatPoints(lever.points)} pt</div>
                <div className="rec2-pts-l">{leverPointsCaption(lever.theme)}</div>
              </>
            ) : (
              <div className="rec2-pts" style={{ color: "var(--ink-2)", fontSize: 13 }}>
                {impact}
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
            {open ? "Ocultar" : toggleLabel}
            <Icon name={open ? "chevDown" : "chevRight"} size={14} />
          </button>
        </div>
      </div>

      <div className="rec-detail">
        <div className="rec-detail-inner">
          {questions.length > 0 && (
            <div className="rec2-block">
              <div className="rec2-label">{questions.length === 1 ? "La pregunta" : "Las preguntas"}</div>
              <ul className="rec2-qs">
                {visible.map((q) => (
                  <li key={q.key} className="rec2-q">
                    <div className="rec2-q-t">
                      {q.providers.map((provider) => (
                        <span
                          key={provider}
                          className="rec2-q-g"
                          style={{ color: getEngineMeta(provider).color }}
                          title={getEngineMeta(provider).label}
                        >
                          <EngineGlyph provider={provider} />
                        </span>
                      ))}
                      <span>{q.prompt}</span>
                    </div>
                    {q.runsOpen > 1 && <div className="rec2-q-m">Abierta {q.runsOpen} escaneos</div>}
                  </li>
                ))}
              </ul>
              {hiddenCount > 0 && (
                <button type="button" className="btn btn-ghost btn-sm" style={{ marginTop: 6 }} onClick={() => setShowAll(true)}>
                  <Icon name="chevDown" size={13} />
                  Ver las otras {hiddenCount}
                </button>
              )}
            </div>
          )}

          <div style={{ marginTop: 4, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            {!solution ? (
              <>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={handleRewrite}
                  disabled={rewriteFeedback.isPending}
                >
                  {rewriteFeedback.isPending ? (
                    <>
                      <span className="btn-spinner" /> Generando…
                    </>
                  ) : (
                    <>
                      <Icon name="sparkles" size={13} />
                      {cta}
                    </>
                  )}
                </button>
                <ActionAnnouncement state={rewriteFeedback.state} />
              </>
            ) : (
              <span className="badge badge-outline">
                <Icon name="sparkles" size={11} />
                Propuesta generada
              </span>
            )}
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={handleDismiss}
              disabled={dismissFeedback.isPending}
            >
              {dismissFeedback.isPending ? (
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
            <ActionAnnouncement state={dismissFeedback.state} />
            {dismissFeedback.state.status === "idle" && (
              <p style={{ margin: 0, fontSize: 11.5, color: "var(--ink-4)" }}>
                {questions.length > 1
                  ? "Cierra todas sus preguntas. Cada una se comprueba en tu próximo escaneo."
                  : "La verás reflejada en tu próximo escaneo."}
              </p>
            )}
          </div>

          {solution && <SolutionPanel solution={solution} />}
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
  // A coverage verdict can change one member's step (GS-03), so the step is
  // only hoisted when every member really shares it; otherwise each card
  // shows its own.
  const memberSteps = items.map((r) => effectiveFirstStep(r));
  const stepsAgree = memberSteps.every((s) => s === memberSteps[0]);
  const sharedStep = stepsAgree ? memberSteps[0] : null;
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
        <span className="rec2-src rec2-src-ia"><Icon name="sparkles" size={11} />IA</span>
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
          {!single && type !== "track_emerging_competitor" && (
            <div style={{ padding: "12px 4px 2px" }}>
              <div className="rec-problem" style={{ marginTop: 0 }}>
                {shared.description}
              </div>
              {sharedStep && (
                <div className="rec2-step">
                  <Icon name="arrRight" size={13} />
                  <span>
                    <b>Haz esto.</b> {sharedStep}
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
                Las preguntas
              </div>
            </div>
          )}
          {visible.map((rec) => (
            <RecCard key={rec.id} rec={rec} projectId={projectId} compact={!single} showOwnStep={!single && !stepsAgree} />
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
  levers = [],
  leverSolutions = {},
  planPoints = null,
  planPointsWithGoogle = null,
  jointPointsByTypeWithGoogle,
  latestCompletedRunId = null,
  googleConnected = false,
  googlePlanSlot = null,
  googleLaterSlot = null,
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
  /** RECS-ONE-LEVER-1: the visibility cards grouped by topic, server-side. */
  levers?: LeverView[];
  /** Lever plans keyed by representative id (only levers of 2+ cards). */
  leverSolutions?: Record<string, GeneratedSolution>;
  /** Techo CONJUNTO del plan (nunca la suma de sus tarjetas). */
  planPoints?: number | null;
  /** Gates "Deshacer" on a dismissed row in "Resueltas" — see
   * ResolvedHistoryItem.run_id's doc comment. Null on any host screen that
   * doesn't pass it (e.g. web-audit's embedded RecCard usage never renders
   * ResolvedHistoryCard, so it never needs this). */
  latestCompletedRunId?: string | null;
  /** Techo conjunto de las dos primeras, cuando Google ocupa el puesto 2. */
  planPointsWithGoogle?: number | null;
  /** Techo por grupo con la tercera del plan de vuelta en «Más adelante». */
  jointPointsByTypeWithGoogle?: Record<string, number | null>;
  /** Search Console conectado: el puesto 2 del plan espera a Google. */
  googleConnected?: boolean;
  /** Puesto 2 del plan (`GooglePlanSlot`), servido en su propio Suspense. */
  googlePlanSlot?: ReactNode;
  /** Fila «Con tus datos de Google» al principio de «Más adelante», o la
   * invitación a conectar Search Console si no está conectado (log §313). */
  googleLaterSlot?: ReactNode;
}) {
  const [filter, setFilter] = useState<FilterMode>("all");
  // RECS-ONE-QUEUE-1 (log §307): one queue for AI and Google. With Search
  // Console connected, slot 2 waits for Google ("pending") and is reported by
  // `GooglePlanMarker` once Google answers: a card kind, or null when there is
  // none and the third AI action takes the slot back.
  const [googlePlan, setGooglePlan] = useState<GooglePlanState>(googleConnected ? "pending" : null);
  const [reportGooglePlan] = useState(() => (kind: GooglePlanKind | null) => setGooglePlan(kind));

  const hasTechnical = recommendations.some((r) => categoryForType(r.recommendation_type) === "technical");

  // El plan y su techo de puntos se calculan en el servidor (selectPlan +
  // un contrafactual conjunto sobre esas mismas acciones). Sumar aqui los
  // deltas de cada tarjeta contaria dos veces los prompts que comparten
  // (ADR 0017 §3), que es justo el error que se corrigio en los grupos.
  const fullPlan = planIds.length > 0
    ? (planIds.map((id) => recommendations.find((r) => r.id === id)).filter(Boolean) as Recommendation[])
    : selectPlan(recommendations);
  const googleInPlan = googlePlan !== null;
  // Google takes slot 2 and the third AI action waits in «Más adelante».
  const plan = googleInPlan ? fullPlan.slice(0, 2) : fullPlan;
  const shownPlanPoints = googleInPlan ? planPointsWithGoogle : planPoints;
  const groupPoints = googleInPlan ? (jointPointsByTypeWithGoogle ?? jointPointsByType) : jointPointsByType;
  const summary = planSummary(shownPlanPoints, googlePlan, plan.length);

  // RECS-SHORT-CARD-1 (log §303): the list under the plan is «Más adelante»,
  // so it leaves out the plan's own cards. Showing them twice made sense when
  // the section was "Todas"; under "más adelante" it would say the plan's
  // actions can wait. Supersedes the "repetition is fine" rule of §115, and
  // with it the "Alta prioridad" filter, which only repeated the plan.
  const planIdSet = new Set(plan.map((r) => r.id));
  // RECS-ONE-LEVER-1: a lever's members live on its card, never as cards of
  // their own, in the plan or in «Más adelante».
  const leverByRep = new Map(levers.map((l) => [l.representativeId, l]));
  const leverMemberSet = new Set(levers.flatMap((l) => l.memberIds));
  const recById = new Map(recommendations.map((r) => [r.id, r]));
  const leverMembers = (lever: LeverView) =>
    lever.memberIds.map((id) => recById.get(id)).filter((r): r is Recommendation => Boolean(r));
  const leverSolution = (lever: LeverView) =>
    lever.memberIds.length > 1
      ? (leverSolutions[lever.representativeId] ?? null)
      : (recById.get(lever.representativeId)?.solution ?? null);
  const renderPlanCard = (rec: Recommendation, rank: number) => {
    const lever = leverByRep.get(rec.id);
    return lever ? (
      <LeverCard
        key={`plan-${rec.id}`}
        lever={lever}
        members={leverMembers(lever)}
        projectId={projectId}
        priorityRank={rank}
        solution={leverSolution(lever)}
      />
    ) : (
      <RecCard key={`plan-${rec.id}`} rec={rec} projectId={projectId} priorityRank={rank} />
    );
  };
  const laterLevers = filter === "all" ? levers.filter((l) => !planIdSet.has(l.representativeId)) : [];
  const filtered = recommendations.filter((r) =>
    filter === "technical"
      ? categoryForType(r.recommendation_type) === "technical"
      : !planIdSet.has(r.id) && !leverMemberSet.has(r.id),
  );

  const tabs: [FilterMode, string][] = [
    ["all", "Pendientes"],
    ...(hasTechnical ? [["technical", "Técnico"] as [FilterMode, string]] : []),
    ...(resolvedHistory.length > 0 ? [["resolved", "Resueltas"] as [FilterMode, string]] : []),
  ];

  return (
    <GooglePlanReport.Provider value={reportGooglePlan}>
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

      {/* 4 · The plan — always on top, whatever the filter, in the accent
          treatment so the three that matter carry visible weight. Since
          RECS-SHORT-CARD-1 (log §303) they are left out of «Más adelante»
          below instead of repeated there. Since RECS-ONE-QUEUE-1 (log §307)
          slot 2 can be Google's. */}
      {(plan.length > 0 || googleInPlan) && (
        <>
          <div className="rec2-plan">
            <div className="rec2-plan-t">Tu plan de esta semana</div>
            {summary && <div className="rec2-plan-s">{summary}</div>}
          </div>
          {plan[0] && renderPlanCard(plan[0], 1)}
          {googleConnected && googlePlanSlot}
          {plan.slice(1).map((rec, i) => renderPlanCard(rec, i + (googleInPlan ? 3 : 2)))}
        </>
      )}
      {/* Without a plan to sit in, the slot still mounts so Google can report. */}
      {!(plan.length > 0 || googleInPlan) && googleConnected && googlePlanSlot}

      {/* 5 · Filters, directly under the priority actions. */}
      <div className="rec2-sec">
        <span className="rec2-sec-t">Más adelante</span>
        {/* GEO-REPORT-1 Fase 2 (log §250): el informe de GenScore sustituye a
            "Exportar plan". Es navegación, no una acción: abre el informe en su
            propia página, legible en pantalla aunque el navegador no imprima. */}
        <a
          href={`/informe/${projectId}`}
          target="_blank"
          rel="noopener"
          className="btn btn-ghost btn-sm"
          style={{ padding: "5px 11px", fontSize: 12 }}
        >
          <Icon name="download" size={13} />
          Descargar informe
        </a>
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

      {/* RECS-ONE-QUEUE-1 (log §307): «Más adelante» opens with the rest of
          the Google cards, one row that scrolls sideways (founder, log §295).
          Hidden rather than unmounted under the other filters, so a card's
          «Deshacer» survives switching tabs. */}
      {/* GSC-CONNECT-CTA-1 (log §313): without Search Console the same slot
          carries the invitation to connect, so it no longer needs the flag. */}
      {googleLaterSlot && <div hidden={filter !== "all"}>{googleLaterSlot}</div>}

      {/* 6 · The list.
          Accordions ONLY under "Todas": grouping exists to tame 20+ mixed
          recommendations, and a filtered view is already narrow and already
          named. Filtering to "Técnico" and then having to open an accordion
          labelled by category to reach the actions is the same choice asked
          twice (founder review). Filtered views list their actions directly. */}
      {filter !== "resolved" &&
        (filtered.length === 0 && laterLevers.length === 0 ? (
          <div className="section-empty">
            {filter === "all" ? (
              <>
                {/* "Todas" is the superset — reaching zero here means zero
                    active recommendations, not "wrong filter" (that's the
                    branch below). ACTIONS-OBSERVABLE-1 slice 4a: this is
                    exactly the state a user lands in right after marking
                    their last active recommendation done, so it points at
                    where that action actually went instead of reading like
                    it vanished (founder feedback 2026-09-07). */}
                <div className="section-empty-title">
                  {plan.length > 0 ? "Nada más por ahora" : "Nada que corregir ahora mismo"}
                </div>
                <div className="section-empty-desc">
                  {plan.length > 0
                    ? "Empieza por tu plan de esta semana."
                    : resolvedHistory.length > 0
                    ? "Lo que ya has resuelto está en la pestaña “Resueltas”."
                    : "Vuelve tras tu próximo escaneo."}
                </div>
                {resolvedHistory.length > 0 && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    style={{ marginTop: 14 }}
                    onClick={() => setFilter("resolved")}
                  >
                    Ver Resueltas
                    <Icon name="arrRight" size={14} />
                  </button>
                )}
              </>
            ) : (
              <>
                <div className="section-empty-title">Nada con este filtro</div>
                <div className="section-empty-desc">Vuelve a &ldquo;Pendientes&rdquo; para verlo todo.</div>
              </>
            )}
          </div>
        ) : filter === "all" ? (
          <>
            {laterLevers.map((lever) => (
              <LeverCard
                key={`lever-${lever.key}`}
                lever={lever}
                members={leverMembers(lever)}
                projectId={projectId}
                solution={leverSolution(lever)}
              />
            ))}
            {groupByType(filtered).map(({ type, items }) => (
              <GroupedRecs
                key={type}
                type={type}
                items={items}
                projectId={projectId}
                jointPointsByType={groupPoints}
              />
            ))}
          </>
        ) : (
          filtered.map((rec) => <RecCard key={`f-${rec.id}`} rec={rec} projectId={projectId} />)
        ))}

      {filter === "resolved" &&
        (resolvedHistory.length > 0 ? (
          resolvedHistory.map((item) => (
            <ResolvedHistoryCard
              key={item.id}
              item={item}
              projectId={projectId}
              latestCompletedRunId={latestCompletedRunId}
            />
          ))
        ) : (
          <div className="section-empty">
            <div className="section-empty-title">Todavía no hay nada resuelto</div>
            <div className="section-empty-desc">
              Aquí aparecerá lo que un escaneo confirme como resuelto y lo que marques como hecho.
            </div>
          </div>
        ))}
    </GooglePlanReport.Provider>
  );
}

/**
 * The line next to «Tu plan de esta semana» (RECS-ONE-QUEUE-1, log §307). Each
 * source keeps its own scale: GEO points for the AI cards (a joint ceiling,
 * never a sum, ADR 0017 §3) and what the Google card moves in Google.
 */
export function planSummary(points: number | null, google: GooglePlanState, aiCount: number): string | null {
  const pts = points !== null && points >= MIN_VISIBLE_POINTS ? `Hasta +${formatPoints(points)} pt GEO` : null;
  if (google === "push_page_one" || google === "improve_snippet") {
    const goal = planGoal(google);
    return pts ? `${pts} y ${goal}` : goal.charAt(0).toUpperCase() + goal.slice(1);
  }
  if (!pts) return null;
  if (google === null && aiCount === 3) return `${pts} si haces las tres`;
  if (google === null && aiCount === 2) return `${pts} si haces las dos`;
  return pts;
}
