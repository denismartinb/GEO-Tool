import { describe, expect, it } from "vitest";
import type { AgenticCheckResult, AgenticComponentResult } from "./api-contract";
import { agentLanes } from "./agent-lanes";
import type { AgenticBrowserRead } from "./browser-obstacles";

const AT = "2026-11-03T09:00:00.000Z";

function comp(id: AgenticComponentResult["id"], score: number | null, label = "Bien"): AgenticComponentResult {
  return {
    id,
    name: id,
    weight: 25,
    score,
    checks: [{ id: `${id}-c`, state: score === null ? "unknown" : score >= 80 ? "pass" : score >= 50 ? "avg" : "fail", label, weight: 1 }]
  } as unknown as AgenticComponentResult;
}

function result(more: Partial<AgenticCheckResult> = {}): AgenticCheckResult {
  return {
    domain: "nubaria.es",
    url: "https://nubaria.es/chaqueta-brisa",
    pageKind: "product",
    pageRead: true,
    score: 60,
    components: [comp("discovery", 90), comp("understanding", 30, "Sin precio ni stock"), comp("trust", 60, "Devoluciones enlazadas"), comp("purchase", 20, "No vemos un botón de compra claro")],
    interop: { found: 0, total: 4, items: [] },
    agents: [],
    challenge: false,
    fixes: [{ component: "understanding", checkId: "understanding-c", label: "Pon el precio en el HTML", points: 10 }] as never,
    platform: null,
    facts: { title: "Chaqueta Brisa", productName: "Chaqueta Brisa", brand: null, price: null, availability: null, rating: null },
    found: "catalog",
    ...more
  };
}

const ok = (more: Partial<Extract<AgenticBrowserRead, { state: "ok" }>> = {}): AgenticBrowserRead => ({
  state: "ok",
  measuredAt: AT,
  cookies: true,
  cookieCover: true,
  price: { state: "from", text: "Desde 129,00 €" },
  options: "unlabeled",
  buy: { state: "named", text: "Añadir a la cesta" },
  ...more
});

