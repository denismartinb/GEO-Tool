/* node --test docs/chrome-extension/prueba/tests/
   Facts captured with collect.js from three local test pages (a shop page
   that blocks PerplexityBot, a complete article, and a page with noindex). */
const test = require("node:test");
const assert = require("node:assert/strict");
const S = require("../extension/score.js");
const F = require("./facts.json");
const NOW = Date.parse("2026-10-28T12:00:00Z");

test("robots: a named group beats «*», longest rule wins, Allow wins a tie", () => {
  const g = S.parseRobots("User-agent: *\nDisallow: /private\n\nUser-agent: GPTBot\nUser-agent: PerplexityBot\nDisallow: /\nAllow: /blog$\n");
  assert.equal(S.tokenVerdict(g, "PerplexityBot", "/x").allowed, false);
  assert.equal(S.tokenVerdict(g, "PerplexityBot", "/blog").allowed, true);
  assert.equal(S.tokenVerdict(g, "OAI-SearchBot", "/x").allowed, true);
  assert.equal(S.tokenVerdict(g, "OAI-SearchBot", "/private/a").allowed, false);
  assert.equal(S.tokenVerdict(S.parseRobots("User-agent: *\nDisallow: /a\nAllow: /a"), "Googlebot", "/a").allowed, true);
  assert.equal(S.tokenVerdict(S.parseRobots("User-agent: *\nDisallow:"), "Googlebot", "/").allowed, true);
});

test("robots: no file means every engine may enter; unreadable means unknown, not blocked", () => {
  assert.equal(S.engineAccess({ status: 404, text: null }, "/").chatgpt.allowed, true);
  assert.equal(S.engineAccess({ status: 0, text: null }, "/").chatgpt.allowed, null);
  const sc = S.scorePage(Object.assign({}, F.b, { robots: { status: 0, text: null } }), NOW);
  assert.equal(sc.lanes.ia, 100, "unknown readers are left out, not counted as failures");
});

test("shop page: Perplexity blocked raises the one alert and the first card", () => {
  const sc = S.scorePage(F.a, NOW);
  assert.equal(sc.commerce, true);
  assert.deepEqual(sc.blockedEngines, ["perplexity"]);
  assert.match(sc.alert.t, /Perplexity no puede leer/);
  assert.equal(sc.fixes[0].id, "bot-perplexity");
  /* the replacement group keeps the «*» rules, so it does not open /checkout */
  assert.match(sc.fixes[0].snippet, /^User-agent: PerplexityBot\nDisallow: \/checkout\nDisallow: \/cuenta\nAllow: \/$/);
  /* price and stock paste the same Offer: one card */
  assert.equal(sc.fixes.filter((f) => f.id === "price" || f.id === "avail").length, 1);
  assert.equal(sc.nota, Math.round(0.55 * sc.lanes.ia + 0.45 * sc.lanes.google), "Agentes stays outside the nota");
});

test("complete article: 100 and nothing to do", () => {
  const sc = S.scorePage(F.b, NOW);
  assert.equal(sc.nota, 100);
  assert.equal(sc.fixes.length, 0);
  assert.equal(sc.alert, null);
  assert.equal(sc.lanes.agent, null);
});

test("noindex page: Google alert first, nosnippet as a card", () => {
  const sc = S.scorePage(F.c, NOW);
  assert.equal(sc.alert.id, "index");
  assert.equal(sc.fixes[0].id, "index");
  assert.ok(sc.fixes.some((f) => f.id === "snippet"));
  assert.ok(sc.nota < 50);
});

test("every card's points are positive and its title has no em dash", () => {
  for (const f of Object.values(F)) for (const x of S.scorePage(f, NOW).fixes) {
    assert.ok(x.pts > 0);
    assert.ok(!/\u2014/.test(x.t + x.why + (x.how || "") + (x.snippet || "")));
  }
});

test("a «Reservar» button alone does not make a shop (no Agentes on a clinic)", () => {
  const clinic = Object.assign({}, F.b, { buy: "Reservar cita" });
  assert.equal(S.scorePage(clinic, NOW).commerce, false);
  assert.equal(S.scorePage(Object.assign({}, F.b, { buy: "Añadir al carrito" }), NOW).commerce, true);
});

test("the title card explains the real problem: too long or too short", () => {
  const long = S.scorePage(Object.assign({}, F.b, { title: "x".repeat(68) }), NOW).fixes.find((f) => f.id === "title");
  assert.match(long.why, /corta/);
  assert.doesNotMatch(long.why, /corto/);
  const short = S.scorePage(Object.assign({}, F.b, { title: "Inicio" }), NOW).fixes.find((f) => f.id === "title");
  assert.match(short.why, /Tan corto/);
});

