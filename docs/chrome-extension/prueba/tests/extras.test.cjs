/* node --test docs/chrome-extension/prueba/tests/ (extension 1.5.0, log §446) */
const test = require("node:test");
const assert = require("node:assert/strict");
const X = require("../extension/extras.js");
const S = require("../extension/score.js");
const R = require("../extension/report/report.js");
const facts = require("./facts.json").a;

const ROBOTS = ["User-agent: *", "Disallow: /wp-admin/", "", "# bots", "User-agent: OAI-SearchBot", "User-agent: ChatGPT-User", "Disallow: /", "", "User-agent: PerplexityBot", "Allow: /"].join("\n");

test("evidence: the blocking group and rule, with 1-based line numbers", () => {
  const ev = X.robotsEvidence(ROBOTS, ["ChatGPT-User", "OAI-SearchBot"], "/");
  assert.deepEqual(ev, { from: 5, to: 7, lines: ["User-agent: OAI-SearchBot", "User-agent: ChatGPT-User", "Disallow: /"] });
  assert.equal(X.lineLabel(ev), "robots.txt, líneas 5 a 7");
});

test("evidence: falls back to the «*» group, and is null when nothing blocks", () => {
  const ev = X.robotsEvidence(ROBOTS, ["Claude-SearchBot"], "/wp-admin/x");
  assert.deepEqual(ev, { from: 1, to: 2, lines: ["User-agent: *", "Disallow: /wp-admin/"] });
  assert.equal(X.robotsEvidence(ROBOTS, ["PerplexityBot"], "/"), null);
  assert.equal(X.robotsEvidence(ROBOTS, ["Claude-SearchBot"], "/"), null);
});

test("evidence agrees with score.js on who is blocked", () => {
  const groups = S.parseRobots(ROBOTS);
  for (const tok of ["OAI-SearchBot", "PerplexityBot", "Claude-SearchBot"]) {
    const blocked = !S.tokenVerdict(groups, tok, "/").allowed;
    assert.equal(!!X.robotsEvidence(ROBOTS, [tok], "/"), blocked, tok);
  }
});

test("history: one entry per visit, capped, and «since last» compares the last two", () => {
  const t0 = Date.parse("2026-11-01T10:00:00Z");
  let h = X.historyPush([], { at: t0, nota: 50, fixes: [{ id: "a", t: "A" }, { id: "b", t: "B" }] });
  h = X.historyPush(h, { at: t0 + 5 * 60e3, nota: 52, fixes: [{ id: "a", t: "A" }, { id: "b", t: "B" }] });
  assert.equal(h.length, 1, "a review within ten minutes is the same visit");
  assert.equal(X.sinceLast(h), null, "first visit: nothing to compare");
  h = X.historyPush(h, { at: t0 + 2 * 864e5, nota: 61, fixes: [{ id: "a", t: "A" }] });
  const s = X.sinceLast(h);
  assert.equal(s.prev.nota, 52);
  assert.equal(s.now.nota, 61);
  assert.deepEqual(s.fixed, ["B"]);
  for (let i = 0; i < 30; i++) h = X.historyPush(h, { at: t0 + (3 + i) * 864e5, nota: 60, fixes: [] });
  assert.equal(h.length, X.HISTORY_MAX);
});

test("history: page key drops fragment and campaign tags, keeps the rest", () => {
  assert.equal(X.pageKey("https://a.es/p?id=3&utm_source=x#top"), "h:https://a.es/p?id=3");
});

test("history: prune keeps the most recent pages", () => {
  const idx = {};
  for (let i = 0; i < X.HISTORY_PAGES + 3; i++) idx["h:" + i] = i;
  assert.deepEqual(X.historyPrune(idx), ["h:0", "h:1", "h:2"]);
});

test("history: entries store plain titles, never HTML", () => {
  const e = X.entryOf({ nota: 40, fixes: [{ id: "x", t: 'Publica un <code class="p">llms.txt</code>' }], shop: null }, 1);
  assert.deepEqual(e.fixes, [{ id: "x", t: "Publica un llms.txt" }]);
});

test("ago text in Spanish", () => {
  assert.equal(X.agoText(30 * 60e3), "hace 30 min");
  assert.equal(X.agoText(5 * 3600e3), "hace 5 h");
  assert.equal(X.agoText(864e5), "ayer");
  assert.equal(X.agoText(3 * 864e5), "hace 3 días");
});

test("report: parts from a stored reading, with no long dash and every fix once", () => {
  const sc = S.scorePage(facts);
  const p = R.buildParts({ at: Date.parse("2026-11-02T20:08:00Z"), facts: Object.assign({}, facts, { aiView: { state: "ok", pct: 64, words: 300, missing: [{ t: "<b>Opiniones</b>", kind: "text" }], blocks: [] } }), sc, shot: null, ev: null, hist: null });
  const all = p.cover + p.sections.flat().join("");
  assert.ok(!all.includes("—"), "no long dash");
  assert.ok(all.includes("&lt;b&gt;Opiniones&lt;/b&gt;"), "page text is escaped");
  assert.ok(all.includes(`<b>${sc.nota}</b>`));
  const ids = new Set(sc.fixes.concat((sc.shop && sc.shop.fixes) || []).map((f) => f.id));
  assert.equal((all.match(/class="fx"/g) || []).length, ids.size);
  assert.ok(/^Informe GenScore · /.test(p.title));
});

test("aiFix writes the missing blocks as HTML and offers the page as Markdown", () => {
  const v = { state: "ok", pct: 34, words: 300, md: "# Tienda\n\nTexto", missing: [
    { t: "Aspiradora Dyson V12", kind: "heading", tag: "h3", full: "Aspiradora Dyson V12" },
    { t: "Durante 48 meses, luego 0€", kind: "price", tag: "p", full: "Durante 48 meses, luego 0€" },
    { t: "HBO <Max>", kind: "text", tag: "li", full: "HBO <Max>" },
    { t: "Comprar", kind: "button", tag: "button", full: "Comprar" }
  ] };
  const f = X.aiFix(v, { url: "https://tienda.es/ofertas/tv/?utm_source=x", host: "tienda.es" });
  assert.equal(f.id, "ai-html");
  assert.equal(f.lane, "ia");
  assert.equal(f.pts, null);
  assert.match(f.snippet, /<h2>Aspiradora Dyson V12<\/h2>/);
  assert.match(f.snippet, /<p>Durante 48 meses, luego 0€<\/p>/);
  assert.match(f.snippet, /<ul>\n  <li>HBO &lt;Max&gt;<\/li>\n<\/ul>/);
  assert.match(f.snippet, /<a href="ENLACE">Comprar<\/a>/);
  assert.equal(f.mdName, "ofertas-tv.md");
  assert.equal(f.mdUrl, "https://tienda.es/ofertas/tv.md");
  assert.equal(f.md, "# Tienda\n\nTexto");
  assert.ok(!/—/.test(f.t + f.why + f.how));
  assert.equal(X.aiFix(Object.assign({}, v, { pct: 96 }), { url: "https://a.es/" }), null);
  assert.equal(X.aiFix(Object.assign({}, v, { missing: [] }), { url: "https://a.es/" }), null);
  assert.equal(X.aiFix({ state: "error" }, { url: "https://a.es/" }), null);
  assert.equal(X.aiFix(v, { url: "https://a.es/", host: "a.es" }).mdName, "index.md");
  assert.equal(X.aiFix(v, { url: "http://localhost:8765/a/", host: "localhost" }).mdUrl, "http://localhost:8765/a.md");
});
