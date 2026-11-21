import { describe, expect, it } from "vitest";
import {
  collapseLeversForPlan,
  expandLeverIds,
  groupLevers,
  leverReach,
  leverTitle,
  themeForRec,
  type LeverView
} from "./levers";
import { selectPlan } from "./plan";
import { buildRecommendationRewritePrompt } from "./recommendation-rewrite-llm";
import { domainsShownInPrompt } from "./anchored-domains";

// RECS-ONE-LEVER-1 — the founder's real test: 21 «Aparece en…» cards that all
// asked for the same move (P25/P40).

const rec = (id: string, opts: { type?: string; points?: number; ids?: string[]; shape?: string } = {}) => ({
  id,
  recommendation_type: opts.type ?? "increase_brand_visibility",
  impact: "medium",
  effort: "medium",
  priority_rank: 1,
  potentialPoints: opts.points ?? 2,
  evidence_json: { affected_prompt_ids: opts.ids ?? [], ...(opts.shape ? { query_shape: opts.shape } : {}) }
});

const categories = new Map<string, string | null>([
  ["r-how-1", "Cómo hacer / guía"],
  ["r-how-2", "Cómo hacer / guía"],
  ["r-alt", "Alternativas"],
  ["r-none", null]
]);

describe("themeForRec", () => {
  it("reads the prompt's topic through its scan row", () => {
    expect(themeForRec({ affected_prompt_ids: ["r-how-1"] }, categories)).toEqual({ kind: "category", category: "Cómo hacer / guía" });
  });
  it("keeps definitions apart whatever their topic", () => {
    expect(themeForRec({ affected_prompt_ids: ["r-how-1"], query_shape: "definition" }, categories)).toEqual({ kind: "definition" });
  });
  it("falls back to «other» without a topic", () => {
    expect(themeForRec({ affected_prompt_ids: ["r-none"] }, categories)).toEqual({ kind: "other" });
    expect(themeForRec(null, categories)).toEqual({ kind: "other" });
  });
});

describe("groupLevers", () => {
  const recs = [
    rec("a", { ids: ["r-how-1"], points: 3 }),
    rec("b", { ids: ["r-how-2"], points: 2 }),
    rec("c", { ids: ["r-alt"] }),
    rec("d", { ids: ["r-how-1"], shape: "definition" }),
    rec("gap", { type: "close_competitor_gap", points: 12 })
  ];
  const groups = groupLevers(recs, (r) => themeForRec(r.evidence_json, categories));

  it("makes one lever per topic, only for the visibility type", () => {
    expect(groups.map((g) => g.key).sort()).toEqual(["category:Alternativas", "category:Cómo hacer / guía", "definition"]);
    expect(groups.flatMap((g) => g.members.map((m) => m.id))).not.toContain("gap");
  });
  it("picks the strongest member as representative", () => {
    const how = groups.find((g) => g.key === "category:Cómo hacer / guía")!;
    expect(how.members.map((m) => m.id)).toEqual(["a", "b"]);
    expect(how.representative.id).toBe("a");
  });
});

describe("the plan sees a lever once", () => {
  const recs = [
    rec("gap", { type: "close_competitor_gap", points: 12 }),
    rec("a", { points: 3 }),
    rec("b", { points: 2 }),
    rec("c", { points: 2 }),
    rec("faq", { type: "create_faq_section", points: 1 })
  ];
  const lever: LeverView = {
    key: "category:x",
    theme: { kind: "category", category: "x" },
    representativeId: "a",
    memberIds: ["a", "b", "c"],
    points: 5
  };

  it("collapses members into the representative with the lever's joint points", () => {
    const collapsed = collapseLeversForPlan(recs, [lever]);
    expect(collapsed.map((r) => r.id)).toEqual(["gap", "a", "faq"]);
    expect(collapsed.find((r) => r.id === "a")!.potentialPoints).toBe(5);
  });

  it("leaves room in the plan for other moves instead of three questions of one lever", () => {
    const plan = selectPlan(collapseLeversForPlan(recs, [lever]));
    expect(plan.map((r) => r.id)).toEqual(["gap", "a", "faq"]);
  });

  it("expands the lever back to every member for the joint ceiling", () => {
    expect(expandLeverIds(["gap", "a"], [lever])).toEqual(["gap", "a", "b", "c"]);
  });
});

describe("copy", () => {
  it("names the topic, shortened where the stored label reads badly", () => {
    expect(leverTitle({ kind: "category", category: "Cómo hacer / guía" })).toBe("Publica una página sobre «Cómo hacer»");
    // RECS-HEADLINES-1 (log §354): a topic too long for two phone lines falls back.
    expect(leverTitle({ kind: "category", category: "Comparativas entre proveedores del sector" })).toBe(
      "Publica una página con estas preguntas"
    );
    expect(leverTitle({ kind: "category", category: "Alternativas" })).toContain("«Alternativas»");
  });
  it("says what was observed", () => {
    expect(leverReach({ kind: "category", category: "x" }, 6)).toBe("La IA no te nombra en 6 preguntas de este tema");
    expect(leverReach({ kind: "definition" }, 1)).toBe("1 pregunta de definición");
  });
  it("has no em dash", () => {
    const all = [
      leverTitle({ kind: "definition" }),
      leverTitle({ kind: "other" }),
      leverReach({ kind: "other" }, 2)
    ].join(" ");
    expect(all).not.toContain("—");
  });
});

describe("the lever plan prompt", () => {
  const input = {
    brand: "GenScore",
    domain: "genscore.es",
    language: "es",
    recommendationType: "increase_brand_visibility",
    ruleTitle: "Una sola página que responda a estas preguntas",
    ruleDescription: "",
    whyThisMatters: "",
    affectedPrompts: ["¿cómo optimizo mi geo?", "¿cómo salgo en chatgpt?"],
    mentionedCompetitors: [],
    citationDomains: ["peec.ai"],
    evidenceSnippets: []
  };
  it("asks for one page for all the questions", () => {
    expect(buildRecommendationRewritePrompt({ ...input, lever: true })).toMatch(/plan ONE page/);
    expect(buildRecommendationRewritePrompt(input)).not.toMatch(/plan ONE page/);
  });
  it("shows the guard no new domain", () => {
    const a = domainsShownInPrompt(buildRecommendationRewritePrompt({ ...input, lever: true }));
    const b = domainsShownInPrompt(buildRecommendationRewritePrompt(input));
    expect([...a].sort()).toEqual([...b].sort());
  });
});
