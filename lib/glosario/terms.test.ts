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
});
