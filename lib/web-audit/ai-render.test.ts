import { describe, expect, it } from "vitest";
import { compareRender, isPageRender, renderIsFresh, RENDER_REFRESH_MS } from "./ai-render";

const prose = (n: number, seed = "texto") => Array.from({ length: n }, (_, i) => `${seed}${i}`).join(" ");
const AT = "2026-11-02T10:00:00.000Z";

const raw = `<html><body><header><nav>Inicio Tienda</nav></header><main>
  <h1>Etiopía Yirgacheffe</h1><p>${prose(60, "cafe")}</p>
  <div id="__next"></div><script>window.x = "${prose(30, "oculto")}"</script>
</main></body></html>`;

const rendered = `<html><body><header><nav>Inicio Tienda</nav></header><main>
  <h1>Etiopía Yirgacheffe</h1><p>${prose(60, "cafe")}</p>
  <div class="price-box"><p>1 kg · 24,90 €</p></div>
  <details><summary>¿Puedo pausar la suscripción un mes?</summary><p>Sí, desde tu cuenta cuando quieras.</p></details>
  <section class="reviews"><p>Llega en 24 h y el tueste es de esta semana</p></section>
  <table><tr><td>Altitud de cultivo</td><td>1.900 metros sobre el mar</td></tr></table>
  <div id="cookie-banner"><p>Usamos cookies para medir tu visita y mejorar la web</p></div>
</main></body></html>`;

describe("compareRender (AI-READ-2, log §451)", () => {
  it("measures the share of what a person sees that arrives in the HTML", () => {
    const r = compareRender(raw, rendered, AT);
    expect(r.state).toBe("ok");
    if (r.state !== "ok") return;
    expect(r.pct).toBeGreaterThan(70);
    expect(r.pct).toBeLessThan(100);
    expect(r.kinds.price).toEqual({ seen: 1, missing: 1 });
    expect(r.kinds.faq).toEqual({ seen: 2, missing: 2 });
    expect(r.kinds.review).toEqual({ seen: 1, missing: 1 });
    expect(r.kinds.spec).toEqual({ seen: 2, missing: 2 });
    expect(r.samples[0]).toEqual({ kind: "price", text: "1 kg · 24,90 €" });
  });

  it("never counts a cookie banner, a menu or a script as content", () => {
    const r = compareRender(raw, rendered, AT);
    if (r.state !== "ok") throw new Error("ok");
    expect(JSON.stringify(r.samples)).not.toMatch(/cookies|Tienda|oculto/);
  });

  it("skips consent text even inside an accordion with no telling class (log §462)", () => {
    const withBanner = rendered.replace(
      "</main>",
      `<div class="pd-panel"><details><summary>Cookies estrictamente necesarias</summary><p>4 proveedores pueden usar este propósito</p></details></div></main>`
    );
    const r = compareRender(raw, withBanner, AT);
    if (r.state !== "ok") throw new Error("ok");
    expect(r.kinds.faq).toEqual({ seen: 2, missing: 2 });
    expect(JSON.stringify(r.samples)).not.toMatch(/proveedores|Cookies/);
  });

  it("is 100 when everything arrives", () => {
    const r = compareRender(rendered, rendered, AT);
    expect(r.state === "ok" && r.pct).toBe(100);
    expect(r.state === "ok" && r.samples).toEqual([]);
  });

  it("does not compare a challenge page or a near-empty render", () => {
    const challenge = "<html><body><p>Checking your browser before accessing the site</p></body></html>";
    expect(compareRender(raw, challenge, AT).state).toBe("unmeasured");
    const big = `<html><body><p>${prose(400)}</p></body></html>`;
    const tiny = `<html><body><p>${prose(50)}</p></body></html>`;
    expect(compareRender(big, tiny, AT).state).toBe("unmeasured");
  });

  it("strips markup from samples and keeps them short", () => {
    const long = `<html><body><main><p>${prose(60, "cafe")}</p><p>${"precio especial de lanzamiento ".repeat(10)}</p></main></body></html>`;
    const r = compareRender(`<html><body><main><p>${prose(60, "cafe")}</p></main></body></html>`, long, AT);
    if (r.state !== "ok") throw new Error("ok");
    expect(r.samples[0].text.length).toBeLessThanOrEqual(80);
    expect(r.samples[0].text).not.toMatch(/[<>]/);
  });
});

describe("freshness", () => {
  it("keeps a good measurement a week and retries a failed one after a day", () => {
    const now = new Date(Date.parse(AT) + RENDER_REFRESH_MS - 1000);
    expect(renderIsFresh({ state: "ok", measuredAt: AT, pct: 90, words: 100, kinds: {}, samples: [] }, now)).toBe(true);
    expect(renderIsFresh({ state: "unmeasured", measuredAt: AT }, now)).toBe(false);
    expect(renderIsFresh(undefined, now)).toBe(false);
    expect(isPageRender({ state: "ok", measuredAt: AT, pct: 1 })).toBe(true);
    expect(isPageRender({ state: "ok", pct: 1 })).toBe(false);
  });
});

describe("block matching", () => {
  it("does not take a price as arrived because its numbers appear elsewhere", () => {
    const base = Array.from({ length: 60 }, (_, i) => `cafe${i}`).join(" ");
    const rawHtml = `<html><body><main><p>${base}</p><p>Envío en 24 h, 90 días de garantía y 1 kg de regalo</p></main></body></html>`;
    const renderedHtml = rawHtml.replace("</main>", "<p>1 kg · 24,90 €</p></main>");
    const r = compareRender(rawHtml, renderedHtml, AT);
    expect(r.state === "ok" && r.kinds.price).toEqual({ seen: 1, missing: 1 });
  });
});
