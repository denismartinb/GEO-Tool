import { describe, expect, it } from "vitest";
import { MAX_REQUESTS, reviewPage } from "./review";
import type { AgenticFetchResult } from "@/lib/agentic-audit/fetch";

const PRODUCT = `<!doctype html><html lang="es"><head><title>Zapatillas Run X · Tienda</title>
<meta name="description" content="Zapatillas de running ligeras con amortiguación para asfalto, envío gratis en 24 horas.">
<link rel="canonical" href="https://shop.example.com/p/run-x">
<script type="application/ld+json">{"@type":"Product","name":"Run X","offers":{"@type":"Offer","price":"89.90","priceCurrency":"EUR","availability":"https://schema.org/InStock"}}</script>
</head><body><header><nav><a href="/precios">Precios</a></nav></header><main><h1>Run X</h1>
<p>Las Run X son unas zapatillas de running ligeras para asfalto, con amortiguación reactiva y suela de goma que dura más de mil kilómetros.</p>
<button>Añadir al carrito</button><a href="/devoluciones">Devoluciones</a></main></body></html>`;

function site(files: Record<string, { status: number; body: string; type?: string }>) {
  const calls: string[] = [];
  const fetch = async (url: string): Promise<AgenticFetchResult> => {
    calls.push(url);
    const path = new URL(url).pathname;
    const f = files[path] ?? { status: 404, body: "" };
    return { kind: "response", status: f.status, finalUrl: url, headers: { "content-type": f.type ?? "text/html" }, body: f.body, ms: 1 };
  };
  return { fetch, calls };
}

describe("reviewPage (the extension's review, on the server)", () => {
  it("scores a product page with the extension's own rules", async () => {
    const { fetch } = site({
      "/p/run-x": { status: 200, body: PRODUCT },
      "/robots.txt": { status: 200, body: "User-agent: *\nAllow: /\n", type: "text/plain" }
    });
    const out = await reviewPage("https://shop.example.com/p/run-x", { fetch, now: () => Date.parse("2026-11-01T12:00:00Z") });
    expect(out.kind).toBe("ok");
    if (out.kind !== "ok") return;
    const s = out.review.score;
    expect(s.commerce).toBe(true);
    expect(s.lanes.google).toBe(100);
    expect(s.say).toBe("Los cuatro motores pueden leerla, y Google la indexa.");
    // The lead paragraph and the buy button are seen even without layout.
    expect(s.criteria.find((c) => c.id === "lead")?.v).toBe(1);
    expect(s.criteria.find((c) => c.id === "buy")?.value).toBe("«Añadir al carrito»");
    expect(s.fixes.map((f) => f.id)).toContain("llms");
  });

  it("reports blocked engines from robots.txt", async () => {
    const { fetch } = site({
      "/p/run-x": { status: 200, body: PRODUCT },
      "/robots.txt": { status: 200, body: "User-agent: GPTBot\nDisallow: /\nUser-agent: OAI-SearchBot\nDisallow: /\n", type: "text/plain" }
    });
    const out = await reviewPage("shop.example.com/p/run-x", { fetch });
    expect(out.kind === "ok" && out.review.score.blockedEngines).toEqual(["chatgpt"]);
  });

  it("refuses what is not a public web address", async () => {
    const { fetch, calls } = site({});
    expect(await reviewPage("http://127.0.0.1/", { fetch })).toEqual({ kind: "failed", reason: "invalid_url" });
    expect(await reviewPage("javascript:alert(1)", { fetch })).toEqual({ kind: "failed", reason: "invalid_url" });
    expect(calls).toEqual([]);
  });

  it("says blocked when a bot wall answers, never a score", async () => {
    const { fetch } = site({ "/": { status: 403, body: "Just a moment..." } });
    expect(await reviewPage("https://shop.example.com/", { fetch })).toEqual({ kind: "failed", reason: "blocked" });
  });

  it("never reads more than MAX_REQUESTS files, all on the page's origin", async () => {
    const home = `<!doctype html><html><head><title>Tienda</title></head><body><main><h1>Tienda</h1>
      ${Array.from({ length: 30 }, (_, i) => `<a class="product-card" href="/productos/item-${i}">Item ${i}</a><span>${i}9,90 €</span>`).join("")}
      <a href="https://otra-web.example.org/p/1">fuera</a></main></body></html>`;
    const { fetch, calls } = site({ "/": { status: 200, body: home } });
    await reviewPage("https://shop.example.com/", { fetch });
    expect(calls.length).toBeLessThanOrEqual(MAX_REQUESTS);
    expect(calls.every((u) => new URL(u).origin === "https://shop.example.com")).toBe(true);
  });
});