test("software or a service: no stock or returns, no «producto» copy (Instinct report, 1.0.1)", () => {
  const saas = Object.assign({}, F.b, {
    buy: "Prueba gratis",
    ld: { types: ["Organization", "SoftwareApplication", "Offer", "FAQPage"], errors: 0, product: null, offering: { type: "SoftwareApplication", name: "GenScore", price: "29", currency: "EUR" }, article: null, faq: true, org: true, offerCount: 1 }
  });
  const r = S.scorePage(saas, NOW);
  assert.equal(r.service, true);
  assert.equal(r.lanes.agent, 100);
  assert.equal(r.criteria.find((c) => c.id === "avail").v, null);
  assert.equal(r.criteria.find((c) => c.id === "returns").v, null);
  assert.equal(r.fixes.filter((x) => x.lane === "agent").length, 0);

  const noPrice = Object.assign({}, saas, { buy: null, ld: Object.assign({}, saas.ld, { offering: Object.assign({}, saas.ld.offering, { price: null }) }) });
  const fx = S.scorePage(noPrice, NOW).fixes.filter((x) => x.lane === "agent");
  const text = fx.map((x) => x.t + " " + x.why + " " + (x.snippet || "")).join(" ");
  assert.match(text, /datos de tu plan/);
  assert.doesNotMatch(text, /stock|InStock|producto|devoluci/i);
  assert.match(fx.find((x) => x.id === "price").snippet, /"price": "PRECIO"/);
});

test("a real shop keeps its goods cards", () => {
  const r = S.scorePage(F.a, NOW);
  assert.ok(!r.service);
});

test("a home page that sells nothing takes Agentes from the shop it found (EXT-SHOP-FIND-1)", () => {
  const shopFacts = { url: "http://localhost:8302/tienda/zapatillas", path: "/tienda/zapatillas", ld: F.a.ld, og: F.a.og, microPrice: F.a.microPrice, buy: F.a.buy, returnsLink: F.a.returnsLink };
  const home = Object.assign({}, F.b, { path: "/", shop: { state: "found", path: "/tienda/zapatillas", source: "menu", facts: shopFacts } });
  const r = S.scorePage(home, NOW);
  assert.equal(r.commerce, false);
  assert.equal(r.shop.state, "found");
  assert.equal(r.lanes.agent, S.scorePage(F.a, NOW).lanes.agent);
  assert.ok(r.shop.fixes.every((x) => x.where === "/tienda/zapatillas" && x.id.startsWith("shop-")));
  /* the home's own nota does not change */
  assert.equal(r.nota, S.scorePage(Object.assign({}, F.b, { path: "/" }), NOW).nota);

  const none = S.scorePage(Object.assign({}, F.b, { path: "/", shop: { state: "none" } }), NOW);
  assert.equal(none.shop.state, "none");
  assert.equal(none.lanes.agent, null);
  /* a candidate that turns out not to sell is «none», not a score */
  const fake = S.scorePage(Object.assign({}, home, { shop: { state: "found", path: "/x", facts: { url: "http://localhost:8302/x", path: "/x", ld: F.b.ld, og: {}, microPrice: false, buy: null } } }), NOW);
  assert.equal(fake.shop.state, "none");
});

test("the llms.txt draft lists the menu and footer links with their own text (EXT-LLMS-LINKS-1)", () => {
  const links = { main: [{ text: "Móvil", url: "https://x.es/movil/" }, { text: "Fibra", url: "https://x.es/fibra/" }], footer: [{ text: "Ayuda", url: "https://x.es/ayuda/" }], legal: [{ text: "Privacidad", url: "https://x.es/privacidad/" }] };
  const base = Object.assign({}, F.b, { llms: { status: 404, ok: false } });
  const fx = (f) => S.scorePage(f, NOW).fixes.find((x) => x.id === "llms");
  const d = fx(Object.assign({}, base, { links, siteName: "Marca X" }));
  assert.match(d.snippet, /^# Marca X\n/);
  assert.match(d.snippet, /## Páginas principales[\s\S]*- \[Móvil\]\(https:\/\/x\.es\/movil\/\)\n- \[Fibra\]/);
  assert.match(d.snippet, /## Más información\n\n- \[Ayuda\]/);
  assert.match(d.snippet, /## Optional\n\n- \[Privacidad\]/);
  assert.doesNotMatch(d.snippet, /: \S/m, "no invented description after a link");
  /* without links it still works, from this page alone */
  const solo = fx(base);
  assert.doesNotMatch(solo.snippet, /## Más información/);
  assert.match(solo.why, /parte de esta página/);
});
