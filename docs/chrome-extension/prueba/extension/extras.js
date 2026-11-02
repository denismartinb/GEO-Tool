/* GenScore extension 1.5.0 (log §446): what the panel adds on top of the
   page review, kept apart from collect.js and score.js because those two are
   copied byte for byte into lib/page-review and into the WordPress plugin.

   - readAiView(): runs inside the tab, like collectPageFacts. It asks for the
     same URL again without cookies and without running JavaScript (fetch +
     DOMParser), which is what an AI search bot receives, and compares its
     text with the text the person sees. Nothing leaves the browser.
   - robotsEvidence(): the robots.txt lines behind an alert, with their line
     numbers, so the panel can say «Comprobado · robots.txt, líneas 5 a 7».
   - history helpers: the note of each page per visit, kept only in this
     browser (chrome.storage.local).
   Pure helpers are exported for node tests (tests/extras.test.cjs). */
(function (root) {
  "use strict";

  /* ---------------- in the tab: the page as an AI bot gets it ---------------- */
  async function readAiView() {
    const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    const words = (s) => norm(s).match(/[\p{L}\p{N}]{3,}/gu) || [];
    const BLOCK = "h1,h2,h3,h4,h5,h6,p,li,dt,dd,blockquote,figcaption,td,th,summary,label,button";
    let html;
    try {
      const ctl = new AbortController();
      const tm = setTimeout(() => ctl.abort(), 8000);
      const r = await fetch(location.href, { credentials: "omit", cache: "no-store", redirect: "follow", signal: ctl.signal, headers: { accept: "text/html" } });
      clearTimeout(tm);
      if (!r.ok || !/html/i.test(r.headers.get("content-type") || "")) return { state: "error", status: r.status };
      html = (await r.text()).slice(0, 4e6);
    } catch (e) {
      return { state: "error", status: 0 };
    }
    const doc = new DOMParser().parseFromString(html, "text/html");
    doc.querySelectorAll("script,style,template,svg").forEach((n) => n.remove());
    const raw = new Map();
    for (const w of words(doc.body ? doc.body.textContent : "")) raw.set(w, (raw.get(w) || 0) + 1);

    const seen = words(document.body ? document.body.innerText : "");
    if (seen.length < 20) return { state: "few", words: seen.length };
    const left = new Map(raw);
    let hits = 0;
    for (const w of seen) { const n = left.get(w); if (n) { hits++; left.set(w, n - 1); } }
    const pct = Math.round((hits / seen.length) * 100);

    const visible = (el) => { if (!el.getClientRects().length) return false; const cs = getComputedStyle(el); return cs.visibility !== "hidden" && cs.display !== "none"; };
    const scope = document.querySelector("main,[role=main],article") || document.body;
    const leaves = [...scope.querySelectorAll(BLOCK)].slice(0, 1500).filter((el) => !el.querySelector(BLOCK) && !el.closest("nav,header,footer,[aria-hidden=true]") && visible(el));
    const missing = [], dup = new Set();
    for (const el of leaves) {
      const text = (el.innerText || "").replace(/\s+/g, " ").trim();
      const ws = words(text);
      if (ws.length < 2) continue;
      const found = ws.filter((w) => raw.has(w)).length / ws.length;
      const gone = found < 0.5;
      const heading = /^H\d$/.test(el.tagName);
      if (gone && ws.length >= 3 && missing.length < 6) {
        const t = text.length > 80 ? text.slice(0, 79).trim() + "…" : text;
        if (dup.has(t)) continue;
        dup.add(t);
        const kind = heading ? "heading" : /(\d[\d.,]*\s?(€|eur|\$|£))|((€|\$|£)\s?\d)/i.test(text) ? "price" : el.tagName === "BUTTON" ? "button" : "text";
        missing.push({ t, kind, full: text.slice(0, 600), tag: heading ? el.tagName.toLowerCase() : el.tagName === "LI" ? "li" : el.tagName === "BUTTON" ? "button" : "p" });
      }
    }
    return { state: "ok", pct, words: seen.length, missing, md: pageMarkdown(scope) };

    /* the page the person sees, as clean Markdown: headings, paragraphs, lists,
       links and table rows of the main content, never menus or scripts */
    function pageMarkdown(root) {
      const out = [], one = (s) => String(s || "").replace(/\s+/g, " ").trim();
      const inline = (el) => {
        let t = "";
        el.childNodes.forEach((n) => {
          if (n.nodeType === 3) t += n.nodeValue;
          else if (n.nodeType === 1 && visible(n)) {
            const tx = one(n.innerText);
            if (n.tagName === "A" && n.href && /^https?:/.test(n.href) && tx) t += `[${tx}](${n.href})`;
            else if (/^(B|STRONG)$/.test(n.tagName) && tx) t += `**${tx}**`;
            else t += n.innerText;
          }
        });
        return one(t);
      };
      const walk = (el) => {
        for (const c of el.children) {
          if (c.matches("nav,header,footer,script,style,noscript,template,svg,form,[aria-hidden=true]") || !visible(c)) continue;
          const tg = c.tagName;
          if (/^H[1-6]$/.test(tg)) { const t = one(c.innerText); if (t) out.push("#".repeat(+tg[1]) + " " + t); }
          else if (tg === "P" || tg === "BLOCKQUOTE" || tg === "FIGCAPTION") { const t = inline(c); if (t) out.push((tg === "BLOCKQUOTE" ? "> " : "") + t); }
          else if (tg === "UL" || tg === "OL") { const items = [...c.children].filter((li) => li.tagName === "LI" && visible(li)).map((li, i) => (tg === "OL" ? i + 1 + ". " : "- ") + inline(li)).filter((x) => x.length > 2); if (items.length) out.push(items.join("\n")); }
          else if (tg === "TABLE") { const rows = [...c.querySelectorAll("tr")].map((tr) => [...tr.children].map((td) => one(td.innerText).replace(/\|/g, "/"))).filter((r) => r.some(Boolean)); if (rows.length) { const n = Math.max(...rows.map((r) => r.length)); const fill = (r) => "| " + Array.from({ length: n }, (_, i) => r[i] || "").join(" | ") + " |"; out.push([fill(rows[0]), "|" + " --- |".repeat(n)].concat(rows.slice(1).map(fill)).join("\n")); } }
          else if (!c.children.length) { const t = one(c.innerText); if (t && t.split(" ").length >= 4) out.push(t); }
          else walk(c);
          if (out.join("\n\n").length > 40000) return;
        }
      };
      walk(root);
      const seenL = new Set();
      return out.filter((b) => (seenL.has(b) ? false : seenL.add(b))).join("\n\n").slice(0, 40000);
    }
  }

  /* ---------------- robots.txt evidence ---------------- */
  /* The group that decides for `tokens` on `path` (named group first, else
     «*»), and the rule inside it that blocks, with 1-based line numbers.
     Mirrors parseRobots/tokenVerdict in score.js; null when nothing blocks. */
  function robotsEvidence(text, tokens, path) {
    const lines = String(text || "").split(/\r?\n/);
    const groups = [];
    let cur = null, lastAgent = false;
    lines.forEach((raw, i) => {
      const line = raw.replace(/#.*$/, "").trim();
      const m = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
      if (!m) return;
      const key = m[1].toLowerCase(), val = m[2].trim();
      if (key === "user-agent") {
        if (!cur || !lastAgent) { cur = { agents: [], agentLines: [], rules: [] }; groups.push(cur); }
        cur.agents.push(val.toLowerCase()); cur.agentLines.push(i);
        lastAgent = true;
      } else if (key === "allow" || key === "disallow") {
        if (cur) cur.rules.push({ allow: key === "allow", path: val, line: i });
        lastAgent = false;
      } else lastAgent = false;
    });
    const matches = (rp, p) => {
      if (!rp) return false;
      const anchored = rp.endsWith("$"), body = anchored ? rp.slice(0, -1) : rp;
      return new RegExp("^" + body.split("*").map((s) => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*") + (anchored ? "$" : "")).test(p);
    };
    for (const token of tokens) {
      const t = token.toLowerCase();
      let sel = groups.filter((g) => g.agents.includes(t));
      if (!sel.length) sel = groups.filter((g) => g.agents.includes("*"));
      let best = null;
      for (const g of sel) for (const r of g.rules) {
        if (!r.path && !r.allow) continue;
        if (!matches(r.path, path)) continue;
        const len = r.path.replace(/\$$/, "").length;
        if (!best || len > best.len || (len === best.len && r.allow && !best.rule.allow)) best = { len, rule: r, g };
      }
      if (!best || best.rule.allow) continue;
      const idx = best.g.agentLines.filter((n) => n < best.rule.line).concat(best.rule.line);
      return { from: idx[0] + 1, to: best.rule.line + 1, lines: idx.map((n) => lines[n].trim()) };
    }
    return null;
  }
  const lineLabel = (ev) => (ev.from === ev.to ? `robots.txt, línea ${ev.from}` : `robots.txt, líneas ${ev.from} a ${ev.to}`);

  /* ---------------- history, per page, in this browser ---------------- */
  const SAME_VISIT_MS = 10 * 60 * 1000;
  const HISTORY_MAX = 12;
  const HISTORY_PAGES = 300;
  /* the page without its fragment and campaign tags */
  function pageKey(url) {
    try {
      const u = new URL(url);
      u.hash = "";
      [...u.searchParams.keys()].filter((k) => /^utm_|^gclid$|^fbclid$/i.test(k)).forEach((k) => u.searchParams.delete(k));
      return "h:" + u.toString();
    } catch (e) { return "h:" + String(url); }
  }
  const plain = (s) => String(s || "").replace(/<[^>]+>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, "&");
  /* one entry per visit: a review within ten minutes of the last one replaces it */
  function historyPush(list, entry) {
    const out = Array.isArray(list) ? list.slice() : [];
    const last = out[out.length - 1];
    if (last && entry.at - last.at < SAME_VISIT_MS) out[out.length - 1] = entry;
    else out.push(entry);
    return out.slice(-HISTORY_MAX);
  }
  function entryOf(sc, at) {
    const seen = new Set(), fixes = [];
    for (const f of sc.fixes.concat((sc.shop && sc.shop.fixes) || [])) if (!seen.has(f.id)) { seen.add(f.id); fixes.push({ id: f.id, t: plain(f.t) }); }
    return { at, nota: sc.nota, fixes };
  }
  /* the last earlier visit against this one; null on a first visit */
  function sinceLast(list) {
    if (!Array.isArray(list) || list.length < 2) return null;
    const now = list[list.length - 1], prev = list[list.length - 2];
    const ids = new Set(now.fixes.map((f) => f.id));
    return { prev, now, visits: list.length, notes: list.map((e) => e.nota), fixed: prev.fixes.filter((f) => !ids.has(f.id)).map((f) => f.t) };
  }
  function agoText(ms) {
    const m = Math.round(ms / 60000), h = Math.round(ms / 3600000), d = Math.round(ms / 86400000);
    if (m < 60) return `hace ${Math.max(m, 1)} min`;
    if (h < 24) return `hace ${h} h`;
    if (d === 1) return "ayer";
    if (d < 30) return `hace ${d} días`;
    const mo = Math.round(d / 30);
    return mo === 1 ? "hace un mes" : `hace ${mo} meses`;
  }
  /* page keys to forget so at most HISTORY_PAGES pages are kept */
  function historyPrune(index) {
    const keys = Object.keys(index || {});
    if (keys.length <= HISTORY_PAGES) return [];
    return keys.sort((a, b) => index[a] - index[b]).slice(0, keys.length - HISTORY_PAGES);
  }

  /* ---------------- the recommendation behind «Lo que lee la IA» ---------------- */
  const escH = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  /* The blocks that only appear with JavaScript, written as HTML to paste in
     the page's template, plus the page as Markdown as a second option.
     null when nothing important is missing. */
  function aiFix(v, f) {
    if (!v || v.state !== "ok" || v.pct >= 95 || !v.missing || !v.missing.length) return null;
    const miss = v.missing.slice(0, 6);
    const lines = [];
    let inList = false;
    for (const m of miss) {
      const tx = escH(String(m.full || m.t).replace(/…$/, "").trim());
      if (m.tag === "li") { if (!inList) { lines.push("<ul>"); inList = true; } lines.push(`  <li>${tx}</li>`); continue; }
      if (inList) { lines.push("</ul>"); inList = false; }
      if (/^h[1-6]$/.test(m.tag || "")) lines.push(`<${m.tag === "h1" ? "h1" : "h2"}>${tx}</${m.tag === "h1" ? "h1" : "h2"}>`);
      else if (m.tag === "button") lines.push(`<p><a href="ENLACE">${tx}</a></p>`);
      else lines.push(`<p>${tx}</p>`);
    }
    if (inList) lines.push("</ul>");
    let path = "pagina";
    try { const u = new URL(f.url); path = u.pathname.replace(/^\/+|\/+$/g, "").replace(/\//g, "-") || "index"; } catch (e) {}
    const mdUrl = (() => { try { const u = new URL(f.url); return u.origin + (u.pathname.replace(/\/+$/, "") || "/index") + ".md"; } catch (e) { return ""; } })();
    const n = v.missing.length;
    return {
      id: "ai-html", lane: "ia", pts: null, kind: "local",
      t: "Pon en el HTML lo que hoy sólo sale con JavaScript",
      why: `El ${100 - v.pct}% del texto que ves no llega a ChatGPT, Claude y Perplexity, porque sus bots leen la página sin ejecutar JavaScript. ${n === 1 ? "Este bloque" : `Estos ${Math.min(n, 6)} bloques`} no les llega${n === 1 ? "" : "n"}.`,
      how: "Escríbelo en la plantilla de la página o en un bloque HTML, no en un script, y quita la versión que pinta el script para no repetirlo. El código lleva el texto que ves hoy: revísalo antes de publicarlo.",
      snippet: `<!-- En la plantilla de esta página, servido en el HTML -->\n${lines.join("\n")}`,
      copyWhat: "el HTML",
      md: v.md || "", mdName: path + ".md",
      mdUrl
    };
  }

  const api = { aiFix, readAiView, robotsEvidence, lineLabel, pageKey, historyPush, entryOf, sinceLast, agoText, historyPrune, plain, SAME_VISIT_MS, HISTORY_MAX, HISTORY_PAGES };
  root.GS_X = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof self !== "undefined" ? self : this);
