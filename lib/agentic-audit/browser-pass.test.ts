import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { pickAgenticTargets } from "./browser-pass";

const NOW = Date.parse("2026-11-03T10:00:00.000Z");
const res = (more: Record<string, unknown> = {}) => ({ found: "catalog", pageRead: true, ...more }) as never;
const row = (id: string, project_id: string, url: string, result: unknown, created_at = "2026-11-03T08:00:00Z") => ({ id, project_id, url, created_at, result: result as never });
const domains = new Map([
  ["p1", "acme.com"],
  ["p2", "https://www.b.com/"]
]);

describe("pickAgenticTargets (AGENTS-BROWSER-1, log §453)", () => {
  it("takes each project's newest review once, on its own domain", () => {
    const out = pickAgenticTargets(
      [row("n1", "p1", "https://acme.com/p", res()), row("o1", "p1", "https://acme.com/q", res()), row("n2", "p2", "https://shop.b.com/p", res())],
      domains,
      NOW
    );
    expect(out.map((t) => t.id)).toEqual(["n1", "n2"]);
  });

  it("skips fresh reads, pages that sell nothing, unread pages, other domains and archived projects", () => {
    const fresh = { state: "ok", measuredAt: "2026-11-01T00:00:00Z", cookies: false, price: { state: "exact", text: null }, options: "none", buy: { state: "named", text: null } };
    expect(pickAgenticTargets([row("a", "p1", "https://acme.com/p", res({ browser: fresh }))], domains, NOW)).toEqual([]);
    expect(pickAgenticTargets([row("a", "p1", "https://acme.com/p", res({ found: "none" }))], domains, NOW)).toEqual([]);
    expect(pickAgenticTargets([row("a", "p1", "https://acme.com/p", res({ pageRead: false }))], domains, NOW)).toEqual([]);
    expect(pickAgenticTargets([row("a", "p1", "https://evil.com/p", res())], domains, NOW)).toEqual([]);
    expect(pickAgenticTargets([row("a", "p9", "https://acme.com/p", res())], domains, NOW)).toEqual([]);
  });

  it("carries forward a fresh read of the same page from an earlier review", () => {
    const earlier = { state: "blocked", measuredAt: "2026-11-01T00:00:00Z" };
    const out = pickAgenticTargets([row("n", "p1", "https://acme.com/p", res()), row("o", "p1", "https://acme.com/p", res({ browser: earlier }))], domains, NOW);
    expect(out).toEqual([expect.objectContaining({ id: "n", carry: earlier })]);
    const otherPage = pickAgenticTargets([row("n", "p1", "https://acme.com/p", res()), row("o", "p1", "https://acme.com/x", res({ browser: earlier }))], domains, NOW);
    expect(otherPage[0].carry).toBeUndefined();
  });
});
