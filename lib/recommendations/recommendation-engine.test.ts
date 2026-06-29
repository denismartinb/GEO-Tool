import { describe, expect, it } from "vitest";
import { categoryForType, generateRecommendationsForRun } from "./recommendation-engine";

type PromptResultFixture = Parameters<typeof generateRecommendationsForRun>[0]["promptResults"][number];

function prompt(overrides: Partial<PromptResultFixture> & { id: string; prompt_text_snapshot: string }): PromptResultFixture {
  return {
    brand_mentioned: true,
    citation_found: true,
    mentioned_competitors_count: 0,
    citations_count: 0,
    sentiment: "neutral",
    extracted_json: null,
    ...overrides
  };
}

function extractedWith(opts: { brandEvidence?: string[]; competitors?: Array<{ name: string; mentioned: boolean; evidence?: string[] }>; citations?: Array<{ domain: string; source: "grounding" | "inline" }> }) {
  return {
    brand: { evidence: opts.brandEvidence ?? [] },
    competitors: opts.competitors ?? [],
    citations: opts.citations ?? []
  };
}

const baseRunScore = {
  visibility_score: 80,
  citation_score: 80,
  competitor_gap_score: 10,
  confidence: "high" as const,
  details_json: {}
};

function run(promptResults: PromptResultFixture[], overrides: Partial<typeof baseRunScore> = {}, competitors: string[] = []) {
  return generateRecommendationsForRun({
    project: { brand: "Acme", domain: "acme.com", country: "ES", language: "es" },
    competitors,
    runScore: { ...baseRunScore, ...overrides },
    promptResults
  });
}

