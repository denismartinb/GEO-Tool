import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/search-console/load", () => ({ loadSearchConsoleScreen: vi.fn() }));
vi.mock("@/lib/search-console/screen-inputs", () => ({ readSearchConsoleInputs: vi.fn() }));
vi.mock("@/app/dashboard/projects/[projectId]/actions", () => ({ addPrompts: vi.fn() }));

import { GoogleRecCard } from "./google-recs";

const render = (rec: Parameters<typeof GoogleRecCard>[0]["rec"]) =>
  renderToStaticMarkup(<GoogleRecCard rec={rec} projectId="p1" />);

describe("GoogleRecCard (log §293)", () => {
  it("names the page-2 query, its page and the page-1 pages to link from", () => {
    const html = render({
      kind: "push_page_one",
      query: "aparecer en chatgpt",
      position: 12.4,
      impressions: 12210,
      page: "https://ex.com/blog/aparecer",
      linkFrom: ["https://ex.com/", "https://ex.com/blog/que-es-geo"]
    });
    expect(html).toContain("Sube «aparecer en chatgpt» a la primera página de Google");
    expect(html).toContain("puesto 12,4 con /blog/aparecer");
    expect(html).toContain("12.210 veces en 28 días");
    expect(html).toContain("tu Home y /blog/que-es-geo, que ya están en la página 1.");
    expect(html).toContain('href="/dashboard/projects/p1/search-console"');
  });

  it("falls back to the site's most visited pages when none is on page 1", () => {
    const html = render({ kind: "push_page_one", query: "x", position: 15, impressions: 1, page: null, linkFrom: [] });
    expect(html).toContain("la página que sale");
    expect(html).toContain("1 vez en 28 días");
    expect(html).toContain("tus páginas más visitadas.");
  });

  it("compares the CTR with the site's own queries in the same tier, never an industry curve", () => {
    const html = render({
      kind: "improve_snippet",
      query: "precio herramienta geo",
      position: 3.2,
      impressions: 11240,
      ctr: 0.008,
      benchmark: 0.1,
      page: "https://ex.com/precios"
    });
    expect(html).toContain("Mejora el título de /precios: la ven 11.240 veces y entra el 0,8%");
    expect(html).toContain("Tus otras búsquedas en los puestos 4 a 10 entran alrededor del 10,0%");
  });

  it("offers to watch an untracked Google question in the AI scan", () => {
    const html = render({ kind: "watch_in_ai", query: "cuál es la mejor herramienta geo", position: 9.1, impressions: 300 });
    expect(html).toContain("Vigila en la IA «cuál es la mejor herramienta geo»");
    expect(html).toContain("(puesto 9,1)");
    expect(html).toContain("Vigilar prompt");
  });
});
