import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { generateRecommendationsForRun } from "./recommendation-engine";
import { citesOnlyReferenceSources, classifyQueryShape, isDefinitionalPrompt } from "./query-shape";
import { groupPromptDetails } from "./prompt-details";
import { pointsCaption } from "./deliverable";
import { buildRecommendationRewritePrompt } from "./recommendation-rewrite-llm";
import { domainsShownInPrompt } from "./anchored-domains";

// log §292 — the founder's own card for «que significa geo» (2026-10-11).

describe("isDefinitionalPrompt", () => {
  it.each(["que significa geo", "¿Qué significa GEO?", "qué es el geo", "significado de geo", "definición de GEO", "what does geo mean"])(
    "treats «%s» as a definition",
    (p) => expect(isDefinitionalPrompt(p)).toBe(true)
  );

  it.each([
    "qué es el mejor crm para pymes",
    "mejores herramientas geo en español",
    "qué herramienta mide la visibilidad de mi marca en chatgpt"
  ])("does not treat «%s» as a definition", (p) => expect(isDefinitionalPrompt(p)).toBe(false));
});

describe("citesOnlyReferenceSources", () => {
  it("is true when every cited domain is a dictionary or an encyclopedia", () => {
    expect(citesOnlyReferenceSources(["dle.rae.es", "wordreference.com", "fundeu.es", "es.wikipedia.org"])).toBe(true);
  });
  it("needs at least two domains", () => {
    expect(citesOnlyReferenceSources(["es.wikipedia.org"])).toBe(false);
  });
  it("is false as soon as one source is not a reference", () => {
    expect(citesOnlyReferenceSources(["es.wikipedia.org", "dle.rae.es", "theacgroup.com"])).toBe(false);
  });
  it("classifies by either signal", () => {
    expect(classifyQueryShape("mejor software de facturación", ["rae.es", "wordreference.com"])).toBe("definition");
    expect(classifyQueryShape("mejor software de facturación", ["holded.com"])).toBe("other");
  });
});

function row(id: string, prompt: string, provider: string, domains: string[]) {
  return {
    id,
    promptId: "prompt-geo",
    provider,
    prompt_text_snapshot: prompt,
    brand_mentioned: false,
    citation_found: false,
    mentioned_competitors_count: 0,
    citations_count: domains.length,
    sentiment: "neutral" as const,
    extracted_json: {
      brand: { evidence: [], position: null },
      competitors: [],
      citations: domains.map((domain) => ({ domain, source: "grounding" as const })),
      sentiment_drivers: [],
      other_brands_mentioned: []
    }
  };
}

function visibilityCard(prompt: string, domains: string[]) {
  const recs = generateRecommendationsForRun({
    project: { brand: "GenScore", domain: "genscore.es", country: "ES", language: "es" },
    competitors: [],
    runScore: { visibility_score: 40, citation_score: 40, competitor_gap_score: 10, confidence: "high", details_json: {} },
    promptResults: [row("r1", prompt, "gemini", domains), row("r2", prompt, "openai", domains)]
  });
  return recs.find((r) => r.recommendation_type === "increase_brand_visibility")!;
}

describe("visibility card on a definitional query", () => {
  it("promises a citation, not a mention", () => {
    const rec = visibilityCard("que significa geo", ["dle.rae.es", "wordreference.com"]);
    expect(rec.description).toMatch(/pregunta de definición/);
    expect(rec.description).not.toMatch(/se la lleva quien publique primero/);
    expect(rec.impact).toBe("low");
    expect(rec.evidence_json.query_shape).toBe("definition");
    expect(String(rec.evidence_json.first_step)).toMatch(/otros significados/);
  });

  it("leaves an ordinary query exactly as before", () => {
    const rec = visibilityCard("mejores herramientas geo en español", ["peec.ai", "otterly.ai"]);
    expect(rec.description).toMatch(/se la lleva quien publique primero/);
    expect(rec.impact).toBe("medium");
    expect(rec.evidence_json.query_shape).toBeUndefined();
  });

  it("labels its points as conditional", () => {
    expect(pointsCaption("increase_brand_visibility", "definition")).toBe("si te nombran");
    expect(pointsCaption("increase_brand_visibility", undefined)).toBe("potenciales");
  });
});

describe("groupPromptDetails", () => {
  it("shows a prompt asked to several engines once, with every engine", () => {
    const d = (id: string, provider: string | null, domains: string[]) => ({
      id,
      prompt: "que significa geo",
      competitors: [],
      domains,
      snippet: null,
      provider
    });
    const grouped = groupPromptDetails([
      d("1", "claude", ["rae.es"]),
      d("2", "gemini", ["rae.es", "fundeu.es"]),
      d("3", "openai", []),
      d("4", "claude", []),
      d("5", null, [])
    ]);
    expect(grouped).toHaveLength(1);
    expect(grouped[0].providers).toEqual(["claude", "gemini", "openai"]);
    expect(grouped[0].domains).toEqual(["rae.es", "fundeu.es"]);
  });
});

describe("rewrite prompt", () => {
  const input = {
    brand: "GenScore",
    domain: "genscore.es",
    language: "es",
    recommendationType: "increase_brand_visibility",
    ruleTitle: 'Aparece en "que significa geo"',
    ruleDescription: "Es una pregunta de definición.",
    whyThisMatters: "",
    affectedPrompts: ["que significa geo"],
    mentionedCompetitors: [],
    citationDomains: ["dle.rae.es", "wordreference.com"],
    evidenceSnippets: []
  };

  it("asks to strengthen an existing page before creating a new one", () => {
    expect(buildRecommendationRewritePrompt(input)).toMatch(/strengthen THAT page/);
  });

  it("asks to disambiguate and to aim for a citation on a definitional query", () => {
    const text = buildRecommendationRewritePrompt({ ...input, queryShape: "definition" });
    expect(text).toMatch(/DEFINITIONAL query/);
    expect(text).toMatch(/disambiguate/);
    expect(buildRecommendationRewritePrompt(input)).not.toMatch(/DEFINITIONAL query/);
  });

  it("never promises Google FAQ rich results", () => {
    expect(buildRecommendationRewritePrompt(input)).toMatch(/Never promise FAQ rich results/);
  });

  it("adds no domain the guard would have to admit", () => {
    const shown = domainsShownInPrompt(buildRecommendationRewritePrompt({ ...input, queryShape: "definition" }));
    const baseline = domainsShownInPrompt(buildRecommendationRewritePrompt(input));
    expect([...shown].sort()).toEqual([...baseline].sort());
  });
});

describe("impact / effort dots", () => {
  const css = readFileSync("app/globals.css", "utf8");
  it("paint the «on» dots even though --p-high/--p-med are never declared", () => {
    expect(css).not.toMatch(/--p-high\s*:/);
    expect(css).toContain(".ie-dot.on-h { background: var(--p-high, var(--accent)); }");
    expect(css).toContain(".ie-dot.on-m { background: var(--p-med, var(--ink-3)); }");
  });
});
