import { describe, expect, it } from "vitest";
import { cleanSeed, mergeRivalGaps, shapeSeedIdeas } from "@/lib/seo-tracking/discover-pure";
import { buildSetupProposal, topicNameFromUrl } from "@/lib/seo-tracking/setup-proposal";

describe("shapeSeedIdeas", () => {
  it("drops tracked and repeated keywords and sorts by volume", () => {
    const items = shapeSeedIdeas(
      [
        { keyword: "Endodoncia precio", volume: 1600, difficulty: null, intent: null },
        { keyword: "endodoncia madrid", volume: 880, difficulty: null, intent: null },
        { keyword: "endodoncia  precio", volume: 10, difficulty: null, intent: null },
        { keyword: "endodoncia duele", volume: null, difficulty: null, intent: null }
      ],
      new Set(["endodoncia madrid"])
    );
    expect(items.map((i) => i.keyword)).toEqual(["endodoncia precio", "endodoncia duele"]);
    expect(items[0]).toEqual({ keyword: "endodoncia precio", volume: 1600, rival: null });
  });
});

describe("shapeSeedIdeas with a seed", () => {
  it("leaves out longer variants that show more searches than the seed, and puts the seed first", () => {
    const idea = (keyword: string, volume: number | null) => ({ keyword, volume, difficulty: null, intent: null });
    const items = shapeSeedIdeas(
      [
        idea("meristation noticias cine y series", 170),
        idea("noticias de cine y series", 170),
        idea("cine y series", 110),
        idea("series y cine", 110),
        idea("programación orange tv cine y series", 70)
      ],
      new Set(),
      "Cine y series"
    );
    expect(items.map((i) => i.keyword)).toEqual(["cine y series", "series y cine", "programación orange tv cine y series"]);
  });

  it("keeps everything when the seed has no figure of its own", () => {
    const items = shapeSeedIdeas([{ keyword: "cine y series online", volume: 50, difficulty: null, intent: null }], new Set(), "cine y series");
    expect(items).toHaveLength(1);
  });
});

describe("mergeRivalGaps", () => {
  it("credits each keyword to the rival that ranks best for it", () => {
    const items = mergeRivalGaps(
      [
        { domain: "a.es", items: [{ keyword: "empaste precio", volume: 2400, difficulty: null, competitorPosition: 5 }] },
        { domain: "b.es", items: [{ keyword: "empaste precio", volume: 2400, difficulty: null, competitorPosition: 2 }, { keyword: "ya vigilada", volume: 9, difficulty: null, competitorPosition: 1 }] }
      ],
      new Set(["ya vigilada"])
    );
    expect(items).toEqual([{ keyword: "empaste precio", volume: 2400, rival: { domain: "b.es", position: 2 } }]);
  });
});

describe("cleanSeed", () => {
  it("accepts a short phrase and refuses empty or long text", () => {
    expect(cleanSeed("  endodoncia   precio ")).toBe("endodoncia precio");
    expect(cleanSeed("   ")).toBeNull();
    expect(cleanSeed("x".repeat(81))).toBeNull();
  });
});

describe("buildSetupProposal", () => {
  const pageByQuery = {
    "implantes dentales madrid": "https://clinicasol.es/implantes-dentales/",
    "implante precio": "https://clinicasol.es/implantes-dentales/",
    "clinica sol opiniones": "https://clinicasol.es/",
    "carillas precio": "https://clinicasol.es/carillas",
    "lejos": "https://clinicasol.es/carillas"
  };
  const queries = [
    { query: "implantes dentales madrid", position: 14, impressions: 900 },
    { query: "implante precio", position: 19, impressions: 300 },
    { query: "clinica sol opiniones", position: 1, impressions: 2000 },
    { query: "carillas precio", position: 3, impressions: 400 },
    { query: "lejos", position: 45, impressions: 5000 },
    { query: "sin pagina", position: 5, impressions: 100 }
  ];

  it("makes one topic per page, without brand searches or far positions", () => {
    const topics = buildSetupProposal({ queries, pageByQuery, brandTerms: ["Clínica Sol", "clinicasol"], keywordCap: 50 });
    expect(topics.map((t) => t.name)).toEqual(["Implantes dentales", "Carillas"]);
    expect(topics[0].keywords.map((k) => k.keyword)).toEqual(["implantes dentales madrid", "implante precio"]);
    expect(topics.flatMap((t) => t.keywords).every((k) => k.checked)).toBe(true);
  });

  it("ticks no more than the plan allows", () => {
    const topics = buildSetupProposal({ queries, pageByQuery, brandTerms: ["Clínica Sol"], keywordCap: 1 });
    expect(topics.flatMap((t) => t.keywords).filter((k) => k.checked).map((k) => k.keyword)).toEqual(["implantes dentales madrid"]);
  });

  it("names a topic after its page", () => {
    expect(topicNameFromUrl("https://x.es/blog/blanqueamiento-en-casa.html")).toBe("Blanqueamiento en casa");
    expect(topicNameFromUrl("https://x.es/")).toBe("Portada");
  });
});
