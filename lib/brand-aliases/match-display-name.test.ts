import { describe, expect, it } from "vitest";
import { matchDisplayName } from "./match-display-name";

describe("matchDisplayName", () => {
  const ALIASES = ["Firefox", "Thunderbird"];

  it("matches the tracked brand string directly", () => {
    expect(matchDisplayName("Mozilla", "Mozilla", ALIASES)).toEqual({ matchedName: "Mozilla", isAlias: false });
  });

  it("matches an alias when the brand string itself doesn't match — the real case this phase exists for", () => {
    // The founder's real 2026-08-02 scan: the AI names only Firefox, never
    // Mozilla — the claimed text contains no form of "Mozilla" at all, so
    // only the alias plausibly matches.
    expect(matchDisplayName("Firefox 45", "Mozilla", ALIASES)).toEqual({
      matchedName: "Firefox",
      isAlias: true
    });
  });

  it("prefers the brand string over an alias when both would match", () => {
    // "Mozilla Firefox" contains both "Mozilla" and "Firefox" — the brand
    // string is checked first, mirroring the order verifyMention uses
    // ([brand, ...aliases]).
    expect(matchDisplayName("Mozilla", "Mozilla", ["Moz"])).toEqual({ matchedName: "Mozilla", isAlias: false });
  });

  it("returns null when nothing in the set plausibly matches", () => {
    expect(matchDisplayName("Chrome", "Mozilla", ALIASES)).toBeNull();
  });

  it("returns null for empty/whitespace-only claims", () => {
    expect(matchDisplayName("", "Mozilla", ALIASES)).toBeNull();
    expect(matchDisplayName("   ", "Mozilla", ALIASES)).toBeNull();
    expect(matchDisplayName(null, "Mozilla", ALIASES)).toBeNull();
    expect(matchDisplayName(undefined, "Mozilla", ALIASES)).toBeNull();
  });

  it("is case- and accent-insensitive, same as the scoring-side matcher", () => {
    expect(matchDisplayName("firefox", "Mozilla", ALIASES)).toEqual({ matchedName: "Firefox", isAlias: true });
    expect(matchDisplayName("Telefónica", "Telefonica", [])).toEqual({ matchedName: "Telefonica", isAlias: false });
  });

  it("matches bidirectionally, same as namesPlausiblyMatch", () => {
    // Claimed text is a superstring of the alias (and does not contain the
    // brand string, so only the alias is in play).
    expect(matchDisplayName("Firefox Focus", "Mozilla", ["Firefox"])).toEqual({
      matchedName: "Firefox",
      isAlias: true
    });
    // Claimed text is a substring of the alias.
    expect(matchDisplayName("Firefox", "Mozilla", ["Firefox Focus"])).toEqual({
      matchedName: "Firefox Focus",
      isAlias: true
    });
  });

  it("checks aliases in the persisted order, first match wins", () => {
    expect(matchDisplayName("Thunderbird", "Mozilla", ["Firefox", "Thunderbird"])).toEqual({
      matchedName: "Thunderbird",
      isAlias: true
    });
  });

  it("tolerates an empty alias list", () => {
    expect(matchDisplayName("Mozilla", "Mozilla", [])).toEqual({ matchedName: "Mozilla", isAlias: false });
    expect(matchDisplayName("Firefox", "Mozilla", [])).toBeNull();
  });
});
