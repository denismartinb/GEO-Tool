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
