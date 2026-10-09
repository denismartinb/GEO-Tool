import { describe, expect, it } from "vitest";
import { estimateRowPx, paginateMatrix, type MatrixGroup } from "./report-pages";

function group(topic: string, n: number, text = "Pregunta corta"): MatrixGroup {
  return {
    topic,
    rows: Array.from({ length: n }, (_, i) => ({ promptId: `${topic}-${i}`, promptText: text, cells: [], page: null }))
  };
}

describe("paginateMatrix", () => {
  it("keeps a short map on one page", () => {
    const pages = paginateMatrix([group("A", 3), group("B", 2)]);
    expect(pages).toHaveLength(1);
    expect(pages[0].map((g) => [g.topic, g.rows.length, g.continued])).toEqual([
      ["A", 3, false],
      ["B", 2, false]
    ]);
  });

  it("splits a long map without losing a single question, marking the continued group", () => {
    const groups = [group("A", 30), group("B", 30, "x".repeat(150))];
    const pages = paginateMatrix(groups);
    expect(pages.length).toBeGreaterThan(1);
    const ids = pages.flatMap((p) => p.flatMap((g) => g.rows.map((r) => r.promptId)));
    expect(ids).toEqual(groups.flatMap((g) => g.rows.map((r) => r.promptId)));
    const continued = pages.slice(1).flatMap((p) => p).filter((g) => g.continued);
    expect(continued.length).toBeGreaterThan(0);
  });

  it("never fills a page past its room", () => {
    const pages = paginateMatrix([group("A", 60, "y".repeat(100))], 300, 400);
    for (const [i, page] of pages.entries()) {
      const used = page.reduce((sum, g) => sum + 30 + g.rows.reduce((s, r) => s + estimateRowPx(r.promptText), 0), 0);
      expect(used).toBeLessThanOrEqual(i === 0 ? 300 : 400);
    }
  });
});
