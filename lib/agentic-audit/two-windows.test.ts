import { describe, expect, it } from "vitest";
import type { AgenticCheckResult, AgenticComponentResult } from "./api-contract";
import type { AgenticBrowserRead } from "./browser-obstacles";
import { browserCheckNotes, twoWindows } from "./two-windows";

const AT = "2026-11-03T09:00:00.000Z";

function c(id: string, state: "pass" | "avg" | "fail" | "unknown") {
  return { id, state, label: id, fix: "", points: 10 };
}

function result(more: Partial<AgenticCheckResult> = {}): AgenticCheckResult {
  const components = [
    { id: "discovery", name: "Descubrimiento", weight: 30, score: 90, checks: [c("no_captcha", "pass")] },
    { id: "understanding", name: "Comprensión", weight: 30, score: 10, checks: [c("product_data", "fail"), c("price", "fail"), c("availability", "fail")] },
    { id: "trust", name: "Confianza", weight: 20, score: 60, checks: [] },
    { id: "purchase", name: "Compra", weight: 20, score: 0, checks: [c("add_to_cart", "fail")] }
  ] as unknown as AgenticComponentResult[];
  return {
    domain: "nubaria.es",
    url: "https://nubaria.es/cafeteras/duo",
    pageKind: "product",
    pageRead: true,
    score: 40,
    components,
    interop: { found: 0, total: 4, items: [] },
    agents: [],
    challenge: false,
    fixes: [],
    platform: null,
    facts: { title: "Cafetera Nubaria Duo", productName: "Cafetera Nubaria Duo", brand: null, price: null, availability: null, rating: null },
    found: "catalog",
    ...more
  } as AgenticCheckResult;
}

const ok = (more: Partial<Extract<AgenticBrowserRead, { state: "ok" }>> = {}): AgenticBrowserRead => ({
  state: "ok",
  measuredAt: AT,
  cookies: true,
  cookieCover: true,
  price: { state: "exact", text: "149,00 €" },
  options: "none",
  buy: { state: "named", text: "Añadir a la cesta" },
  name: "Cafetera Nubaria Duo",
  stock: "En stock",
  productData: true,
  ...more
});

describe("twoWindows (AGENTS-BROWSER-1 PR 2)", () => {
  it("says what exists only with JavaScript, point by point", () => {
    const w = twoWindows(result({ browser: ok() }));
    if (w.state !== "measured") throw new Error("measured");
    expect(w.rows.map((r) => `${r.pin ?? "-"}:${r.id}:${r.raw.text}|${r.nav.text}`)).toEqual([
      "-:name:Cafetera Nubaria Duo|Cafetera Nubaria Duo",
      "1:price:No aparece|149,00 €",
      "2:stock:No aparece|En stock",
      "3:buy:No aparece|«Añadir a la cesta»",
      "4:data:No están|Los añade un script",
      "5:challenge:Ninguno|Ninguno",
      "6:cover:No aplica|Aviso de cookies encima"
    ]);
    // Log §458: what «Punto por punto» prints is a sentence, never «Están» or «Nada» alone.
    expect(w.rows.map((r) => `${r.raw.say ?? r.raw.text}|${r.nav.say ?? r.nav.text}`)).toEqual([
      "Cafetera Nubaria Duo|Cafetera Nubaria Duo",
      "No ve el precio|Ve 149,00 €",
      "No sabe si queda|Ve «En stock»",
      "No ve ningún botón|Ve el botón «Añadir a la cesta»",
      "La página no los declara|Los añade un script al cargar",
      "Entra sin reto|Entra sin reto",
      "Sin navegador no salen avisos|Un aviso de cookies la tapa hasta aceptarlo"
    ]);
    expect(w.rows.filter((r) => r.gap).map((r) => r.id)).toEqual(["price", "stock", "buy", "data"]);
    expect(w.read.foot).toBe("No sabe cuánto cuesta ni si queda ni ve el botón");
    expect(w.nav.foot).toBe("Llega a comprar, tras aceptar las cookies");
    expect(w.nav.cookiesPin).toBe(6);
    expect(w.verdict?.title).toBe("Tu precio, tu stock y tu botón existen, pero sólo con JavaScript.");
    expect(w.fixes.map((f) => f.title)).toEqual([
      "Pon el precio, el stock y el botón en el HTML que sirve el servidor",
      "Escribe los datos del producto en el HTML, no con un script",
      "Que el aviso de cookies no tape la ficha"
    ]);
  });

  it("does not blame JavaScript for what the browser does not see either", () => {
    const w = twoWindows(result({ browser: ok({ price: { state: "missing", text: null }, cookies: false }) }));
    if (w.state !== "measured") throw new Error("measured");
    expect(w.verdict?.title).toBe("Tu stock y tu botón existen, pero sólo con JavaScript.");
    expect(w.fixes.map((f) => f.title)).toContain("Pon el precio a la vista en la ficha");
    expect(w.nav.foot).toBe("Ve el botón, pero no el precio");
  });

  it("has no verdict when the HTML already carries everything", () => {
    const pass = result({
      facts: { title: null, productName: "Duo", brand: null, price: "149 EUR", availability: "En stock", rating: null },
      browser: ok({ cookies: false })
    });
    for (const comp of pass.components) for (const k of comp.checks) (k as { state: string }).state = "pass";
    const w = twoWindows(pass);
    if (w.state !== "measured") throw new Error("measured");
    expect(w.verdict).toBeNull();
    expect(w.fixes).toEqual([]);
    expect(w.read.foot).toBe("Tiene lo que necesita para comprar");
    expect(w.rows.find((r) => r.id === "data")?.nav.text).toBe("Están");
  });

  it("never invents a browser reading", () => {
    expect(twoWindows(result())).toMatchObject({ state: "measuring" });
    expect(twoWindows(result({ browser: { state: "blocked", measuredAt: AT } }))).toMatchObject({ state: "blocked" });
    // A read stored before the extra fields leaves those rows unmeasured.
    const old = ok();
    delete (old as { stock?: unknown }).stock;
    delete (old as { productData?: unknown }).productData;
    const w = twoWindows(result({ browser: old }));
    if (w.state !== "measured") throw new Error("measured");
    expect(w.rows.find((r) => r.id === "stock")?.nav.tone).toBe("na");
    expect(w.rows.find((r) => r.id === "data")?.gap).toBe(false);
  });

  it("writes no long dashes", () => {
    expect(JSON.stringify(twoWindows(result({ browser: ok({ buy: { state: "unnamed", text: null } }) })))).not.toMatch(/—/);
  });
});

describe("browserCheckNotes", () => {
  it("tells a value that arrives late from one that is missing", () => {
    expect(browserCheckNotes(result({ browser: ok() }))).toMatchObject({
      price: "Con navegador sí se ve (149,00 €): sólo llega con JavaScript. Sírvelo en el HTML.",
      add_to_cart: "Con navegador sí se ve («Añadir a la cesta»): sólo llega con JavaScript."
    });
    expect(browserCheckNotes(result({ browser: ok({ price: { state: "missing", text: null } }) })).price).toMatch(/^Tampoco/);
    expect(browserCheckNotes(result())).toEqual({});
  });
});
