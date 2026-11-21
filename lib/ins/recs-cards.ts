/**
 * Recomendaciones in the «Instrumento» system (CONSOLE-INSTRUMENTO-1 F4, log
 * §357): one card model for the plan deck, the «Más adelante» rows and the
 * focus layer. Pure and client-safe. It only re-shapes what the screen already
 * decides (`selectPlan`, levers, headlines, coverage overlays, joint points);
 * no figure and no sentence is computed here that the old cards did not show.
 */

import {
  effectiveFirstStep,
  type Recommendation,
} from "@/app/dashboard/projects/[projectId]/recommendations/recommendations-client";
import type { GeneratedSolution } from "@/lib/recommendations/generated-solution";
import { groupPromptDetails } from "@/lib/recommendations/prompt-details";
import { labelForType } from "@/lib/recommendations/recommendation-engine";
import { MIN_VISIBLE_POINTS, formatPoints } from "@/lib/recommendations/plan";
import {
  deliverableForType,
  pointsCaption,
  type DeliverableControl,
} from "@/lib/recommendations/deliverable";
import {
  emergingCompetitorReach,
  scopeLine,
} from "@/lib/recommendations/card-signals";
import {
  overlayForHeadline,
  recommendationHeadline,
} from "@/lib/recommendations/headline";
import {
  LEVER_TYPE,
  leverFirstStep,
  leverPointsCaption,
  leverReach,
  leverTitle,
  type LeverView,
} from "@/lib/recommendations/levers";

export type CardQuestion = {
  key: string;
  prompt: string;
  providers: string[];
  runsOpen: number;
};

export type InsCard = {
  /** Plate id: the recommendation id, or the lever's representative id. */
  id: string;
  form: "rec" | "lever" | "emerging";
  /** `recommendation_type`, with `LEVER_TYPE` for a lever. */
  type: string;
  kindLabel: string;
  title: string;
  context: string | null;
  /** «Haz esto»: the first bounded move. */
  step: string | null;
  quick: boolean;
  control: DeliverableControl | null;
  runsOpen: number;
  previouslyDoneAt: string | null;
  /** Real counterfactual; null means a qualitative word instead, never a made-up figure. */
  points: number | null;
  pointsUpTo: boolean;
  pointsCaption: string | null;
  impactWord: string;
  providers: string[];
  reach: string | null;
  questions: CardQuestion[];
  definitionNote: boolean;
  rec: Recommendation;
  members: Recommendation[];
  lever: LeverView | null;
  solution: GeneratedSolution | null;
};

export function leverQuestionsOf(
  members: readonly Recommendation[],
): CardQuestion[] {
  const byPrompt = new Map<string, CardQuestion>();
  for (const rec of members) {
    const details = groupPromptDetails(
      rec.evidence_json?.affected_prompt_details ?? [],
    );
    const entries =
      details.length > 0
        ? details.map((d) => ({ prompt: d.prompt, providers: d.providers }))
        : (rec.evidence_json?.affected_prompts ?? []).map((prompt) => ({
            prompt,
            providers: [] as string[],
          }));
    for (const entry of entries) {
      const key = entry.prompt.trim().toLowerCase();
      if (!key) continue;
      const runsOpen = rec.consecutive_runs_open ?? 1;
      const seen = byPrompt.get(key);
      if (seen) {
        seen.providers = Array.from(
          new Set([...seen.providers, ...entry.providers]),
        );
        seen.runsOpen = Math.max(seen.runsOpen, runsOpen);
      } else {
        byPrompt.set(key, {
          key,
          prompt: entry.prompt,
          providers: entry.providers,
          runsOpen,
        });
      }
    }
  }
  return [...byPrompt.values()].sort((a, b) => b.runsOpen - a.runsOpen);
}

function impactWordOf(impact: string): string {
  return impact === "high"
    ? "Impacto alto"
    : impact === "medium"
      ? "Impacto medio"
      : "Impacto bajo";
}

export function cardFromRec(rec: Recommendation): InsCard {
  const ev = rec.evidence_json ?? {};
  const headline = recommendationHeadline(
    rec,
    overlayForHeadline(rec.coverageOverlay),
  );
  const { control } = deliverableForType(rec.recommendation_type);
  const details = groupPromptDetails(ev.affected_prompt_details ?? []);
  const questions: CardQuestion[] =
    details.length > 0
      ? details.map((d) => ({
          key: d.id,
          prompt: d.prompt,
          providers: d.providers,
          runsOpen: rec.consecutive_runs_open ?? 1,
        }))
      : Array.from(
          new Map(
            (ev.affected_prompts ?? [])
              .map((p) => p.trim())
              .filter(Boolean)
              .map((p) => [p.toLowerCase(), p] as const),
          ).values(),
        ).map((prompt) => ({
          key: prompt.toLowerCase(),
          prompt,
          providers: [],
          runsOpen: rec.consecutive_runs_open ?? 1,
        }));
  const providers = Array.from(new Set(details.flatMap((d) => d.providers)));
  const emerging = rec.recommendation_type === "track_emerging_competitor";
  const quantified =
    typeof rec.potentialPoints === "number" &&
    rec.potentialPoints >= MIN_VISIBLE_POINTS;
  return {
    id: rec.id,
    form: emerging ? "emerging" : "rec",
    type: rec.recommendation_type,
    kindLabel: labelForType(rec.recommendation_type),
    title: headline.title,
    context: headline.context,
    step: emerging ? null : effectiveFirstStep(rec),
    quick:
      rec.impact === "high" &&
      rec.effort === "low" &&
      control !== "third_party",
    control,
    runsOpen: rec.consecutive_runs_open ?? 1,
    previouslyDoneAt: rec.previouslyMarkedDoneAt ?? null,
    points: quantified ? (rec.potentialPoints as number) : null,
    pointsUpTo: false,
    pointsCaption: quantified
      ? pointsCaption(rec.recommendation_type, ev.query_shape)
      : null,
    impactWord: impactWordOf(rec.impact),
    providers,
    reach: emerging
      ? emergingCompetitorReach(details.length)
      : scopeLine(questions.length, providers),
    questions,
    definitionNote: false,
    rec,
    members: [rec],
    lever: null,
    solution: rec.solution,
  };
}

