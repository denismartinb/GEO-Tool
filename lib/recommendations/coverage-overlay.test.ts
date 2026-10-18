import { describe, it, expect } from "vitest";
import { computeCoverageOverlay, isAnswerPage, isListingPage, overlayCopy } from "./coverage-overlay";
import { NOT_COVERED_NOTE, COULD_NOT_VERIFY_NOTE } from "./domain-coverage";

function rec(overrides: Partial<{
  id: string;
  recommendationType: string;
  resultId: string | null;
  confidence: "low" | "medium" | "high";
}> = {}) {
  return {
    id: "rec-1",
    recommendationType: "add_citation_block",
    resultId: "result-1",
    confidence: "medium" as const,
    ...overrides
  };
}

describe("computeCoverageOverlay", () => {
  it("returns an empty map when there are no coverage topics at all", () => {
    const overlay = computeCoverageOverlay({
      recommendations: [rec()],
      resultIdToPromptId: new Map([["result-1", "prompt-1"]]),
      coverageTopics: []
    });
    expect(overlay.size).toBe(0);
  });

  it("marks a confirmed surfacing gap when the topic is found:true, bumping confidence and attaching the verified page", () => {
    const overlay = computeCoverageOverlay({
      recommendations: [rec({ confidence: "medium" })],
      resultIdToPromptId: new Map([["result-1", "prompt-1"]]),
      coverageTopics: [
        { promptId: "prompt-1", topic: "x", found: true, pages: [{ url: "https://acme.com/a", title: "A" }], note: "n" }
      ]
    });
    const entry = overlay.get("rec-1");
    expect(entry?.state).toBe("confirmed_surfacing_gap");
    expect(entry?.verifiedPage).toEqual({ url: "https://acme.com/a", title: "A" });
    expect(entry?.confidenceOverride).toBe("high");
  });

  it("bumps low confidence to medium (does not jump straight to high)", () => {
    const overlay = computeCoverageOverlay({
      recommendations: [rec({ confidence: "low" })],
      resultIdToPromptId: new Map([["result-1", "prompt-1"]]),
      coverageTopics: [{ promptId: "prompt-1", topic: "x", found: true, pages: [], note: "n" }]
    });
    expect(overlay.get("rec-1")?.confidenceOverride).toBe("medium");
  });

  it("caps high confidence at high", () => {
    const overlay = computeCoverageOverlay({
      recommendations: [rec({ confidence: "high" })],
      resultIdToPromptId: new Map([["result-1", "prompt-1"]]),
      coverageTopics: [{ promptId: "prompt-1", topic: "x", found: true, pages: [], note: "n" }]
    });
    expect(overlay.get("rec-1")?.confidenceOverride).toBe("high");
  });

  it("marks a possible content gap when the topic is confirmed not-covered, without bumping confidence", () => {
    const overlay = computeCoverageOverlay({
      recommendations: [rec({ confidence: "medium" })],
      resultIdToPromptId: new Map([["result-1", "prompt-1"]]),
      coverageTopics: [{ promptId: "prompt-1", topic: "x", found: false, pages: [], note: NOT_COVERED_NOTE }]
    });
    const entry = overlay.get("rec-1");
    expect(entry?.state).toBe("possible_content_gap");
    expect(entry?.verifiedPage).toBeNull();
    expect(entry?.confidenceOverride).toBeNull();
  });

  it("leaves the card unchanged (no overlay entry) when the topic could not be verified", () => {
    const overlay = computeCoverageOverlay({
      recommendations: [rec()],
      resultIdToPromptId: new Map([["result-1", "prompt-1"]]),
      coverageTopics: [{ promptId: "prompt-1", topic: "x", found: false, pages: [], note: COULD_NOT_VERIFY_NOTE }]
    });
    expect(overlay.has("rec-1")).toBe(false);
  });

  it("Fase B: also enriches increase_brand_visibility, anchored by the same promptId join", () => {
    const overlay = computeCoverageOverlay({
      recommendations: [rec({ recommendationType: "increase_brand_visibility" })],
      resultIdToPromptId: new Map([["result-1", "prompt-1"]]),
      coverageTopics: [{ promptId: "prompt-1", topic: "x", found: true, pages: [{ url: "https://acme.com/a", title: "A" }], note: "n" }]
    });
    expect(overlay.get("rec-1")?.state).toBe("confirmed_surfacing_gap");
  });

  it("still ignores a run-wide type with no single prompt to join against", () => {
    // create_faq_section fires from the run's aggregate (visibility/citation
    // scores + informational-prompt count), not from one scan_prompt_results
    // row — there is no single topic it could ever match.
    const overlay = computeCoverageOverlay({
      recommendations: [rec({ recommendationType: "create_faq_section" })],
      resultIdToPromptId: new Map([["result-1", "prompt-1"]]),
      coverageTopics: [{ promptId: "prompt-1", topic: "x", found: true, pages: [], note: "n" }]
    });
    expect(overlay.size).toBe(0);
  });

  it("leaves the card unchanged when the recommendation has no resultId", () => {
    const overlay = computeCoverageOverlay({
      recommendations: [rec({ resultId: null })],
      resultIdToPromptId: new Map([["result-1", "prompt-1"]]),
      coverageTopics: [{ promptId: "prompt-1", topic: "x", found: true, pages: [], note: "n" }]
    });
    expect(overlay.size).toBe(0);
  });

  it("leaves the card unchanged when the resultId has no known promptId mapping", () => {
    const overlay = computeCoverageOverlay({
      recommendations: [rec({ resultId: "result-unmapped" })],
      resultIdToPromptId: new Map([["result-1", "prompt-1"]]),
      coverageTopics: [{ promptId: "prompt-1", topic: "x", found: true, pages: [], note: "n" }]
    });
    expect(overlay.size).toBe(0);
  });

  it("leaves the card unchanged when the mapped promptId has no matching coverage topic (older/different scan)", () => {
    const overlay = computeCoverageOverlay({
      recommendations: [rec()],
      resultIdToPromptId: new Map([["result-1", "prompt-999"]]),
      coverageTopics: [{ promptId: "prompt-1", topic: "x", found: true, pages: [], note: "n" }]
    });
    expect(overlay.size).toBe(0);
  });

  it("handles multiple recommendations independently", () => {
    const overlay = computeCoverageOverlay({
      recommendations: [
        rec({ id: "rec-a", resultId: "result-a", confidence: "low" }),
        rec({ id: "rec-b", resultId: "result-b", confidence: "medium" }),
        rec({ id: "rec-c", resultId: "result-c", confidence: "medium" })
      ],
      resultIdToPromptId: new Map([
        ["result-a", "prompt-a"],
        ["result-b", "prompt-b"],
        ["result-c", "prompt-c"]
      ]),
      coverageTopics: [
        { promptId: "prompt-a", topic: "a", found: true, pages: [{ url: "https://acme.com/a", title: "A" }], note: "n" },
        { promptId: "prompt-b", topic: "b", found: false, pages: [], note: NOT_COVERED_NOTE }
        // prompt-c has no coverage topic at all.
      ]
    });
    expect(overlay.get("rec-a")?.state).toBe("confirmed_surfacing_gap");
    expect(overlay.get("rec-b")?.state).toBe("possible_content_gap");
    expect(overlay.has("rec-c")).toBe(false);
  });
});

