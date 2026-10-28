/**
 * RECS-ONE-LEVER-1 — one card per lever.
 *
 * The engine emits one `increase_brand_visibility` card per prompt, and that
 * stays: per-prompt dedupe keys are what let a scan resolve gaps one at a time
 * (RECS-3, log §115 point 6). But every one of those cards asks for the same
 * move — answer the question on your site — so 21 of them read as 21 tasks and
 * their «+2 pt» each read as a sum (founder's real test, P25/P40). Here they
 * are grouped, in presentation only, by the topic the user already gave each
 * prompt (`project_prompts.category`): one card per topic, one plan, one joint
 * figure. Definition questions are always their own lever (log §292).
 *
 * Pure and client-safe: the page computes the levers and their joint points,
 * the client renders them, and both read the same titles from here.
 */

import { rankGroupMembers, type PlanCandidate } from "@/lib/recommendations/plan";

/** The only type grouped into levers. */
export const LEVER_TYPE = "increase_brand_visibility";

export type LeverTheme = { kind: "definition" } | { kind: "category"; category: string } | { kind: "other" };

/** What the client receives per lever. Member ids are real recommendation ids. */
export type LeverView = {
  key: string;
  theme: LeverTheme;
  /** The member that stands for the lever in the plan and holds its plan. */
  representativeId: string;
  memberIds: string[];
  /** Joint counterfactual over every member (ADR 0017 §3), never a sum. */
  points: number | null;
};

/** Shorter names for the topics whose stored label reads badly in a title. */
const CATEGORY_TITLE: Record<string, string> = {
  "Cómo hacer / guía": "Cómo hacer"
};

export function themeLabel(category: string): string {
  return CATEGORY_TITLE[category] ?? category;
}

export function leverKey(theme: LeverTheme): string {
  if (theme.kind === "category") return `category:${theme.category}`;
  return theme.kind;
}

/**
 * RECS-HEADLINES-1 (log §353): the deliverable, never the outcome. A topic
 * name too long for two phone lines falls back to the generic form; the
 * reach line under the title already names the topic's questions.
 */
export function leverTitle(theme: LeverTheme): string {
  if (theme.kind === "definition") return "Añade las definiciones al inicio de tu página";
  if (theme.kind === "category") {
    const title = `Publica una página sobre «${themeLabel(theme.category)}»`;
    return title.length <= 48 ? title : "Publica una página con estas preguntas";
  }
  return "Publica una página con tus otras preguntas";
}

export function leverFirstStep(theme: LeverTheme): string {
  if (theme.kind === "definition") {
    return "Responde cada definición en las dos primeras frases de tu página sobre el tema. Si un término tiene otros significados, acláralo en esa misma frase.";
  }
  return "Una sola página con cada pregunta como subtítulo y la respuesta en sus dos primeras frases. Si ya tienes una página sobre el tema, refuérzala en vez de crear otra.";
}

function questions(n: number): string {
  return n === 1 ? "1 pregunta" : `${n} preguntas`;
}

export function leverReach(theme: LeverTheme, questionCount: number): string {
  if (theme.kind === "definition") {
    return questionCount === 1 ? "1 pregunta de definición" : `${questionCount} preguntas de definición`;
  }
  if (theme.kind === "category") return `La IA no te nombra en ${questions(questionCount)} de este tema`;
  return `La IA no te nombra en ${questions(questionCount)} sin tema asignado`;
}

export function leverPointsCaption(theme: LeverTheme): string {
  return theme.kind === "definition" ? "si te nombran" : "si te nombran en estas preguntas";
}

/** The note a definition lever keeps from the single card (log §292). */
export const DEFINITION_LEVER_NOTE =
  "Son preguntas de definición: lo realista es que te citen, no que te nombren.";

type LeverEvidence = {
  query_shape?: unknown;
  affected_prompt_ids?: unknown;
} | null | undefined;

/**
 * The topic of one card. A definition wins over the topic; otherwise the first
 * affected scan row whose prompt has a topic decides. Rows of one card are the
 * same prompt asked to several engines, so they share it.
 */
export function themeForRec(evidence: LeverEvidence, categoryByResultId: ReadonlyMap<string, string | null>): LeverTheme {
  if (evidence?.query_shape === "definition") return { kind: "definition" };
  const ids = Array.isArray(evidence?.affected_prompt_ids) ? evidence.affected_prompt_ids : [];
  for (const id of ids) {
    if (typeof id !== "string") continue;
    const category = categoryByResultId.get(id);
    if (typeof category === "string" && category.trim()) return { kind: "category", category: category.trim() };
  }
  return { kind: "other" };
}

export type LeverGroup<T> = { key: string; theme: LeverTheme; members: T[]; representative: T };

/**
 * Groups the lever type's cards by theme. Members and levers are both ordered
 * with the plan's own score, so the screen keeps one criterion throughout.
 */
export function groupLevers<T extends PlanCandidate>(recs: readonly T[], themeOf: (rec: T) => LeverTheme): LeverGroup<T>[] {
  const byKey = new Map<string, { theme: LeverTheme; members: T[] }>();
  for (const rec of recs) {
    if (rec.recommendation_type !== LEVER_TYPE) continue;
    const theme = themeOf(rec);
    const key = leverKey(theme);
    const bucket = byKey.get(key) ?? { theme, members: [] };
    bucket.members.push(rec);
    byKey.set(key, bucket);
  }
  const groups = [...byKey.entries()].map(([key, { theme, members }]) => {
    const ranked = rankGroupMembers(members);
    return { key, theme, members: ranked, representative: ranked[0] };
  });
  // Strongest lever first, judged by its best member; the page re-sorts by
  // joint points once it has them.
  const order = rankGroupMembers(groups.map((g) => g.representative));
  return groups.sort((a, b) => order.indexOf(a.representative) - order.indexOf(b.representative));
}

/**
 * The plan's view of the recommendations: each lever counts once, through its
 * representative carrying the lever's joint points. Everything else passes
 * through untouched, in order.
 */
export function collapseLeversForPlan<T extends PlanCandidate>(recs: readonly T[], levers: readonly LeverView[]): T[] {
  const leverByMember = new Map<string, LeverView>();
  for (const lever of levers) for (const id of lever.memberIds) leverByMember.set(id, lever);
  const out: T[] = [];
  for (const rec of recs) {
    const lever = leverByMember.get(rec.id);
    if (!lever) {
      out.push(rec);
      continue;
    }
    if (lever.representativeId !== rec.id) continue;
    out.push(lever.points !== null ? { ...rec, potentialPoints: lever.points } : rec);
  }
  return out;
}

/** Plan ids with every lever expanded to all its members. */
export function expandLeverIds(ids: readonly string[], levers: readonly LeverView[]): string[] {
  const byRep = new Map(levers.map((l) => [l.representativeId, l]));
  return ids.flatMap((id) => byRep.get(id)?.memberIds ?? [id]);
}
