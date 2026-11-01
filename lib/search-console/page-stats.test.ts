import { describe, expect, it } from "vitest";
import { affectedPagesWithGoogle, buildPageStats } from "./insights";

const pages = [
  { page: "https://www.genscore.es/", clicks: 14, impressions: 300, position: 21.34 },
  { page: "https://www.genscore.es/blog/que-es-geo/", clicks: 4, impressions: 90, position: 8.61 },
  { page: "https://www.genscore.es/precios", clicks: 0, impressions: 40, position: 34.2 }
];
const qp = [
  { query: "genscore", page: "https://www.genscore.es/", clicks: 12, impressions: 50, position: 1.2 },
  { query: "geo tool", page: "https://www.genscore.es/", clicks: 2, impressions: 80, position: 9 },
  { query: "qué es geo", page: "https://www.genscore.es/blog/que-es-geo/", clicks: 4, impressions: 60, position: 8 },
  { query: "precio geo", page: "https://www.genscore.es/precios", clicks: 0, impressions: 30, position: 30 }
];

describe("buildPageStats", () => {
  it("keeps each page's figures and the search with the most clicks", () => {
    const s = buildPageStats(pages, qp, 50);
    expect(s.complete).toBe(true);
    expect(s.pages.find((p) => p.key === "genscore.es/")).toMatchObject({ clicks: 14, position: 21.3, topQuery: "genscore" });
    // No clicks: no search is named as the one that brings it.
    expect(s.pages.find((p) => p.key === "genscore.es/precios")?.topQuery).toBeNull();
  });

  it("is incomplete when Google filled the row limit", () => {
    expect(buildPageStats(pages, qp, 3).complete).toBe(false);
  });
});

describe("affectedPagesWithGoogle", () => {
  const urls = ["https://genscore.es/precios", "https://genscore.es/sin-datos", "https://www.genscore.es/", "https://genscore.es/blog/que-es-geo"];

  it("sorts by clicks and matches with or without www and trailing slash", () => {
    const rows = affectedPagesWithGoogle(urls, buildPageStats(pages, qp, 50));
    expect(rows.map((r) => r.url)).toEqual([
      "https://www.genscore.es/",
      "https://genscore.es/blog/que-es-geo",
      "https://genscore.es/precios",
      "https://genscore.es/sin-datos"
    ]);
    expect(rows[0]).toMatchObject({ kind: "seen", clicks: 14, topQuery: "genscore" });
  });

  it("says a missing page had no impressions only when Google returned every page", () => {
    expect(affectedPagesWithGoogle(urls, buildPageStats(pages, qp, 50)).at(-1)?.kind).toBe("unseen");
    expect(affectedPagesWithGoogle(urls, buildPageStats(pages, qp, 3)).at(-1)?.kind).toBe("unknown");
  });
});
