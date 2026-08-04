import { describe, expect, it } from "vitest";
import type { DomainCoverageMap, DomainCoverageTopic } from "./coverage-map";
import { buildLlmsTxt, publishSteps, LLMS_DESCRIPTION_TOKEN, LLMS_SUMMARY_TOKEN } from "./llms-txt";

function topic(overrides: Partial<DomainCoverageTopic> = {}): DomainCoverageTopic {
  return {
    promptId: "p1",
    topic: "mejores zapatillas de trail",
    found: true,
    pages: [{ url: "https://acme.com/trail", title: "Título inventado por Gemini" }],
    note: "",
    ...overrides
  };
}

function coverage(topics: DomainCoverageTopic[]): DomainCoverageMap {
  return { scanId: "run-1", generatedAt: "2026-08-04T10:00:00.000Z", topics };
}

const BASE = { brand: "Acme", domainNormalized: "acme.com" };

describe("buildLlmsTxt", () => {
  it("uses the user's own topics as sections and their verified URLs as links", () => {
    const result = buildLlmsTxt({
      ...BASE,
      coverage: coverage([
        topic(),
        topic({ promptId: "p2", topic: "guía de tallas", pages: [{ url: "https://acme.com/tallas", title: "x" }] })
      ])
    });

    expect(result).not.toBeNull();
    expect(result!.content).toContain("# Acme");
    expect(result!.content).toContain("## mejores zapatillas de trail");
    expect(result!.content).toContain("## guía de tallas");
    expect(result!.content).toContain("(https://acme.com/trail)");
    expect(result!.sectionCount).toBe(2);
    expect(result!.linkCount).toBe(2);
  });

  it("NEVER publishes Gemini's page title as if it were the site's own description", () => {
    // The single most important assertion in this file. `title` on a coverage
    // page was written by the model, not read from the page — only the URL is
    // verified. Putting it in a file the user publishes at their own domain
    // root would launder a guess into a fact.
    const result = buildLlmsTxt({
      ...BASE,
      coverage: coverage([topic({ pages: [{ url: "https://acme.com/trail", title: "Título inventado por Gemini" }] })])
    });

    expect(result!.content).not.toContain("Título inventado por Gemini");
    expect(result!.content).toContain(LLMS_DESCRIPTION_TOKEN);
  });

  it("labels each link with its real path, which the site actually has", () => {
    const result = buildLlmsTxt({
      ...BASE,
      coverage: coverage([topic({ pages: [{ url: "https://acme.com/trail/zapatillas", title: "x" }] })])
    });

    expect(result!.content).toContain("- [/trail/zapatillas](https://acme.com/trail/zapatillas)");
  });

  it("names the homepage rather than showing a bare slash", () => {
    const result = buildLlmsTxt({
      ...BASE,
      coverage: coverage([topic({ pages: [{ url: "https://acme.com/", title: "x" }] })])
    });

    expect(result!.content).toContain("- [Portada](https://acme.com/)");
  });

  it("declares every placeholder so the UI can stop a premature publish", () => {
    const result = buildLlmsTxt({ ...BASE, coverage: coverage([topic()]) });

    expect(result!.placeholders).toEqual([LLMS_SUMMARY_TOKEN, LLMS_DESCRIPTION_TOKEN]);
    expect(result!.content).toContain(LLMS_SUMMARY_TOKEN);
  });

  it("returns null when no coverage audit has ever run", () => {
    // A file made only of placeholders looks like a working artifact and
    // teaches a model nothing — worse than not offering one.
    expect(buildLlmsTxt({ ...BASE, coverage: null })).toBeNull();
  });

  it("returns null when every topic is a content gap", () => {
    expect(buildLlmsTxt({ ...BASE, coverage: coverage([topic({ found: false, pages: [] })]) })).toBeNull();
  });

  it("skips a topic that was found but has no verified page", () => {
    const result = buildLlmsTxt({
      ...BASE,
      coverage: coverage([topic({ found: true, pages: [] }), topic({ promptId: "p2", topic: "envíos" })])
    });

    expect(result!.sectionCount).toBe(1);
    expect(result!.content).toContain("## envíos");
  });

  it("dedupes a URL that several topics cite, keeping the first section", () => {
    const shared = { url: "https://acme.com/trail", title: "x" };
    const result = buildLlmsTxt({
      ...BASE,
      coverage: coverage([topic({ pages: [shared] }), topic({ promptId: "p2", topic: "segundo tema", pages: [shared] })])
    });

    expect(result!.linkCount).toBe(1);
    expect(result!.sectionCount).toBe(1);
    expect(result!.content).toContain("## mejores zapatillas de trail");
    expect(result!.content).not.toContain("## segundo tema");
  });

  it("treats /path and /path/ as the same page", () => {
    const result = buildLlmsTxt({
      ...BASE,
      coverage: coverage([
        topic({
          pages: [
            { url: "https://acme.com/trail", title: "x" },
            { url: "https://acme.com/trail/", title: "x" }
          ]
        })
      ])
    });

    expect(result!.linkCount).toBe(1);
  });

  it("caps links per section and sections per file so one campaign can't produce an unreadable file", () => {
    const many = Array.from({ length: 9 }, (_, i) => ({ url: `https://acme.com/p${i}`, title: "x" }));
    const manyTopics = Array.from({ length: 20 }, (_, i) =>
      topic({ promptId: `p${i}`, topic: `tema ${i}`, pages: [{ url: `https://acme.com/t${i}`, title: "x" }] })
    );

    expect(buildLlmsTxt({ ...BASE, coverage: coverage([topic({ pages: many })]) })!.linkCount).toBe(5);
    expect(buildLlmsTxt({ ...BASE, coverage: coverage(manyTopics) })!.sectionCount).toBe(12);
  });

  it("drops a non-https or malformed URL instead of emitting a broken link", () => {
    const result = buildLlmsTxt({
      ...BASE,
      coverage: coverage([
        topic({
          pages: [
            { url: "http://acme.com/inseguro", title: "x" },
            { url: "no es una url", title: "x" },
            { url: "https://acme.com/bien", title: "x" }
          ]
        })
      ])
    });

    expect(result!.linkCount).toBe(1);
    expect(result!.content).toContain("https://acme.com/bien");
    expect(result!.content).not.toContain("inseguro");
  });

  it("does not let a bracket in a topic name break the markdown", () => {
    const result = buildLlmsTxt({ ...BASE, coverage: coverage([topic({ topic: "precios [2026]" })]) });

    expect(result!.content).toContain("## precios 2026");
  });

  it("ends with exactly one trailing newline", () => {
    const result = buildLlmsTxt({ ...BASE, coverage: coverage([topic()]) });

    expect(result!.content.endsWith("\n")).toBe(true);
    expect(result!.content.endsWith("\n\n")).toBe(false);
  });
});

describe("publishSteps", () => {
  it("ends on a step the user can SEE succeed, not one they have to assume", () => {
    const steps = publishSteps("acme.com");
    const verification = steps.find((s) => s.code === "https://acme.com/llms.txt");

    expect(verification).toBeDefined();
    expect(steps.indexOf(verification!)).toBeGreaterThan(0);
  });

  it("uses the project's real domain in the verification URL", () => {
    expect(publishSteps("otra-marca.es").some((s) => s.code === "https://otra-marca.es/llms.txt")).toBe(true);
  });

  it("names the exact filename, since the check is case-sensitive", () => {
    expect(publishSteps("acme.com").some((s) => s.code === "llms.txt")).toBe(true);
  });
});
