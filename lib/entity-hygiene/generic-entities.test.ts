import { describe, expect, it } from "vitest";
import { isGenericEntity, isGenericEntityDomain, isGenericEntityName } from "./generic-entities";

describe("isGenericEntityName", () => {
  it("1. matches a known AI assistant by name, case/diacritic-insensitively", () => {
    expect(isGenericEntityName("ChatGPT")).toBe(true);
    expect(isGenericEntityName("  chatgpt  ")).toBe(true);
    expect(isGenericEntityName("Claude")).toBe(true);
    expect(isGenericEntityName("Gemini")).toBe(true);
  });

  it("2. matches GEO-industry jargon as a whole phrase", () => {
    expect(isGenericEntityName("GEO Score")).toBe(true);
    expect(isGenericEntityName("geo-score")).toBe(true);
    expect(isGenericEntityName("Share of Voice")).toBe(true);
  });

  it("3. never matches on a bare token that is only generic as part of a longer phrase", () => {
    // "score" and "geo" alone are real words/abbreviations real companies use
    // on their own (The GEO Group) — only the full phrase "GEO Score" is the
    // generic industry term this list exists to catch.
    expect(isGenericEntityName("score")).toBe(false);
    expect(isGenericEntityName("geo")).toBe(false);
    expect(isGenericEntityName("Score")).toBe(false);
  });

  it("4. does not match a real brand name that merely contains a generic word", () => {
    expect(isGenericEntityName("Geotab")).toBe(false);
    expect(isGenericEntityName("Scoreboard Inc")).toBe(false);
    expect(isGenericEntityName("ChatGPT Wrapper Co")).toBe(false);
  });

  it("5. does not match an unrelated real competitor name", () => {
    expect(isGenericEntityName("Semrush")).toBe(false);
    expect(isGenericEntityName("Ahrefs")).toBe(false);
    expect(isGenericEntityName("Mozilla")).toBe(false);
  });
});

describe("isGenericEntityDomain", () => {
  it("6. matches a known AI tool's own domain, with or without www.", () => {
    expect(isGenericEntityDomain("chatgpt.com")).toBe(true);
    expect(isGenericEntityDomain("www.chatgpt.com")).toBe(true);
    expect(isGenericEntityDomain("openai.com")).toBe(true);
  });

  it("7. does not match an unrelated domain", () => {
    expect(isGenericEntityDomain("semrush.com")).toBe(false);
    expect(isGenericEntityDomain("mozilla.org")).toBe(false);
  });
});

describe("isGenericEntity", () => {
  it("8. flags a candidate whose NAME is generic even with a made-up domain", () => {
    expect(isGenericEntity({ name: "ChatGPT", domain: "some-wrapper.example.com" })).toBe(true);
  });

  it("9. flags a candidate whose DOMAIN is a known AI tool even under a different display name", () => {
    expect(isGenericEntity({ name: "Bing AI", domain: "bing.com" })).toBe(true);
  });

  it("10. accepts a real competitor with neither a generic name nor a generic domain", () => {
    expect(isGenericEntity({ name: "Semrush", domain: "semrush.com" })).toBe(false);
  });

  it("11. accepts a real competitor when no domain is provided", () => {
    expect(isGenericEntity({ name: "Semrush" })).toBe(false);
  });
});
