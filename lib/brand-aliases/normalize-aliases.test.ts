import { describe, expect, it } from "vitest";
import {
  MAX_ALIAS_LENGTH,
  MAX_ALIASES,
  MIN_ALIAS_LENGTH,
  normalizeAliasInput,
  removeAliasFromList,
  validateNewAlias
} from "./normalize-aliases";

describe("normalizeAliasInput", () => {
  it("trims and collapses internal whitespace without lowercasing", () => {
    expect(normalizeAliasInput("  Firefox   Focus  ")).toBe("Firefox Focus");
  });
});

describe("validateNewAlias", () => {
  const base = { brand: "Mozilla", existingAliases: [] as string[] };

  it("accepts the real case this phase exists for", () => {
    const result = validateNewAlias({ raw: "Firefox", ...base });
    expect(result).toEqual({ ok: true, alias: "Firefox" });
  });

  it("trims before validating and stores the trimmed form", () => {
    const result = validateNewAlias({ raw: "  Thunderbird  ", ...base });
    expect(result).toEqual({ ok: true, alias: "Thunderbird" });
  });

  it("rejects an empty or whitespace-only input", () => {
    expect(validateNewAlias({ raw: "", ...base }).ok).toBe(false);
    expect(validateNewAlias({ raw: "   ", ...base }).ok).toBe(false);
  });

  it("rejects an alias shorter than MIN_ALIAS_LENGTH", () => {
    const result = validateNewAlias({ raw: "FF", ...base });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(String(MIN_ALIAS_LENGTH));
  });

  it("rejects an alias longer than MAX_ALIAS_LENGTH", () => {
    const tooLong = "a".repeat(MAX_ALIAS_LENGTH + 1);
    const result = validateNewAlias({ raw: tooLong, ...base });
    expect(result.ok).toBe(false);
  });

  it("accepts an alias exactly at MAX_ALIAS_LENGTH", () => {
    const exact = "a".repeat(MAX_ALIAS_LENGTH);
    const result = validateNewAlias({ raw: exact, ...base });
    expect(result.ok).toBe(true);
  });

  it("rejects an alias equal to the brand string (case/diacritic-insensitive)", () => {
    expect(validateNewAlias({ raw: "mozilla", ...base }).ok).toBe(false);
    expect(validateNewAlias({ raw: "MOZILLA", ...base }).ok).toBe(false);
  });

  it("rejects an alias the brand string already contains, and vice versa", () => {
    expect(validateNewAlias({ raw: "Mozilla Corporation", brand: "Mozilla", existingAliases: [] }).ok).toBe(false);
    expect(validateNewAlias({ raw: "Mozilla", brand: "Mozilla Corporation", existingAliases: [] }).ok).toBe(false);
  });

  it("rejects a duplicate of an existing alias, case-insensitively", () => {
    const result = validateNewAlias({ raw: "firefox", brand: "Mozilla", existingAliases: ["Firefox"] });
    expect(result.ok).toBe(false);
  });

  it("rejects a generic AI assistant/GEO-industry term (ENTITY-HYGIENE-1) — this path had no such guard before", () => {
    expect(validateNewAlias({ raw: "ChatGPT", ...base }).ok).toBe(false);
    expect(validateNewAlias({ raw: "GEO Score", brand: "GenScore", existingAliases: [] }).ok).toBe(false);
  });

  it("rejects an alias redundant with one already accepted (bidirectional substring)", () => {
    const narrower = validateNewAlias({ raw: "Firefox Focus", brand: "Mozilla", existingAliases: ["Firefox"] });
    expect(narrower.ok).toBe(false);

    const broader = validateNewAlias({ raw: "Firefox", brand: "Mozilla", existingAliases: ["Firefox Focus"] });
    expect(broader.ok).toBe(false);
  });

  it("enforces MAX_ALIASES", () => {
    const many = Array.from({ length: MAX_ALIASES }, (_, i) => `Producto${String(i).padStart(3, "0")}`);
    const result = validateNewAlias({ raw: "OneMore", brand: "Marca", existingAliases: many });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(String(MAX_ALIASES));
  });

  it("is accent-insensitive when comparing to the brand and existing aliases", () => {
    expect(validateNewAlias({ raw: "telefónica", brand: "Telefonica", existingAliases: [] }).ok).toBe(false);
    expect(validateNewAlias({ raw: "Movil", brand: "Marca", existingAliases: ["Móvil"] }).ok).toBe(false);
  });
});

describe("removeAliasFromList", () => {
  it("removes a matching alias case/diacritic-insensitively", () => {
    expect(removeAliasFromList(["Firefox", "Thunderbird"], "firefox")).toEqual(["Thunderbird"]);
    expect(removeAliasFromList(["Móvil", "Otro"], "movil")).toEqual(["Otro"]);
  });

  it("is a no-op when the alias isn't present", () => {
    expect(removeAliasFromList(["Firefox"], "Chrome")).toEqual(["Firefox"]);
  });

  it("never mutates the input array", () => {
    const original = ["Firefox", "Thunderbird"];
    const copy = [...original];
    removeAliasFromList(original, "Firefox");
    expect(original).toEqual(copy);
  });
});
