import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/search-console/load", () => ({ loadSearchConsoleOverview: vi.fn() }));

import { GscOverviewHalfView } from "./gsc-overview-half";
import type { SearchConsoleOverview } from "@/lib/search-console/load";

const P = "11111111-1111-4111-8111-111111111111";
const render = (state: SearchConsoleOverview) => renderToStaticMarkup(<GscOverviewHalfView projectId={P} state={state} />);

function ready(overrides: Partial<Extract<SearchConsoleOverview, { kind: "ready" }>["report"]> = {}): SearchConsoleOverview {
  return {
    kind: "ready",
    report: {
      clicks: { value: 1045, deltaPct: 12.4 },
      position: { value: 9.6, delta: 1.3 },
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
  it("shows the clicks, position and page-2 count Google returned", () => {
    const html = render(ready());
    expect(html).toContain("1045");
    expect(html).toContain("+12%");
    expect(html).toContain("9,6");
    expect(html).toContain("▲ 1,3");
    expect(html).toContain(">2<");
    expect(html).toContain("búsquedas en la página 2");
    expect(html).toContain(`/dashboard/projects/${P}/search-console`);
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

  it("renders nothing it could not honestly fill", () => {
    expect(render({ kind: "not_configured" })).toBe("");
    expect(render({ kind: "unavailable" })).toBe("");
    expect(render({ kind: "error", category: "timeout" })).toBe("");
    expect(render(ready({ empty: true }))).toBe("");
  });

  it("hides deltas Google cannot support", () => {
    const html = render(ready({ clicks: { value: 3, deltaPct: null }, position: { value: 20, delta: null }, nearPage1: [] }));
    expect(html).not.toContain("%");
    expect(html).not.toContain("▲");
    expect(html).not.toContain("en la página 2 de Google");
  });
});