describe("overlayCopy", () => {
  it("add_citation_block, found: talks about citation, matching its real trigger (mentioned but not cited)", () => {
    const copy = overlayCopy("add_citation_block", "confirmed_surfacing_gap");
    expect(copy?.whatWeFound).toContain("no lo está citando");
    expect(copy?.whatToDo).toContain("no crees una página nueva");
  });

  it("increase_brand_visibility, found: talks about not appearing in the answer, NOT about citation", () => {
    // The regression this fase exists to avoid: this card's real trigger is
    // "not mentioned at all", so claiming "the AI isn't citing it as a
    // source" here would be a category error — there is no mention to cite.
    const copy = overlayCopy("increase_brand_visibility", "confirmed_surfacing_gap");
    expect(copy?.whatWeFound).not.toContain("citando");
    expect(copy?.whatWeFound).toContain("no está apareciendo en la respuesta");
    expect(copy?.whatToDo).toContain("no crees una página nueva");
  });

  it("increase_brand_visibility, not-found: reuses rule_visibility_001's own first_step verbatim", () => {
    // recommendation-engine.ts's firstStep for this rule, character for
    // character — the overlay must never invent a different call to action
    // for the same gap.
    const copy = overlayCopy("increase_brand_visibility", "possible_content_gap");
    expect(copy?.whatToDo).toBe(
      "publica una página que responda esta pregunta en las dos primeras frases, con el titular en forma de pregunta."
    );
  });

  it("add_citation_block, not-found: unchanged from before Fase B", () => {
    const copy = overlayCopy("add_citation_block", "possible_content_gap");
    expect(copy?.whatToDo).toContain("plantéate crear una página");
  });

  it("returns null for a state of none — nothing to say", () => {
    expect(overlayCopy("add_citation_block", "none")).toBeNull();
  });
});

