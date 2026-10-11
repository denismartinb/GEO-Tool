import { describe, expect, it } from "vitest";
import { resolveCompetitiveClaim } from "./competitive-claim";

const base = { citationScore: 40, sampleSufficient: true };

describe("resolveCompetitiveClaim (GS-02)", () => {
  it("never claims leadership with zero competitors (0 of 72 regression)", () => {
    const claim = resolveCompetitiveClaim({ ...base, brandRate: 0, competitors: [] });
    expect(claim.kind).toBe("no_competitors");
  });

  it("does not claim leadership when nobody was named", () => {
    const claim = resolveCompetitiveClaim({
      ...base,
      brandRate: 0,
      competitors: [{ name: "Rival", mentionRate: 0 }]
    });
    expect(claim.kind).toBe("nobody_named");
  });

  it("reports a tie as a tie", () => {
    const claim = resolveCompetitiveClaim({
      ...base,
      brandRate: 40,
      competitors: [{ name: "Rival", mentionRate: 40 }, { name: "Otro", mentionRate: 10 }]
    });
    expect(claim).toEqual({ kind: "tied", competitor: "Rival" });
  });

  it("names the strongest competitor ahead of the brand", () => {
    const claim = resolveCompetitiveClaim({
      ...base,
      brandRate: 20,
      competitors: [{ name: "Otro", mentionRate: 30 }, { name: "Rival", mentionRate: 60 }]
    });
    expect(claim).toEqual({ kind: "behind", competitor: "Rival", competitorRate: 60 });
  });

  it("does not call a lead on a small sample", () => {
    const claim = resolveCompetitiveClaim({
      ...base,
      sampleSufficient: false,
      brandRate: 60,
      competitors: [{ name: "Rival", mentionRate: 20 }]
    });
    expect(claim.kind).toBe("ahead_small_sample");
  });

  it("claims leadership only when ahead of a real competitor on a sufficient sample", () => {
    const claim = resolveCompetitiveClaim({
      ...base,
      brandRate: 60,
      competitors: [{ name: "Rival", mentionRate: 20 }]
    });
    expect(claim.kind).toBe("leader");
  });

  it("keeps the citation-gap message when no rival is ahead and nothing is cited", () => {
    const claim = resolveCompetitiveClaim({
      ...base,
      citationScore: 0,
      brandRate: 0,
      competitors: []
    });
    expect(claim.kind).toBe("no_citations");
  });

  it("does not mutate the competitor list", () => {
    const competitors = [{ name: "A", mentionRate: 10 }, { name: "B", mentionRate: 50 }];
    resolveCompetitiveClaim({ ...base, brandRate: 0, competitors });
    expect(competitors.map((c) => c.name)).toEqual(["A", "B"]);
  });
});