describe("agentLanes (AGENTS-BROWSER-1, log §453)", () => {
  it("readers stop where the stored review fails; browsers go further", () => {
    const lanes = agentLanes(result({ browser: ok() }));
    expect(lanes.read.reach).toEqual({ tone: "bad", label: "Se quedan en Entra" });
    expect(lanes.nav.stations.map((s) => s.tone)).toEqual(["ok", "warn", "warn", "warn"]);
    expect(lanes.nav.reach).toEqual({ tone: "warn", label: "Llegan a Compra" });
  });

  it("says the price only arrives with JavaScript when the raw page has none and the browser sees one", () => {
    expect(agentLanes(result({ browser: ok() })).readBrake).toEqual({ title: "No les llega tu precio", line: "Está en la ficha, pero sólo con JavaScript." });
    const raw = result({ browser: ok(), facts: { title: null, productName: null, brand: null, price: "149 EUR", availability: null, rating: null } });
    expect(agentLanes(raw).readBrake).toEqual({ title: "Pon el precio en el HTML", line: "Sin precio ni stock" });
  });

  it("orders obstacles by what frena, then what cuesta, and picks the browsers' brake from the first", () => {
    const lanes = agentLanes(result({ browser: ok({ buy: { state: "missing", text: null } }) }));
    expect(lanes.obstacles.map((o) => `${o.id}:${o.word}`)).toEqual(["buy:Frena", "cookies:Cuesta", "price:Cuesta", "options:Cuesta", "challenge:Bien"]);
    expect(lanes.navBrake).toEqual({ title: "No encuentran el botón de compra", line: "No vemos un botón para comprar o contratar." });
    expect(lanes.nav.reach).toEqual({ tone: "bad", label: "Se quedan en Se fía" });
    expect(lanes.navSteps.map((s) => s.key)).toEqual(["buy-missing", "price-from"]);
  });

  it("has no brake and no steps when nothing stands in the way, and hides options it did not see", () => {
    const lanes = agentLanes(result({ browser: ok({ cookies: false, price: { state: "exact", text: "149,00 €" }, options: "none" }) }));
    expect(lanes.navBrake).toBeNull();
    expect(lanes.navSteps).toEqual([]);
    expect(lanes.obstacles.some((o) => o.id === "options")).toBe(false);
    expect(lanes.nav.stations[3]).toMatchObject({ tone: "ok", line: "«Añadir a la cesta» a la vista" });
  });

  it("never invents a browser reading: measuring, blocked and failed leave the lane unmeasured", () => {
    for (const [browser, state] of [
      [undefined, "measuring"],
      [{ state: "blocked", measuredAt: AT }, "blocked"],
      [{ state: "unmeasured", measuredAt: AT }, "unmeasured"]
    ] as const) {
      const lanes = agentLanes(result({ browser: browser as AgenticBrowserRead | undefined }));
      expect(lanes.navState).toBe(state);
      expect(lanes.nav.stations.every((s) => s.tone === "na")).toBe(true);
      expect(lanes.nav.reach.label).toBe("Sin medir");
      expect(lanes.obstacles).toEqual([]);
      expect(lanes.window).toBeNull();
    }
  });

  it("only counts a cookie banner that covers the page, and says why in one sentence (log §457)", () => {
    const strip = agentLanes(result({ browser: ok({ cookieCover: false }) }));
    expect(strip.obstacles.find((o) => o.id === "cookies")).toMatchObject({ tone: "ok", line: "Hay aviso, pero no vemos que tape la ficha: se puede seguir sin cerrarlo." });
    expect(strip.window?.cookies).toBe(false);
    const cover = agentLanes(result({ browser: ok({ cookieCover: true }) }));
    expect(cover.obstacles.find((o) => o.id === "cookies")).toMatchObject({ tone: "warn", line: "Sale como una ventana encima de la ficha y hay que cerrarlo antes de seguir." });
    // A read stored before the field existed is not counted against the site.
    const old = agentLanes(result({ browser: ok({ cookieCover: undefined }) }));
    expect(old.obstacles.find((o) => o.id === "cookies")?.tone).toBe("ok");
  });

  it("fills the window only with what the page showed", () => {
    expect(agentLanes(result({ browser: ok() })).window).toEqual({
      url: "https://nubaria.es/chaqueta-brisa",
      name: "Chaqueta Brisa",
      price: "Desde 129,00 €",
      options: true,
      buy: "Añadir a la cesta",
      cookies: true
    });
  });

  it("writes no long dashes", () => {
    const text = JSON.stringify(agentLanes(result({ browser: ok({ buy: { state: "unnamed", text: null }, price: { state: "missing", text: null } }) })));
    expect(text).not.toMatch(/—/);
  });
});

describe("agentLanes: listings, leads and error pages (log §465)", () => {
  it("does not judge a listing and says why", () => {
    const lanes = agentLanes(result({ browser: ok({ listing: true }) }));
    expect(lanes.navState).toBe("unmeasured");
    expect(lanes.navLine).toContain("portada o un listado");
    expect(lanes.obstacles).toEqual([]);
  });

  it("says a 404 apart from a failed render", () => {
    expect(agentLanes(result({ browser: { state: "unmeasured", measuredAt: AT, reason: "not_found" } })).navLine).toContain("no existe");
    expect(agentLanes(result({ browser: { state: "unmeasured", measuredAt: AT } })).navLine).toContain("No pudimos abrir");
  });

  it("reads a lead button as a brake, not as a way to buy", () => {
    const lanes = agentLanes(result({ browser: ok({ price: { state: "exact", text: "30 €/mes" }, options: "none", cookieCover: false, buy: { state: "lead", text: "Te llamamos" } }) }));
    expect(lanes.nav.stations.find((s) => s.id === "purchase")).toMatchObject({ tone: "warn", line: "Sólo «Te llamamos»" });
    expect(lanes.navBrake?.title).toBe("No pueden contratar directamente");
    expect(lanes.navSteps.map((s) => s.key)).toContain("buy-lead");
  });
});
