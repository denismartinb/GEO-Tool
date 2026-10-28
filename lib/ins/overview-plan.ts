/**
 * «Tu plan de esta semana» of Visión general (CONSOLE-INSTRUMENTO-1 F3, log
 * §352). Same owners as Recomendaciones and the bell: `selectPlan` over the
 * recommendations collapsed by lever (`collapseLeversForPlan`), potential
 * points from `computeRecommendationPotentialPoints`, and the ceiling as ONE
 * joint counterfactual over the plan's actions (`computeJointPotentialPoints`,
 * ADR 0017 §3), never a sum. Nothing is invented: a row without a figure says
 * its impact in words.
 */
import { collapseLeversForPlan, expandLeverIds, groupLevers, leverTitle, themeForRec, type LeverEvidence, type LeverView } from "@/lib/recommendations/levers";
import { MIN_VISIBLE_POINTS, selectPlan } from "@/lib/recommendations/plan";
import {
  computeJointPotentialPoints,
  computeRecommendationPotentialPoints,
  type ScoreInputRow
} from "@/lib/scoring/run-scoring";

export type PlanRecInput = {
  id: string;
  title: string;
  recommendation_type: string;
  impact: string;
  effort: string;
  priority_rank: number;
  evidence_json: unknown;
};

export type PlanRow = {
  id: string;
  text: string;
  source: "ia" | "google";
  /** Rounded GEO points this action is worth on its own, or null. */
  points: number | null;
  /** Words for the impact when there is no figure. */
  qualitative: string;
};

export type OverviewPlan = {
  /** The AI plan, up to three actions, best first. */
  rows: PlanRow[];
  /** Joint ceiling over those actions, or null when it rounds to nothing. */
  points: number | null;
  /** Joint ceiling when a Google card takes the second slot (only the first two AI actions count). */
  pointsWithGoogle: number | null;
};

function affectedPromptIds(evidence: unknown): string[] {
  if (!evidence || typeof evidence !== "object") return [];
  const ids = (evidence as Record<string, unknown>).affected_prompt_ids;
  return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === "string") : [];
}

function impactWords(impact: string): string {
  const v = impact.toLowerCase();
  return v === "high" ? "Impacto alto" : v === "medium" || v === "med" ? "Impacto medio" : "Impacto bajo";
}

export function buildOverviewPlan(input: {
  recs: readonly PlanRecInput[];
  categoryByResultId: ReadonlyMap<string, string | null>;
  scoreRows: ScoreInputRow[];
  domain: string;
}): OverviewPlan {
  const { recs, categoryByResultId, scoreRows, domain } = input;
  const withPoints = recs.map((r) => ({
    ...r,
    potentialPoints:
      scoreRows.length > 0
        ? (computeRecommendationPotentialPoints(scoreRows, domain, r.recommendation_type, affectedPromptIds(r.evidence_json))
            ?.deltaPoints ?? null)
        : null
  }));

  const themeOf = (r: (typeof withPoints)[number]) => themeForRec(r.evidence_json as LeverEvidence, categoryByResultId);
  const levers: LeverView[] = groupLevers(withPoints, themeOf)
    .map((group) => {
      const joint =
        scoreRows.length > 0
          ? computeJointPotentialPoints(
              scoreRows,
              domain,
              group.members.map((r) => ({
                recommendationType: r.recommendation_type,
                affectedPromptIds: affectedPromptIds(r.evidence_json)
              }))
            )
          : null;
      return {
        key: group.key,
        theme: group.theme,
        representativeId: group.representative.id,
        memberIds: group.members.map((r) => r.id),
        points: joint ? joint.deltaPoints : null
      };
    })
    .sort((a, b) => (b.points ?? -1) - (a.points ?? -1));

  const plan = selectPlan(collapseLeversForPlan(withPoints, levers));
  const leverByRep = new Map(levers.map((l) => [l.representativeId, l]));
  const byId = new Map(withPoints.map((r) => [r.id, r]));

  const ceiling = (planRecs: typeof plan): number | null => {
    if (scoreRows.length === 0 || planRecs.length === 0) return null;
    const ids = expandLeverIds(planRecs.map((r) => r.id), levers);
    const joint = computeJointPotentialPoints(
      scoreRows,
      domain,
      ids
        .map((id) => byId.get(id))
        .filter((r): r is NonNullable<typeof r> => Boolean(r))
        .map((r) => ({ recommendationType: r.recommendation_type, affectedPromptIds: affectedPromptIds(r.evidence_json) }))
    );
    return joint && Math.round(joint.deltaPoints) > 0 ? Math.round(joint.deltaPoints) : null;
  };

  const rows: PlanRow[] = plan.map((r) => {
    const lever = leverByRep.get(r.id);
    const raw = r.potentialPoints;
    return {
      id: r.id,
      text: lever ? leverTitle(lever.theme) : r.title,
      source: "ia",
      points: typeof raw === "number" && raw >= MIN_VISIBLE_POINTS && Math.round(raw) > 0 ? Math.round(raw) : null,
      qualitative: impactWords(r.impact)
    };
  });

  return { rows, points: ceiling(plan), pointsWithGoogle: ceiling(plan.slice(0, 2)) };
}