describe("generateRecommendationsForRun", () => {
  it("returns no recommendations for an empty run", () => {
    expect(run([])).toEqual([]);
  });

  it("flags low visibility with evidence scoped to the missing prompts", () => {
    const recs = run(
      [
        prompt({ id: "p1", prompt_text_snapshot: "best running shoes", brand_mentioned: false }),
        prompt({ id: "p2", prompt_text_snapshot: "about acme", brand_mentioned: true })
      ],
      { visibility_score: 40 }
    );

    const visibilityRec = recs.find((r) => r.recommendation_type === "increase_brand_visibility");
    expect(visibilityRec).toBeDefined();
    expect(visibilityRec!.evidence_json.affected_prompt_ids).toEqual(["p1"]);
    expect(visibilityRec!.evidence_json.affected_prompts).toEqual(["best running shoes"]);
  });

  it("scopes citation domains to the prompt where they were actually cited (no cross-prompt leakage)", () => {
    const recs = run(
      [
        prompt({
          id: "p1",
          prompt_text_snapshot: "who makes the best running shoes",
          citation_found: false,
          extracted_json: extractedWith({ citations: [] })
        }),
        prompt({
          id: "p2",
          prompt_text_snapshot: "unrelated cited prompt",
          citation_found: true,
          extracted_json: extractedWith({ citations: [{ domain: "rival.com", source: "grounding" }] })
        })
      ],
      { citation_score: 20 }
    );

    const citationRec = recs.find((r) => r.recommendation_type === "add_citation_block");
    expect(citationRec).toBeDefined();
    // p2 is cited and not part of this rule's affected set, so its domain must not leak in.
    expect(citationRec!.evidence_json.citation_domains).toEqual([]);
    const details = citationRec!.evidence_json.affected_prompt_details as Array<{ id: string }>;
    expect(details.map((d) => d.id)).toEqual(["p1"]);
  });

  it("only counts grounded citations, never inline-only ones, in per-prompt evidence", () => {
    const recs = run(
      [
        prompt({
          id: "p1",
          prompt_text_snapshot: "best running shoes",
          brand_mentioned: false,
          extracted_json: extractedWith({
            citations: [
              { domain: "inline-only.com", source: "inline" },
              { domain: "grounded.com", source: "grounding" }
            ]
          })
        })
      ],
      { visibility_score: 40 }
    );

    const rec = recs.find((r) => r.recommendation_type === "increase_brand_visibility")!;
    const details = rec.evidence_json.affected_prompt_details as Array<{ domains: string[] }>;
    expect(details[0].domains).toEqual(["grounded.com"]);
  });

  it("never substitutes a competitor quote as evidence for a brand-gap rule (citation readiness)", () => {
    const recs = run(
      [
        prompt({
          id: "p1",
          prompt_text_snapshot: "best furniture brand",
          citation_found: false,
          extracted_json: extractedWith({
            competitors: [{ name: "Ikea", mentioned: true, evidence: ["IKEA es la más popular."] }]
          })
        })
      ],
      { citation_score: 20 }
    );

    const citationRec = recs.find((r) => r.recommendation_type === "add_citation_block");
    expect(citationRec).toBeDefined();
    // The brand has no evidence text in p1 — the rule must show no snippet
    // rather than silently quoting a competitor as if it supported the claim
    // that the brand itself is rarely cited.
    expect(citationRec!.evidence_json.evidence_snippets).toEqual([]);
  });

  it("never shows a brand-mention quote as evidence for citation readiness, even when the brand has evidence text", () => {
    // The brand itself (e.g. "Ikea" for an ikea.es project) can be mentioned
    // by name in an answer without its domain ever being cited as a grounded
    // source — brand-mention text proves mention, not citation, so it must
    // never back a claim that the brand is rarely cited.
    const recs = run(
      [
        prompt({
          id: "p1",
          prompt_text_snapshot: "best furniture brand",
          citation_found: false,
          extracted_json: extractedWith({ brandEvidence: ["Ikea es una marca conocida de muebles."] })
        })
      ],
      { citation_score: 20 }
    );

    const citationRec = recs.find((r) => r.recommendation_type === "add_citation_block");
    expect(citationRec).toBeDefined();
    expect(citationRec!.evidence_json.evidence_snippets).toEqual([]);
  });

  it("never shows a fabricated snippet for a per-prompt visibility gap (brand absent, no competitor)", () => {
    const recs = run(
      [
        prompt({
          id: "p1",
          prompt_text_snapshot: "best furniture brand",
          brand_mentioned: false
        })
      ],
      { visibility_score: 40 }
    );

    const visibilityRec = recs.find((r) => r.recommendation_type === "increase_brand_visibility");
    expect(visibilityRec).toBeDefined();
    expect(visibilityRec!.evidence_json.affected_prompt_ids).toEqual(["p1"]);
    // Brand has no evidence text and there is no competitor to borrow from.
    expect(visibilityRec!.evidence_json.evidence_snippets).toEqual([]);
  });

  it("leaves a brand-absent prompt that names a competitor to the competitor rules, not a standalone visibility card", () => {
    const recs = run(
      [
        prompt({
          id: "p1",
          prompt_text_snapshot: "best furniture brand",
          brand_mentioned: false,
          mentioned_competitors_count: 1,
          extracted_json: extractedWith({
            competitors: [{ name: "Ikea", mentioned: true, evidence: ["IKEA es la más popular."] }]
          })
        })
      ],
      { visibility_score: 40, competitor_gap_score: 60, details_json: { total_competitor_mentions: 2 } }
    );

    // No per-prompt visibility card for a prompt where a competitor is present
    // (avoids two cards for the same prompt); the competitor-gap rule owns it.
    expect(recs.some((r) => r.recommendation_type === "increase_brand_visibility")).toBe(false);
    expect(recs.some((r) => r.recommendation_type === "close_competitor_gap")).toBe(true);
  });

  it("does quote the dominant competitor as evidence for close_competitor_gap, where that quote IS the point", () => {
    const recs = run(
      [
        prompt({
          id: "p1",
          prompt_text_snapshot: "best running shoes",
          brand_mentioned: false,
          mentioned_competitors_count: 1,
          extracted_json: extractedWith({ competitors: [{ name: "Adidas", mentioned: true, evidence: ["Adidas es líder del mercado."] }] })
        }),
        prompt({
          id: "p2",
          prompt_text_snapshot: "top sportswear brands",
          brand_mentioned: false,
          mentioned_competitors_count: 1,
          extracted_json: extractedWith({ competitors: [{ name: "Adidas", mentioned: true, evidence: ["Adidas tiene la mejor reputación."] }] })
        })
      ],
      {},
      ["Adidas", "Puma"]
    );

    const rec = recs.find((r) => r.recommendation_type === "close_competitor_gap");
    expect(rec).toBeDefined();
    expect(rec!.evidence_json.evidence_snippets).toEqual(["Adidas es líder del mercado.", "Adidas tiene la mejor reputación."]);
  });

  it("names a specific dominant competitor when it wins 2+ prompts where the brand is absent", () => {
    const recs = run(
      [
        prompt({
          id: "p1",
          prompt_text_snapshot: "best running shoes",
          brand_mentioned: false,
          mentioned_competitors_count: 1,
          extracted_json: extractedWith({ competitors: [{ name: "Adidas", mentioned: true }] })
        }),
        prompt({
          id: "p2",
          prompt_text_snapshot: "top sportswear brands",
          brand_mentioned: false,
          mentioned_competitors_count: 1,
          extracted_json: extractedWith({ competitors: [{ name: "Adidas", mentioned: true }] })
        })
      ],
      {},
      ["Adidas", "Puma"]
    );

    const rec = recs.find((r) => r.recommendation_type === "close_competitor_gap");
    expect(rec).toBeDefined();
    expect(rec!.title).toContain("Adidas");
    expect(rec!.evidence_json.dominant_competitor).toBe("Adidas");
  });

  it("keeps separate recommendations for two distinct dominant competitors instead of collapsing them", () => {
    const recs = run(
      [
        prompt({ id: "p1", prompt_text_snapshot: "q1", brand_mentioned: false, mentioned_competitors_count: 1, extracted_json: extractedWith({ competitors: [{ name: "Adidas", mentioned: true }] }) }),
        prompt({ id: "p2", prompt_text_snapshot: "q2", brand_mentioned: false, mentioned_competitors_count: 1, extracted_json: extractedWith({ competitors: [{ name: "Adidas", mentioned: true }] }) }),
        prompt({ id: "p3", prompt_text_snapshot: "q3", brand_mentioned: false, mentioned_competitors_count: 1, extracted_json: extractedWith({ competitors: [{ name: "Puma", mentioned: true }] }) }),
        prompt({ id: "p4", prompt_text_snapshot: "q4", brand_mentioned: false, mentioned_competitors_count: 1, extracted_json: extractedWith({ competitors: [{ name: "Puma", mentioned: true }] }) })
      ],
      {},
      ["Adidas", "Puma"]
    );

    const gapRecs = recs.filter((r) => r.recommendation_type === "close_competitor_gap");
    expect(gapRecs).toHaveLength(2);
    expect(gapRecs.map((r) => r.evidence_json.dominant_competitor).sort()).toEqual(["Adidas", "Puma"]);
  });

  it("does not name a competitor that only wins a single prompt", () => {
    const recs = run(
      [
        prompt({ id: "p1", prompt_text_snapshot: "q1", brand_mentioned: false, mentioned_competitors_count: 1, extracted_json: extractedWith({ competitors: [{ name: "Adidas", mentioned: true }] }) })
      ],
      { competitor_gap_score: 60 },
      ["Adidas"]
    );

    const gapRecs = recs.filter((r) => r.recommendation_type === "close_competitor_gap");
    expect(gapRecs.every((r) => r.evidence_json.dominant_competitor === undefined)).toBe(true);
  });

  it("falls back to a generic competitor-gap recommendation when no named competitor dominance is detected", () => {
    const recs = run(
      [
        prompt({ id: "p1", prompt_text_snapshot: "q1", brand_mentioned: false, mentioned_competitors_count: 1 })
      ],
      { competitor_gap_score: 60, details_json: { total_competitor_mentions: 3 } }
    );

    const gapRec = recs.find((r) => r.recommendation_type === "close_competitor_gap");
    expect(gapRec).toBeDefined();
    expect(gapRec!.evidence_json.dominant_competitor).toBeUndefined();
  });

  it("splits the citation gap into one focused card per affected prompt (no bundling)", () => {
    const recs = run(
      [
        prompt({ id: "p1", prompt_text_snapshot: "precio de sofás cama", brand_mentioned: true, citation_found: false }),
        prompt({ id: "p2", prompt_text_snapshot: "muebles sostenibles", brand_mentioned: true, citation_found: false })
      ],
      { citation_score: 20 }
    );

    const citationRecs = recs.filter((r) => r.recommendation_type === "add_citation_block");
    expect(citationRecs).toHaveLength(2);
    // Each card is scoped to exactly one prompt and names it in the title.
    const affected = citationRecs.map((r) => (r.evidence_json.affected_prompt_ids as string[])[0]).sort();
    expect(affected).toEqual(["p1", "p2"]);
    expect(citationRecs.every((r) => (r.evidence_json.affected_prompt_ids as string[]).length === 1)).toBe(true);
    expect(citationRecs.some((r) => r.title.includes("sofás cama"))).toBe(true);
  });

  it("emits a per-prompt visibility card only for a brand-absent prompt with no competitor", () => {
    const recs = run(
      [
        prompt({ id: "p1", prompt_text_snapshot: "tiendas de muebles modernas", brand_mentioned: false })
      ],
      { visibility_score: 40 }
    );

    const visRecs = recs.filter((r) => r.recommendation_type === "increase_brand_visibility");
    expect(visRecs).toHaveLength(1);
    expect((visRecs[0].evidence_json.affected_prompt_ids as string[])).toEqual(["p1"]);
    expect(visRecs[0].title).toContain("tiendas de muebles modernas");
  });

  it("triggers comparison content rule once 2+ comparative prompts lack the brand", () => {
    const recs = run(
      [
        prompt({ id: "p1", prompt_text_snapshot: "best running shoes vs competitor", brand_mentioned: false, mentioned_competitors_count: 1 }),
        prompt({ id: "p2", prompt_text_snapshot: "top alternatives for running shoes", brand_mentioned: false, mentioned_competitors_count: 1 })
      ]
    );

    expect(recs.some((r) => r.recommendation_type === "add_comparison_content")).toBe(true);
  });

  it("surfaces a digital-PR source gap from third-party domains cited where the brand is absent (gap 8)", () => {
    const recs = run([
      prompt({
        id: "p1",
        prompt_text_snapshot: "q1",
        brand_mentioned: false,
        citation_found: true,
        extracted_json: extractedWith({ citations: [{ domain: "reddit.com", source: "grounding" }] })
      }),
      prompt({
        id: "p2",
        prompt_text_snapshot: "q2",
        brand_mentioned: false,
        citation_found: true,
        extracted_json: extractedWith({ citations: [{ domain: "reddit.com", source: "grounding" }] })
      })
    ]);

    const rec = recs.find((r) => r.recommendation_type === "pursue_citation_sources");
    expect(rec).toBeDefined();
    expect(rec!.evidence_json.source_domains as string[]).toContain("reddit.com");
    expect(rec!.evidence_json.citation_domains as string[]).toContain("reddit.com");
  });

  it("ignores the brand's own cited domain and one-off sources for the PR gap (gap 8)", () => {
    const recs = run([
      prompt({
        id: "p1",
        prompt_text_snapshot: "q1",
        brand_mentioned: false,
        citation_found: true,
        extracted_json: extractedWith({ citations: [{ domain: "acme.com", source: "grounding" }] })
      }),
      prompt({
        id: "p2",
        prompt_text_snapshot: "q2",
        brand_mentioned: false,
        citation_found: true,
        extracted_json: extractedWith({ citations: [{ domain: "reddit.com", source: "grounding" }] })
      })
    ]);

    expect(recs.some((r) => r.recommendation_type === "pursue_citation_sources")).toBe(false);
  });

  it("caps the backlog at 10 recommendations and assigns priority_rank within [1,10]", () => {
    const prompts: PromptResultFixture[] = [];
    const competitors = ["C1", "C2", "C3", "C4", "C5"];
    for (const name of competitors) {
      prompts.push(
        prompt({ id: `${name}-a`, prompt_text_snapshot: `${name} a`, brand_mentioned: false, mentioned_competitors_count: 1, extracted_json: extractedWith({ competitors: [{ name, mentioned: true }] }) }),
        prompt({ id: `${name}-b`, prompt_text_snapshot: `${name} b`, brand_mentioned: false, mentioned_competitors_count: 1, extracted_json: extractedWith({ competitors: [{ name, mentioned: true }] }) })
      );
    }

    const recs = run(prompts, { visibility_score: 10, citation_score: 5 }, competitors);
    expect(recs.length).toBeLessThanOrEqual(10);
    for (const rec of recs) {
      expect(rec.priority_rank).toBeGreaterThanOrEqual(1);
      expect(rec.priority_rank).toBeLessThanOrEqual(10);
    }
  });

  it("maps recommendation types to the right UI category", () => {
    expect(categoryForType("improve_citation_readiness")).toBe("authority");
    expect(categoryForType("add_citation_block")).toBe("authority");
    expect(categoryForType("pursue_citation_sources")).toBe("authority");
    expect(categoryForType("strengthen_brand_entity_clarity")).toBe("technical");
    expect(categoryForType("increase_brand_visibility")).toBe("content");
    expect(categoryForType("close_competitor_gap")).toBe("content");
    expect(categoryForType("unknown_future_type")).toBe("content");
  });
});
