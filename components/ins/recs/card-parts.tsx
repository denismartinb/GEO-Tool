"use client";

import { useState, type ReactNode } from "react";
import { Ic } from "@/components/ins/ic";
import { EngineLogo, engineName } from "@/components/ins/kit/engine";
import { HiPath } from "@/components/ins/overview/blocks";
import { prefersReducedMotion } from "@/components/ins/kit/use-media";
import {
  overlayCopyLocal,
  type Recommendation,
} from "@/app/dashboard/projects/[projectId]/recommendations/recommendations-client";
import { adviceSignal, dataSignal } from "@/lib/recommendations/card-signals";
import {
  CONTROL_LABEL,
  classifySolutionReadiness,
  deliverableForType,
  readinessLabel,
} from "@/lib/recommendations/deliverable";
import type { GeneratedSolution } from "@/lib/recommendations/generated-solution";
import {
  plainSnippet,
  shortDomainList,
} from "@/lib/recommendations/plain-snippet";
import { DEFINITION_LEVER_NOTE } from "@/lib/recommendations/levers";
import type { InsCard } from "@/lib/ins/recs-cards";

/**
 * Pieces shared by the plan deck and the «Más adelante» rows (CONSOLE-
 * INSTRUMENTO-1 F4, log §357). Everything here lays out data the old cards
 * already showed; nothing is computed or phrased beyond what they said.
 */

export function SrcChip({ src }: { src: "ia" | "google" }) {
  if (src === "google") {
    return (
      <span className="src">
        <svg width="11" height="11" aria-hidden="true" focusable="false">
          <use href="#e-google" />
        </svg>
        Google
      </span>
    );
  }
  return (
    <span className="src ia">
      <Ic n="sparkles" />
      IA
    </span>
  );
}

export function EngineRow({
  providers,
  size = 14,
}: {
  providers: string[];
  size?: number;
}) {
  return (
    <>
      {providers.map((p) => (
        <EngineLogo key={p} provider={p} size={size} />
      ))}
    </>
  );
}

