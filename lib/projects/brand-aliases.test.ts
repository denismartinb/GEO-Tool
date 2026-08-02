import { describe, expect, it } from "vitest";
import { MAX_ALIASES, selectVerifiableAliases } from "@/lib/projects/brand-aliases";

/** The real case this whole phase exists for. */
const MOZILLA_EVIDENCE = [
  "Homepage title: Internet for people, not profit — Mozilla",
  "Homepage headings: Firefox Browser | Firefox Focus | Thunderbird | Mozilla VPN",
  "Homepage visible text excerpt: Get Firefox, the browser backed by Mozilla, a non-profit.",
  "Thunderbird is a free email application."
].join("\n");

describe("selectVerifiableAliases", () => {
  it("accepts the product names that made the founder's scan wrong", () => {
    const { accepted } = selectVerifiableAliases(["Firefox", "Firefox Focus", "Thunderbird"], "Mozilla", MOZILLA_EVIDENCE);
    expect(accepted).toEqual(["Firefox", "Firefox Focus", "Thunderbird"]);
  });

  it("rejects an alias the model invented that is nowhere on the brand's own site", () => {
    // The model "knows" Mozilla ships these; the homepage does not say so.
    // An unverifiable alias is a guess, and guesses must not move the score.
    const { accepted, rejected } = selectVerifiableAliases(
      ["Firefox", "Firefox Pro Max", "Netscape Navigator"],
      "Mozilla",
      MOZILLA_EVIDENCE
    );
    expect(accepted).toEqual(["Firefox"]);
    expect(rejected.map((r) => r.reason)).toEqual(["not_in_evidence", "not_in_evidence"]);
  });

  it("documents the known limit: the generic list is a heuristic, not a guarantee", () => {
    // A category noun specific to a vertical we have not enumerated passes
    // every rule — it is in the evidence, long enough, and not on the list.
    // Recorded as a test so the gap is visible rather than discovered in
    // production; the mitigation is that aliases are user-editable, not that
    // this list is complete.
    const { accepted } = selectVerifiableAliases(
      ["mancuernas"],
      "Decathlon",
      "Decathlon vende mancuernas y material de fitness."
    );
    expect(accepted).toEqual(["mancuernas"]);
  });

  it("rejects generic category words even when they appear in the evidence", () => {
    // "Focus" alone is in the text (as part of Firefox Focus) but would match
    // any answer that uses the word — this is the ADR 0021 "tu marca" failure
    // arriving through the alias door.
    const { accepted, rejected } = selectVerifiableAliases(["Focus", "browser"], "Mozilla", MOZILLA_EVIDENCE);
    expect(accepted).toEqual([]);
    expect(rejected.map((r) => r.reason)).toContain("generic");
  });

  it("rejects aliases too short to match safely in both directions", () => {
    const { accepted, rejected } = selectVerifiableAliases(["FF", "VPN"], "Mozilla", MOZILLA_EVIDENCE);
    expect(accepted).toEqual([]);
    expect(rejected.every((r) => r.reason === "too_short")).toBe(true);
  });

  it("rejects an alias already covered by the tracked brand string", () => {
    const { rejected } = selectVerifiableAliases(["Mozilla"], "Mozilla Corporation", "Mozilla Corporation builds Firefox.");
    expect(rejected).toEqual([{ alias: "Mozilla", reason: "same_as_brand" }]);
  });

  it("is accent- and case-insensitive against the evidence", () => {
    const { accepted } = selectVerifiableAliases(["telefonica"], "Movistar", "Telefónica opera Movistar en España.");
    expect(accepted).toEqual(["telefonica"]);
  });

  it("deduplicates variants that normalize to the same name", () => {
    const { accepted, rejected } = selectVerifiableAliases(
      ["Firefox", "  firefox  ", "FIREFOX"],
      "Mozilla",
      MOZILLA_EVIDENCE
    );
    expect(accepted).toEqual(["Firefox"]);
    expect(rejected.map((r) => r.reason)).toEqual(["duplicate", "duplicate"]);
  });

  it("enforces the same cap as the database constraint", () => {
    const many = Array.from({ length: MAX_ALIASES + 5 }, (_, i) => `Producto${i}`);
    const evidence = many.join(" ");
    const { accepted, rejected } = selectVerifiableAliases(many, "Marca", evidence);
    expect(accepted).toHaveLength(MAX_ALIASES);
    expect(rejected.every((r) => r.reason === "over_limit")).toBe(true);
  });

  it("returns an empty accepted list rather than inventing something", () => {
    // Most brands genuinely have no alias. That is the correct answer, not a
    // failure to be papered over.
    expect(selectVerifiableAliases([], "Acme", "Acme sells widgets.").accepted).toEqual([]);
    expect(selectVerifiableAliases(["", "   "], "Acme", "Acme sells widgets.").accepted).toEqual([]);
  });

  it("never throws on malformed model output", () => {
    const junk = [null, undefined, 123, {}] as unknown as string[];
    expect(() => selectVerifiableAliases(junk, "Acme", "Acme sells widgets.")).not.toThrow();
  });
});