describe("home_only (GS-03)", () => {
  it("does not certify coverage when the only own page is the home", () => {
    for (const url of ["https://acme.com/", "https://acme.com", "https://www.acme.com/?utm=x", "https://acme.com/index.html"]) {
      const overlay = computeCoverageOverlay({
        recommendations: [rec({ recommendationType: "increase_brand_visibility" })],
        resultIdToPromptId: new Map([["result-1", "prompt-1"]]),
        coverageTopics: [{ promptId: "prompt-1", topic: "x", found: true, pages: [{ url, title: "Inicio" }], note: "n" }]
      });
      expect(overlay.get("rec-1")?.state, url).toBe("home_only");
      expect(overlay.get("rec-1")?.confidenceOverride, url).toBeNull();
    }
  });

  it("a real inner page among the results still confirms coverage", () => {
    const overlay = computeCoverageOverlay({
      recommendations: [rec()],
      resultIdToPromptId: new Map([["result-1", "prompt-1"]]),
      coverageTopics: [
        {
          promptId: "prompt-1",
          topic: "x",
          found: true,
          pages: [{ url: "https://acme.com/", title: "Inicio" }, { url: "https://acme.com/precios", title: "Precios" }],
          note: "n"
        }
      ]
    });
    expect(overlay.get("rec-1")?.state).toBe("confirmed_surfacing_gap");
  });

  it("every state's first step agrees with its own advice: improve when covered, create otherwise", () => {
    for (const type of ["increase_brand_visibility", "add_citation_block"]) {
      expect(overlayCopy(type, "confirmed_surfacing_gap")?.firstStep).not.toMatch(/^Publica/);
      expect(overlayCopy(type, "possible_content_gap")?.firstStep).toMatch(/^Publica/);
      expect(overlayCopy(type, "home_only")?.firstStep).toMatch(/^Publica/);
      expect(overlayCopy(type, "home_only")?.whatToDo).not.toContain("no crees una página nueva");
    }
  });
});

describe("no_editable_page (RECS-DIAGNOSIS-1, log §299)", () => {
  function overlayFor(pages: Array<{ url: string; title: string }>) {
    return computeCoverageOverlay({
      recommendations: [rec({ recommendationType: "increase_brand_visibility" })],
      resultIdToPromptId: new Map([["result-1", "prompt-1"]]),
      coverageTopics: [{ promptId: "prompt-1", topic: "x", found: true, pages, note: "n" }]
    }).get("rec-1");
  }

  it("does not certify coverage with a forum or community thread on the brand's domain", () => {
    for (const url of [
      "https://comunidad.acme.es/t5/quejas/no-funciona/td-p/123",
      "https://community.acme.com/thread/9",
      "https://acme.es/foro/tema-123"
    ]) {
      const entry = overlayFor([{ url, title: "Hilo" }]);
      expect(entry?.state, url).toBe("no_editable_page");
      expect(entry?.verifiedPage, url).toBeNull();
      expect(entry?.confidenceOverride, url).toBeNull();
    }
  });

  it("skips the forum and links the brand's own page when both exist", () => {
    const entry = overlayFor([
      { url: "https://comunidad.acme.es/t5/hilo", title: "Hilo" },
      { url: "https://acme.es/", title: "Inicio" },
      { url: "https://acme.es/servicios/fibra", title: "Fibra" }
    ]);
    expect(entry?.state).toBe("confirmed_surfacing_gap");
    expect(entry?.verifiedPage?.url).toBe("https://acme.es/servicios/fibra");
  });

  it("keeps home_only when the home is the only page", () => {
    expect(overlayFor([{ url: "https://acme.es/", title: "Inicio" }])?.state).toBe("home_only");
  });

  it("does not treat a deep slug that merely contains «comunidad» as a forum", () => {
    expect(overlayFor([{ url: "https://acme.es/blog/comunidad-de-vecinos", title: "Blog" }])?.state).toBe(
      "confirmed_surfacing_gap"
    );
  });

  it("tells the user to publish their own page, never to edit the thread", () => {
    for (const type of ["add_citation_block", "increase_brand_visibility"]) {
      const copy = overlayCopy(type, "no_editable_page");
      expect(copy?.firstStep).toMatch(/^Publica/);
      expect(copy?.whatToDo).not.toContain("no crees una página nueva");
    }
  });
});

