import { describe, expect, it } from "vitest";
import { recommendationHeadline } from "@/lib/recommendations/headline";
import { buildOverviewPlan, type PlanRecInput } from "./overview-plan";

const rec = (id: string, type: string, rank: number, extra: Partial<PlanRecInput> = {}): PlanRecInput => ({
  id,
  title: `Título ${id}`,
  recommendation_type: type,
  impact: "high",
  effort: "low",
  priority_rank: rank,
  evidence_json: {},
  ...extra
});

describe("buildOverviewPlan", () => {
  it("keeps at most three actions, one per type first, and states impact in words without figures", () => {
    const plan = buildOverviewPlan({
      recs: [rec("a", "t1", 1), rec("b", "t2", 2), rec("c", "t3", 3), rec("d", "t1", 4)],
      categoryByResultId: new Map(),
      scoreRows: [],
      domain: "ejemplo.es"
    });
    expect(plan.rows.map((r) => r.id)).toEqual(["a", "b", "c"]);
    expect(plan.points).toBeNull();
    expect(plan.rows.every((r) => r.points === null && r.qualitative === "Impacto alto")).toBe(true);
  });

  it("names a lever by its topic, never by one member's title", () => {
    const plan = buildOverviewPlan({
      recs: [rec("a", "increase_brand_visibility", 1, { title: "Aparece en «x»", evidence_json: { query_shape: "definition" } })],
      categoryByResultId: new Map(),
      scoreRows: [],
      domain: "ejemplo.es"
    });
    expect(plan.rows[0].text).toBe("Añade las definiciones al inicio de tu página");
  });

  it("names a single action by its headline, the task and not the stored title", () => {
    const r = rec("a", "add_citation_block", 1, { title: "Título largo guardado en la base de datos que no es la tarea" });
    const plan = buildOverviewPlan({ recs: [r], categoryByResultId: new Map(), scoreRows: [], domain: "ejemplo.es" });
    expect(plan.rows[0].text).toBe(recommendationHeadline(r).title);
  });

  it("returns an empty plan for no recommendations", () => {
    const plan = buildOverviewPlan({ recs: [], categoryByResultId: new Map(), scoreRows: [], domain: "ejemplo.es" });
    expect(plan.rows).toEqual([]);
    expect(plan.points).toBeNull();
    expect(plan.pointsWithGoogle).toBeNull();
  });
});
