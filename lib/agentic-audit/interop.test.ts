import { describe, expect, it } from "vitest";
import { buildInterop, interopProbePaths, profileDeclaresMcp, type InteropProbes } from "./interop";

const absent = { state: "absent" as const, body: null };
const unknown = { state: "unknown" as const, body: null };
const found = (body: unknown) => ({ state: "found" as const, body: JSON.stringify(body) });

function probes(over: Partial<InteropProbes>): InteropProbes {
  return { ucp: absent, mcpCard: absent, agentCard: absent, agentCardLegacy: absent, feed: null, feedPlatform: null, ...over };
}

describe("buildInterop", () => {
  it("counts out of four", () => {
    const r = buildInterop(probes({}));
    expect(r.total).toBe(4);
    expect(r.found).toBe(0);
  });

  it("a UCP profile that declares MCP counts both", () => {
    const r = buildInterop(probes({ ucp: found({ services: { shopping: { transports: ["rest", "mcp"] } } }) }));
    expect(r.items.find((i) => i.id === "ucp")?.state).toBe("found");
    expect(r.items.find((i) => i.id === "mcp")?.state).toBe("found");
    expect(r.found).toBe(2);
  });

  it("an HTML page served at a well-known path is not a profile", () => {
    const r = buildInterop(probes({ ucp: { state: "found", body: "<html>404</html>" } }));
    expect(r.items.find((i) => i.id === "ucp")?.state).toBe("absent");
  });

  it("reads the legacy agent card when the new one is missing", () => {
    const r = buildInterop(probes({ agentCardLegacy: found({ name: "Tienda", skills: [] }) }));
    expect(r.items.find((i) => i.id === "a2a")?.state).toBe("found");
  });

  it("a feed we cannot see is unknown, never absent", () => {
    const r = buildInterop(probes({}));
    expect(r.items.find((i) => i.id === "feed")?.state).toBe("unknown");
  });

  it("reads Shopify's public catalogue", () => {
    const r = buildInterop(probes({ feed: found({ products: [{ id: 1 }] }), feedPlatform: "Shopify" }));
    expect(r.items.find((i) => i.id === "feed")?.state).toBe("found");
  });

  it("a blocked well-known file is unknown", () => {
    const r = buildInterop(probes({ ucp: unknown, mcpCard: unknown }));
    expect(r.items.find((i) => i.id === "ucp")?.state).toBe("unknown");
    expect(r.items.find((i) => i.id === "mcp")?.state).toBe("unknown");
  });
});

describe("profileDeclaresMcp", () => {
  it("finds an mcp key or endpoint", () => {
    expect(profileDeclaresMcp({ mcp: { endpoint: "https://x" } })).toBe(true);
    expect(profileDeclaresMcp({ endpoints: ["https://shop.example/api/mcp"] })).toBe(true);
    expect(profileDeclaresMcp({ transports: ["rest"] })).toBe(false);
  });
});

describe("interopProbePaths", () => {
  it("is a fixed list: only well-known files, plus one catalogue URL on known platforms", () => {
    expect(interopProbePaths(null).feed).toBeNull();
    expect(interopProbePaths("Shopify").feed).toBe("/products.json?limit=1");
    expect(interopProbePaths("WooCommerce").feed).toContain("/wp-json/wc/store/v1/products");
    for (const path of Object.values(interopProbePaths("Shopify"))) {
      expect(path?.startsWith("/")).toBe(true);
    }
  });
});
