import { describe, expect, it } from "vitest";
import { normalizeTarget, runAgenticAudit, type AgenticFetcher } from "./run-audit";

const PRODUCT_HTML = `<html><head><script src="https://cdn.shopify.com/x.js"></script>
<script type="application/ld+json">{"@type":"Product","name":"X","gtin13":"1","offers":{"@type":"Offer","price":"9","priceCurrency":"EUR","availability":"InStock"}}</script>
</head><body><form action="/cart/add"><button>Añadir al carrito</button></form><p>${"Texto ".repeat(200)}</p></body></html>`;

type Route = { status: number; body?: string; type?: string; headers?: Record<string, string> };

function fakeFetch(routes: Record<string, Route>, requested: string[] = []): AgenticFetcher {
  return async (url) => {
    requested.push(url);
    const path = new URL(url).pathname + new URL(url).search;
    const route = routes[path];
    if (!route) return { kind: "response", status: 404, finalUrl: url, headers: {}, body: "", ms: 5 };
    return {
      kind: "response",
      status: route.status,
      finalUrl: url,
      headers: { "content-type": route.type ?? "text/html; charset=utf-8", ...route.headers },
      body: route.body ?? "",
      ms: 5
    };
  };
}

const allowAll = () => true;

describe("normalizeTarget", () => {
  it("accepts a bare domain, a www host or a full URL, and always uses https", () => {
    expect(normalizeTarget("tienda.es")).toMatchObject({ url: "https://tienda.es/", baseDomain: "tienda.es" });
    expect(normalizeTarget("http://www.tienda.es/p/1#x")).toMatchObject({
      url: "https://www.tienda.es/p/1",
      host: "www.tienda.es",
      baseDomain: "tienda.es"
    });
  });

  it("rejects what is not a public web address", () => {
    expect(normalizeTarget("")).toBeNull();
    expect(normalizeTarget("localhost")).toBeNull();
    expect(normalizeTarget("http://127.0.0.1/")).toBeNull();
    expect(normalizeTarget("https://user:pw@tienda.es")).toBeNull();
    expect(normalizeTarget("https://tienda.es:8080/")).toBeNull();
  });
});

describe("runAgenticAudit", () => {
  it("scores a readable product page and only requests the fixed list of URLs", async () => {
    const requested: string[] = [];
    const out = await runAgenticAudit("tienda.es/p", {
      fetch: fakeFetch(
        {
          "/p": { status: 200, body: PRODUCT_HTML },
          "/robots.txt": { status: 200, body: "User-agent: *\nAllow: /", type: "text/plain" },
          "/sitemap.xml": { status: 200, body: "<urlset></urlset>", type: "application/xml" },
          "/products.json?limit=1": { status: 200, body: '{"products":[{"id":1}]}', type: "application/json" }
        },
        requested
      ),
      tokenAllowed: allowAll
    });
    expect(out.status).toBe("completed");
    if (out.status !== "completed") return;
    expect(out.result.pageKind).toBe("product");
    expect(out.result.score).not.toBeNull();
    expect(out.result.interop.items.find((i) => i.id === "feed")?.state).toBe("found");
    const paths = requested.map((u) => new URL(u).pathname).sort();
    expect(paths).toEqual(
      [
        "/.well-known/agent-card.json",
        "/.well-known/agent.json",
        "/.well-known/mcp.json",
        "/.well-known/ucp",
        "/p",
        "/products.json",
        "/robots.txt",
        "/sitemap.xml"
      ].sort()
    );
  });

  it("a challenged page completes with pageRead false and no total", async () => {
    const out = await runAgenticAudit("tienda.es", {
      fetch: fakeFetch({ "/": { status: 403, body: "Just a moment...", headers: { "cf-mitigated": "challenge" } } }),
      tokenAllowed: allowAll
    });
    expect(out.status).toBe("completed");
    if (out.status !== "completed") return;
    expect(out.result.challenge).toBe(true);
    expect(out.result.pageRead).toBe(false);
    expect(out.result.score).toBeNull();
  });

  it("an unreachable page fails, and an invalid input never fetches", async () => {
    const unreachable = await runAgenticAudit("tienda.es", {
      fetch: async () => ({ kind: "error", reason: "timeout" }),
      tokenAllowed: allowAll
    });
    expect(unreachable).toEqual({ status: "failed", error: "site_unreachable" });

    const requested: string[] = [];
    const invalid = await runAgenticAudit("no es una web", { fetch: fakeFetch({}, requested), tokenAllowed: allowAll });
    expect(invalid).toEqual({ status: "failed", error: "invalid_url" });
    expect(requested).toEqual([]);
  });

  it("a 404 product page fails instead of scoring an error page", async () => {
    const out = await runAgenticAudit("tienda.es/no-existe", { fetch: fakeFetch({}), tokenAllowed: allowAll });
    expect(out).toEqual({ status: "failed", error: "site_unreachable" });
  });
});
