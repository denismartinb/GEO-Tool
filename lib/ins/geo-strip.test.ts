import { describe, expect, it } from "vitest";
import { buildSiteWeek, selectGeoStrip, type GeoStripSnapshot } from "./geo-strip";
import type { BotAccessReport } from "@/lib/web-audit/robots";
import type { PageAuditEntry } from "@/lib/web-audit/technical-audit";

const NOW = Date.parse("2026-11-02T12:00:00Z");
const tokens = (perplexity: boolean) => ({
  tokens: { "OAI-SearchBot": true, "ChatGPT-User": true, PerplexityBot: perplexity, "Perplexity-User": true },
  starRules: []
});
const bots = (perplexity = true, chatgptServer?: "allowed" | "blocked"): BotAccessReport =>
  ({
    robotsFound: true,
    bots: [],
    llmsTxtFound: true,
    llmsTxtBytes: 1,
    sitemapFound: true,
    aiBots: tokens(perplexity),
    ...(chatgptServer
      ? { serverProbe: { measuredAt: "x", baseline: "ok", engines: { chatgpt: { token: "OAI-SearchBot", state: chatgptServer, status: 200 } } } }
      : {})
  }) as BotAccessReport;
const page = (url: string, check: Record<string, unknown>): PageAuditEntry =>
  ({ url, contextLabel: "", status: "analyzed", check, fetchMs: 1, htmlBytes: 1 }) as unknown as PageAuditEntry;
const snap = (b: BotAccessReport, pages: PageAuditEntry[] = [], created_at = "2026-11-02T08:00:00Z"): GeoStripSnapshot => ({
  bots: b,
  pages,
  created_at
});

describe("selectGeoStrip (GEO-ALERTS-1, log §440)", () => {
  it("puts the server block above a robots.txt block, with its evidence tag", () => {
    const strip = selectGeoStrip({ projectId: "p", latest: snap(bots(false, "blocked")), previous: null, now: NOW });
    expect(strip).toMatchObject({ tone: "warm", title: "ChatGPT no puede entrar en tu web", evidence: "Simulación", more: "Y hay 1 freno más." });
    expect(strip?.cta?.href).toBe("/dashboard/projects/p/web-audit?bloque=geo");
  });

  it("shows JavaScript-only content in blue only when nothing blocks", () => {
    const js = [page("https://acme.com/tienda", { citability: { jsShell: true } })];
    expect(selectGeoStrip({ projectId: "p", latest: snap(bots(), js), previous: null, now: NOW })).toMatchObject({
      tone: "info",
      title: "La IA ve vacía tu página /tienda",
      evidence: "Comprobado"
    });
    expect(selectGeoStrip({ projectId: "p", latest: snap(bots(false), js), previous: null, now: NOW })?.tone).toBe("warm");
  });

  it("shows a closable green strip for a week after something got fixed", () => {
    const strip = selectGeoStrip({ projectId: "p", latest: snap(bots(true)), previous: snap(bots(false)), now: NOW });
    expect(strip).toMatchObject({ tone: "pos", title: "Perplexity ya puede leer tu web", evidence: null });
    expect(strip?.dismissKey).toContain("2026-11-02T08:00:00Z");
    expect(selectGeoStrip({ projectId: "p", latest: snap(bots(true)), previous: snap(bots(false)), now: NOW + 8 * 864e5 })).toBeNull();
  });

  it("says nothing without an audit or without news", () => {
    expect(selectGeoStrip({ projectId: "p", latest: null, previous: null, now: NOW })).toBeNull();
    expect(selectGeoStrip({ projectId: "p", latest: snap(bots()), previous: snap(bots()), now: NOW })).toBeNull();
  });
});

describe("buildSiteWeek", () => {
  it("only exists with something resolved or a block still open", () => {
    expect(buildSiteWeek({ projectId: "p", latest: snap(bots()), weekAgo: snap(bots()) })).toBeNull();
    expect(buildSiteWeek({ projectId: "p", latest: snap(bots(true)), weekAgo: snap(bots(false)) })).toEqual({
      resolved: "Perplexity ya puede leer tu web.",
      open: null
    });
    expect(buildSiteWeek({ projectId: "p", latest: snap(bots(false)), weekAgo: null })?.open?.title).toBe("Perplexity no puede leer tu web");
  });
});
