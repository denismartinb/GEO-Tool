import { describe, expect, it } from "vitest";
import { GLOSSARY_TERMS } from "./terms";

describe("GLOSSARY_TERMS", () => {
  it("has at least 15 entries for the first slice", () => {
    expect(GLOSSARY_TERMS.length).toBeGreaterThanOrEqual(15);
  });

  it("every entry has a unique slug", () => {
    const slugs = GLOSSARY_TERMS.map((t) => t.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("every slug is URL/anchor-safe (lowercase, hyphens only)", () => {
    for (const t of GLOSSARY_TERMS) {
      expect(t.slug).toMatch(/^[a-z0-9-]+$/);
    }
  });

  it("every term and definition is non-empty", () => {
    for (const t of GLOSSARY_TERMS) {
      expect(t.term.length).toBeGreaterThan(0);
      expect(t.definition.length).toBeGreaterThan(20);
    }
  });

  // GROWTH-2 Fase 2.6b: each term gets its own page (/glosario/<slug>), long
  // enough to be worth a dedicated URL — docs/content-strategy.md §4.1 sets
  // 150-300 words as the target length for a glossary entry.
  it("every longDefinition is within the 150-300 word range from content-strategy.md §4.1", () => {
    for (const t of GLOSSARY_TERMS) {
      const wordCount = t.longDefinition.trim().split(/\s+/).length;
      expect(wordCount, `${t.slug}: ${wordCount} words`).toBeGreaterThanOrEqual(150);
      expect(wordCount, `${t.slug}: ${wordCount} words`).toBeLessThanOrEqual(300);
    }
  });

  it("every entry has at least 3 relatedLinks (content-strategy.md §4.3 internal-linking minimum)", () => {
    for (const t of GLOSSARY_TERMS) {
      expect(t.relatedLinks.length, `${t.slug}`).toBeGreaterThanOrEqual(3);
    }
  });

  it("no term links to itself, and every /glosario/<slug> relatedLink points to a real term", () => {
    const slugs = new Set(GLOSSARY_TERMS.map((t) => t.slug));
    for (const t of GLOSSARY_TERMS) {
      for (const link of t.relatedLinks) {
        expect(link.href, `${t.slug} -> ${link.href}`).not.toBe(`/glosario/${t.slug}`);
        const match = link.href.match(/^\/glosario\/(.+)$/);
        if (match) {
          expect(slugs.has(match[1]), `${t.slug} -> ${link.href} (unknown term)`).toBe(true);
        }
      }
    }
  });

  it("every relatedLink has a descriptive anchor label, never 'aquí' or 'este artículo'", () => {
    const forbidden = /^(aquí|este artículo|leer más)$/i;
    for (const t of GLOSSARY_TERMS) {
      for (const link of t.relatedLinks) {
        expect(forbidden.test(link.label.trim()), `${t.slug} -> "${link.label}"`).toBe(false);
      }
    }
  });
});
