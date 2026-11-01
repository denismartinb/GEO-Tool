import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/search-console/load", () => ({ loadSearchConsoleScreen: vi.fn() }));

import { GscOverviewHalfView, type GscOverviewHalfState as SearchConsoleOverview } from "./gsc-overview-half";

const P = "11111111-1111-4111-8111-111111111111";
const render = (state: SearchConsoleOverview) => renderToStaticMarkup(<GscOverviewHalfView projectId={P} state={state} />);

function ready(overrides: Partial<Extract<SearchConsoleOverview, { kind: "ready" }>["report"]> = {}): SearchConsoleOverview {
  return {
    kind: "ready",
    report: {
      clicks: { value: 1045, deltaPct: 12.4 },
      impressions: { value: 30120, deltaPct: 8 },
      position: { value: 9.6, delta: 1.3 },
      daily: [
        { date: "2026-10-04", clicks: 30, impressions: 900, position: 11.2 },
        { date: "2026-10-05", clicks: 0, impressions: 0 },
        { date: "2026-10-06", clicks: 41, impressions: 1100, position: 9.1 },
        { date: "2026-10-31", clicks: 38, impressions: 1000, position: 9.4 }
      ],
      nearPage1: [
        { query: "a", position: 12, movement: null, clicks: 0, impressions: 10, ctr: 0, nearPage1: true },
        { query: "b", position: 15, movement: null, clicks: 0, impressions: 5, ctr: 0, nearPage1: true }
      ],
      empty: false,
      ...overrides
    }
  };
}

describe("GscOverviewHalfView", () => {
  it("shows clicks with their change, position with its move, impressions and the daily line", () => {
    const html = render(ready());
    expect(html).toContain("1045");
    expect(html).toContain("+12%");
    expect(html).toContain("9,6");
    expect(html).toContain("▲ 1,3");
    expect(html).toContain("30.120");
    expect(html).toContain("Impresiones · +8%");
    expect(html).toContain("gx-sp");
  });

  it("draws the position over time with a gap for a day without impressions, never a 0", () => {
    const html = render(ready());
    expect(html).toContain("Evolución del puesto");
    expect(html).toContain("4 oct");
    expect(html).toContain("31 oct");
    // 2026-10-05 has no impressions: the line breaks there.
    expect(html.match(/<circle /g)?.length).toBe(1);
    expect(html.match(/<polyline /g)?.length).toBe(2);
  });

  it("lists the nearest page-1 searches with Denis's line", () => {
    const html = render(ready());
    expect(html).toContain("Casi en la página 1");
    expect(html).toContain("12,0");
    expect(html).toContain("Las más fáciles de subir. Ya te ven, hay que optimizarlas.");
  });

  it("invites to connect when there is no connection, straight to Google", () => {
    const html = render({ kind: "disconnected" });
    expect(html).toContain("Añade lo que ve Google");
    expect(html).toContain("Conectar con Google");
    expect(html).toContain(`/api/search-console/connect?projectId=${P}`);
    // GSC-CONNECT-CTA-1 (log §313): no example figures behind the invitation.
    expect(html.slice(html.indexOf("Añade")).replace(/<[^>]*>/g, "").replace(/página 1/g, "")).not.toMatch(/\d/);
    expect(render({ kind: "reconnect", reason: "revoked" })).toContain("Volver a conectar");
  });

  it("renders nothing when the feature cannot work, and says so when Google gave nothing", () => {
    expect(render({ kind: "not_configured" })).toBe("");
    expect(render({ kind: "unavailable" })).toBe("");
    expect(render({ kind: "error", category: "timeout" })).toContain("Google no ha respondido");
    const empty = render(ready({ empty: true }));
    expect(empty).toContain("no ha devuelto búsquedas");
    expect(empty).not.toMatch(/clics<\/small>/);
  });

  it("hides deltas, the chart and the page-1 box when Google cannot support them", () => {
    const html = render(
      ready({
        clicks: { value: 3, deltaPct: null },
        impressions: { value: 40, deltaPct: null },
        position: { value: 20, delta: null },
        daily: [{ date: "2026-10-31", clicks: 3, impressions: 40, position: 20 }],
        nearPage1: []
      })
    );
    expect(html).not.toContain("%");
    expect(html).not.toContain("▲");
    expect(html).not.toContain("Evolución del puesto");
    expect(html).not.toContain("Casi en la página 1");
    expect(html).not.toContain("gx-b");
  });
});