export function cardFromLever(
  lever: LeverView,
  members: Recommendation[],
  solution: GeneratedSolution | null,
): InsCard {
  const questions = leverQuestionsOf(members);
  const providers = Array.from(new Set(questions.flatMap((q) => q.providers)));
  const rep =
    members.find((m) => m.id === lever.representativeId) ?? members[0];
  const quantified =
    lever.points !== null && lever.points >= MIN_VISIBLE_POINTS;
  const impact = members.some(
    (m) => m.impact === "medium" || m.impact === "high",
  )
    ? "Impacto medio"
    : "Impacto bajo";
  return {
    id: lever.representativeId,
    form: "lever",
    type: LEVER_TYPE,
    kindLabel: "Contenido en tu web",
    title: leverTitle(lever.theme),
    context: null,
    step: leverFirstStep(lever.theme),
    quick: false,
    control: "own_site",
    runsOpen: Math.max(...members.map((m) => m.consecutive_runs_open ?? 1)),
    previouslyDoneAt: null,
    points: quantified ? (lever.points as number) : null,
    pointsUpTo: true,
    pointsCaption: quantified ? leverPointsCaption(lever.theme) : null,
    impactWord: impact,
    providers,
    reach: leverReach(lever.theme, questions.length),
    questions,
    definitionNote: lever.theme.kind === "definition",
    rec: rep,
    members,
    lever,
    solution,
  };
}

/** `+4 pt`, `hasta +4 pt`, or the qualitative word. */
export function importanceLabel(card: InsCard): string {
  if (card.points === null) return card.impactWord;
  return `${card.pointsUpTo ? "hasta " : ""}+${formatPoints(card.points)} pt`;
}

const fold = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
export { fold as foldText };

export function cardMatches(card: InsCard, q: string): boolean {
  if (!q.trim()) return true;
  const hay = [
    card.title,
    card.context ?? "",
    card.step ?? "",
    card.kindLabel,
    ...card.questions.map((x) => x.prompt),
  ].join(" ");
  return fold(hay).includes(fold(q.trim()));
}

/** What each group of «Más adelante» is about, in the words of what the card asks for. */
const GROUP_DESC: Record<string, string> = {
  increase_brand_visibility:
    "Una tarjeta por tema de tus preguntas, con un solo plan para todas.",
  add_comparison_content:
    "Páginas que comparan tu marca con las que ya salen en las respuestas.",
  close_competitor_gap:
    "Comparativas con los rivales que salen donde tú no sales.",
  create_faq_section: "Preguntas y respuestas cortas que se pueden citar.",
  add_citation_block: "Datos con fecha y fuente en tus páginas.",
  improve_citation_readiness: "Datos con fecha y fuente en tus páginas.",
  strengthen_brand_entity_clarity:
    "Que quede claro qué haces, para quién y dónde.",
  update_stale_content: "Datos viejos que la IA todavía repite.",
  address_negative_narrative: "Lo que la IA repite de ti y conviene responder.",
  pursue_comparator_sources: "Comparadores que la IA cita y donde no estás.",
  pursue_community_sources:
    "Hilos y vídeos que la IA cita y donde puedes aportar.",
  pursue_media_sources: "Medios que la IA cita y que podrían nombrarte.",
  pursue_citation_sources: "Webs que la IA cita y a las que puedes escribir.",
  track_emerging_competitor: "Marcas que la IA nombra y que no sigues todavía.",
};

export type CardGroup = {
  key: string;
  label: string;
  description: string | null;
  items: InsCard[];
};

export function groupCards(cards: readonly InsCard[]): CardGroup[] {
  const order: string[] = [];
  const byType = new Map<string, InsCard[]>();
  for (const card of cards) {
    if (!byType.has(card.type)) {
      byType.set(card.type, []);
      order.push(card.type);
    }
    byType.get(card.type)?.push(card);
  }
  return order.map((type) => ({
    key: type,
    label: type === LEVER_TYPE ? "Contenido en tu web" : labelForType(type),
    description: GROUP_DESC[type] ?? null,
    items: byType.get(type) ?? [],
  }));
}
