import { describe, expect, it } from "vitest";
import { buildRecommendationRewritePrompt } from "./recommendation-rewrite-llm";
import { domainsShownInPrompt } from "./anchored-domains";
import { readinessLabel } from "./deliverable";

// RECS-MIXED-CHANNEL-1 (log §326): a plan about YouTube came back with
// "semantic HTML + FAQPage on genscore.es" steps (founder's card, 2026-10-18).

const input = (recommendationType: string) => ({
  brand: "GenScore",
  domain: "genscore.es",
  language: "es",
  recommendationType,
  ruleTitle: "Participar en youtube.com",
  ruleDescription: "La IA cita conversaciones de youtube.com.",
  whyThisMatters: "",
  affectedPrompts: ["¿Qué herramientas hay en España para GEO?"],
  mentionedCompetitors: [],
  citationDomains: ["youtube.com"],
  evidenceSnippets: []
});

const MACHINE_READABLE = /making it machine-readable/;
const OFF_SITE = /this action happens OUTSIDE the brand's website/;

describe("rewrite prompt by channel", () => {
  it.each(["pursue_community_sources", "pursue_comparator_sources", "pursue_media_sources", "pursue_citation_sources", "track_emerging_competitor"])(
    "%s never asks for the machine-readable website step",
    (type) => {
      const text = buildRecommendationRewritePrompt(input(type));
      expect(text).not.toMatch(MACHINE_READABLE);
      expect(text).toMatch(OFF_SITE);
    }
  );

  it.each(["create_faq_section", "increase_brand_visibility", "add_citation_block"])("%s keeps it", (type) => {
    const text = buildRecommendationRewritePrompt(input(type));
    expect(text).toMatch(MACHINE_READABLE);
    expect(text).not.toMatch(OFF_SITE);
  });

  it("an unclassified type keeps the old behaviour", () => {
    expect(buildRecommendationRewritePrompt(input("some_future_type"))).toMatch(MACHINE_READABLE);
  });

  it("each third-party family has its own play", () => {
    expect(buildRecommendationRewritePrompt(input("pursue_community_sources"))).toMatch(/community participation/);
    expect(buildRecommendationRewritePrompt(input("pursue_comparator_sources"))).toMatch(/comparators and directories/);
    expect(buildRecommendationRewritePrompt(input("pursue_media_sources"))).toMatch(/media pitch/);
  });

  it("adds no domain the guard would have to admit", () => {
    const shown = domainsShownInPrompt(buildRecommendationRewritePrompt(input("pursue_community_sources")));
    const baseline = domainsShownInPrompt(buildRecommendationRewritePrompt(input("some_future_type")));
    expect([...shown].sort()).toEqual([...baseline].sort());
  });
});

describe("readinessLabel by channel", () => {
  it("says «Plan listo» when there is nothing to paste on the brand's site", () => {
    expect(readinessLabel({ kind: "ready" }, "third_party")).toBe("Plan listo");
    expect(readinessLabel({ kind: "ready" }, "in_app")).toBe("Plan listo");
    expect(readinessLabel({ kind: "ready" }, "own_site")).toBe("Listo para copiar");
    expect(readinessLabel({ kind: "ready" }, null)).toBe("Listo para copiar");
    expect(readinessLabel({ kind: "needs_data", blanks: 2 }, "third_party")).toBe("2 huecos por rellenar");
  });
});
