import { describe, expect, it } from "vitest";
import { generateRecommendationsForRun } from "./recommendation-engine";
import { PROFITABLE_PROMPT, genscoreInput } from "./fixtures/genscore-first-scan";

/**
 * Audit 2026-10-08 — "recomendaciones sin promesas no demostradas".
 *
 * Reproduces the first scan of genscore.es on a synthetic fixture (see the
 * fixture header) and pins what a recommendation is allowed to claim:
 *
 *  - "no tracked competitor appears" is a fact about the monitored list, not
 *    about the market, and says nothing about cost or first-mover advantage;
 *  - a card with no verifiable fragment is a content hypothesis and its
 *    confidence is derived from its evidence, never inherited from the run;
 *  - the sources and unmonitored brands the AI DID name are evidence and show.
 */

const PROMISES = /nadie ocupa|más barato|publique primero|se la lleva quien|ni tú ni ningún competidor/i;

function visibilityCard(input = genscoreInput()) {
  const recs = generateRecommendationsForRun(input);
  const card = recs.find(
    (r) => r.recommendation_type === "increase_brand_visibility" && r.title.includes("rentable")
  );
  if (!card) throw new Error("fixture must produce the visibility card for the 'rentable' prompt");
  return card;
}

describe("unproven claims — visibility card on a prompt with sources but no tracked brand", () => {
  it("does not conclude absence of competition, cheaper entry or first-mover advantage", () => {
    const card = visibilityCard();
    const why = String(card.evidence_json.why_this_matters);
    expect(card.description).not.toMatch(PROMISES);
    expect(why).not.toMatch(PROMISES);
  });

  it("states the fact that WAS observed: no monitored brand, N answers, and the brands/sources that did appear", () => {
    const card = visibilityCard();
    expect(card.description).toMatch(/monitoriz/i);
    expect(card.description).toContain("6 respuestas");
    expect(card.description).toContain("Ahrefs");
    expect(card.evidence_json.other_brands).toEqual(expect.arrayContaining(["Ahrefs", "Moz"]));
    // the list shown is capped, the real total is not hidden
    expect(Number(card.evidence_json.citation_domains_total)).toBeGreaterThan(
      (card.evidence_json.citation_domains as string[]).length
    );
  });

  it("is labelled a content hypothesis and does not inherit the run's high confidence", () => {
    const card = visibilityCard();
    expect(card.evidence_json.evidence_kind).toBe("content_hypothesis");
    expect(card.confidence).not.toBe("high");
    // the diagnosis certainty (is the gap real?) stays separate and high
    expect(card.evidence_json.run_confidence).toBe("high");
  });
});

describe("unproven claims — FAQ card with no fragment", () => {
  it("is a format hypothesis with low confidence, whatever the run confidence", () => {
    const faq = generateRecommendationsForRun(genscoreInput()).find(
      (r) => r.recommendation_type === "create_faq_section"
    );
    expect(faq).toBeDefined();
    expect((faq!.evidence_json.evidence_snippets as string[]).length).toBe(0);
    expect(faq!.evidence_json.evidence_kind).toBe("content_hypothesis");
    expect(faq!.confidence).toBe("low");
    expect(faq!.description).not.toMatch(/es lo que la ia extrae mejor/i);
  });
});

describe("unproven claims — the monitored set changes the claim", () => {
  it("names the monitored brands, and with none says it cannot tell who holds the query", () => {
    const withSet = visibilityCard(genscoreInput(["Profound", "Semrush"]));
    expect(withSet.description).toContain("Profound");
    expect(withSet.evidence_json.monitored_competitors).toEqual(["Profound", "Semrush"]);

    const noSet = visibilityCard(genscoreInput([]));
    expect(noSet.evidence_json.monitored_competitors).toEqual([]);
    expect(noSet.description).toMatch(/no monitorizas competidores/i);
    expect(noSet.description).not.toMatch(PROMISES);
  });

  it("keeps the same dedupe key when the set changes (history is not broken)", () => {
    expect(visibilityCard(genscoreInput(["Profound"])).dedupe_key).toBe(visibilityCard(genscoreInput([])).dedupe_key);
  });
});

describe("unproven claims — sources are not verified brand mentions", () => {
  it("never says the cited sources 'do not mention' the brand: only that its domain is not among them", () => {
    const recs = generateRecommendationsForRun(genscoreInput());
    for (const r of recs.filter((x) => x.recommendation_type.startsWith("pursue_"))) {
      expect(r.description).not.toMatch(/ninguno te menciona|no está en esas fichas|donde tu marca no sale/i);
    }
  });
});

describe("unproven claims — every prompt at 0%", () => {
  it("no card without a quote or a named competitor claims high confidence", () => {
    const recs = generateRecommendationsForRun(genscoreInput());
    expect(recs.length).toBeGreaterThan(0);
    for (const r of recs) {
      const ev = r.evidence_json;
      const hasQuote = (ev.evidence_snippets as string[]).length > 0;
      const hasCompetitor = (ev.mentioned_competitors as string[]).length > 0;
      if (!hasQuote && !hasCompetitor) expect(r.confidence, r.title).not.toBe("high");
    }
  });

  it("every card keeps the diagnosis certainty apart from the action's confidence", () => {
    for (const r of generateRecommendationsForRun(genscoreInput())) {
      expect(r.evidence_json.run_confidence, r.title).toBe("high");
      expect(typeof r.evidence_json.confidence_reason, r.title).toBe("string");
    }
  });

  it("a card backed by a quoted competitor is still allowed to be high (the cap is evidence, not pessimism)", () => {
    const gap = generateRecommendationsForRun(genscoreInput()).find((r) => r.recommendation_type === "close_competitor_gap");
    expect(gap?.evidence_json.evidence_kind).toBe("observation");
    expect(gap?.confidence).toBe("high");
  });
});

describe("unproven claims — sanity of the fixture", () => {
  it("reproduces the audit's setup", () => {
    const input = genscoreInput();
    const rowsForPrompt = input.promptResults.filter((p) => p.prompt_text_snapshot === PROFITABLE_PROMPT);
    expect(rowsForPrompt).toHaveLength(6);
    expect(input.promptResults.every((p) => !p.brand_mentioned)).toBe(true);
  });
});
