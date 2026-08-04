import { describe, expect, it } from "vitest";
import { TOOLS } from "./mejores-herramientas-geo";

describe("TOOLS (mejores-herramientas-geo)", () => {
  it("has at least 4 tools, including Genscore", () => {
    expect(TOOLS.length).toBeGreaterThanOrEqual(4);
    expect(TOOLS.some((t) => t.slug === "genscore")).toBe(true);
  });

  it("every tool has a unique slug", () => {
    const slugs = TOOLS.map((t) => t.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("every tool has all required fields non-empty", () => {
    for (const t of TOOLS) {
      expect(t.name.length, t.slug).toBeGreaterThan(0);
      expect(t.url.length, t.slug).toBeGreaterThan(0);
      expect(t.oneLiner.length, t.slug).toBeGreaterThan(20);
      expect(t.distinctiveFeature.length, t.slug).toBeGreaterThan(20);
      expect(t.pricingNote.length, t.slug).toBeGreaterThan(0);
      expect(t.spanishSupport.length, t.slug).toBeGreaterThan(0);
      expect(t.bestFor.length, t.slug).toBeGreaterThan(20);
    }
  });

  it("every url is an absolute https url", () => {
    for (const t of TOOLS) {
      expect(t.url.startsWith("https://"), t.slug).toBe(true);
    }
  });

  it("at least two tools link to their own dedicated head-to-head comparativa", () => {
    expect(TOOLS.filter((t) => t.comparisonHref).length).toBeGreaterThanOrEqual(2);
  });

  it("Genscore itself has no comparisonHref (it doesn't compare against itself)", () => {
    expect(TOOLS.find((t) => t.slug === "genscore")?.comparisonHref).toBeUndefined();
  });
});
