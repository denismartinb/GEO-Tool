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
      copy: async () => {},
      listen() {}
    };
  })();

  /* ---------------- state ---------------- */
  const S = { read: false, autoOn: false, tabId: null, rec: null, real: null, proj: {}, sample: { on: false, domain: null }, tab: null, lane: null, dk: {}, done: {}, shown: false, noted: null, seen: {}, from: null };
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
  const band = (v) => (v >= 75 ? ["ok", "Bien"] : v >= 50 ? ["mid", "Mejorable"] : ["bad", "Se frena"]);
  const SH = (c) => `<i class="sh ${c || ""}" aria-hidden="true"></i>`;
  const laneIcon = (k) => (k === "google" ? lg("google", 12) : k === "agent" ? ic("cart") : ic("sparkles"));
  const laneName = (k) => (k === "google" ? "Google" : k === "agent" ? "Agentes" : "IA");
  const tile = (host) => {
    const h = String(host || "?"), c = ["#1d4fd6", "#0f7a54", "#7c3aed", "#c2410c", "#0e7490", "#334155"][[...h].reduce((a, x) => a + x.charCodeAt(0), 0) % 6];
    return `<span class="fav tl" style="background:${c}" aria-hidden="true">${esc(h[0].toUpperCase())}</span>`;
  };
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
      score: p.geoScore, say: p.lede || "Todavía no hay un escaneo completado de este dominio.",
      engines, rivals: p.rivals.map((r) => [r.name, pct(r.share), r.isBrand]), seo: p.seoScore,
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
  function readers(sc) {
    return `<div class="rd4">${EK.map((e) => { const a = sc.access[e]; const cls = a == null ? "u" : a ? "y" : "n"; return `<div class="c ${cls}"><span class="lg">${lg(e, 18)}<i></i></span>${ENG[e].n}<small>${a == null ? "Sin leer" : a ? "Puede leerla" : "Bloqueado"}</small></div>`; }).join("")}</div>`;
  }
  const promptRows = (list) => list.map(([q, es, s]) => `<div class="qr"><span class="q">${esc(q)}<small>${esc(s)}</small></span><span class="e">${es.map((e) => lg(e, 14)).join("")}</span></div>`).join("");
  const gscInvite = () => `<div class="calm col">${lg("google", 16)}<span>Tus búsquedas de Google, tu puesto y tus clics, leídos de tu Search Console. Sólo lectura, la misma conexión que en la consola.</span><button class="btn ink sm" ${S.real ? `data-act="open" data-to="/dashboard" data-c="search-console"` : `data-act="sample-only" data-what="conectar Search Console"`}>Conectar con Google</button></div>`;

  function pageLane(k, sc, rel) {
    const C = sc.criteria.filter((c) => c.lane === k);
    if (k === "ia") {
      let h = `<div class="mh">Quién puede leerla<span class="r">robots.txt</span></div>${readers(sc)}`;
      const pr = rel === "own" && A() ? A().prompts : [];
      if (pr.length) h += `<div class="mh">La citan en tus prompts${EJx()}</div>${promptRows(pr.slice(0, 3))}`;
      return h + `<div class="mh">En la página</div>${kv(C.filter((c) => !c.id.startsWith("bot-")))}`;
    }
    if (k === "google") return (rel === "own" ? `<div class="mh">Search Console</div>${gscInvite()}` : "") + `<div class="mh">En la página</div>${kv(C)}`;
    return `<div class="mh">Lo que lee un agente</div>${kv(C)}<p class="mini-note">Se mira sólo cuando la página vende algo. No entra en la nota.</p>`;
  }
  function domLane(k) {
    if (k === "ia") {
      const D = A(), max = Math.max(1, ...D.rivals.map((r) => r[1] || 0)), emax = Math.max(60, ...EK.map((e) => D.engines[e] || 0));
      const engs = EK.filter((e) => D.engines[e] != null);
      return `<div class="mh">Te nombran por motor${EJx()}</div>${engs.map((e, i) => `<div class="er"><svg class="l" aria-hidden="true"><use href="#e-${e}"/></svg><span class="n">${ENG[e].n}</span>${bar(D.engines[e], { max: emax, cls: "thin", delay: i * 60 })}<span class="v num">${D.engines[e]}<small>%</small></span></div>`).join("")}
        ${D.rivals.length ? `<div class="mh">Frente a tus rivales${EJx()}</div>${D.rivals.map(([n, m, me], i) => `<div class="er">${me ? tile(curDom()) : tile(n)}<span class="n" style="${me ? "color:var(--blue-ink)" : ""}">${esc(me ? (isSample() ? brandOf(curDom()) : n) : n)}</span>${bar(m, { max: max * 1.1, cls: "thin " + (me ? "" : "ink nomark"), delay: i * 60 })}<span class="v num">${m}<small>%</small></span></div>`).join("")}` : ""}`;
    }
    if (k === "google") return gscInvite();
    return `<div class="ag4">${A().agentParts.map(([n, v, w], i) => { const pc = Math.round((v / w) * 100), [cl, st] = band(pc); return gauge({ v: pc, cls: cl, nm: n, st, i, tag: "div" }); }).join("")}</div><p class="mini-note">De la auditoría agéntica de tu web. ${EJx()}</p>`;
  }

  /* ---------------- layer 1: hero «Cuadro» ---------------- */
  function heroPage(sc, rel) {
    const n = sc.nota;
    const lanes = ["ia", "google"].concat(sc.commerce ? ["agent"] : []);
    const st = { ia: sc.blockedEngines.length ? `${4 - sc.blockedEngines.length} de 4 la leen` : band(sc.lanes.ia)[1], google: band(sc.lanes.google)[1], agent: band(sc.lanes.agent)[1] };
    const d = dial(n, { bands: [50, 75] }).replace(/aria-label="[^"]*"/, `aria-label="Nota SEO + IA ${n} de 100"`);
    return `<div class="hq"><div class="dialbox">${d}<div class="dial-c"><span class="big num" id="heroN">${roll(S.from ?? n)}</span><span class="of">Nota SEO + IA</span></div></div>
      <div class="bands"><span class="${n < 50 ? "on" : ""}">Se frena</span><span class="${n >= 50 && n < 75 ? "on" : ""}">Mejorable</span><span class="${n >= 75 ? "on" : ""}">Bien</span></div>
      <p class="say">${sc.say}</p>
      <div class="gg3" style="grid-template-columns:repeat(${lanes.length},minmax(0,1fr))">${lanes.map((k, i) => gauge({ v: sc.lanes[k], cls: band(sc.lanes[k])[0], nm: laneName(k), icon: laneIcon(k), st: st[k], lane: k, i })).join("")}</div>
      ${lanes.map((k) => laneBox(k, () => pageLane(k, sc, rel))).join("")}</div>`;
  }
  function heroDom() {
    const D = A();
    if (!D) {
      const p = S.proj[curDom()];
      return `<div class="paused" style="min-height:240px"><span class="ring ${p === "error" ? "" : "spin"}">${p === "error" ? ic("warn") : svgGs(30)}</span><h2>${p === "error" ? "No hemos podido leer tu dominio" : "Leyendo tu dominio"}</h2>${p === "error" ? `<button class="btn line sm" data-act="reload-proj" style="margin-top:14px">Reintentar</button>` : ""}</div>`;
    }
    const s = D.score, meR = D.rivals.find((r) => r[2]), me = meR ? meR[1] : null, top = D.rivals.find((r) => !r[2]);
    const lanes = [["ia", me, "%", top ? `${esc(top[0])}, ${top[1]}%` : "Sin rivales nombrados", me != null && top && me < top[1] ? "mid" : "ok"]];
    if (D.seo != null) lanes.push(["google", D.seo, "", "Salud SEO", band(D.seo)[0]]);
    if (D.agent != null) lanes.push(["agent", D.agent, "", band(D.agent)[1], band(D.agent)[0]]);
    return `<div class="hq"><div class="dialbox">${dial(s ?? 0)}<div class="dial-c"><span class="big num">${s == null ? "–" : roll(s)}</span><span class="of">Puntuación GEO</span></div></div>
      <div class="bands"><span class="${s != null && s < 40 ? "on" : ""}">Inicial</span><span class="${s >= 40 && s < 70 ? "on" : ""}">Emergente</span><span class="${s >= 70 ? "on" : ""}">Competitivo</span></div>
      <p class="say">${esc(D.say)}</p>
      <div class="gg3" style="grid-template-columns:repeat(${lanes.length},minmax(0,1fr))">${lanes.map(([k, v, u, st, cls], i) => gauge({ v, unit: u, cls, nm: laneName(k), icon: laneIcon(k), st, lane: k, i })).join("")}</div>
      ${lanes.map(([k]) => laneBox(k, () => domLane(k))).join("")}</div>`;
  }

  /* ---------------- layer 2: the one warm alert ---------------- */
  const alertHtml = (sc) => (sc.alert ? `<div class="alert" role="status">${ic("warn")}<div class="tx"><b>${sc.alert.t}</b> ${sc.alert.s}</div><button class="btn warm" data-act="jump" data-id="${sc.alert.id}">Arreglarlo</button></div>` : "");

  /* ---------------- layer 3: «Haz esto», one card at a time ---------------- */
  const whereOf = (f) => (f.id.startsWith("bot-") ? "En tu robots.txt" : f.id === "llms" ? "En la raíz de tu web" : f.kind === "plan" ? "Tu plan de esta semana" : f.kind === "goal" ? "Tu plan de esta semana" : "En esta página");
  function plate(f, ctx) {
    const key = ctx + ":" + f.id, kind = f.kind || "local", done = S.done[key];
    const pts = f.pts == null && kind !== "goal" ? "" : kind === "goal" ? `<span class="pt q">Objetivo</span>` : f.unit === "en Agentes" ? `<span class="pt num">+${f.pts}<small>Agentes</small></span>` : `<span class="pt num">+${f.pts}<small>pt</small></span>`;
    let body = `<p class="why">${f.why}</p>`;
    if (f.how) body += `<p class="why">${f.how}</p>`;
    if (f.snippet) body += `<pre class="snip" tabindex="0">${esc(f.snippet)}</pre><div class="acts"><button class="btn line sm" data-act="copy" data-key="${esc(key)}">${ic("copy", "sm")}Copiar ${esc(f.copyWhat || "el código")}</button></div>`;
    if (kind === "plan") body += `<div class="acts"><button class="btn line sm" data-act="open" data-to="/dashboard" data-c="plan">Abrir en la consola${ic("arrowr", "sm")}</button></div>`;
    /* a real plan item is marked done in the console, where it is saved; the
       panel only reads (paso 02), so it offers no slide that would save nothing */
    const tail = kind === "plan" && !isSample() ? ""
      : kind === "goal" ? `<div class="gline">${ic("trend", "sm")}<span>Objetivo</span><b>${esc(f.goal)}</b><span>Lo seguimos en cada foto</span></div>`
      : done ? `<div class="donebar">${ic("checkc")}<span>Hecha. Se verá en el próximo escaneo.</span><button class="btn sm" data-act="undo" data-key="${esc(key)}">Deshacer</button></div>`
      : slideHtml(key, kind === "local" ? "Desliza cuando lo hayas puesto" : "Desliza para marcar como hecho");
    return `<div class="plc" data-k="${esc(key)}"><div class="top">${srcChip(f.lane)}<span class="k">${whereOf(f)}</span>${pts}</div><div class="dk-k">Haz esto</div><h3>${f.t}</h3>${body}${tail}</div>`;
  }
  function deck(items, ctx, empty) {
    if (!items.length) return `<div class="hz"><div class="ey rule">Haz esto</div><div class="calm">${ic("checkc")}<span>${empty}</span></div></div>`;
    const idx = Math.min(S.dk[ctx] || 0, items.length - 1);
    S.dk[ctx] = idx;
    const gain = items.filter((x) => x.unit === "pt").reduce((a, x) => a + x.pts, 0);
    const many = items.length > 1;
    return `<div class="hz" data-ctx="${esc(ctx)}"><div class="ey rule">Haz esto${gain ? `<span class="cnt">Hasta +${Math.min(gain, 100)} pt</span>` : ""}</div>
      ${many ? `<div class="ptk" role="tablist" aria-label="Tarjetas">${items.map((_, i) => `<button role="tab" data-dkgo="${i}" class="${i === idx ? "cur" : ""} ${S.done[ctx + ":" + items[i].id] ? "done" : ""}" aria-label="Tarjeta ${i + 1}" aria-selected="${i === idx}"><span class="num">${String(i + 1).padStart(2, "0")}</span><i></i></button>`).join("")}</div>` : ""}
      <div class="pl ${many ? "" : "one"}">${plate(items[idx], ctx)}</div>
      ${many ? `<div class="nav"><button class="navb" data-dk="-1" aria-label="Anterior" ${idx === 0 ? "disabled" : ""}>${ic("chevl")}</button><button class="navb" data-dk="1" aria-label="Siguiente" ${idx === items.length - 1 ? "disabled" : ""}>${ic("chevr")}</button><span class="sp"></span><span class="ln2 num">${idx + 1} de ${items.length}</span></div>` : ""}</div>`;
  }

  /* ---------------- CTAs ---------------- */
  const arcSvg = () => { let g = ""; for (let i = 0; i <= 40; i++) { const a = ((200 + i * 3.5) * Math.PI) / 180, r0 = i % 5 ? 140 : 128; g += `<line x1="${(150 + r0 * Math.cos(a)).toFixed(1)}" y1="${(150 + r0 * Math.sin(a)).toFixed(1)}" x2="${(150 + 148 * Math.cos(a)).toFixed(1)}" y2="${(150 + 148 * Math.sin(a)).toFixed(1)}"/>`; } return `<svg class="arc" viewBox="0 0 300 300" aria-hidden="true">${g}</svg>`; };
  const ctaNoAcct = (host) => `<div class="deep">${arcSvg()}<div class="egs">${EK.map((e) => `<span>${lg(e, 15)}</span>`).join("")}</div><p class="q">¿Quieres saber si ChatGPT, Gemini, Claude y Perplexity recomiendan <b>${esc(host)}</b> y a sus competidores?</p><button class="btn onink" data-act="open" data-to="/signup" data-c="analizar-dominio">Analizar dominio${ic("arrowr", "sm")}</button><p class="ft">7 días de Pro gratis. Sin tarjeta.</p></div>`;
  const ctaOther = (host) => S.real
    ? `<div class="deep">${arcSvg()}<p class="q" style="margin-top:0">¿Quieres seguir <b>${esc(host)}</b> en GenScore?</p><button class="btn onink" data-act="open" data-to="/dashboard/projects/new" data-c="nuevo-dominio">Analizar como dominio<span class="dim"> · ${S.real.domains.length} de ${S.real.domainCap}</span></button></div>`
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
    const onPage = !!f && S.tab === "page";
    const own = !!f && relation() === "own";
    const days = S.real && S.real.trialEndsAt ? Math.max(0, Math.ceil((new Date(S.real.trialEndsAt) - Date.now()) / 864e5)) : null;
    const planLine = S.real ? (days != null ? `Prueba de ${esc(S.real.plan.name)} · ${days} ${days === 1 ? "día" : "días"}` : `Plan ${esc(S.real.plan.name)}`) : "Prueba de Pro · 7 días";
    const pageItem = f ? `<div class="mh" style="margin:6px 10px 4px">Página abierta</div><button class="dd-i ${onPage ? "on" : ""}" role="menuitem" data-tab="page">${tile(f.host)}<span class="t">${esc(f.host)}<span>${esc(pathLabel(f))}</span></span>${onPage ? ic("check", "sm ck") : ""}</button><div class="dd-sep"></div>` : "";
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
    const D = A();
    return `<div class="px">${headAcct()}${pageHint()}<div class="ey">Visión general · <span class="mono">${esc(curDom())}</span></div>${heroDom()}${D ? deck(D.plan, "dom", "Tu plan está al día.") : ""}${foot(null)}</div>`;
  }
  function viewReading() {
    return `<div class="px pfull">${acctOn() ? headAcct() : headNo("")}<div class="paused"><span class="ring spin">${svgGs(30)}</span><h2>Leyendo la página</h2><p>Su HTML, su robots.txt y su llms.txt. Desde tu navegador.</p></div></div>`;
  }
  function viewError(r) {
    const t = { blocked: ["Esta página no se puede revisar", "Chrome no deja que ninguna extensión lea sus propias páginas, la tienda ni los PDF."], perm: ["Pulsa el icono otra vez", "Chrome retiró el permiso al cambiar de página."], gone: ["La pestaña ya no está", "Abre la página y pulsa el icono."], other: ["No hemos podido leerla", "Recarga la página y pulsa el icono otra vez."] }[r] || ["No hemos podido leerla", ""];
    return `<div class="px pfull">${acctOn() ? headAcct() : headNo("")}<div class="paused"><span class="ring">${ic("warn")}</span><h2>${t[0]}</h2><p>${t[1]}</p>${r === "blocked" || !S.read ? "" : `<button class="rv" data-act="review-now">${ic("scan")}<span>Revisar esta página</span>${ic("arrowr", "sm")}</button>`}</div>${foot(null)}</div>`;
  }
  function viewReview(f, sc) {
    const rel = relation();
    /* a new page starts on itself, or on the domain when it is your homepage */
    if (S.tabUrl !== f.url) { S.tabUrl = f.url; S.tab = rel === "own" && f.path === "/" ? "dom" : "page"; }
    let h = `<div class="px">${rel === "none" ? headNo(f.host) : headAcct()}`;
    const fixesCtx = "page:" + f.url;
    if (rel !== "none" && S.tab === "dom") {
      const D = A();
      h += `<div class="ey">Visión general · <span class="mono">${esc(curDom())}</span>${EJx()}</div>${heroDom()}${rel === "own" && covers(f.host, curDom()) ? alertHtml(sc) : ""}${D ? deck(D.plan, "dom", "Tu plan está al día.") : ""}`;
      return h + foot(null) + "</div>";
    }
    if (rel === "none") h += `<div class="ey">Revisión gratis · <span class="mono">${esc(pathLabel(f))}</span></div>`;
    h += heroPage(sc, rel) + alertHtml(sc);
    h += deck(sc.fixes, fixesCtx, "Nada que arreglar en esta página. La pueden leer los cuatro motores y Google.");
    if (rel === "none") h += ctaNoAcct(f.host);
    if (rel === "other") h += ctaOther(f.host);
    return h + foot(f) + "</div>";
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
    const first = !S.seen[ctx]; S.seen[ctx] = 1;
    armMotion(pn, first);
    $$(".gg", pn).forEach((g) => {
      if (first && !RM.matches) requestAnimationFrame(() => requestAnimationFrame(() => g.classList.add("lit")));
      else { const v = $(".val", g); g.style.setProperty("--gd", "0ms"); if (v) v.style.transition = "none"; g.classList.add("lit"); requestAnimationFrame(() => { if (v) v.style.transition = ""; }); }
    });
    $$(".seg", pn).forEach(segInd);
    bindSlides(pn, confirm);
    if (S.from != null && SC) { const to = SC.nota; setTimeout(() => setRoll($("#heroN", pn), to), 80); S.from = null; }
  }

  /* compare with the last reading of the same URL in this session (reload + icon) */
  async function noteDelta() {
    if (!S.rec || S.rec.state !== "ok" || S.noted === S.rec.at) return;
    S.noted = S.rec.at;
    const sc = GS_SCORE.scorePage(S.rec.facts);
    const k = "last:" + S.rec.facts.url;
    const last = await Env.getS(k);
    await Env.setS(k, { nota: sc.nota, at: Date.now() });
    if (last && last.nota !== sc.nota && Date.now() - last.at < 3 * 3600e3) {
      S.from = last.nota;
      draw();
      toast(`La nota pasa de ${last.nota} a ${sc.nota}.`, "Revisada otra vez en tu navegador. No es un escaneo.", sc.nota > last.nota ? "arrowup" : "arrowdown");
    }
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
      if (S.real.sel !== prev) S.tab = "dom";
      if (!was) { S.tabUrl = null; S.lane = null; }
      ensureProj();
    } else if (r.status === 401) {
      S.real = null;
    }
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
    if (a === "review-now") { reviewNow(); return; }
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
    } else if (a === "open") {
      Env.open(`${SITE}${t.dataset.to}?${utm(t.dataset.c || "panel")}`);
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
