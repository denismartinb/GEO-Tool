import { describe, expect, it } from "vitest";
import {
  aggregateCitations,
  compareOpportunityRows,
  type CitationInputRow,
  type CitationRow
} from "@/lib/citations/aggregate-citations";

function row(overrides: Partial<CitationInputRow> = {}): CitationInputRow {
  return {
    prompt_id: "p1",
    prompt_text_snapshot: "prompt text",
    brand_mentioned: false,
    extracted_json: {},
    provider: null,
    ...overrides
  };
}

const projectDomain = "brand.com";
const competitorDomains = [{ name: "Rival", domain: "rival.com" }];
const promptCategoryMap = new Map<string, string | null>([
  ["p1", "informational"],
  ["p2", null]
]);

describe("aggregateCitations", () => {
  it("1. parity: dedup by domain, inline by URL, categories, brandMentioned yes/no/na, prompt grouping — matches pre-refactor behavior with no meaningful engine dimension", () => {
    const rows: CitationInputRow[] = [
      row({
        prompt_id: "p1",
        prompt_text_snapshot: "What is the best X?",
        brand_mentioned: true,
        extracted_json: {
          competitors: [{ name: "Rival", mentioned: true }],
          citations: [
            { source: "grounding", domain: "brand.com", title: "Brand Page" },
            { source: "grounding", domain: "rival.com", title: "Rival Page" },
            { source: "grounding", domain: undefined, title: "Some unresolved thing" }
          ]
        }
      }),
      row({
        prompt_id: "p2",
        prompt_text_snapshot: "Another question",
        brand_mentioned: false,
        extracted_json: {
          citations: [
            { source: "inline", url: "https://third.com/page", domain: "third.com", title: "Third Page" },
            { source: "grounding", domain: "brand.com", title: "Brand Page" }
          ]
        }
      })
    ];

    const { citationRows, promptGroups, hasStructuredCitations } = aggregateCitations({
      rows,
      projectDomain,
      competitorDomains,
      promptCategoryMap
    });

    expect(hasStructuredCitations).toBe(true);
    expect(citationRows).toHaveLength(4);

    // Sorted by cited desc; brand.com cited twice (once per prompt) so it
    // leads, the rest (cited once each) keep first-seen order.
    expect(citationRows.map((r) => r.id)).toEqual([
      "brand.com",
      "rival.com",
      "unresolved:some unresolved thing",
      "https://third.com/page"
    ]);

    const brandRow = citationRows.find((r) => r.id === "brand.com")!;
    expect(brandRow.category).toBe("brand");
    expect(brandRow.cited).toBe(2);
    expect(brandRow.brandMentioned).toBe("na");
    expect(brandRow.prompts).toHaveLength(2);

    const rivalRow = citationRows.find((r) => r.id === "rival.com")!;
    expect(rivalRow.category).toBe("competitor");
    expect(rivalRow.cited).toBe(1);
    expect(rivalRow.brandMentioned).toBe("yes"); // came from p1, brand_mentioned: true

    const unresolvedRow = citationRows.find((r) => r.id === "unresolved:some unresolved thing")!;
    expect(unresolvedRow.category).toBe("third_party");
    expect(unresolvedRow.domain).toBe("");
    expect(unresolvedRow.brandMentioned).toBe("yes");

    const thirdRow = citationRows.find((r) => r.id === "https://third.com/page")!;
    expect(thirdRow.category).toBe("third_party");
    expect(thirdRow.url).toBe("https://third.com/page");
    expect(thirdRow.brandMentioned).toBe("no"); // came from p2, brand_mentioned: false

    expect(promptGroups).toHaveLength(2);
    expect(promptGroups.map((g) => g.id)).toEqual(["p1", "p2"]);

    const p1 = promptGroups.find((g) => g.id === "p1")!;
    expect(p1.topic).toBe("informational");
    expect(p1.brandMentioned).toBe(true);
    expect(p1.citedUrls).toBe(3);
    expect(p1.totalCites).toBe(3);

    const p2 = promptGroups.find((g) => g.id === "p2")!;
    expect(p2.topic).toBeNull();
    expect(p2.brandMentioned).toBe(false);
    expect(p2.citedUrls).toBe(2);
    expect(p2.totalCites).toBe(2);
  });

  it("2. same domain cited by Gemini and ChatGPT → one row, engines has 2 entries with correct per-engine counts", () => {
    const rows: CitationInputRow[] = [
      row({
        provider: "gemini",
        extracted_json: {
          citations: [
            { source: "grounding", domain: "shared.com", title: "Shared" },
            { source: "grounding", domain: "shared.com", title: "Shared" }
          ]
        }
      }),
      row({
        provider: "openai",
        extracted_json: {
          citations: [{ source: "grounding", domain: "shared.com", title: "Shared" }]
        }
      })
    ];

    const { citationRows } = aggregateCitations({
      rows,
      projectDomain,
      competitorDomains,
      promptCategoryMap
    });

    expect(citationRows).toHaveLength(1);
    const sharedRow = citationRows[0];
    expect(sharedRow.cited).toBe(3);
    expect(sharedRow.engines).toEqual([
      { provider: "gemini", cited: 2 },
      { provider: "openai", cited: 1 }
    ]);
  });

  it("3. provider: null is attributed to 'gemini'", () => {
    const rows: CitationInputRow[] = [
      row({
        provider: null,
        extracted_json: { citations: [{ source: "grounding", domain: "x.com", title: "X" }] }
      })
    ];

    const { citationRows } = aggregateCitations({
      rows,
      projectDomain,
      competitorDomains,
      promptCategoryMap
    });

    expect(citationRows[0].engines).toEqual([{ provider: "gemini", cited: 1 }]);
  });

  it("4. grounding citation without resolved domain still groups by unresolved:{title}, engine attributed", () => {
    const rows: CitationInputRow[] = [
      row({
        provider: "gemini",
        extracted_json: {
          citations: [{ source: "grounding", domain: undefined, title: "Mystery Source" }]
        }
      }),
      row({
        provider: "openai",
        extracted_json: {
          citations: [{ source: "grounding", domain: undefined, title: "Mystery Source" }]
        }
      })
    ];

    const { citationRows } = aggregateCitations({
      rows,
      projectDomain,
      competitorDomains,
      promptCategoryMap
    });

    expect(citationRows).toHaveLength(1);
    const unresolvedRow = citationRows[0];
    expect(unresolvedRow.id).toBe("unresolved:mystery source");
    expect(unresolvedRow.domain).toBe("");
    expect(unresolvedRow.engines).toEqual([
      { provider: "gemini", cited: 1 },
      { provider: "openai", cited: 1 }
    ]);
  });

  it("5. engineTotals counts distinct domains and total cites per engine", () => {
    const rows: CitationInputRow[] = [
      row({
        provider: "gemini",
        extracted_json: {
          citations: [
            { source: "grounding", domain: "a.com", title: "A" },
            { source: "grounding", domain: "b.com", title: "B" }
          ]
        }
      }),
      row({
        provider: "openai",
        extracted_json: {
          citations: [
            { source: "grounding", domain: "a.com", title: "A" },
            { source: "grounding", domain: "a.com", title: "A" },
            { source: "grounding", domain: "c.com", title: "C" }
          ]
        }
      })
    ];

    const { engineTotals } = aggregateCitations({
      rows,
      projectDomain,
      competitorDomains,
      promptCategoryMap
    });

    expect(engineTotals).toEqual([
      { provider: "gemini", domains: 2, cites: 2 },
      { provider: "openai", domains: 2, cites: 3 }
    ]);
  });

  it("6. opportunity ordering: a domain cited by 2 engines ranks ahead of one with more cites from a single engine", () => {
    const rows: CitationInputRow[] = [
      // one-engine.com: cited 10 times, only by gemini.
      row({
        provider: "gemini",
        brand_mentioned: false,
        extracted_json: {
          citations: Array.from({ length: 10 }, () => ({
            source: "grounding" as const,
            domain: "one-engine.com",
            title: "One Engine"
          }))
        }
      }),
      // many-engines.com: cited 4 times total, but by both gemini and openai.
      row({
        provider: "gemini",
        brand_mentioned: false,
        extracted_json: {
          citations: [
            { source: "grounding", domain: "many-engines.com", title: "Many Engines" },
            { source: "grounding", domain: "many-engines.com", title: "Many Engines" },
            { source: "grounding", domain: "many-engines.com", title: "Many Engines" }
          ]
        }
      }),
      row({
        provider: "openai",
        brand_mentioned: false,
        extracted_json: {
          citations: [{ source: "grounding", domain: "many-engines.com", title: "Many Engines" }]
        }
      })
    ];

    const { citationRows } = aggregateCitations({
      rows,
      projectDomain,
      competitorDomains,
      promptCategoryMap
    });

    const opportunityRows: CitationRow[] = citationRows
      .filter((r) => r.category === "third_party" && r.brandMentioned === "no" && r.domain)
      .sort(compareOpportunityRows);

    expect(opportunityRows.map((r) => r.domain)).toEqual(["many-engines.com", "one-engine.com"]);
  });

  it("7. a Claude row with no citations does not appear in engines nor engineTotals", () => {
    const rows: CitationInputRow[] = [
      row({
        provider: "gemini",
        extracted_json: {
          citations: [{ source: "grounding", domain: "shared.com", title: "Shared" }]
        }
      }),
      row({
        provider: "claude",
        brand_mentioned: true,
        extracted_json: {} // Claude has no web search — never produces citations.
      })
    ];

    const { citationRows, engineTotals } = aggregateCitations({
      rows,
      projectDomain,
      competitorDomains,
      promptCategoryMap
    });

    expect(citationRows).toHaveLength(1);
    expect(citationRows[0].engines).toEqual([{ provider: "gemini", cited: 1 }]);
    expect(citationRows[0].engines.some((e) => e.provider === "claude")).toBe(false);
    expect(engineTotals.some((e) => e.provider === "claude")).toBe(false);
  });

  it("8. inline citation pointing to google.com (e.g. a Maps search link) is excluded as noise; a real grounding citation is never filtered even if its domain happens to be google.com", () => {
    const rows: CitationInputRow[] = [
      row({
        provider: "openai",
        extracted_json: {
          citations: [
            { source: "inline", url: "https://www.google.com/maps/search/BANNI%2C+Espa%C3%B1a", domain: "google.com", title: "BANNI" },
            { source: "inline", url: "https://real-site.com/page", domain: "real-site.com", title: "Real Site" }
          ]
        }
      }),
      row({
        provider: "gemini",
        extracted_json: {
          citations: [{ source: "grounding", domain: "google.com", title: "Google Shopping listing" }]
        }
      })
    ];

    const { citationRows } = aggregateCitations({
      rows,
      projectDomain,
      competitorDomains,
      promptCategoryMap
    });

    // The inline Maps-noise citation ("BANNI") is excluded entirely — no row
    // for it at all, under any title or domain.
    expect(citationRows.some((r) => r.title === "BANNI")).toBe(false);
    // The other inline citation (a real third-party page) is unaffected.
    expect(citationRows.some((r) => r.domain === "real-site.com")).toBe(true);
    // The grounding citation survives even though its domain is also
    // google.com — only the heuristic inline path is filtered.
    expect(citationRows.some((r) => r.title === "Google Shopping listing")).toBe(true);
    expect(citationRows).toHaveLength(2);
  });

  it("9. a grounding citation whose URL host matches its domain (OpenAI's real page URL) keeps the URL and dedups by page, not by domain", () => {
    const rows: CitationInputRow[] = [
      row({
        provider: "openai",
        extracted_json: {
          citations: [
            {
              source: "grounding",
              url: "https://xataka.com/moviles/mejores-tarifas-2026",
              domain: "xataka.com",
              title: "Mejores tarifas 2026"
            },
            {
              // A second, distinct real page on the same domain must stay a
              // separate row — it is not the same cited page.
              source: "grounding",
              url: "https://xataka.com/moviles/otro-articulo",
              domain: "xataka.com",
              title: "Otro artículo"
            }
          ]
        }
      })
    ];

    const { citationRows } = aggregateCitations({ rows, projectDomain, competitorDomains, promptCategoryMap });

    expect(citationRows).toHaveLength(2);
    const page1 = citationRows.find((r) => r.id === "https://xataka.com/moviles/mejores-tarifas-2026")!;
    expect(page1.url).toBe("https://xataka.com/moviles/mejores-tarifas-2026");
    const page2 = citationRows.find((r) => r.id === "https://xataka.com/moviles/otro-articulo")!;
    expect(page2.url).toBe("https://xataka.com/moviles/otro-articulo");
  });

  it("10. a grounding citation whose URL host is the Vertex redirect (Gemini) never surfaces that URL — domain-level dedup, unchanged", () => {
    const rows: CitationInputRow[] = [
      row({
        provider: "gemini",
        extracted_json: {
          citations: [
            {
              source: "grounding",
              url: "https://vertexaisearch.cloud.google.com/grounding-api-redirect/AbCdEf123",
              domain: "movistar.es",
              title: "Movistar"
            },
            {
              source: "grounding",
              url: "https://vertexaisearch.cloud.google.com/grounding-api-redirect/GhIjKl456",
              domain: "movistar.es",
              title: "Movistar"
            }
          ]
        }
      })
    ];

    const { citationRows } = aggregateCitations({ rows, projectDomain, competitorDomains, promptCategoryMap });

    expect(citationRows).toHaveLength(1);
    expect(citationRows[0].id).toBe("movistar.es");
    expect(citationRows[0].url).toBe("");
    expect(citationRows[0].cited).toBe(2);
  });

  it("11. impactBreakdown attributes each row's full cited count to exactly one bucket, summing to totalCited", () => {
    const rows: CitationInputRow[] = [
      // Own page.
      row({
        provider: "gemini",
        extracted_json: { citations: [{ source: "grounding", domain: "brand.com", title: "Brand" }] }
      }),
      // Competitor's own page.
      row({
        provider: "gemini",
        extracted_json: { citations: [{ source: "grounding", domain: "rival.com", title: "Rival" }] }
      }),
      // Third party, brand mentioned in that same answer → favorable.
      row({
        provider: "gemini",
        brand_mentioned: true,
        extracted_json: { citations: [{ source: "grounding", domain: "favorable-third-party.com", title: "Favorable" }] }
      }),
      // Third party, competitor mentioned instead of brand → adverse.
      row({
        provider: "gemini",
        brand_mentioned: false,
        extracted_json: {
          competitors: [{ name: "Rival", mentioned: true }],
          citations: [{ source: "grounding", domain: "adverse-third-party.com", title: "Adverse" }]
        }
      }),
      // Third party, no brand and no TRACKED competitor, but the answer did
      // name some other brand → otherBrands, not neutral.
      row({
        provider: "gemini",
        brand_mentioned: false,
        extracted_json: {
          other_brands_mentioned: ["Untracked Telco"],
          citations: [{ source: "grounding", domain: "other-brands-third-party.com", title: "Other brands" }]
        }
      }),
      // Third party, no brand, no tracked competitor, no other brand at
      // all → genuinely neutral.
      row({
        provider: "gemini",
        brand_mentioned: false,
        extracted_json: { citations: [{ source: "grounding", domain: "neutral-third-party.com", title: "Neutral" }] }
      })
    ];

    const { impactBreakdown } = aggregateCitations({ rows, projectDomain, competitorDomains, promptCategoryMap });

    expect(impactBreakdown).toEqual({
      own: 1,
      favorable: 1,
      adverse: 1,
      otherBrands: 1,
      competitor: 1,
      neutral: 1
    });
    const total = Object.values(impactBreakdown).reduce((sum, n) => sum + n, 0);
    expect(total).toBe(6);
  });

  it("13. a tracked competitor mention outranks other_brands_mentioned — the row stays 'adverse', never double-counted", () => {
    const rows: CitationInputRow[] = [
      row({
        provider: "gemini",
        brand_mentioned: false,
        extracted_json: {
          competitors: [{ name: "Rival", mentioned: true }],
          other_brands_mentioned: ["Some Other Brand"],
          citations: [{ source: "grounding", domain: "both-signals.com", title: "Both" }]
        }
      })
    ];

    const { impactBreakdown } = aggregateCitations({ rows, projectDomain, competitorDomains, promptCategoryMap });

    expect(impactBreakdown.adverse).toBe(1);
    expect(impactBreakdown.otherBrands).toBe(0);
  });

  it("12. sourceTypeBreakdown classifies third-party rows via classifySourceType and own/competitor via category, percentages sum to ~100", () => {
    const rows: CitationInputRow[] = [
      row({
        provider: "gemini",
        extracted_json: {
          citations: [
            { source: "grounding", domain: "brand.com", title: "Brand" },
            { source: "grounding", domain: "rival.com", title: "Rival" },
            { source: "grounding", domain: "reddit.com", title: "Reddit thread" },
            { source: "grounding", domain: "some-unknown-blog.example", title: "Unknown" }
          ]
        }
      })
    ];

    const { sourceTypeBreakdown } = aggregateCitations({ rows, projectDomain, competitorDomains, promptCategoryMap });

    const byType = Object.fromEntries(sourceTypeBreakdown.map((s) => [s.type, s]));
    expect(byType.own.cited).toBe(1);
    expect(byType.competitor.cited).toBe(1);
    expect(byType.community.cited).toBe(1);
    expect(byType.unknown.cited).toBe(1);
    const pctSum = sourceTypeBreakdown.reduce((sum, s) => sum + s.pct, 0);
    expect(pctSum).toBeGreaterThanOrEqual(99);
    expect(pctSum).toBeLessThanOrEqual(101);
  });
});
