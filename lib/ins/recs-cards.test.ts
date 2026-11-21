import { describe, expect, it } from "vitest";
import type { Recommendation } from "@/app/dashboard/projects/[projectId]/recommendations/recommendations-client";
import {
  cardFromRec,
  cardMatches,
  groupCards,
  importanceLabel,
  leverQuestionsOf
} from "./recs-cards";

const rec = (id: string, type: string, extra: Record<string, unknown> = {}) =>
  ({
    id,
    title: `Título ${id}`,
    recommendation_type: type,
    impact: "high",
    effort: "low",
    priority_rank: 1,
    consecutive_runs_open: 2,
    evidence_json: { affected_prompts: ["Mejor software de facturación", "mejor software de facturación "] },
    solution: null,
    ...extra
  }) as unknown as Recommendation;

describe("cardFromRec", () => {
  it("uses the action headline and counts distinct questions", () => {
    const card = cardFromRec(rec("a", "create_faq_section"));
    expect(card.title).toBe("Sube esta FAQ a tu web");
    expect(card.questions).toHaveLength(1);
    expect(card.form).toBe("rec");
  });

  it("never invents points: without a counterfactual it speaks in words", () => {
    const card = cardFromRec(rec("a", "create_faq_section"));
    expect(card.points).toBeNull();
    expect(importanceLabel(card)).toBe("Impacto alto");
  });

  it("shows real points when the row carries them", () => {
    const card = cardFromRec(rec("a", "create_faq_section", { potentialPoints: 4 }));
    expect(importanceLabel(card)).toMatch(/^\+4 pt$/);
  });

  it("marks emerging competitors with their own form", () => {
    expect(cardFromRec(rec("e", "track_emerging_competitor")).form).toBe("emerging");
  });
});

describe("leverQuestionsOf", () => {
  it("merges the same question across members, keeping the longest open streak", () => {
    const a = rec("a", "increase_brand_visibility", { consecutive_runs_open: 1 });
    const b = rec("b", "increase_brand_visibility", { consecutive_runs_open: 4 });
    const qs = leverQuestionsOf([a, b]);
    expect(qs).toHaveLength(1);
    expect(qs[0].runsOpen).toBe(4);
  });
});

describe("groupCards and cardMatches", () => {
  it("groups by type in first-seen order", () => {
    const cards = [
      cardFromRec(rec("a", "create_faq_section")),
      cardFromRec(rec("b", "add_citation_block")),
      cardFromRec(rec("c", "create_faq_section"))
    ];
    const groups = groupCards(cards);
    expect(groups.map((g) => g.items.length)).toEqual([2, 1]);
  });

  it("searches ignoring case and accents", () => {
    const card = cardFromRec(rec("a", "create_faq_section"));
    expect(cardMatches(card, "FACTURACION")).toBe(true);
    expect(cardMatches(card, "zzz")).toBe(false);
  });
});