describe("listing_only (RECS-COVERAGE-1, log §330)", () => {
  function overlayFor(pages: Array<{ url: string; title: string }>) {
    return computeCoverageOverlay({
      recommendations: [rec({ recommendationType: "increase_brand_visibility" })],
      resultIdToPromptId: new Map([["result-1", "prompt-1"]]),
      coverageTopics: [{ promptId: "prompt-1", topic: "x", found: true, pages, note: "n" }]
    }).get("rec-1");
  }

  it("treats blog homes, section indexes, taxonomy and pagination pages as listings", () => {
    for (const url of [
      "https://genscore.es/blog",
      "https://genscore.es/blog/",
      "https://acme.es/en/blog",
      "https://genscore.es/comparativas",
      "https://acme.es/blog/categoria/geo",
      "https://acme.es/tag/seo",
      "https://acme.es/blog/page/2"
    ]) {
      expect(isListingPage(url), url).toBe(true);
      expect(isAnswerPage(url), url).toBe(false);
    }
  });

  it("keeps articles and pages below an index as answer pages", () => {
    for (const url of [
      "https://genscore.es/blog/que-es-el-geo",
      "https://genscore.es/comparativas/genscore-vs-peec-ai",
      "https://genscore.es/docs/empezar/primer-escaneo",
      "https://acme.es/precios",
      "https://acme.es/pagina/sobre-nosotros"
    ]) {
      expect(isListingPage(url), url).toBe(false);
      expect(isAnswerPage(url), url).toBe(true);
    }
  });

  it("does not certify coverage when Google only returned an index (the /blog case of the real test)", () => {
    const entry = overlayFor([{ url: "https://genscore.es/blog", title: "Blog" }]);
    expect(entry?.state).toBe("listing_only");
    expect(entry?.verifiedPage).toBeNull();
  });

  it("an index next to the real article links the article, never the index", () => {
    const entry = overlayFor([
      { url: "https://genscore.es/blog", title: "Blog" },
      { url: "https://genscore.es/blog/que-es-el-geo", title: "Qué es el GEO" }
    ]);
    expect(entry?.state).toBe("confirmed_surfacing_gap");
    expect(entry?.verifiedPage?.url).toBe("https://genscore.es/blog/que-es-el-geo");
  });

  it("home plus index is a listing, home alone stays home_only, a forum wins over an index", () => {
    expect(
      overlayFor([
        { url: "https://genscore.es/", title: "Inicio" },
        { url: "https://genscore.es/blog", title: "Blog" }
      ])?.state
    ).toBe("listing_only");
    expect(overlayFor([{ url: "https://genscore.es/", title: "Inicio" }])?.state).toBe("home_only");
    expect(
      overlayFor([
        { url: "https://acme.es/blog", title: "Blog" },
        { url: "https://acme.es/foro/tema-1", title: "Foro" }
      ])?.state
    ).toBe("no_editable_page");
  });

  it("its advice never tells the user the question is already covered", () => {
    for (const type of ["increase_brand_visibility", "add_citation_block"]) {
      const copy = overlayCopy(type, "listing_only");
      expect(copy?.whatToDo).not.toContain("no crees una página nueva");
      expect(copy?.firstStep).toMatch(/si no existe, publícalo\.$/);
      expect(copy?.whatWeFound).not.toContain("—");
    }
  });
});
