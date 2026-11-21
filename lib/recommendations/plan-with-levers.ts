import { collapseLeversForPlan, groupLevers, type LeverTheme, type LeverView } from "@/lib/recommendations/levers";
import { selectPlan, type PlanCandidate } from "@/lib/recommendations/plan";
import { computeJointPotentialPoints, type ScoreInputRow } from "@/lib/scoring/run-scoring";

function affectedPromptIds(evidence: unknown): string[] {
  if (!evidence || typeof evidence !== "object") return [];
  const ids = (evidence as Record<string, unknown>).affected_prompt_ids;
  return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === "string") : [];
}

/**
 * The plan as Recomendaciones and Visión general pick it: page levers collapsed
 * into one card (RECS-ONE-LEVER-1, log §328), each worth its joint ceiling, then
 * `selectPlan`. The report, the extension, the MCP and the WordPress plugin read
 * this same plan (WP-PLUGIN-2, log §432, adenda «mismo plan»), never their own.
 */
export function selectPlanWithLevers<T extends PlanCandidate & { evidence_json: unknown }>(input: {
  recs: readonly T[];
  themeOf: (rec: T) => LeverTheme;
  scoreRows: ScoreInputRow[];
  domain: string;
}): { plan: T[]; levers: LeverView[] } {
  const { recs, themeOf, scoreRows, domain } = input;
  const levers: LeverView[] = groupLevers(recs, themeOf)
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
  return { plan: selectPlan(collapseLeversForPlan(recs, levers)), levers };
}
