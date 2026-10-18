import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { QueryView } from "@/lib/search-console/report";
import { GscQueries, sortQueries } from "./gsc-queries";

const q = (query: string, position: number, clicks: number, impressions: number): QueryView => ({
  query,
  position,
  movement: null,
  clicks,
  impressions,
  ctr: impressions > 0 ? clicks / impressions : 0,
  nearPage1: position > 10 && position <= 20
});

const ROWS = [q("geo vs aeo", 3, 0, 4), q("genscore", 1.2, 9, 38), q("llmso", 35, 0, 3), q("aeo", 1, 1, 2)];

describe("sortQueries (log §329)", () => {
  it("sorts by query A–Z and back", () => {
    expect(sortQueries(ROWS, "query", "asc").map((r) => r.query)).toEqual(["aeo", "genscore", "geo vs aeo", "llmso"]);
    expect(sortQueries(ROWS, "query", "desc").map((r) => r.query)).toEqual(["llmso", "geo vs aeo", "genscore", "aeo"]);
  });
  it("sorts by position, best first on asc", () => {
    expect(sortQueries(ROWS, "position", "asc").map((r) => r.position)).toEqual([1, 1.2, 3, 35]);
  });
  it("sorts by clicks and breaks ties by impressions", () => {
    expect(sortQueries(ROWS, "clicks", "desc").map((r) => r.query)).toEqual(["genscore", "aeo", "geo vs aeo", "llmso"]);
  });
  it("does not mutate its input", () => {
    const copy = [...ROWS];
    sortQueries(ROWS, "position", "desc");
    expect(ROWS).toEqual(copy);
  });
});

describe("GscQueries", () => {
  it("renders sortable headers with arrows and every column (none hidden on mobile)", () => {
    const html = renderToStaticMarkup(<GscQueries queries={ROWS} />);
    expect(html).toContain('aria-label="Ordenar por búsqueda"');
    expect(html).toContain('aria-label="Ordenar por puesto"');
    expect(html).toContain('aria-label="Ordenar por clics"');
    expect(html).toContain('aria-label="Ordenar por impresiones"');
    expect(html).toContain("↕");
    expect(html).toContain('aria-sort="descending"');
    expect(html).not.toContain("gsc-hide-m");
  });
  it("starts with the most-seen search first", () => {
    const html = renderToStaticMarkup(<GscQueries queries={ROWS} />);
    expect(html.indexOf("genscore")).toBeLessThan(html.indexOf("geo vs aeo"));
  });
});
