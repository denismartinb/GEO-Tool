import { describe, expect, it } from "vitest";
import { computeDominantBrandSentiment, type BrandSentimentInputRow } from "@/lib/metrics/brand-sentiment";

function row(overrides: Partial<BrandSentimentInputRow> = {}): BrandSentimentInputRow {
  return {
    brand_mentioned: false,
    sentiment: null,
    ...overrides
  };
}

describe("computeDominantBrandSentiment", () => {
  it("1. mixed rows: only brand_mentioned rows are counted", () => {
    const rows: BrandSentimentInputRow[] = [
      row({ brand_mentioned: true, sentiment: "positive" }),
      row({ brand_mentioned: true, sentiment: "positive" }),
      row({ brand_mentioned: false, sentiment: "negative" }), // excluded
      row({ brand_mentioned: false, sentiment: "negative" }) // excluded
    ];
    expect(computeDominantBrandSentiment(rows)).toBe("positive");
  });

  it("2. zero brand_mentioned rows → null, even with plenty of sentiment data", () => {
    const rows: BrandSentimentInputRow[] = [
      row({ brand_mentioned: false, sentiment: "positive" }),
      row({ brand_mentioned: false, sentiment: "negative" }),
      row({ brand_mentioned: null, sentiment: "mixed" })
    ];
    expect(computeDominantBrandSentiment(rows)).toBeNull();
  });

  it("3. empty input → null", () => {
    expect(computeDominantBrandSentiment([])).toBeNull();
  });

  it("4. ties resolve to insertion order (first-seen wins), same as engine-breakdown.ts", () => {
    const rows: BrandSentimentInputRow[] = [
      row({ brand_mentioned: true, sentiment: "positive" }),
      row({ brand_mentioned: true, sentiment: "negative" })
    ];
    expect(computeDominantBrandSentiment(rows)).toBe("positive");

    // Reversed insertion order flips the winner — proves it's genuinely
    // insertion order, not e.g. alphabetical or enum order.
    const reversed: BrandSentimentInputRow[] = [
      row({ brand_mentioned: true, sentiment: "negative" }),
      row({ brand_mentioned: true, sentiment: "positive" })
    ];
    expect(computeDominantBrandSentiment(reversed)).toBe("negative");
  });

  it("5. a brand-mentioned row with sentiment 'unknown' contributes to no bucket", () => {
    const rows: BrandSentimentInputRow[] = [
      row({ brand_mentioned: true, sentiment: "unknown" }),
      row({ brand_mentioned: true, sentiment: "unknown" })
    ];
    expect(computeDominantBrandSentiment(rows)).toBeNull();

    // But a real sentiment among them still wins even if 'unknown' rows
    // outnumber it — 'unknown' never accumulates count of its own.
    const withOneReal: BrandSentimentInputRow[] = [
      row({ brand_mentioned: true, sentiment: "unknown" }),
      row({ brand_mentioned: true, sentiment: "unknown" }),
      row({ brand_mentioned: true, sentiment: "negative" })
    ];
    expect(computeDominantBrandSentiment(withOneReal)).toBe("negative");
  });

  it("6. a brand-mentioned row with sentiment: null contributes to no bucket", () => {
    const rows: BrandSentimentInputRow[] = [
      row({ brand_mentioned: true, sentiment: null }),
      row({ brand_mentioned: true, sentiment: "mixed" })
    ];
    expect(computeDominantBrandSentiment(rows)).toBe("mixed");
  });

  it("7. clear winner among several brand_mentioned rows with different sentiments", () => {
    const rows: BrandSentimentInputRow[] = [
      row({ brand_mentioned: true, sentiment: "negative" }),
      row({ brand_mentioned: true, sentiment: "negative" }),
      row({ brand_mentioned: true, sentiment: "negative" }),
      row({ brand_mentioned: true, sentiment: "positive" }),
      row({ brand_mentioned: false, sentiment: "positive" }) // excluded, would have tied
    ];
    expect(computeDominantBrandSentiment(rows)).toBe("negative");
  });
});