function enginesText(providers: string[]): string {
  const names = Array.from(new Set(providers.map(engineName)));
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} y ${names[names.length - 1]}`;
}

function dateLabel(iso: string): string {
  return new Date(iso).toLocaleDateString("es-ES", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "Europe/Madrid",
  });
}

/** Badges that qualify a card: only the exceptions, as the old card did. */
export function CardBadges({ card }: { card: InsCard }) {
  return (
    <>
      {card.quick ? (
        <span className="badge b-blue">Victoria rápida</span>
      ) : null}
      {card.control === "third_party" ? (
        <span className="badge b-line">{CONTROL_LABEL.third_party}</span>
      ) : null}
      {card.control === "in_app" ? (
        <span className="badge b-line">{CONTROL_LABEL.in_app}</span>
      ) : null}
      {card.runsOpen > 1 && card.control !== "third_party" ? (
        <span className="badge b-line">Abierta {card.runsOpen} escaneos</span>
      ) : null}
      {card.previouslyDoneAt ? (
        <span className="badge b-line">
          La marcaste como hecha el {dateLabel(card.previouslyDoneAt)}
        </span>
      ) : null}
    </>
  );
}

/** «Visto en N preguntas» accordion with the engines (deck cards). */
export function SeenAccordion({ card }: { card: InsCard }) {
  const [open, setOpen] = useState(false);
  if (card.questions.length === 0) return null;
  const n = card.questions.length;
  const names = enginesText(card.providers);
  return (
    <div className={`seen${open ? " open" : ""}`}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span>
          Visto en {n} {n === 1 ? "pregunta" : "preguntas"}
        </span>
        {card.providers.length > 0 ? (
          <span className="e" aria-label={`Motores: ${names}`}>
            <EngineRow providers={card.providers} />
          </span>
        ) : null}
        <Ic n="chevd" sm />
      </button>
      {open ? (
        <ul>
          {card.questions.map((q) => (
            <li key={q.key}>
              {q.prompt}
              {q.runsOpen > 1 && card.form === "lever" ? (
                <span className="rc-open">
                  {" "}
                  · Abierta {q.runsOpen} escaneos
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="btn sm line"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          window.setTimeout(
            () => setCopied(false),
            prefersReducedMotion() ? 900 : 1600,
          );
        } catch {
          /* Clipboard unavailable (insecure context): nothing to confirm. */
        }
      }}
    >
      <Ic n={copied ? "check" : "copy"} sm />
      {copied ? "Copiado" : "Copiar"}
    </button>
  );
}

/** The generated plan (`.gen` block): steps and ready-to-paste examples. */
export function SolutionBlock({
  solution,
  type,
}: {
  solution: GeneratedSolution;
  type: string;
}) {
  const readiness = classifySolutionReadiness(solution);
  const control = deliverableForType(type).control;
  return (
    <div className="gen">
      <div className="gh">
        <Ic n="sparkles" sm />
        {solution.title}
        <span className="rc-ready">
          {readinessLabel(readiness, control ?? "own_site")}
        </span>
      </div>
      <p className="rc-sum">{solution.summary}</p>
      {solution.steps.length > 0 ? (
        <ol>
          {solution.steps.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ol>
      ) : null}
      {solution.examples.map((ex, i) => (
        <div className="rc-ex" key={i}>
          <div className="rc-exh">
            <span>{ex.label}</span>
            <CopyButton text={ex.content} />
          </div>
          <pre>{ex.content}</pre>
        </div>
      ))}
      <p>
        Plantilla generada por IA: revísala y adáptala a tu web antes de
        publicarla.
      </p>
    </div>
  );
}

export function GeneratingBlock() {
  return (
    <div className="think" role="status">
      <span className="dots">
        <i />
        <i />
        <i />
      </span>
      <span className="shimmer">Generando…</span>
    </div>
  );
}

function OverlayNote({ rec }: { rec: Recommendation }) {
  const overlay = rec.coverageOverlay;
  if (!overlay || overlay.state === "none") return null;
  const copy = overlayCopyLocal(rec.recommendation_type, overlay.state);
  if (!copy) return null;
  const heading =
    overlay.state === "confirmed_surfacing_gap"
      ? "Sí tienes una página sobre este tema"
      : overlay.state === "possible_content_gap"
        ? "No encontramos contenido tuyo sobre este tema"
        : overlay.state === "home_only"
          ? "Sólo encontramos tu portada"
          : overlay.state === "listing_only"
            ? "Sólo encontramos una página índice"
            : "Sólo encontramos foros o comunidad";
  return (
    <div
      className={`rc-note${overlay.state === "confirmed_surfacing_gap" ? " pos" : ""}`}
    >
      <div className="rc-nk">
        <Ic
          n={overlay.state === "confirmed_surfacing_gap" ? "check" : "scan"}
          sm
        />
        Auditoría de tu web
      </div>
      <b>{heading}</b>
      <p>{copy.whatWeFound}</p>
      <p>
        <b>Qué hacer:</b> {copy.whatToDo}
      </p>
      {overlay.verifiedPage ? (
        <a
          href={overlay.verifiedPage.url}
          target="_blank"
          rel="noopener noreferrer"
        >
          Tu página: {overlay.verifiedPage.url}
        </a>
      ) : null}
    </div>
  );
}

/**
 * What the card rests on: «Lo que vimos» (the data), «Por qué funciona» (the
 * advice), the web audit verdict, the questions and the evidence. Blocks
 * without data are left out, never filled (RECS-SHORT-CARD-1, log §303).
 */
export function CardDetail({
  card,
  withQuestions = true,
}: {
  card: InsCard;
  withQuestions?: boolean;
}) {
  const rec = card.rec;
  const ev = rec.evidence_json ?? {};
  const isLever = card.form === "lever";
  const confidence = rec.coverageOverlay?.confidenceOverride ?? rec.confidence;
  const data = isLever
    ? null
    : dataSignal({
        confidence,
        questionCount: card.questions.length,
        providers: card.providers,
        runsOpen: card.runsOpen,
      });
  const advice = isLever ? null : adviceSignal(card.control, ev.query_shape);
  const stale = ev.stale_signals ?? [];
  const snippets =
    rec.recommendation_type === "update_stale_content" && stale.length > 0
      ? stale
      : (ev.evidence_snippets ?? []);
  const competitors = ev.mentioned_competitors ?? [];
  const domains = ev.citation_domains ?? [];
  const pages = ev.citation_pages ?? [];
  const drivers = ev.sentiment_drivers ?? [];
  const assumptions = ev.assumptions ?? [];
  const hasEvidence =
    snippets.length +
      drivers.length +
      competitors.length +
      domains.length +
      pages.length +
      assumptions.length >
    0;
  const shortDomains = shortDomainList(domains);
  const blocks: ReactNode[] = [];

  if (data && (rec.description || data.note)) {
    blocks.push(
      <div key="saw">
        <div className="lbl">
          Lo que vimos{" "}
          <span className={`rc-chip ${data.tone}`}>{data.label}</span>
        </div>
        {rec.description ? <p>{rec.description}</p> : null}
        {data.note ? <p className="rc-sub">{data.note}</p> : null}
      </div>,
    );
  }
  if (!isLever && (ev.why_this_matters || advice)) {
    blocks.push(
      <div key="why">
        <div className="lbl">
          Por qué funciona{" "}
          {advice ? (
            <span className="rc-chip advice">{advice.label}</span>
          ) : null}
        </div>
        {ev.why_this_matters ? <p>{ev.why_this_matters}</p> : null}
        {advice ? <p className="rc-sub">{advice.note}</p> : null}
      </div>,
    );
  }
  if (isLever && card.definitionNote) {
    blocks.push(
      <div key="def">
        <p className="rc-sub">{DEFINITION_LEVER_NOTE}</p>
      </div>,
    );
  }

  return (
    <div className="rc-detail">
      {blocks}
      {isLever ? null : <OverlayNote rec={rec} />}
      {withQuestions && card.questions.length > 0 ? (
        <div>
          <div className="lbl">
            {card.questions.length === 1 ? "La pregunta" : "Las preguntas"}
          </div>
          <ul className="rc-qs">
            {card.questions.slice(0, 5).map((q) => (
              <li key={q.key}>
                <span className="g">
                  <EngineRow providers={q.providers} size={13} />
                </span>
                <span>{q.prompt}</span>
              </li>
            ))}
          </ul>
          {card.questions.length > 5 ? (
            <p className="rc-sub">y {card.questions.length - 5} más</p>
          ) : null}
        </div>
      ) : null}
      {hasEvidence && !isLever ? (
        <div>
          <div className="lbl">Evidencia</div>
          {snippets.slice(0, 3).map((s, i) => (
            <blockquote className="rc-quote" key={i}>
              {plainSnippet(s)}
            </blockquote>
          ))}
          {drivers.length > 0 ? (
            <p>
              <b>Temas recurrentes:</b> {drivers.join(", ")}
            </p>
          ) : null}
          {competitors.length > 0 ? (
            <p>
              <b>Competidores:</b> {competitors.join(", ")}
            </p>
          ) : null}
          {domains.length > 0 ? (
            <p>
              <b>Dominios:</b> {shortDomains.shown.join(", ")}
              {shortDomains.hidden > 0 ? ` y ${shortDomains.hidden} más` : ""}
            </p>
          ) : null}
          {pages.length > 0 ? (
            <div>
              <b>Páginas citadas:</b>
              <ul className="rc-pages">
                {pages.slice(0, 4).map((p, i) => (
                  <li key={i}>
                    «{p.title}» <span>({p.domain})</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {assumptions.length > 0 ? (
            <p className="rc-sub">
              <b>Supuestos:</b> {assumptions.join(" ")}
            </p>
          ) : null}
        </div>
      ) : null}
      {!isLever && ev.action_suggested ? (
        <div>
          <div className="lbl">Acción sugerida</div>
          <p>{ev.action_suggested}</p>
        </div>
      ) : null}
    </div>
  );
}

export function TitleWithPath({ text }: { text: string }) {
  return <HiPath text={text} />;
}
