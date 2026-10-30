import { describe, expect, it } from "vitest";
import {
  buildOrigins,
  citationsLead,
  filterPages,
  percentShares,
  tabCounts,
  type PageItem,
} from "@/lib/ins/citations-model";

const page = (id: string, category: PageItem["category"], title = id, domain = "x.com"): PageItem => ({
  id,
  title,
  url: `${domain}/${id}`,
  domain,
  cited: 1,
  category,
  typeLabel: "",
});

describe("percentShares", () => {
  it("adds up to exactly 100", () => {
    expect(percentShares([1, 1, 1]).reduce((a, b) => a + b, 0)).toBe(100);
    expect(percentShares([4, 14, 17, 65]).reduce((a, b) => a + b, 0)).toBe(100);
  });
  it("is all zeros with nothing to share", () => {
    expect(percentShares([0, 0])).toEqual([0, 0]);
  });
});

describe("buildOrigins", () => {
  it("splits third parties by whether the answer named the brand", () => {
    const g = buildOrigins(
      [
        { category: "brand", brandMentioned: "yes" },
        { category: "competitor", brandMentioned: "no" },
        { category: "third_party", brandMentioned: "yes" },
        { category: "third_party", brandMentioned: "no" },
        { category: "third_party", brandMentioned: "na" },
      ],
      "a.es",
    );
    expect(g.map((x) => x.pages)).toEqual([1, 1, 1, 2]);
    expect(g.reduce((s, x) => s + x.percent, 0)).toBe(100);
  });
});

describe("filterPages / tabCounts", () => {
  const items = [page("a", "brand", "Precios"), page("b", "competitor"), page("c", "third_party", "Guía de facturación")];
  it("filters by tab and by accent-insensitive query", () => {
    expect(filterPages(items, "Tuyas", "").map((i) => i.id)).toEqual(["a"]);
    expect(filterPages(items, "Todas", "guia").map((i) => i.id)).toEqual(["c"]);
  });
  it("counts each tab", () => {
    expect(tabCounts(items)).toEqual({ Todas: 3, Tuyas: 1, Competidores: 1, Terceros: 1 });
  });
});

describe("citationsLead", () => {
  it("says nothing without citations", () => {
    expect(citationsLead({ totalCited: 0, own: 0, reachable: 3 })).toEqual([]);
  });
  it("never claims own citations when there are none", () => {
    const text = citationsLead({ totalCited: 10, own: 0, reachable: 2 }).map((p) => p.text).join("");
    expect(text).toContain("Ninguna de las citas apunta a tu web");
    expect(text).toContain("2 webs alcanzables");
  });
  it("uses the real share when some citations are own", () => {
    const text = citationsLead({ totalCited: 10, own: 1, reachable: 0 }).map((p) => p.text).join("");
    expect(text).toContain("10% de las citas");
  });
});
