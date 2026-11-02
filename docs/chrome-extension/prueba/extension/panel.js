/* GenScore test extension: the side panel.
   Runs after core.js (ic, lg, bar, dial, roll, setRoll, armMotion,
   progressTicks, slideHtml, bindSlides, toast, segInd: the console's own
   helpers), score.js (GS_SCORE) and sample.js (SAMPLE).
   Layers, top to bottom: state (dial + three gauges), the one warm alert,
   «Haz esto» one card at a time, and the detail of each lane.
   Every string that comes from the page goes through esc() before innerHTML. */
(() => {
  "use strict";
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const SITE = GS_API;
  /* the screenshot travels to the report page at a width that prints sharp on A4 */
  async function shrinkShot(dataUrl) {
    const bmp = await createImageBitmap(await (await fetch(dataUrl)).blob());
    const w = Math.min(1200, bmp.width), h = Math.round((bmp.height * w) / bmp.width);
    const cv = new OffscreenCanvas(w, h);
    cv.getContext("2d").drawImage(bmp, 0, 0, w, h);
    const blob = await cv.convertToBlob({ type: "image/jpeg", quality: 0.8 });
    return await new Promise((ok) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = () => ok(null); r.readAsDataURL(blob); });
  }
  const utm = (content) => `utm_source=chrome-extension&utm_medium=extension&utm_campaign=extension&utm_content=${content}`;

  /* ---------------- environment: Chrome, or a stand-in for screenshots ---------------- */
  const IN_EXT = typeof chrome !== "undefined" && chrome.storage && chrome.storage.session && chrome.tabs;
  const Env = IN_EXT ? {
    activeTab: async () => (await chrome.tabs.query({ active: true, currentWindow: true }))[0] || null,
    result: async (id) => (await chrome.storage.session.get("r:" + id))["r:" + id] || null,
    getS: async (k) => (await chrome.storage.session.get(k))[k],
    setS: (k, v) => chrome.storage.session.set({ [k]: v }),
    getL: async (k) => (await chrome.storage.local.get(k))[k],
    setL: (k, v) => chrome.storage.local.set({ [k]: v }),
    reread: (tabId) => chrome.runtime.sendMessage({ type: "reread", tabId }),
    /* optional permission: without it the panel cannot read a page, only the
       toolbar icon can (activeTab). Asked once, on the first press. */
    hasAuto: () => chrome.permissions.contains({ origins: ["<all_urls>"] }),
    askAuto: () => chrome.permissions.request({ origins: ["<all_urls>"] }),
    /* the account: GenScore's own session cookie travels with these requests
       because the manifest holds host_permissions for GS_API only (paso 02) */
    api: async (path) => {
      try {
        const r = await fetch(GS_API + path, { credentials: "include", cache: "no-store" });
        return { status: r.status, body: r.ok ? await r.json() : null };
      } catch (e) { return { status: 0, body: null }; }
    },
    badge: (tabId, on) => { try { chrome.action.setBadgeBackgroundColor({ tabId, color: "#2563eb" }); chrome.action.setBadgeText({ tabId, text: on ? " " : "" }); } catch (e) {} },
    open: (url) => chrome.tabs.create({ url }),
    delL: (k) => chrome.storage.local.remove(k),
    /* 1.5.0 (log §446): the page report. The screenshot is of the reviewed tab only, and
       only while Chrome lets us (activeTab grant or the optional permission). */
    shot: async (tabId) => {
      try {
        const tab = (await chrome.tabs.query({ active: true, currentWindow: true }))[0];
        if (!tab || tab.id !== tabId) return null;
        return await shrinkShot(await chrome.tabs.captureVisibleTab(tab.windowId, { format: "jpeg", quality: 80 }));
      } catch (e) { return null; }
    },
    report: async (data) => {
      const all = await chrome.storage.session.get(null);
      const old = Object.keys(all).filter((k) => k.startsWith("rep:")).sort().slice(0, -2);
      if (old.length) await chrome.storage.session.remove(old);
      const id = String(Date.now());
      await chrome.storage.session.set({ ["rep:" + id]: data });
      chrome.tabs.create({ url: chrome.runtime.getURL("report.html#" + id) });
    },
    copy: (t) => navigator.clipboard.writeText(t),
    listen(fn) {
      chrome.storage.onChanged.addListener((ch, area) => { if (area === "session" && S.tabId != null && ch["r:" + S.tabId]) fn("result"); });
      chrome.tabs.onActivated.addListener(() => fn("tab"));
      chrome.tabs.onUpdated.addListener((tabId, info) => { if (tabId === S.tabId && (info.status === "complete" || info.url)) fn("loaded"); });
      chrome.permissions.onAdded.addListener(() => fn("perm"));
      chrome.permissions.onRemoved.addListener(() => fn("perm"));
      chrome.windows && chrome.windows.onFocusChanged && chrome.windows.onFocusChanged.addListener(() => fn("tab"));
    }
  } : (() => {
    const demo = window.__GS_DEMO || {};
    const mem = {};
    return {
      activeTab: async () => ({ id: 1, url: demo.url }),
      result: async () => demo.result || null,
      getS: async (k) => mem[k], setS: async (k, v) => { mem[k] = v; },
      getL: async (k) => (demo.local || {})[k], setL: async (k, v) => { (demo.local ||= {})[k] = v; },
      reread: async () => ({ ok: true }),
      hasAuto: async () => !!demo.auto, askAuto: async () => true,
      badge: () => {},
      api: async (path) => { const a = demo.api || {}; const k = Object.keys(a).find((x) => path.startsWith(x)); return k ? { status: 200, body: a[k] } : { status: 401, body: null }; },
      open: (u) => toast("Se abriría " + esc(u.split("?")[0]), "", "arrowr"),
      delL: async () => {}, shot: async () => null,
      report: async () => toast("Se abriría el informe de esta página.", "", "download"),
      copy: async () => {},
      listen() {}
    };
  })();

  /* ---------------- state ---------------- */
  const S = { read: false, autoOn: false, tabId: null, rec: null, real: null, proj: {}, sample: { on: false, domain: null }, tab: null, lane: null, dk: {}, done: {}, shown: false, noted: null, seen: {}, from: null, rateAsk: false };
  /* The account is the real one when GenScore answers /api/ext/context with
     a session (paso 02); otherwise «Cuenta de ejemplo» still works as before. */
  const acctOn = () => !!S.real || S.sample.on;
  const isSample = () => !S.real;
  const covers = (h, d) => !!h && !!d && (h === d || h.endsWith("." + d));
  const acctDomains = () => (S.real ? S.real.domains.map((x) => x.domain) : [S.sample.domain, ...SAMPLE.extraDomains]);
  const curDom = () => (S.real ? S.real.sel : S.sample.domain);
  const relation = () => {
    if (!acctOn() || !S.rec || !S.rec.facts) return "none";
    const h = S.rec.facts.host;
    if (S.real) return S.real.domains.some((x) => covers(h, x.domain)) ? "own" : "other";
    return covers(h, S.sample.domain) ? "own" : "other";
  };
  const SH = (c) => `<i class="sh ${c || ""}" aria-hidden="true"></i>`;
  const laneIcon = (k) => (k === "google" ? lg("google", 12) : k === "agent" ? ic("cart") : ic("sparkles"));
  const laneName = (k) => (k === "google" ? "Google" : k === "agent" ? "Agentes" : "IA");
  const tile = (host) => {
    const h = String(host || "?"), c = ["#1d4fd6", "#0f7a54", "#7c3aed", "#c2410c", "#0e7490", "#334155"][[...h].reduce((a, x) => a + x.charCodeAt(0), 0) % 6];
    return `<span class="fav tl" style="background:${c}" aria-hidden="true">${esc(h[0].toUpperCase())}</span>`;
  };
  const favImg = (dom, name) => { const u = dom ? `${GS_API}/api/favicon?domain=${encodeURIComponent(dom)}&sz=64` : null; return u ? `<img class="fav fi" src="${u}" alt="" width="18" height="18" data-n="${esc(name)}">` : tile(name); };
  const brandOf = (host) => { const b = String(host || "").split(".")[0].replace(/-/g, " "); return b.charAt(0).toUpperCase() + b.slice(1); };
  const pathLabel = (f) => (f.path === "/" ? "portada" : f.path.length > 34 ? f.path.slice(0, 33) + "…" : f.path);
  const EJ0 = `<span class="badge b-ej">Ejemplo</span>`;
  const EJx = () => (isSample() ? EJ0 : "");
  const ENGKEY = { openai: "chatgpt", gemini: "gemini", claude: "claude", perplexity: "perplexity" };
  const LABELKEY = { ChatGPT: "chatgpt", Gemini: "gemini", Claude: "claude", Perplexity: "perplexity" };
  const pct = (share) => (share == null ? null : Math.round(share * 100));
  /* The selected domain's figures in the shape the views were built on
     (sample.js). Real ones come from /api/ext/project as shares; the panel
     prints percentages, never counts. null while it loads. */
  function A() {
    if (isSample()) return SAMPLE;
    const p = S.proj[curDom()];
    if (!p || p === "loading" || p === "error") return null;
    const engines = {};
    for (const e of p.engines) if (ENGKEY[e.provider]) engines[ENGKEY[e.provider]] = pct(e.mentionShare);
    const card = p.agentic && p.agentic.kind === "card" ? p.agentic : null;
    return {
      score: p.geoScore, scanDate: p.scanDate || null, say: p.lede || "Todavía no hay un escaneo completado de este dominio.",
      engines, rivals: p.rivals.map((r) => [r.name, pct(r.share), r.isBrand, r.domain || null]), competitorDomains: p.competitorDomains || [], seo: p.seoScore,
      agent: card ? card.score : null, agentParts: card ? card.components.map((c) => [c.name, c.points ?? 0, c.weight]) : [],
      plan: p.plan.map((x, i) => ({ id: "r" + i, kind: "plan", lane: "ia", pts: null, t: esc(x.title), why: esc(x.firstStep || "") })),
      prompts: (p.citingPrompts || []).map((q) => [q.text, q.engines.map((l) => LABELKEY[l]).filter(Boolean), q.mentioned ? "Te nombran" : "No te nombran"])
    };
  }

  /* ---------------- small gauge (light «Cuadro claro») ---------------- */
  const GA0 = 135, GSW = 270;
  const gpt = (c, r, f) => { const t = ((GA0 + GSW * f) * Math.PI) / 180; return [c + r * Math.cos(t), c + r * Math.sin(t)]; };
  const garc = (c, r) => { const [x0, y0] = gpt(c, r, 0), [x1, y1] = gpt(c, r, 1); return `M${x0.toFixed(2)} ${y0.toFixed(2)} A${r} ${r} 0 1 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`; };
  function gauge({ v, unit = "", cls, nm, icon, st, lane, i = 0, tag = "button" }) {
    const c = 60, r = 44, full = garc(c, r);
    const tks = Array.from({ length: 11 }, (_, k) => { const [x0, y0] = gpt(c, r + 7, k / 10), [x1, y1] = gpt(c, r + 11, k / 10); return `<line x1="${x0.toFixed(1)}" y1="${y0.toFixed(1)}" x2="${x1.toFixed(1)}" y2="${y1.toFixed(1)}"/>`; }).join("");
    const open = lane && S.lane === lane;
    const attrs = lane ? `data-lane="${lane}" aria-expanded="${open}"` : "";
    const shown = v == null ? "–" : v;
    return `<${tag} class="gg ${cls}" ${attrs} style="--v:${v || 0};--gd:${i * 90}ms" aria-label="${nm}: ${shown}${unit}. ${st}"><span class="dl"><svg viewBox="0 0 120 104" aria-hidden="true"><g class="tk2">${tks}</g><path class="trk" d="${full}"/><path class="val" d="${full}" pathLength="100"/></svg><span class="in"><b class="num">${shown}<small>${unit}</small></b></span></span>
      <span class="nm">${icon || ""}${nm}</span><span class="st">${SH()}${st}${lane ? ic("chevd", "chev") : ""}</span></${tag}>`;
  }
  const laneBox = (k, body) => `<div class="lb ${S.lane === k ? "open" : ""}"><div><div class="lbi">${S.lane === k ? body() : ""}</div></div></div>`;

  /* ---------------- lane bodies (layer 4) ---------------- */
  const kv = (rows) => rows.map((c) => `<div class="kv"><span>${esc(c.label)}</span><span class="w ${c.v == null ? "" : c.v >= 1 ? "yes" : c.v === 0 ? "no" : ""}">${c.v == null ? "" : c.v >= 1 ? ic("check") : c.v === 0 ? ic("x") : ""}${esc(c.value)}</span></div>`).join("");
  const promptRows = (list) => list.map(([q, es, s]) => `<div class="qr"><span class="q">${esc(q)}<small>${esc(s)}</small></span><span class="e">${es.map((e) => lg(e, 14)).join("")}</span></div>`).join("");
  const gscInvite = () => `<div class="calm col">${lg("google", 16)}<span>Tus búsquedas de Google, tu puesto y tus clics, leídos de tu Search Console. Sólo lectura, la misma conexión que en la consola.</span><button class="btn ink sm" ${S.real ? `data-act="open" data-to="${esc(gscTo())}" data-c="search-console"` : `data-act="sample-only" data-what="conectar Search Console"`}>Conectar con Google</button></div>`;

  // EXT-GSC-2 (log §411): the Search Console block with trend, position chart
  // and queries, from what «Posición en Google» reads. Every figure is
  // Google's; a missing one is left out, never drawn as 0.
  const nES = (n, d = 0) => Number(n).toLocaleString("es-ES", { minimumFractionDigits: d, maximumFractionDigits: d });
  const dPct = (x) => (x == null ? "" : `<span class="gd ${x >= 0 ? "up" : "down"}">${x >= 0 ? "+" : ""}${nES(x)}% <small>vs. 28 días antes</small></span>`);
  const dPos = (x) => (x == null || Math.abs(x) < 0.05 ? "" : `<span class="gd ${x > 0 ? "up" : "down"}">${x > 0 ? "▲" : "▼"} ${nES(Math.abs(x), 1)}</span>`);
  const MES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
  const dayLabel = (iso) => { const [, m, d] = String(iso).split("-").map(Number); return m && d ? `${d} ${MES[m - 1]}` : ""; };
  const spark = (vals, cls) => {
    if (vals.length < 2) return "";
    const mn = Math.min(...vals), mx = Math.max(...vals), r = mx - mn || 1;
    const d = vals.map((v, i) => `${i ? "L" : "M"}${((i / (vals.length - 1)) * 100).toFixed(1)},${(25 - ((v - mn) / r) * 24).toFixed(1)}`).join("");
    return `<svg class="gsp ${cls}" viewBox="0 0 100 26" preserveAspectRatio="none" aria-hidden="true"><path d="${d}"/></svg>`;
  };
  function posChart(daily) {
    const pts = daily.map((d, i) => ({ i, v: d.position, label: dayLabel(d.date) })).filter((p) => p.v != null);
    if (pts.length < 2) return "";
    const W = 340, H = 120, n = daily.length - 1 || 1, vals = pts.map((p) => p.v);
    const lo = Math.floor(Math.min(...vals)), hi = Math.ceil(Math.max(...vals)), r = hi - lo || 1;
    const x = (i) => 28 + (i / n) * (W - 34), y = (v) => 8 + ((v - lo) / r) * (H - 28);
    const line = pts.map((p, k) => `${k ? "L" : "M"}${x(p.i).toFixed(1)},${y(p.v).toFixed(1)}`).join("");
    const first = pts[0], last = pts[pts.length - 1];
    const area = `${line}L${x(last.i).toFixed(1)},${H - 20}L${x(first.i).toFixed(1)},${H - 20}Z`;
    const ticks = [...new Set([lo, Math.round((lo + hi) / 2), hi])].map((t) => `<text x="22" y="${(y(t) + 3).toFixed(1)}" text-anchor="end">${t}</text><line x1="28" x2="${W - 6}" y1="${y(t).toFixed(1)}" y2="${y(t).toFixed(1)}"/>`).join("");
    const mid = pts[Math.floor((pts.length - 1) / 2)];
    const lbl = [[first, "start"], [mid, "middle"], [last, "end"]].map(([p, a]) => `<text x="${x(p.i).toFixed(1)}" y="${H - 6}" text-anchor="${a}">${p.label}</text>`).join("");
    return `<svg class="gpc" viewBox="0 0 ${W} ${H}" role="img" aria-label="Evolución del puesto medio en Google"><defs><linearGradient id="gpcg" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="currentColor" stop-opacity=".18"/><stop offset="1" stop-color="currentColor" stop-opacity="0"/></linearGradient></defs>${ticks}<path class="ar" d="${area}"/><path class="ln" d="${line}"/><circle cx="${x(last.i).toFixed(1)}" cy="${y(last.v).toFixed(1)}" r="3.5"/>${lbl}</svg>`;
  }
  const qRow = (r, right) => `<div class="gq"><span class="pp num">${nES(r.position, 1)}</span><span class="n">${esc(r.query)}</span>${right}</div>`;
  const moveTag = (m) => (m == null ? `<span class="mv nw">Nueva</span>` : Math.abs(m) < 0.5 ? `<span class="mv eq">=</span>` : `<span class="mv ${m > 0 ? "up" : "down"}">${m > 0 ? "▲" : "▼"}${nES(Math.abs(m))}</span>`);
  const clicksTag = (c) => `<span class="c num">${nES(c)}<small> ${c === 1 ? "clic" : "clics"}</small></span>`;
  function gscRich(g, go) {
    const t = g.trend, daily = t.daily || [];
    const pos = g.position == null || g.position === 0 ? "—" : nES(g.position, 1);
    const was = g.position != null && t.positionDelta != null ? `<span class="was">antes ${nES(g.position + t.positionDelta, 1)}</span>` : "";
    const chart = posChart(daily);
    const q = (t.queries || []).map((r) => qRow(r, moveTag(r.movement) + clicksTag(r.clicks))).join("");
    const near = (t.near || []).map((r) => qRow(r, `<span class="c num">${nES(r.impressions)}<small> impr.</small></span>`)).join("");
    return `<div class="gsh"><span class="mh">Google · últimos 28 días</span><span class="src">${lg("google", 12)}Search Console</span></div>
      <div class="gk3">
        <div class="k"><span class="l">Clics</span><b class="num">${nES(g.clicks)}</b>${dPct(t.clicksDeltaPct)}${spark(daily.map((d) => d.clicks), "c")}</div>
        <div class="k"><span class="l">Impresiones</span><b class="num">${nES(t.impressions)}</b>${dPct(t.impressionsDeltaPct)}${spark(daily.map((d) => d.impressions), "i")}</div>
        <div class="k"><span class="l">Puesto medio</span><b class="num">${pos}</b>${dPos(t.positionDelta)}${was}</div>
      </div>
      ${chart ? `<div class="gcard"><div class="gch"><b>Evolución del puesto medio</b><small>Mejor arriba ↑</small></div>${chart}</div>` : ""}
      ${q ? `<div class="gcard"><div class="gch"><b>Tus búsquedas con más clics</b><small>Puesto · cambio</small></div>${q}</div>` : ""}
      ${near ? `<div class="gcard hot"><div class="gch"><b>Casi en la página 1</b><small>Puestos 11 a 20</small></div>${near}<p class="gnote">Las más fáciles de subir. Ya te ven, hay que optimizarlas.</p></div>` : ""}
      <div class="acts">${go("Ver Posición en Google", "gsc-open")}</div>`;
  }
  function gscPage() {
    const p = S.proj[curDom()], g = p && typeof p === "object" ? p.searchConsole : null;
    const pg = g && g.state === "connected" ? g.page : null;
    if (!pg) return "";
    const rows = (pg.queries || []).map((r) => qRow(r, clicksTag(r.clicks))).join("");
    return `<div class="gcard pg"><div class="gch"><b>Esta página en Google</b><small>Últimos 28 días</small></div><div class="gk3 sm"><div class="k"><span class="l">Clics</span><b class="num">${nES(pg.clicks)}</b></div><div class="k"><span class="l">Impresiones</span><b class="num">${nES(pg.impressions)}</b></div><div class="k"><span class="l">Puesto medio</span><b class="num">${nES(pg.position, 1)}</b></div></div>${rows ? `<div class="mh sub">Búsquedas que la traen</div>${rows}` : ""}</div>`;
  }
  /* EXT-GSC-2 (log §411): the open page of your own domain, analysed on its
     own («Página abierta»), reads the same Search Console connection as the
     domain view. Connected: the page's own figures, or a plain line when
     Google returned none for it. Still loading: nothing, never the invite. */
  function gscOwnPage() {
    if (!S.real) return `<div class="mh">Search Console</div>${gscInvite()}`;
    const p = S.proj[curDom()];
    if (!p || p === "loading") return "";
    const g = typeof p === "object" ? p.searchConsole : null;
    if (g && g.state === "connected") {
      const pg = gscPage();
      if (pg) return pg;
      return `<div class="mh">Search Console</div><div class="calm col">${lg("google", 16)}<span>Search Console está conectado. Google no ha devuelto búsquedas que lleven a esta página en los últimos 28 días.</span><button class="btn line sm" data-act="open" data-to="${esc(projPath("search-console") || "/dashboard")}" data-c="gsc-open">Ver Posición en Google${ic("arrowr", "sm")}</button></div>`;
    }
    if (g && g.state === "off") return "";
    return `<div class="mh">Search Console</div>${gscBlock()}`;
  }
  /* ---------------- layer 1: hero «Cuadro» ---------------- */
  /* Two questions, two instruments (log §432, adenda «optimización técnica»): the page review
     says whether the page is technically optimized, as a bar with a state,
     never a dial. The only dial is the domain's Puntuación GEO, whether the AI
     names the brand. A new site can be optimized and still score near zero. */
  const readyBand = (v) => (v >= 75 ? ["ok", "Optimizada"] : v >= 50 ? ["mid", "Mejorable"] : ["bad", "Se frena"]);
  /* EXT-SHOP-FIND-1: on a home page that sells nothing and no shop was found, say so.
     A found shop is announced inside Agentes only, without its URL (Denis, 2026-11-01). */
  function shopLine(sc) {
    if (!sc.shop || sc.shop.state === "found") return "";
    return `<div class="shopln none">${ic("cart")}<span class="tx">GenScore no detecta tu tienda ni tus productos de forma estándar.</span></div>`;
  }
  /* the Puntuación GEO while /api/ext/project loads, or when it failed */
  function heroDom() {
    const p = S.proj[curDom()];
    return `<div class="paused" style="min-height:240px"><span class="ring ${p === "error" ? "" : "spin"}">${p === "error" ? ic("warn") : svgGs(30)}</span><h2>${p === "error" ? "No hemos podido leer tu dominio" : "Leyendo tu dominio"}</h2>${p === "error" ? `<button class="btn line sm" data-act="reload-proj" style="margin-top:14px">Reintentar</button>` : ""}</div>`;
  }

  /* ---------------- layer 2: the one warm alert ---------------- */
  const alertHtml = (sc, f) => {
    if (!sc.alert) return "";
    const ev = alertEvidence(sc, f);
    const evh = ev ? `<span class="ev">${tagx("ok")}<span class="evw">${esc(ev.where)}</span></span>${ev.lines.length ? `<code class="evc">${ev.lines.map(esc).join("<br>")}</code>` : ""}` : "";
    return `<div class="alert ${ev ? "alx" : ""}" role="status">${ic("warn")}<div class="tx"><b>${sc.alert.t}</b> ${sc.alert.s}${evh}</div><button class="btn warm" data-act="jump" data-id="${sc.alert.id}">Arreglarlo</button></div>`;
  };

  /* ================= 1.5.0 (log §446) =================
     Evidence tags: Comprobado (read in the page or its files now), Estimado,
     Simulación (our server asking as a bot). One tag per claim that has a source. */
  const TAGX = { ok: ["check", "Comprobado"], est: [null, "Estimado"], sim: [null, "Simulación"] };
  const tagx = (k, extra) => `<span class="tagx ${k}">${TAGX[k][0] ? ic(TAGX[k][0], "sm") : ""}${TAGX[k][1]}${extra ? ` ${extra}` : ""}</span>`;
  /* Where the alert comes from: the robots.txt lines (with their numbers) or the robots meta / header. */
  function alertEvidence(sc, f) {
    const id = sc.alert && sc.alert.id;
    if (!id || !f) return null;
    const robotsAlert = id.startsWith("bot-") || (id === "index" && /robots\.txt/.test(sc.alert.s));
    if (robotsAlert) {
      const toks = id.startsWith("bot-") ? GS_SCORE.ENGINE_TOKENS[id.slice(4)] || [] : ["Googlebot"];
      const ev = f.robots && f.robots.status === 200 && f.robots.text ? GS_X.robotsEvidence(f.robots.text, toks, f.path) : null;
      return ev ? { where: GS_X.lineLabel(ev), lines: ev.lines } : { where: "robots.txt", lines: [] };
    }
    if (id === "index" || id === "snippet") {
      const word = id === "index" ? /noindex|\bnone\b/ : /nosnippet|max-snippet/;
      if (word.test(f.xRobots || "")) return { where: "Cabecera X-Robots-Tag", lines: [`X-Robots-Tag: ${f.xRobots}`] };
      if (word.test(f.robotsMeta || "")) return { where: "Etiqueta meta robots", lines: [`<meta name="robots" content="${f.robotsMeta}">`] };
    }
    return null;
  }
  /* «Lo que lee la IA»: the page without JavaScript (readAiView, in the tab) against what you see */
  const AIKIND = { price: "cart", heading: "notes", button: "cart", text: "prompts" };
  function aiCard(f) {
    const v = f && f.aiView;
    if (!v || v.state !== "ok") return "";
    const pc = v.pct, all = pc >= 95, miss = all ? [] : v.missing.slice(0, 4);
    const list = miss.map((m) => `<div class="aim">${ic(AIKIND[m.kind] || "prompts", "sm")}<span>${esc(m.t)}</span><em>Sólo con JavaScript</em></div>`).join("");
    const canCmp = !all && v.blocks.length >= 3 && v.blocks.some((b) => b.gone);
    const col = (title, gone) => `<div class="col"><b>${title}</b>${v.blocks.map((b) => `<i class="b ${b.h ? "h" : ""} ${gone && b.gone ? "gone" : ""}" style="width:${b.h ? Math.min(b.w, 80) : b.w}%"></i>`).join("")}</div>`;
    const cmp = canCmp && S.cmp ? `<div class="aicmp">${col("Lo que ves", false)}${col("Lo que llega sin JavaScript", true)}</div>` : "";
    return `<div class="aiv"><div class="aih"><span class="ey">Lo que lee la IA</span>${tagx("ok")}</div>
      <div class="aibig"><b class="num">${pc}<small>%</small></b><span>${all ? "del texto que ves llega en el HTML, que es lo que leen los bots de IA." : miss.length ? "del texto que ves llega a los bots de IA. El resto sólo aparece con JavaScript, y ChatGPT, Claude y Perplexity no lo ejecutan." : "del texto que ves llega a los bots de IA. Lo que falta está fuera del contenido principal (menú, cabecera o pie) o son textos cortos."}</span></div>
      <div class="aibar"><i style="width:${pc}%"></i></div><div class="aileg"><span><i class="a"></i>En el HTML</span>${all ? "" : `<span><i class="b"></i>Sólo con JavaScript</span>`}</div>
      ${list ? `<div class="mh">Lo que no les llega</div>${list}` : ""}${cmp}
      ${canCmp ? `<div class="acts"><button class="btn line sm" data-act="ai-cmp" aria-expanded="${!!S.cmp}">${ic("eye", "sm")}${S.cmp ? "Ocultar la comparación" : "Ver lado a lado"}</button></div>` : ""}
      ${list ? `<p class="mini-note">Haz esto: pide que esos bloques salgan en el HTML de la página. Suele venir de un plugin o de un tema que los carga después.</p>` : ""}
      <p class="mini-note">Comprobado en tu navegador: pedimos la página otra vez sin tu sesión y sin JavaScript, como la reciben los bots.</p></div>`;
  }
  /* «Desde tu última visita»: the note of this page per visit, only in this browser */
  function histLine(f) {
    const h = S.hist;
    if (!h || !f || h.key !== GS_X.pageKey(f.url) || !h.info) return "";
    const { prev, now, visits, notes, fixed } = h.info, d = now.nota - prev.nota;
    let svg = "";
    if (notes.length >= 3) {
      const mn = Math.min(...notes), mx = Math.max(...notes);
      svg = `<svg viewBox="0 0 100 24" preserveAspectRatio="none" aria-hidden="true"><path d="${notes.map((v, i) => `${i ? "L" : "M"}${((i / (notes.length - 1)) * 100).toFixed(1)},${(22 - ((v - mn) / (mx - mn || 1)) * 20).toFixed(1)}`).join("")}"/></svg>`;
    }
    const fx = fixed.slice(0, 3);
    const r2 = fx.length ? `<div class="r2">${ic("checkc", "sm")}<span>Arreglado: ${fx.map((t) => `<b>${esc(t)}</b>`).join(fx.length > 2 ? ", " : " y ").replace(/, (?=<b>[^<]*<\/b>$)/, " y ")}</span></div>` : "";
    return `<div class="vhist ${d > 0 ? "up" : d < 0 ? "down" : "eq"}"><div class="r1"><span class="l">Desde tu última visita · ${GS_X.agoText(now.at - prev.at)}</span><b class="num">${d === 0 ? "Sin cambios" : `${prev.nota} → ${now.nota}`}</b></div>${svg}${r2}<small>${visits} revisiones de esta página. Se guarda sólo en este navegador.</small></div>`;
  }
  /* «¿Te deja pasar el servidor?»: robots.txt next to our probe as each bot (GEO-ALERTS-1) */
  const PROBE_NAME = { chatgpt: "Búsqueda de ChatGPT", claude: "Búsqueda de Claude", perplexity: "Búsqueda de Perplexity", gemini: "Gemini" };
  function probeCard() {
    const au = audOf(), pr = au && au.server;
    if (!pr || !pr.rows || !pr.rows.length) return "";
    const rb = (v) => (v == null ? `<span class="w">—</span>` : `<span class="w ${v ? "yes" : "no"}">${ic(v ? "check" : "x")}${v ? "Permite" : "Bloquea"}</span>`);
    const sv = (r) => (r.server == null || r.server === "unknown" ? `<span class="w">—</span>` : `<span class="w ${r.server === "allowed" ? "yes" : "no"}">${ic(r.server === "allowed" ? "check" : "x")}${r.status != null ? r.status : r.server === "allowed" ? "Pasa" : "Reto"}</span>`);
    const clash = pr.rows.filter((r) => r.robots === true && r.server === "blocked");
    const names = clash.map((r) => ENG[r.engine] ? ENG[r.engine].n : r.engine);
    const note = clash.length
      ? `robots.txt deja pasar a ${names.length > 1 ? names.slice(0, -1).join(", ") + " y " + names.at(-1) : names[0]}, pero tu servidor ${clash.length > 1 ? "les" : "le"} responde con un bloqueo. Casi siempre es el cortafuegos (en Cloudflare, «Bloquear bots de IA»). `
      : "";
    return `<div class="probe"><div class="aih"><span class="mh" style="margin:0">¿Te deja pasar el servidor?</span>${tagx("sim", "· " + esc(shortDate(pr.measuredAt)))}</div>
      <div class="pt hd"><span></span><span>robots.txt</span><span>Servidor</span></div>
      ${pr.rows.map((r) => `<div class="pt"><span class="n">${lg(r.engine, 13)}<span>${esc(r.token || "Google-Extended")}<small>${PROBE_NAME[r.engine] || ""}</small></span></span>${rb(r.robots)}${sv(r)}</div>`).join("")}
      <p class="mini-note">${note}Pedimos tu portada desde el servidor de GenScore con el nombre de cada bot; el bot real puede recibir otra respuesta. Gemini lee con Googlebot, que no imitamos.</p></div>`;
  }
  /* 1.5.0 (Denis, 2026-11-02): full width, right above the technical
     recommendations: you read the review, then download it if you want. */
  const reportCard = (f) => (f ? `<button class="repbtn" data-act="report">${`<span class="dl">${ic("download", "sm")}</span>`}<span>Descarga el informe de esta página</span><em>Nuevo</em>${ic("arrowr", "sm")}</button>` : "");

  /* ---------------- layer 3: «Haz esto», one card at a time ---------------- */
  const whereOf = (f) => (f.kind === "web" ? "En toda la web" : f.where ? (f.id.startsWith("shop-") ? "En tu tienda" : `En ${esc(f.where)}`) : f.id.startsWith("bot-") ? "En tu robots.txt" : f.id === "llms" ? "En la raíz de tu web" : f.kind === "plan" ? "Tu plan de esta semana" : f.kind === "goal" ? "Tu plan de esta semana" : "En esta página");
  function plate(f, ctx) {
    const key = ctx + ":" + f.id, kind = f.kind || "local", done = S.done[key];
    const pts = f.pts == null && kind !== "goal" ? "" : kind === "goal" ? `<span class="pt q">Objetivo</span>` : f.unit === "en Agentes" ? `<span class="pt num">+${f.pts}<small>Agentes</small></span>` : `<span class="pt num">+${f.pts}<small>pt</small></span>`;
    let body = `<p class="why">${f.why}</p>`;
    if (f.how) body += `<p class="why">${f.how}</p>`;
    if (f.snippet) body += `<pre class="snip" tabindex="0">${esc(f.snippet)}</pre><div class="acts"><button class="btn line sm" data-act="copy" data-key="${esc(key)}">${ic("copy", "sm")}Copiar ${esc(f.copyWhat || "el código")}</button></div>`;
    if (kind === "plan") body += `<div class="acts"><button class="btn line sm" data-act="open" data-to="/dashboard" data-c="plan">Abrir en la consola${ic("arrowr", "sm")}</button></div>`;
    if (kind === "web" && f.to) body += `<div class="acts"><button class="btn line sm" data-act="open" data-to="${esc(f.to)}" data-c="web-fix">Ver en la consola${ic("arrowr", "sm")}</button></div>`;
    /* a real plan item is marked done in the console, where it is saved; the
       panel only reads (paso 02), so it offers no slide that would save nothing */
    const tail = (kind === "plan" && !isSample()) || kind === "web" ? ""
      : kind === "goal" ? `<div class="gline">${ic("trend", "sm")}<span>Objetivo</span><b>${esc(f.goal)}</b><span>Lo seguimos en cada foto</span></div>`
      : done ? `<div class="donebar">${ic("checkc")}<span>Hecha. Se verá en el próximo escaneo.</span><button class="btn sm" data-act="undo" data-key="${esc(key)}">Deshacer</button></div>`
      : slideHtml(key, kind === "local" ? "Desliza cuando lo hayas puesto" : "Desliza para marcar como hecho");
    return `<div class="plc" data-k="${esc(key)}"><div class="top">${srcChip(f.lane)}<span class="k">${whereOf(f)}</span>${pts}</div><div class="dk-k">Haz esto</div><h3>${f.t}</h3>${body}${tail}</div>`;
  }
  function deck(items, ctx, empty, title = "Haz esto") {
    if (!items.length) return `<div class="hz"><div class="ey rule">${title}</div><div class="calm">${ic("checkc")}<span>${empty}</span></div></div>`;
    const idx = Math.min(S.dk[ctx] || 0, items.length - 1);
    S.dk[ctx] = idx;
    const gain = items.filter((x) => x.unit === "pt").reduce((a, x) => a + x.pts, 0);
    const many = items.length > 1;
    return `<div class="hz" data-ctx="${esc(ctx)}"><div class="ey rule">${title}${gain ? `<span class="cnt">Hasta +${Math.min(gain, 100)} pt</span>` : ""}</div>
      ${many ? `<div class="ptk" role="tablist" aria-label="Tarjetas">${items.map((_, i) => `<button role="tab" data-dkgo="${i}" class="${i === idx ? "cur" : ""} ${S.done[ctx + ":" + items[i].id] ? "done" : ""}" aria-label="Tarjeta ${i + 1}" aria-selected="${i === idx}"><span class="num">${String(i + 1).padStart(2, "0")}</span><i></i></button>`).join("")}</div>` : ""}
      <div class="pl ${many ? "" : "one"}">${plate(items[idx], ctx)}</div>
      ${many ? `<div class="nav"><button class="navb" data-dk="-1" aria-label="Anterior" ${idx === 0 ? "disabled" : ""}>${ic("chevl")}</button><button class="navb" data-dk="1" aria-label="Siguiente" ${idx === items.length - 1 ? "disabled" : ""}>${ic("chevr")}</button><span class="sp"></span><span class="ln2 num">${idx + 1} de ${items.length}</span></div>` : ""}</div>`;
  }

  /* ---------------- CTAs ---------------- */
  const arcSvg = () => { let g = ""; for (let i = 0; i <= 40; i++) { const a = ((200 + i * 3.5) * Math.PI) / 180, r0 = i % 5 ? 140 : 128; g += `<line x1="${(150 + r0 * Math.cos(a)).toFixed(1)}" y1="${(150 + r0 * Math.sin(a)).toFixed(1)}" x2="${(150 + 148 * Math.cos(a)).toFixed(1)}" y2="${(150 + 148 * Math.sin(a)).toFixed(1)}"/>`; } return `<svg class="arc" viewBox="0 0 300 300" aria-hidden="true">${g}</svg>`; };
  const ctaNoAcct = (host) => `<div class="deep">${arcSvg()}<div class="egs">${EK.map((e) => `<span>${lg(e, 15)}</span>`).join("")}</div><p class="q">¿Quieres saber si ChatGPT, Gemini, Claude y Perplexity recomiendan <b>${esc(host)}</b> y a sus competidores?</p><button class="btn onink" data-act="open" data-to="/signup" data-c="analizar-dominio">Analizar dominio${ic("arrowr", "sm")}</button><p class="ft">7 días de Pro gratis. Sin tarjeta.</p></div>`;
  /* a site already tracked as a competitor is not offered again (Denis, 2026-11-02) */
  const isCompetitor = (host) => { const D = A(), h = String(host || "").toLowerCase().replace(/^www\./, ""); return !!D && [...(D.competitorDomains || []), ...D.rivals.filter((r) => !r[2]).map((r) => r[3])].some((d) => d && covers(h, String(d).toLowerCase().replace(/^www\./, ""))); };
  const ctaOther = (host) => S.real
    ? `<div class="deep">${arcSvg()}<p class="q" style="margin-top:0">¿Quieres añadir <b>${esc(host)}</b> a tus dominios?</p><button class="btn onink" data-act="open" data-to="/dashboard/projects/new" data-c="nuevo-dominio">Añadir a mis dominios${S.real.domainCap < 100 ? `<span class="dim"> · ${S.real.domains.length} de ${S.real.domainCap}</span>` : ""}</button>${!projPath("") ? "" : isCompetitor(host) ? `<button class="btn lnd" data-act="open" data-to="${esc(projPath("competitors"))}" data-c="competidor-ya">${ic("checkc", "sm")}Ya es competidor de ${esc(curDom())}</button>` : `<button class="btn lnd" data-act="open" data-to="${esc(projPath("competitors") + "?nuevo=" + encodeURIComponent(host) + (S.rec && S.rec.facts && S.rec.facts.siteName ? "&nombre=" + encodeURIComponent(S.rec.facts.siteName) : ""))}" data-c="competidor">Añadir como competidor de ${esc(curDom())}</button>`}</div>`
    : `<div class="deep">${arcSvg()}<p class="q" style="margin-top:0">¿Quieres seguir <b>${esc(host)}</b> en GenScore?</p><button class="btn onink" data-act="sample-only" data-what="analizar un dominio nuevo">Analizar como dominio<span class="dim"> · ${1 + SAMPLE.extraDomains.length} de ${SAMPLE.cap}</span></button><button class="btn lnd" data-act="sample-only" data-what="añadir un competidor">Añadir como competidor de ${esc(S.sample.domain)}</button><button class="lnk2" data-act="use-domain">Probar esta web como mi dominio de ejemplo</button></div>`;

  /* ---------------- header and foot ---------------- */
  const svgGs = (w = 16) => `<svg width="${w}" height="${Math.round(w * 1.03)}" aria-hidden="true"><use href="#e-gs"/></svg>`;
  function headNo(host) { return `<div class="ph">${svgGs(20)}<span class="who">${host ? `<b>Esta página</b>${esc(host)}` : `<b class="wm">GenScore</b>`}</span><span class="lgin">Identifícate en <b class="wm">GenScore</b> para el análisis completo</span><button class="lnk" data-act="open" data-to="/login" data-c="login">Login</button></div>`; }
  /* The selector at the top says what the results below belong to (Denis,
     2026-10-30): the open page is one more option, next to the domains. */
  /* idle: on a page that is not the console, before the icon is pressed. The
     selector then names what to do here, not a domain (Denis, 2026-10-30). */
  function headAcct(idle) {
    const d = curDom(), f = S.rec && S.rec.state === "ok" ? S.rec.facts : null;
    const doms = acctDomains(), cap = S.real ? S.real.domainCap : SAMPLE.cap;
    const brandFor = (x) => (S.real ? (S.real.domains.find((y) => y.domain === x) || {}).brand || brandOf(x) : brandOf(x));
    /* On one of your own sites «Esta página | Toda la web» lives in the Optimización técnica block.
       On someone else's site the selector names the open page, and lists it above your domains (Denis, 2026-11-02). */
    const other = !!f && !idle && relation() === "other";
    const onPage = other && S.tab !== "dom";
    const own = !!f && relation() === "own";
    const pageItem = other ? `<div class="mh" style="margin:6px 10px 4px">Página abierta</div><button class="dd-i ${onPage ? "on" : ""}" role="menuitem" data-tab="page">${tile(f.host)}<span class="t">${esc(f.host)}<span>${esc(pathLabel(f))}</span></span>${onPage ? ic("check", "sm ck") : ""}</button><div class="dd-sep"></div>` : "";
    const days = S.real && S.real.trialEndsAt ? Math.max(0, Math.ceil((new Date(S.real.trialEndsAt) - Date.now()) / 864e5)) : null;
    const planLine = S.real ? (days != null ? `Prueba de ${esc(S.real.plan.name)} · ${days} ${days === 1 ? "día" : "días"}` : `Plan ${esc(S.real.plan.name)}`) : "Prueba de Pro · 7 días";
    const domItem = (x) => { const on = x === d && !onPage && !idle; const act = S.real || x === d ? `data-pick="${esc(x)}"` : `data-act="sample-only" data-what="cambiar de dominio"`; return `<button class="dd-i ${on ? "on" : ""}" role="menuitem" ${act}>${tile(x)}<span class="t">${esc(brandFor(x))}<span>${esc(x)}</span></span>${on ? ic("check", "sm ck") : ""}</button>`; };
    const newDom = S.real ? `data-act="open" data-to="/dashboard/projects/new" data-c="nuevo-dominio"` : `data-act="sample-only" data-what="añadir un dominio"`;
    const menu = S.dd ? `<div class="dd-m" role="menu">${pageItem}<div class="mh" style="margin:6px 10px 4px">Tus dominios<span class="r num">${doms.length} de ${cap}</span></div>${doms.map(domItem).join("")}<div class="dd-sep"></div>${isSample() && f && !own ? `<button class="dd-i" role="menuitem" data-act="use-domain">${tile(f.host)}<span class="t">Probar ${esc(f.host)}<span>como mi dominio de ejemplo</span></span></button>` : ""}<button class="dd-i add" role="menuitem" ${newDom}><span class="ico">${ic("plus", "sm")}</span><span class="t">Nuevo dominio</span><span class="cap num">${doms.length} de ${cap}</span></button><div class="mh" style="margin:8px 10px 4px">${planLine}</div></div>` : "";
    const btn = idle
      ? `<span class="fav pgi">${ic("scan", "sm")}</span><span class="t"><b>Analiza la página actual</b><span class="d sans">o elige uno de tus dominios</span></span>`
      : onPage
      ? `${tile(f.host)}<span class="t"><b>${esc(f.host)}</b><span class="d">Página abierta · ${esc(pathLabel(f))}</span></span>`
      : d ? `${tile(d)}<span class="t"><b>${esc(brandFor(d))}</b><span class="d">${esc(d)}</span></span>`
      : `<span class="t"><b>Sin dominios</b><span class="d">Añade el primero en la consola</span></span>`;
    const ini = S.real ? esc((S.real.email || "?").slice(0, 2).toUpperCase()) : "DM";
    const av = S.real ? `<button class="av" data-act="open" data-to="/dashboard/settings" data-c="cuenta" aria-label="Tu cuenta">${ini}</button>` : `<button class="av" data-act="sample-only" data-what="abrir tu cuenta" aria-label="Tu cuenta">DM</button>`;
    return `<div class="ph">${svgGs(20)}<div class="dd"><button class="pj" data-act="dd" aria-expanded="${!!S.dd}" aria-haspopup="menu">${btn}${ic("updown", "sm")}</button>${menu}</div>${av}</div>
      ${isSample() ? `<div class="ctx">${EJ0}<span>Cuenta y escaneos inventados para probar. La revisión de la página es real.</span></div>` : ""}`;
  }
  function foot(f) {
    return `<div class="pf">${acctOn() ? `<button class="open" data-act="open" data-to="/dashboard" data-c="abrir-consola">${svgGs()}Abrir la consola${ic("arrowr", "sm")}</button>` : ""}
      <div class="sets"><div class="sws"><button class="sw ${S.autoOn && S.read ? "on" : ""}" data-act="auto" role="switch" aria-checked="${S.autoOn && S.read}"><i></i>Revisar automáticamente las páginas</button>${S.real || !GS_SAMPLE ? "" : `<button class="sw ${S.sample.on ? "on" : ""}" data-act="sample" role="switch" aria-checked="${S.sample.on}"><i></i>Cuenta de ejemplo</button>`}</div><span class="sp"></span><button class="thb" data-act="theme" aria-label="Cambiar de tema">${ic(curTheme() === "dark" ? "sun" : "moon", "sm")}</button></div></div>`;
  }


  /* ---------------- EXT-AUDITS-1 (log §406): the domain's audits, read-only ----------------
     What the console already audited (technical snapshot and agentic review),
     from /api/ext/project. Nothing here launches a review or calls an LLM. */
  // Straight to Google's consent screen for this project (the route checks the
  // session owns it and returns to «Posición en Google»); without a project id,
  // the console.
  // EXT-GSC-1 (log §409): what /api/ext/project says about Search Console.
  // Connected → the same three figures as Visión general; never connected or
  // an older server → the one invitation text; "off" → nothing.
  const gscBlock = () => {
    const p = S.proj[curDom()], g = p && typeof p === "object" ? p.searchConsole : null;
    // Signed out: the sample teaser. Signed in: invite only on the real state,
    // never while the project is loading, failed or did not report it.
    if (!g) return S.real ? "" : gscInvite();
    if (g.state === "disconnected") return gscInvite();
    if (g.state === "off") return "";
    const to = projPath("search-console") || "/dashboard";
    const go = (label, c) => `<button class="btn line sm" data-act="open" data-to="${esc(c === "gsc-reconnect" ? gscTo() : to)}" data-c="${c}">${label}${ic("arrowr", "sm")}</button>`;
    const box = (body, btn) => `<div class="calm col gsc1">${lg("google", 16)}${body}${btn}</div>`;
    if (g.state === "reconnect") return box(`<span>Google ha retirado el permiso de Search Console. Vuelve a conectar para ver tus búsquedas, tu puesto y tus clics.</span>`, go("Volver a conectar", "gsc-reconnect"));
    if (g.state === "pick_property") return box(`<span>Search Console está conectado. Elige qué propiedad corresponde a ${esc(curDom())}.</span>`, go("Elegir propiedad", "gsc-property"));
    if (g.state === "error") return box(`<span>Search Console está conectado, pero Google no ha respondido ahora mismo.</span>`, go("Ver Posición en Google", "gsc-open"));
    if (g.empty) return box(`<span>Search Console conectado. Google no ha devuelto búsquedas de tu web en estos 28 días.</span>`, go("Ver Posición en Google", "gsc-open"));
    if (g.trend) return gscRich(g, go);
    const fmtN = (n) => Number(n).toLocaleString("es-ES");
    const pos = g.position == null || g.position === 0 ? "—" : Number(g.position).toLocaleString("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    const cells = [[fmtN(g.clicks), g.clicks === 1 ? "clic" : "clics"], [pos, "puesto medio"]];
    if (g.nearPage1 > 0) cells.push([fmtN(g.nearPage1), g.nearPage1 === 1 ? "búsqueda en la página 2" : "búsquedas en la página 2"]);
    return `<div class="mh">Google · últimos 28 días</div><div class="eng1 gscn">${cells.map(([v, l]) => `<div class="c"><b class="num">${v}</b><span class="n">${l}</span></div>`).join("")}</div><div class="acts">${go("Ver Posición en Google", "gsc-open")}</div>`;
  };
  const gscTo = () => { const pp = projPath(""); return pp ? `/api/search-console/connect?projectId=${pp.split("/").pop()}` : "/dashboard"; };
  const projPath = (sub) => { const d = S.real && S.real.domains.find((x) => x.domain === curDom()); return d && d.id ? `/dashboard/projects/${d.id}${sub ? "/" + sub : ""}` : null; };
  const AUD_META = {
    geo: { name: "Auditoría GEO", q: "¿Te puede citar la IA?", more: "Ver la Auditoría GEO", to: "web-audit?bloque=geo" },
    seo: { name: "Auditoría SEO", q: "¿Te encuentra Google?", more: "Ver la Auditoría SEO", to: "web-audit?bloque=seo" },
    agent: { name: "Auditoría agéntica", q: "¿Puede un agente comprar en tu web?", more: "Ver la visibilidad en agentes", to: "agentic-visibility" }
  };
  const audOf = () => { if (isSample()) return null; const p = S.proj[curDom()]; return p && typeof p === "object" && p.audits ? p.audits : null; };
  const shortDate = (iso) => { try { return new Date(iso).toLocaleDateString("es-ES", { day: "numeric", month: "short" }).replace(".", ""); } catch (e) { return ""; } };
  const fmtPts = (n) => (n == null ? "" : n < 1 ? "<1" : "+" + String(Math.round(n * 10) / 10).replace(".", ","));
  const SEV = { critical: "hi", warning: "md", improvement: "lo", agentic: "md" };
  function pageAudit() {
    const au = audOf();
    if (!au || !au.page) return "";
    if (au.page.state === "not_audited") return `<div class="aud"><div class="ey rule">En tu auditoría</div><div class="calm">${svgGs(16)}<span>Esta página no está entre las que revisa la consola. Lo de arriba sale solo de tu navegador.</span></div></div>`;
    const pa = au.page, proj = S.proj[curDom()];
    const cited = [...new Set(((proj && proj.citingPrompts) || []).flatMap((q) => q.engines))];
    const yn = (v, y, n) => (v == null ? "" : `<span class="w ${v ? "yes" : "no"}">${ic(v ? "check" : "x")}${v ? y : n}</span>`);
    const facts = [
      au.auditedAt ? `<div class="kv"><span>Revisada desde el servidor</span><span class="w">${esc(shortDate(au.auditedAt))}</span></div>` : "",
      pa.aiBotsAllowed == null ? "" : `<div class="kv"><span>ChatGPT, Gemini, Claude y Perplexity</span>${yn(pa.aiBotsAllowed, "Pueden entrar", "Alguno bloqueado")}</div>`,
      pa.indexable == null ? "" : `<div class="kv"><span>Google puede indexarla</span>${yn(pa.indexable, "Sí", "No, tiene noindex")}</div>`,
      cited.length ? `<div class="kv"><span>La citan en sus respuestas</span><span class="w yes">${ic("check")}${esc(cited.join(" y ").replace(/ y (?=.* y )/g, ", "))}</span></div>` : ""
    ].join("");
    const rows = pa.issues.map((x) => `<div class="aui"><span class="d md"></span><span class="tx">${esc(x.label)}<small>${AUD_META[x.block].name}</small></span></div>`).join("");
    const to = projPath("web-audit?bloque=" + (pa.issues[0] ? pa.issues[0].block : "geo"));
    return `<div class="aud"><div class="ey rule">En tu auditoría</div><div class="auc open solo"><div class="aubi">${facts}${rows ? `<div class="aus">Problemas de esta página según GenScore</div>${rows}` : `<div class="calm">${ic("checkc")}<span>GenScore no ve problemas técnicos en esta página.</span></div>`}${to ? `<div class="acts"><button class="btn line sm" data-act="open" data-to="${esc(to)}" data-c="aud-page">Ver en la Auditoría técnica${ic("arrowr", "sm")}</button></div>` : ""}</div></div></div>`;
  }
  /* ---------------- views ---------------- */
  /* The paused panel (Denis, 2026-10-30, version B of the artifact): a small
     replica of Chrome's toolbar where a cursor presses the GenScore icon, since
     only that icon can read a page without the permission, and ONE button,
     «Escanear automáticamente las páginas», which asks for the permission once.
     Chrome lets nothing draw over its own toolbar, so the real icon only gets
     a blinking badge (badgeTick). */
  const PUZ = `<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path d="M10 4.5a2 2 0 1 1 4 0V6h3a1 1 0 0 1 1 1v3h-1.5a2 2 0 1 0 0 4H18v3a1 1 0 0 1-1 1h-3v-1.5a2 2 0 1 0-4 0V18H7a1 1 0 0 1-1-1v-3h1.5a2 2 0 1 0 0-4H6V7a1 1 0 0 1 1-1h3z" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>`;
  const CUR = `<svg class="mbcur" viewBox="0 0 18 22" aria-hidden="true"><path d="M1.5 1.5v16l4.3-4 3 6.6 3-1.4-3-6.4h6z" fill="var(--surface)" stroke="var(--ink)" stroke-width="1.4" stroke-linejoin="round"/></svg>`;
  function viewIdle(paused) {
    const auto = S.autoOn && S.read ? "" : `<div class="autobox"><button class="rv" data-act="auto-on">${ic("eye", "sm")}<span>Escanear automáticamente las páginas</span></button>
      ${S.read ? "" : `<p class="tiny">Chrome te pedirá permiso para leer las webs.</p>`}</div>`;
    return `<div class="px pfull">${acctOn() ? headAcct(!!S.real) : headNo("")}<div class="paused idleb">
      <div class="idlemain"><div class="minibar" aria-hidden="true"><i class="u"></i><span class="t">${PUZ}</span><span class="t g">${svgGs(14)}</span><i class="av"></i><i class="hit"></i>${CUR}</div>
      <h2>${paused || S.real ? "Para analizar la página actual, pulsa el icono de nuevo" : "Pulsa el icono"}</h2>
      <div class="kbd"><span>o</span><span class="ks"><kbd>Alt</kbd>+<kbd>Mayús</kbd>+<kbd>G</kbd></span></div></div>
      ${auto}</div>${foot(null)}</div>`;
  }
  /* Signed in and no page read yet: the panel opens on the project the
     console is pointed at, with one line on how to read the open page
     (Denis, 2026-10-30). Once a page is read, it takes over (viewReview). */
  /* Not while the open tab is GenScore itself: right after signing in the
     person is on the console, and the hint only makes sense once they visit
     another page (Denis, 2026-10-30). Chrome gives the tab's URL only for
     GS_API, which is the one origin the manifest holds; elsewhere it is
     undefined, and that also counts as «another page». */
  const onConsole = () => !!S.tabNow && S.tabNow.startsWith(GS_API + "/");
  function pageHint() {
    if ((S.read && S.autoOn) || onConsole()) return "";
    if (S.read) return `<button class="pghint" data-act="review-now"><span class="k2">${ic("scan", "sm")}</span><span class="tx"><b>Analizar la página actual</b></span>${ic("arrowr", "sm")}</button>`;
    return `<div class="pghint" role="note"><span class="k2">${svgGs(14)}</span><span class="tx"><b>Para analizar la página actual, pulsa el icono de nuevo</b><span class="ks"><kbd>Alt</kbd>+<kbd>Mayús</kbd>+<kbd>G</kbd></span></span></div>`;
  }
  function viewDom() {
    S.sc = null;
    return `<div class="px">${headAcct()}${justIn()}${pageHint()}${geoSection(null, "own")}${techSection(null, null, "own")}${foot(null)}</div>`;
  }
  function viewReading() {
    return `<div class="px pfull">${acctOn() ? headAcct() : headNo("")}<div class="paused"><span class="ring spin">${svgGs(30)}</span><h2>Leyendo la página</h2><p>Su HTML, su robots.txt y su llms.txt. Desde tu navegador.</p></div></div>`;
  }
  function viewError(r) {
    const t = { blocked: ["Esta página no se puede revisar", "Chrome no deja que ninguna extensión lea sus propias páginas, la tienda ni los PDF."], perm: ["Pulsa el icono otra vez", "Chrome retiró el permiso al cambiar de página."], gone: ["La pestaña ya no está", "Abre la página y pulsa el icono."], other: ["No hemos podido leerla", "Recarga la página y pulsa el icono otra vez."] }[r] || ["No hemos podido leerla", ""];
    return `<div class="px pfull">${acctOn() ? headAcct() : headNo("")}<div class="paused"><span class="ring">${ic("warn")}</span><h2>${t[0]}</h2><p>${t[1]}</p>${r === "blocked" || !S.read ? "" : `<button class="rv" data-act="review-now">${ic("scan")}<span>Revisar esta página</span>${ic("arrowr", "sm")}</button>`}</div>${foot(null)}</div>`;
  }
  /* ===== EXT-PANEL-COHERENCE-1 (log §433): one skeleton signed in and out =====
     Denis kept the store design and asked only for coherence between the two states:
     1 · Optimización técnica [Esta página | Toda la web]: number + band bar, three gauges, Recomendaciones técnicas.
     2 · Puntuación GEO: the only dial. Signed out it is the same dial, «Sin medir», with the dark invitation.
     Signed out the technical block leads; signed in the Puntuación GEO does, because it is what the account adds. */
  const LOCK = `<svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true"><rect x="5" y="11" width="14" height="9.5" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8.5 11V8a3.5 3.5 0 0 1 7 0v3" fill="none" stroke="currentColor" stroke-width="2"/></svg>`;
  /* «Toda la web» read as «all of the internet» (Denis, 2026-11-02): the tab names the domain, or «Todo el dominio» when it does not fit */
  const scopeHost = () => String((acctOn() ? curDom() : S.scf && S.scf.host) || "").replace(/^www\./, "");
  const scopeName = () => { const h = scopeHost(); return h && h.length <= 22 ? `Todo ${esc(h)}` : "Todo el dominio"; };
  const scopeSeg = (locked) => `<div class="seg sx" role="tablist"><span class="ind"></span><button role="tab" data-tab="page" aria-pressed="${S.tab !== "dom"}">Esta página</button><button role="tab" data-tab="dom" aria-pressed="${S.tab === "dom"}" title="Todas las páginas clave de ${esc(scopeHost())}">${scopeName()}${locked ? `<span class="lk2" aria-label="Con tu cuenta">${LOCK}</span>` : ""}</button></div>`;
  function oHero(v, say, locked) {
    if (locked) return `<div class="oh lockd"><div class="ohn"><span class="big num q">?</span><span class="ohw"><b class="w">Sin medir</b><small>${scopeHost() ? `Todo ${esc(scopeHost())}` : "Todo el dominio"}, con tu cuenta</small></span></div><div class="osc"><i class="f" style="width:0"></i><i class="bd" style="left:50%"></i><i class="bd" style="left:75%"></i></div><div class="obands"><span>Se frena</span><span>Mejorable</span><span>Optimizada</span></div><p class="say">${say}</p></div>`;
    const [c, w] = readyBand(v);
    return `<div class="oh"><div class="ohn"><span class="big num"><span id="heroN">${roll(v)}</span><small>%</small></span><span class="ohw"><b class="w ${c}">${w}</b><small>Optimización técnica</small></span></div>
      <div class="osc ${c}" role="img" aria-label="${v}%, ${w}"><i class="f" style="--w:${v}%"></i><i class="bd" style="left:50%"></i><i class="bd" style="left:75%"></i><span class="mk" style="--w:${v}%"></span></div>
      <div class="obands"><span class="${c === "bad" ? "on" : ""}">Se frena</span><span class="${c === "mid" ? "on" : ""}">Mejorable</span><span class="${c === "ok" ? "on" : ""}">Optimizada</span></div><p class="say">${say}</p></div>`;
  }
  /* Who can read / who can buy: official logos, small, only inside an open IA
     or Agentes. The agents are the console's own list and rules
     (lib/agentic-audit/shopping-agents.ts): each one finds the site through
     its maker's search bot; Grok Bot and Instinct publish no identity, so
     they are «No se ve desde fuera», never green. Meta is read from the same
     robots.txt with `meta-webindexer` and stays outside the note, as in the
     WordPress plugin. */
  const WHO = {
    ia: [["chatgpt", "ChatGPT", "chatgpt"], ["gemini", "Gemini", "gemini"], ["claude", "Claude", "claude"], ["perplexity", "Perplexity", "perplexity"], ["meta", "Meta AI", "meta"]],
    agent: [["meta", "Muse", "meta"], ["chatgpt", "Dots", "chatgpt"], ["gemini", "Agente de Gemini", "gemini"], ["perplexity", "Comet", "perplexity"], ["grok", "Grok Bot", null], [null, "Instinct", null]]
  };
  function metaAccess(f, path) {
    const r = f && f.robots;
    if (!r || r.status === 0 || r.status >= 500) return null;
    if (r.status !== 200 || r.text == null) return true;
    return GS_SCORE.tokenVerdict(GS_SCORE.parseRobots(r.text), "meta-webindexer", path).allowed;
  }
  function whoRow(k, sc, f, path) {
    const acc = (via) => (via === "meta" ? metaAccess(f, path) : sc.access[via]);
    const st = (via) => { if (via == null) return "h"; const a = acc(via); return a == null ? "u" : a ? "y" : "n"; };
    const T = { y: k === "ia" ? "Puede leerla" : "Te encuentra", n: "Bloqueado", u: "Sin comprobar", h: "No se ve desde fuera" };
    const rows = WHO[k].map(([logo, n, via]) => [logo, n, st(via)]);
    const items = rows.map(([logo, n, s]) => `<span class="wi ${s}" data-tip="${n} · ${T[s]}">${logo ? `<svg aria-hidden="true"${logo === "grok" ? ' class="mo"' : ""}><use href="#e-${logo}"/></svg>` : `<span class="mono1" aria-hidden="true">${n[0]}</span>`}<i></i><span class="sr">${n}: ${T[s]}</span></span>`).join("");
    const used = new Set(rows.map((r) => r[2]));
    return `<div class="wrow"><span class="wl">${k === "ia" ? "Quién puede leerla" : "Agentes que compran"}</span><span class="wis">${items}</span></div><div class="wleg">${["y", "n", "u", "h"].filter((x) => used.has(x)).map((x) => `<span><i class="${x}"></i>${T[x]}</span>`).join("")}</div>`;
  }
  function pageLaneBody(k, sc, rel) {
    const C = sc.criteria.filter((c) => c.lane === k && !c.id.startsWith("bot-"));
    if (k === "ia") {
      const pr = rel === "own" && A() ? A().prompts : [];
      return (pr.length ? `<div class="mh">La citan en tus prompts${EJx()}</div>${promptRows(pr.slice(0, 3))}` : "") + `<div class="mh">En la página</div>${kv(C)}`;
    }
    if (k === "google") return (rel === "own" ? gscOwnPage() : "") + `<div class="mh">En la página</div>${kv(C)}`;
    if (sc.shop && sc.shop.state === "found") return `<div class="mh">Lo que lee un agente</div>${kv(sc.shop.criteria)}`;
    return `<div class="mh">Lo que lee un agente</div>${kv(C)}<p class="mini-note">Se mira sólo cuando la página vende algo.</p>`;
  }
  function audBody(b) {
    const m = AUD_META[b.key], to = projPath(m.to), unit = b.key === "agent" ? "Agentes" : "pt";
    const rows = b.issues.map((x) => `<div class="aui"><span class="d ${SEV[x.severity] || "lo"}"></span><span class="tx">${esc(x.label)}${x.scope ? `<small>${esc(x.scope)}</small>` : ""}</span><span class="pt num">${fmtPts(x.points)}${x.points == null ? "" : `<small>${unit}</small>`}</span></div>`).join("");
    return `<div class="mh">${m.name}</div>${rows || `<div class="calm">${ic("checkc")}<span>Nada que arreglar en este bloque.</span></div>`}${b.projected ? `<div class="aug">${ic("trend", "sm")}<span>Si arreglas ${b.issues.length === 1 ? "esto" : b.issues.length === 2 ? "estos dos" : "estos tres"}</span><b class="num">${b.score} → ${b.projected}</b></div>` : ""}${to ? `<div class="acts"><button class="btn line sm" data-act="open" data-to="${esc(to)}" data-c="aud-${b.key}">${m.more}${ic("arrowr", "sm")}</button></div>` : ""}`;
  }
  /* The whole site, signed in: what the console already audited, never a new
     figure. The number is the technical readiness of the audited pages (the
     Salud técnica, `audits.readiness`), the same 55/45 mix of IA and Google
     the page note uses; the gauges are the three audit blocks. */
  function webBlock(sc, f) {
    const p = S.proj[curDom()], au = audOf();
    if (!au) return { hero: `<div class="calm">${svgGs(16)}<span>${isSample() ? "La cuenta de ejemplo no trae auditorías de la web." : p === "loading" || p == null ? "Leyendo las auditorías de tu web." : p === "error" ? "No hemos podido leer las auditorías de tu web." : "GenScore todavía no ha auditado tu web. La auditoría se hace sola tras cada escaneo."}</span></div>`, lanes: "", body: "", cards: "" };
    const B = (key) => au.blocks.find((b) => b.key === key);
    const bl = [["ia", "geo"], ["google", "seo"], ["agent", "agent"]].filter(([, b]) => B(b));
    const v = au.readiness;
    const hero = v == null
      ? `<div class="oh"><p class="say">${au.auditedAt ? `Auditada el ${esc(shortDate(au.auditedAt))}.` : ""} Las tres auditorías de toda tu web, una por indicador.</p></div>`
      : oHero(v, `${v >= 75 ? "Tus páginas clave están listas para la IA y para Google." : v >= 50 ? "Tus páginas clave se pueden mejorar para la IA y para Google." : "Tus páginas clave frenan a la IA y a Google."}${au.auditedAt ? ` Auditada el ${esc(shortDate(au.auditedAt))}.` : ""}`);
    const lanes = bl.map(([k, b], i) => { const s = B(b).score, c = readyBand(s)[0]; return gauge({ v: s, unit: "%", cls: c, nm: laneName(k), icon: laneIcon(k), st: readyBand(s)[1], lane: k, i }); }).join("");
    const body = bl.map(([k, b]) => laneBox(k, () => (k !== "google" && sc ? whoRow(k, sc, f, "/") : "") + (k === "ia" ? probeCard() : "") + audBody(B(b)) + (k === "google" ? gscBlock() : ""))).join("");
    /* block points are not additive (lib/ext/audits.ts), so these cards never sum into «Hasta +N pt» */
    const top = bl.flatMap(([k, b]) => B(b).issues.map((x) => ({ ...x, lane: k, blk: b }))).filter((x) => x.points != null).sort((a, b) => b.points - a.points).slice(0, 3);
    const cards = deck(top.map((x, i) => ({ id: "w" + i + ":" + x.check, kind: "web", lane: x.lane, pts: Math.max(1, Math.round(x.points)), unit: x.blk === "agent" ? "en Agentes" : "bloque", t: esc(x.label), why: `Según la ${AUD_META[x.blk].name}${x.scope ? `: ${esc(x.scope)}` : ""}.`, to: projPath(AUD_META[x.blk].to) })), "web", "Nada que arreglar en toda tu web.", "Recomendaciones técnicas");
    return { hero, lanes, body, cards };
  }
  function teaser(k) {
    const T = { ia: ["Conoce cómo te citan los motores", "Cuánto te nombra cada motor y quién sale antes que tú."], google: ["Conoce la Salud SEO de todo tu dominio", "Todas tus páginas clave, no solo esta, y qué arreglar primero."], agent: ["Conoce tu nota para agentes", "Cómo te descubren, te entienden, se fían y te compran."] }[k];
    let ill;
    if (k === "ia") ill = `<div class="eng1 ghost">${EK.map((e) => `<div class="c" data-tip="${ENG[e].n}"><svg class="l" aria-hidden="true"><use href="#e-${e}"/></svg><b class="q"></b><span class="n">${ENG[e].n}</span><span class="tb"><i></i></span></div>`).join("")}</div><div class="xk ghost">${[86, 64, 52, 38].map((w, i) => `<div class="xq${i === 1 ? " me" : ""}"><span class="ps num">${i + 1}</span><span class="fav gh"></span><span class="q" style="width:${70 - i * 8}%"></span><span class="tb"><i style="width:${w}%"></i></span><span></span></div>`).join("")}</div>`;
    else if (k === "google") ill = `<div class="gseo ghost"><span class="aur"><svg viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="16" class="t"/></svg></span><div>${[92, 74, 84].map((w) => `<span class="q" style="width:${w}%"></span>`).join("")}</div></div>`;
    else ill = `<div class="ag4 ghost">${["Descubrimiento", "Comprensión", "Confianza", "Compra"].map((n) => gauge({ v: null, cls: "", nm: n, st: "", tag: "div" })).join("")}</div>`;
    return `<div class="tz"><div class="ill">${ill}<span class="lk">${ic("shield", "sm")}</span></div><b class="h">${T[0]}</b><p>${T[1]}</p><button class="btn ink" data-act="open" data-to="/login" data-c="tz-login">Identifícate gratis${ic("arrowr", "sm")}</button></div>`;
  }
  function techSection(f, sc, rel) {
    const scoped = rel === "own" || rel === "none";
    const dom = scoped && (S.tab === "dom" || !sc);
    let hero, lanes, body, cards = "", tail = "";
    if (!dom) {
      const shopOn = !!(sc.shop && sc.shop.state === "found");
      const ks = ["ia", "google"].concat(sc.commerce || shopOn || rel !== "own" ? ["agent"] : []);
      hero = oHero(sc.nota, sc.say) + histLine(f);
      lanes = ks.map((k, i) => { const v = sc.lanes[k], c = v == null ? "na" : readyBand(v)[0]; return gauge({ v, unit: "%", cls: c, nm: laneName(k), icon: laneIcon(k), st: k === "ia" && sc.blockedEngines.length ? `${4 - sc.blockedEngines.length} de 4 la leen` : v == null ? "No aplica" : readyBand(v)[1], lane: k, i }); }).join("");
      body = ks.map((k) => laneBox(k, () => (k !== "google" ? whoRow(k, sc, f, f.path) : "") + pageLaneBody(k, sc, rel))).join("");
      cards = deck(sc.fixes, "page:" + f.url, "Nada que arreglar en esta página. La pueden leer los cuatro motores y Google.", "Recomendaciones técnicas");
      if (rel === "own" && covers(f.host, curDom())) tail = pageAudit();
    } else if (rel === "none") {
      hero = oHero(null, "Las tres auditorías de toda tu web: ¿te cita la IA, te encuentra Google, puede comprar un agente?", true);
      /* each locked gauge opens its own teaser, a figure-free picture of what the account adds (§408, back by Denis 2026-11-02) */
      const LK = [["ia", "Auditoría GEO"], ["google", "Auditoría SEO"], ["agent", "Auditoría agéntica"]];
      lanes = LK.map(([k, st], i) => `<button class="gg na lkg" data-lane="${k}" aria-expanded="${S.lane === k}" style="--v:0;--gd:${i * 90}ms"><span class="dl"><svg viewBox="0 0 120 104" aria-hidden="true"><path class="trk" d="${garc(60, 44)}"/></svg><span class="in">${ic("shield")}</span></span><span class="nm">${laneIcon(k)}${laneName(k)}</span><span class="st">${st}${ic("chevd", "chev")}</span></button>`).join("");
      body = LK.map(([k]) => laneBox(k, () => teaser(k))).join("");
      if (LK.some(([k]) => S.lane === k)) cards = "";
      else
      cards = `<div class="lkcta"><p><b>Toda tu web, no solo esta página.</b> Las tres auditorías con cada punto de mejora, gratis con tu cuenta.</p><button class="btn ink" data-act="open" data-to="/login" data-c="web-login">Identifícate en GenScore${ic("arrowr", "sm")}</button></div>`;
    } else {
      ({ hero, lanes, body, cards } = webBlock(sc, f));
    }
    const seg = scoped && sc ? scopeSeg(rel === "none") : `<span class="sxl">${dom ? scopeName() : "Esta página"}</span>`;
    return `<section class="sct"><div class="sh2"><div class="ey">Optimización técnica</div>${seg}</div>
      <p class="qq">¿Está tu web optimizada para la IA y Google?</p>
      <div class="hq prep">${hero}${lanes ? `<div class="gg3">${lanes}</div>` : ""}${body}</div>${dom ? "" : alertHtml(sc, f) + shopLine(sc) + aiCard(f) + reportCard(f)}${cards}${tail}</section>`;
  }
  function geoSection(host, rel) {
    const head = `<div class="sh2"><div class="ey">Puntuación GEO · <span class="mono">${esc(rel === "none" ? host : curDom())}</span>${rel === "none" ? "" : EJx()}</div></div><p class="qq">¿Sabes si la IA recomienda tu marca?</p>`;
    if (rel === "none") {
      return `<section class="sgeo">${head}<div class="hq off"><div class="dialbox">${dial(0)}<div class="dial-c"><span class="big num q">?</span><span class="of">Sin medir</span></div></div>
        <div class="bands"><span>Inicial</span><span>Emergente</span><span>Competitivo</span></div></div>${ctaNoAcct(host)}</section>`;
    }
    if (rel === "other") return `<section class="sgeo">${ctaOther(host)}</section>`;
    const D = A();
    if (!D) return `<section class="sgeo">${head}${heroDom()}</section>`;
    const s = D.score, top = D.rivals.find((r) => !r[2]), me = D.rivals.find((r) => r[2]);
    const engs = EK.filter((e) => D.engines[e] != null);
    const say = s != null && me ? `Te nombran en el ${me[1]}% de las preguntas principales de búsqueda.` : esc(D.say);
    return `<section class="sgeo">${head}<div class="hq"><div class="dialbox">${dial(s ?? 0)}<div class="dial-c"><span class="big num">${s == null ? "–" : roll(s)}</span><span class="of">Puntuación GEO</span></div></div>
      <div class="bands"><span class="${s != null && s < 40 ? "on" : ""}">Inicial</span><span class="${s != null && s >= 40 && s < 70 ? "on" : ""}">Emergente</span><span class="${s != null && s >= 70 ? "on" : ""}">Competitivo</span></div>
      <p class="say">${say}</p>${D.scanDate && engs.length ? `<div class="prov">${ic("notes", "sm")}<span>Escaneo del ${esc(shortDate(D.scanDate))} · ${engNames(engs)} · preguntas principales de búsqueda</span></div>` : ""}
      ${engs.length ? `<div class="eng1 sm">${engs.map((e) => `<div class="c" data-tip="${ENG[e].n}"><svg class="l" aria-hidden="true"><use href="#e-${e}"/></svg><b class="num">${D.engines[e]}<small>%</small></b><span class="n">${ENG[e].n}</span><span class="tb"><i style="width:${D.engines[e]}%"></i></span></div>`).join("")}</div>` : ""}
      ${top && me && top[1] > me[1] ? `<div class="rv1">${favImg(top[3], top[0])}<span><b>${esc(top[0])}</b> sale más que tú: en el ${top[1]}% de las respuestas.</span></div>` : ""}</div>
      ${deck(D.plan, "dom", "Tu plan está al día.", "Recomendaciones de GenScore")}</section>`;
  }
  /* EXT-REACH-1 (log §436): the one-time ask for a store rating (rules in rate.js) */
  const rateCard = () => (S.rateAsk ? `<div class="rate" role="region" aria-label="Valorar la extensión"><b>¿Te está siendo útil?</b><p>Una valoración en Chrome Web Store ayuda a que otras personas encuentren la extensión. Tarda un minuto.</p><div class="ra"><button class="btn blue sm" data-act="rate-go">Valorar en Chrome Web Store</button><button class="btn ghost sm" data-act="rate-later">Ahora no</button></div></div>` : "");
  const justIn = () => (S.justIn ? `<div class="justin" role="status">${ic("checkc", "sm")}<span>Has entrado. El panel se ha actualizado solo.</span><button class="jx" data-act="justin-x" aria-label="Cerrar aviso">${ic("x", "sm")}</button></div>` : "");
  /* Closing the notice collapses its own height, so what sits below slides up
     instead of jumping (Denis, 2026-11-02). It also leaves on its own. */
  let justInTimer = 0;
  function dismissJustIn() {
    S.justIn = false;
    clearTimeout(justInTimer);
    const el = document.querySelector(".justin");
    if (!el) return;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) { el.remove(); return; }
    el.style.height = el.offsetHeight + "px";
    void el.offsetHeight;
    el.classList.add("out");
    el.addEventListener("transitionend", (e) => { if (e.propertyName === "height") el.remove(); });
    setTimeout(() => el.remove(), 600);
  }
  function viewReview(f, sc) {
    const rel = relation();
    S.sc = sc; S.scf = f;
    /* a new page starts on itself */
    if (S.tabUrl !== f.url) { S.tabUrl = f.url; if (!S.justIn) S.tab = "page"; }
    /* on someone else's site, picking one of your domains in the selector shows that domain */
    if (rel === "other" && S.tab === "dom") return viewDom();
    const head = rel === "none" ? headNo(f.host) : headAcct();
    const t = techSection(f, sc, rel), g = geoSection(f.host, rel);
    /* signed in, the Puntuación GEO leads on your own site: it is what the account adds.
       On someone else's site the page review leads and «¿Quieres añadir…?» closes it (Denis, 2026-11-02) */
    return `<div class="px">${head}${justIn()}${rateCard()}${rel === "own" ? g + t : t + g}${foot(f)}</div>`;
  }

  /* ---------------- toolbar badge ---------------- */
  let badgeTimer = null, badgeOn = false, badgeTab = null;
  function badgeTick(idle) {
    if (idle && S.tabId != null && !RM.matches) {
      if (badgeTimer && badgeTab === S.tabId) return;
      clearInterval(badgeTimer); if (badgeTab != null && badgeTab !== S.tabId) Env.badge(badgeTab, false);
      badgeTab = S.tabId; badgeOn = false;
      const t = () => { badgeOn = !badgeOn; Env.badge(badgeTab, badgeOn); };
      t(); badgeTimer = setInterval(t, 900);
    } else if (idle && S.tabId != null) {
      Env.badge(S.tabId, true); badgeTab = S.tabId;
    } else {
      clearInterval(badgeTimer); badgeTimer = null;
      if (badgeTab != null) Env.badge(badgeTab, false);
      badgeTab = null;
    }
  }
  addEventListener("pagehide", () => { clearInterval(badgeTimer); if (badgeTab != null) Env.badge(badgeTab, false); });

  /* ---------------- draw ---------------- */
  let SC = null;
  function draw() {
    const pn = $("#panel");
    let html, ctx;
    const idle = !S.rec && !(S.read && S.autoOn && S.tabId != null);
    badgeTick(idle && !(S.real && (S.read || onConsole())));
    /* Signed in: on the console the panel shows the console's domain; on any
       other page it shows the paused screen, unless a domain was picked in
       the selector (Denis, 2026-10-30). */
    if (!S.rec && idle && S.real && curDom() && (onConsole() || S.pickedDom)) { html = viewDom(); ctx = "dom|" + curDom() + "|" + (A() ? 1 : 0); }
    else if (!S.rec) { html = idle ? viewIdle(S.shown) : viewReading(); ctx = "idle" + S.read + S.autoOn; }
    else if (S.rec.state === "reading") { html = viewReading(); ctx = "reading"; }
    else if (S.rec.state === "error") { html = viewError(S.rec.reason); ctx = "error"; }
    else {
      SC = GS_SCORE.scorePage(S.rec.facts);
      html = viewReview(S.rec.facts, SC);
      ctx = [S.rec.at, relation(), S.tab].join("|");
      S.shown = true;
    }
    pn.innerHTML = html;
    /* a favicon that does not load (204 from /api/favicon, offline) falls back to the letter tile */
    $$("img.fi", pn).forEach((im) => { const bad = () => { im.outerHTML = tile(im.dataset.n || "?"); }; if (im.complete && !im.naturalWidth) bad(); else im.addEventListener("error", bad, { once: true }); });
    const first = !S.seen[ctx]; S.seen[ctx] = 1;
    armMotion(pn, first);
    $$(".gg", pn).forEach((g) => {
      if (first && !RM.matches) requestAnimationFrame(() => requestAnimationFrame(() => g.classList.add("lit")));
      else { const v = $(".val", g); g.style.setProperty("--gd", "0ms"); if (v) v.style.transition = "none"; g.classList.add("lit"); requestAnimationFrame(() => { if (v) v.style.transition = ""; }); }
    });
    $$(".osc", pn).forEach((o) => { if (first && !RM.matches) requestAnimationFrame(() => requestAnimationFrame(() => o.classList.add("lit"))); else o.classList.add("lit"); });
    $$(".seg", pn).forEach(segInd);
    bindSlides(pn, confirm);
    if (S.from != null && SC) { const to = SC.nota; if (S.tab !== "dom") setTimeout(() => setRoll($("#heroN", pn), to), 80); S.from = null; }
  }

  /* compare with the last reading of the same URL in this session (reload + icon) */
  async function noteDelta() {
    if (!S.rec || S.rec.state !== "ok" || S.noted === S.rec.at) return;
    S.noted = S.rec.at;
    noteUse();
    const sc = GS_SCORE.scorePage(S.rec.facts);
    recordVisit(S.rec, sc);
    const k = "last:" + S.rec.facts.url;
    const last = await Env.getS(k);
    await Env.setS(k, { nota: sc.nota, at: Date.now() });
    if (last && last.nota !== sc.nota && Date.now() - last.at < 3 * 3600e3) {
      S.from = last.nota;
      draw();
      toast(`La nota pasa de ${last.nota} a ${sc.nota}.`, "Revisada otra vez en tu navegador. No es un escaneo.", sc.nota > last.nota ? "arrowup" : "arrowdown");
    }
  }

  /* 1.5.0 (log §446): one entry per visit and page, only in chrome.storage.local;
     coming back to a tab with the same reading does not count as a visit */
  async function recordVisit(rec, sc) {
    const key = GS_X.pageKey(rec.facts.url);
    let list = (await Env.getL(key)) || [];
    if (!list.length || list[list.length - 1].rev !== rec.at) {
      list = GS_X.historyPush(list, Object.assign(GS_X.entryOf(sc, Date.now()), { rev: rec.at }));
      await Env.setL(key, list);
      const idx = (await Env.getL("hidx")) || {};
      idx[key] = Date.now();
      const drop = GS_X.historyPrune(idx);
      drop.forEach((k) => { delete idx[k]; Env.delL(k); });
      await Env.setL("hidx", idx);
    }
    S.hist = { key, info: GS_X.sinceLast(list) };
    if (S.hist.info && S.rec === rec) draw();
  }
  async function openReport() {
    if (!S.rec || S.rec.state !== "ok") return;
    const f = S.rec.facts, sc = GS_SCORE.scorePage(f);
    const shot = await Env.shot(S.tabId);
    const h = S.hist && S.hist.key === GS_X.pageKey(f.url) ? S.hist.info : null;
    await Env.report({ v: 1, at: S.rec.at, facts: f, sc, shot, ev: alertEvidence(sc, f), hist: h ? { prev: h.prev.nota, now: h.now.nota, prevAt: h.prev.at, fixed: h.fixed } : null });
  }

  /* a page reviewed in the panel is a day of real use; the third day asks once */
  async function noteUse() {
    if (S.rateAsk) return;
    const days = GS_RATE.noteUseDay(await Env.getL("useDays"), Date.now());
    await Env.setL("useDays", days);
    if (GS_RATE.shouldAskRating(days, await Env.getL("rateDone"))) { S.rateAsk = true; draw(); }
  }

  /* ---------------- the account (paso 02) ---------------- */
  let ctxAt = 0;
  async function loadCtx(force) {
    if (!force && Date.now() - ctxAt < 3000) return;
    ctxAt = Date.now();
    const r = await Env.api("/api/ext/context");
    const was = !!S.real;
    if (r.status === 200 && r.body && Array.isArray(r.body.domains)) {
      const prev = S.real && S.real.sel, prevAct = S.real ? S.real.activeDomain : undefined;
      S.real = Object.assign({}, r.body, { sel: null });
      S.real.sel = pickSel(prev, r.body.activeDomain !== prevAct);
      /* signed in while the panel was open: say so once, and open the whole site */
      if (!was) { S.lane = null; S.seen = {}; if (S.ctxSeen) { S.justIn = true; S.tab = "dom"; clearTimeout(justInTimer); justInTimer = setTimeout(dismissJustIn, 8000); } }
      ensureProj();
    } else if (r.status === 401) {
      S.real = null;
    }
    S.ctxSeen = true;
    if (was !== !!S.real || (S.real && S.real.sel !== (S._lastSel ?? null))) draw();
    S._lastSel = S.real ? S.real.sel : null;
  }
  /* the open page's own domain when it is one of yours; else the domain the
     console is pointed at when that just changed; else the last pick */
  function pickSel(prev, consoleMoved) {
    const doms = S.real.domains.map((x) => x.domain), h = S.rec && S.rec.facts ? S.rec.facts.host : null;
    const own = doms.filter((d) => covers(h, d)).sort((a, b) => b.length - a.length)[0];
    const act = doms.includes(S.real.activeDomain) ? S.real.activeDomain : null;
    if (own) return own;
    if (consoleMoved && act) return act;
    return doms.includes(prev) ? prev : act || doms[0] || null;
  }
  async function ensureProj() {
    if (!S.real || !S.real.sel) return;
    const d = S.real.sel, f = S.rec && S.rec.state === "ok" ? S.rec.facts : null;
    const url = f && covers(f.host, d) ? f.url : null, key = d + "|" + (url || "");
    if (S.projKey && S.projKey[d] === key && S.proj[d] && S.proj[d] !== "error") return;
    (S.projKey ||= {})[d] = key;
    S.proj[d] = "loading";
    draw();
    const r = await Env.api(`/api/ext/project?domain=${encodeURIComponent(d)}${url ? `&url=${encodeURIComponent(url)}` : ""}`);
    if (S.projKey[d] !== key) return;
    if (r.status === 401) { S.real = null; draw(); return; }
    S.proj[d] = r.status === 200 && r.body ? r.body : "error";
    draw();
  }

  async function sync() {
    const tab = await Env.activeTab();
    S.tabId = tab ? tab.id : null;
    S.tabNow = tab ? tab.url || null : null;
    S.pickedDom = false; /* a pick in the selector lasts until the tab changes */
    S.rec = S.tabId != null ? await Env.result(S.tabId) : null;
    S.lane = null; S.dd = false;
    if (S.real) { S.real.sel = pickSel(S.real.sel); ensureProj(); }
    draw();
    noteDelta();
    if (S.read && S.autoOn && !S.rec && S.tabId != null) Env.reread(S.tabId);
  }
  /* The permission request has to be the first await of the click, or Chrome
     drops the user gesture and refuses it. */
  async function ensureRead() {
    if (S.read) return true;
    let ok = false;
    try { ok = await Env.askAuto(); } catch (e) { ok = false; }
    if (!ok) { toast("Sin ese permiso, usa el icono de la barra.", "Chrome sólo deja leer la página al pulsarlo.", "warn"); return false; }
    S.read = true;
    return true;
  }
  async function reviewNow() { if (await ensureRead()) await readHere(); }
  async function autoOn() {
    if (!(await ensureRead())) return;
    S.autoOn = true;
    await Env.setL("autoOn", true);
    toast("Listo. Con el panel abierto, cada página se revisa sola.", "Lo puedes quitar abajo, en el pie del panel.", "checkc");
    await readHere();
  }
  async function readHere() {
    if (S.tabId == null) await sync();
    const r = await Env.reread(S.tabId);
    if (!r || !r.ok) { toast("No hemos podido leer esta página.", "Si es otra web, pulsa el icono de la barra.", "warn"); draw(); }
  }

  /* slide confirmed */
  async function confirm(key) {
    if (key.startsWith("page:")) {
      if (!S.tabId) return;
      const r = await Env.reread(S.tabId);
      if (!r || !r.ok) { toast(S.read ? "No hemos podido leerla." : "Recarga la página y pulsa el icono.", S.read ? "Recarga la página." : "Chrome retiró el permiso al cambiar de página.", "warn"); draw(); }
      return;
    }
    S.done[key] = true; draw();
    toast("Marcada como hecha.", "En la prueba no se guarda nada. En la cuenta real, se verá en el próximo escaneo.", "checkc", () => { S.done[key] = false; draw(); });
  }

  function findFix(key) {
    const [ctx, id] = [key.slice(0, key.lastIndexOf(":")), key.slice(key.lastIndexOf(":") + 1)];
    const list = ctx === "dom" ? (A() ? A().plan : []) : SC ? SC.fixes : [];
    return list.find((x) => x.id === id);
  }

  /* ---------------- events ---------------- */
  document.addEventListener("click", async (ev) => {
    const t = ev.target.closest("[data-act],[data-lane],[data-tab],[data-pick],[data-dk],[data-dkgo]");
    if (S.justIn && t) { dismissJustIn(); if (t.dataset.act === "justin-x") return; }
    if (!t) { if (S.dd && !ev.target.closest(".dd")) { S.dd = false; draw(); } return; }
    if (t.dataset.lane) { S.lane = S.lane === t.dataset.lane ? null : t.dataset.lane; draw(); return; }
    if (t.dataset.tab) { S.tab = t.dataset.tab; S.lane = null; S.dd = false; draw(); return; }
    if (t.dataset.pick != null) {
      if (S.real) { S.real.sel = t.dataset.pick; ensureProj(); }
      S.tab = "dom"; S.pickedDom = true; S.lane = null; S.dd = false; draw(); return;
    }
    const hz = t.closest(".hz");
    if (t.dataset.dk && hz) { S.dk[hz.dataset.ctx] = (S.dk[hz.dataset.ctx] || 0) + +t.dataset.dk; draw(); return; }
    if (t.dataset.dkgo && hz) { S.dk[hz.dataset.ctx] = +t.dataset.dkgo; draw(); return; }
    const a = t.dataset.act;
    if (a === "rate-go" || a === "rate-later") {
      S.rateAsk = false;
      await Env.setL("rateDone", a === "rate-go" ? "rated" : "later");
      if (a === "rate-go") Env.open(`${GS_RATE.STORE_REVIEWS_URL}?utm_source=chrome-extension&utm_medium=extension&utm_campaign=valorar`);
      draw();
      return;
    }
    if (a === "ai-cmp") { S.cmp = !S.cmp; draw(); return; }
    if (a === "report") { openReport(); return; }
    if (a === "review-now") { S.tab = "page"; S.pickedDom = false; reviewNow(); return; }
    if (a === "auto-on") { autoOn(); return; }
    if (a === "auto") {
      if (S.autoOn && S.read) { S.autoOn = false; await Env.setL("autoOn", false); draw(); toast("Revisión automática quitada.", "«Revisar esta página» sigue funcionando.", "checkc"); }
      else autoOn();
      return;
    }
    if (a === "copy") {
      const f = findFix(t.dataset.key);
      if (f && f.snippet) { try { await Env.copy(f.snippet); toast("Copiado.", S.read ? "Pégalo en tu web y recarga la página." : "Pégalo en tu web, recarga la página y pulsa el icono.", "copy"); } catch (e) { toast("No se pudo copiar.", "Selecciona el código y cópialo a mano.", "warn"); } }
    } else if (a === "undo") { S.done[t.dataset.key] = false; draw(); }
    else if (a === "jump") {
      if (!SC || !S.rec || !S.rec.facts) return;
      const i = SC.fixes.findIndex((x) => x.id === t.dataset.id);
      if (i > -1) { S.dk["page:" + S.rec.facts.url] = i; if (S.tab === "dom") S.tab = "page"; S.lane = null; draw(); const n = $(".hz"); n && n.scrollIntoView({ behavior: RM.matches ? "auto" : "smooth", block: "start" }); }
    } else if (a === "open-page") {
      Env.open(t.dataset.url);
    } else if (a === "open") {
      Env.open(`${SITE}${t.dataset.to}${t.dataset.to.includes("?") ? "&" : "?"}${utm(t.dataset.c || "panel")}`);
    } else if (a === "sample") {
      S.sample.on = !S.sample.on;
      if (S.sample.on && !S.sample.domain) S.sample.domain = S.rec && S.rec.facts ? S.rec.facts.host : "tu-dominio-ejemplo.es";
      S.tabUrl = null; S.lane = null;
      await Env.setL("sample", S.sample);
      draw();
      if (S.sample.on) toast("Cuenta de ejemplo activada.", `Tu dominio de ejemplo es ${esc(S.sample.domain)}. Los datos de cuenta son inventados.`, "users");
    } else if (a === "use-domain") {
      if (S.rec && S.rec.facts) { S.sample.domain = S.rec.facts.host; S.dd = false; S.tabUrl = null; await Env.setL("sample", S.sample); draw(); toast(`Ahora ${esc(S.sample.domain)} es tu dominio de ejemplo.`, "", "checkc"); }
    } else if (a === "sample-only") {
      S.dd = false; draw();
      toast(`En la prueba no se puede ${esc(t.dataset.what || "hacer esto")}.`, "Con la cuenta conectada, funciona igual que en la consola.", "notes");
    } else if (a === "dd") { S.dd = !S.dd; draw(); }
    else if (a === "reload-proj") { if (S.real) { delete S.proj[curDom()]; S.projKey[curDom()] = null; ensureProj(); } }
    else if (a === "theme") {
      document.documentElement.dataset.theme = curTheme() === "dark" ? "light" : "dark";
      try { localStorage.setItem("gs-ext-theme", document.documentElement.dataset.theme); } catch (e) {}
      draw();
    }
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && S.dd) { S.dd = false; draw(); } });
  addEventListener("resize", () => $$(".seg").forEach(segInd));

  /* ---------------- boot ---------------- */
  /* light by default (Denis, 2026-10-30); the footer button switches to dark */
  { let th = null; try { th = localStorage.getItem("gs-ext-theme"); } catch (e) {} document.documentElement.dataset.theme = th === "dark" ? "dark" : "light"; }
  (async () => {
    const s = await Env.getL("sample");
    if (GS_SAMPLE && s && typeof s === "object") S.sample = { on: !!s.on, domain: s.domain || null };
    S.read = await Env.hasAuto();
    S.autoOn = !!(await Env.getL("autoOn"));
    Env.listen(async (why) => {
      if (why === "tab") { loadCtx(); return sync(); }
      if (why === "perm") { S.read = await Env.hasAuto(); return draw(); }
      if (why === "loaded") return sync();
      S.rec = await Env.result(S.tabId);
      if (S.real && S.rec && S.rec.state === "ok") { S.real.sel = pickSel(S.real.sel); ensureProj(); }
      draw(); noteDelta();
    });
    await sync();
    await loadCtx(true);
    /* back from signing in on GenScore: the panel notices on its own */
    addEventListener("focus", () => loadCtx());
    document.addEventListener("visibilitychange", () => { if (!document.hidden) loadCtx(); });
    document.fonts && document.fonts.ready.then(() => $$(".seg").forEach(segInd));
  })();
})();
