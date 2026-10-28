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
  const SITE = "https://www.genscore.es";
  const utm = (content) => `utm_source=chrome-extension&utm_medium=extension&utm_campaign=prueba-0-1&utm_content=${content}`;

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
    open: (url) => chrome.tabs.create({ url }),
    copy: (t) => navigator.clipboard.writeText(t),
    listen(fn) {
      chrome.storage.onChanged.addListener((ch, area) => { if (area === "session" && S.tabId != null && ch["r:" + S.tabId]) fn("result"); });
      chrome.tabs.onActivated.addListener(() => fn("tab"));
      chrome.windows && chrome.windows.onFocusChanged && chrome.windows.onFocusChanged.addListener(() => fn("tab"));
    }
  } : (() => {
    const demo = window.__GS_DEMO || {};
    const mem = {};
    return {
      activeTab: async () => ({ id: 1 }),
      result: async () => demo.result || null,
      getS: async (k) => mem[k], setS: async (k, v) => { mem[k] = v; },
      getL: async (k) => (demo.local || {})[k], setL: async (k, v) => { (demo.local ||= {})[k] = v; },
      reread: async () => ({ ok: true }),
      open: (u) => toast("Se abriría " + esc(u.split("?")[0]), "", "arrowr"),
      copy: async () => {},
      listen() {}
    };
  })();

  /* ---------------- state ---------------- */
  const S = { tabId: null, rec: null, sample: { on: false, domain: null }, tab: null, lane: null, dk: {}, done: {}, shown: false, noted: null, seen: {}, from: null };
  const relation = () => {
    if (!S.sample.on || !S.rec || !S.rec.facts) return "none";
    const h = S.rec.facts.host, d = S.sample.domain;
    return h === d || h.endsWith("." + d) ? "own" : "other";
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
  const EJ = `<span class="badge b-ej">Ejemplo</span>`;

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
  const gscInvite = () => `<div class="calm col">${lg("google", 16)}<span>Tus búsquedas de Google, tu puesto y tus clics, leídos de tu Search Console. Sólo lectura, la misma conexión que en la consola.</span><button class="btn ink sm" data-act="sample-only" data-what="conectar Search Console">Conectar con Google</button></div>`;

  function pageLane(k, sc, rel) {
    const C = sc.criteria.filter((c) => c.lane === k);
    if (k === "ia") {
      let h = `<div class="mh">Quién puede leerla<span class="r">robots.txt</span></div>${readers(sc)}`;
      if (rel === "own") h += `<div class="mh">La citan en tus prompts${EJ}</div>${promptRows(SAMPLE.prompts.slice(0, 2))}`;
      return h + `<div class="mh">En la página</div>${kv(C.filter((c) => !c.id.startsWith("bot-")))}`;
    }
    if (k === "google") return (rel === "own" ? `<div class="mh">Search Console</div>${gscInvite()}` : "") + `<div class="mh">En la página</div>${kv(C)}`;
    return `<div class="mh">Lo que lee un agente</div>${kv(C)}<p class="mini-note">Se mira sólo cuando la página vende algo. No entra en la nota.</p>`;
  }
  function domLane(k) {
    if (k === "ia") {
      const max = Math.max(...SAMPLE.rivals.map((r) => r[1]));
      return `<div class="mh">Te nombran por motor${EJ}</div>${EK.map((e, i) => `<div class="er"><svg class="l" aria-hidden="true"><use href="#e-${e}"/></svg><span class="n">${ENG[e].n}</span>${bar(SAMPLE.engines[e], { max: 60, cls: "thin", delay: i * 60 })}<span class="v num">${SAMPLE.engines[e]}<small>%</small></span></div>`).join("")}
        <div class="mh">Frente a tus rivales${EJ}</div>${SAMPLE.rivals.map(([n, m, me], i) => `<div class="er">${me ? tile(S.sample.domain) : tile(n)}<span class="n" style="${me ? "color:var(--blue-ink)" : ""}">${esc(me ? brandOf(S.sample.domain) : n)}</span>${bar(m, { max: max * 1.1, cls: "thin " + (me ? "" : "ink nomark"), delay: i * 60 })}<span class="v num">${m}<small>%</small></span></div>`).join("")}`;
    }
    if (k === "google") return gscInvite();
    return `<div class="ag4">${SAMPLE.agentParts.map(([n, v, w], i) => { const pc = Math.round((v / w) * 100), [cl, st] = band(pc); return gauge({ v: pc, cls: cl, nm: n, st, i, tag: "div" }); }).join("")}</div><p class="mini-note">De la auditoría agéntica de tu tienda. ${EJ}</p>`;
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
    const s = SAMPLE.score, me = SAMPLE.rivals.find((r) => r[2])[1], top = SAMPLE.rivals[0];
    const lanes = [["ia", me, "%", `${top[0]}, ${top[1]}%`, me >= top[1] ? "ok" : "mid"], ["google", SAMPLE.seo, "", "Salud SEO", band(SAMPLE.seo)[0]], ["agent", SAMPLE.agent, "", band(SAMPLE.agent)[1], band(SAMPLE.agent)[0]]];
    return `<div class="hq"><div class="dialbox">${dial(s)}<div class="dial-c"><span class="big num">${roll(s)}</span><span class="of">Puntuación GEO</span></div></div>
      <div class="bands"><span class="${s < 40 ? "on" : ""}">Inicial</span><span class="${s >= 40 && s < 70 ? "on" : ""}">Emergente</span><span class="${s >= 70 ? "on" : ""}">Competitivo</span></div>
      <p class="say">${esc(SAMPLE.say)}</p>
      <div class="gg3">${lanes.map(([k, v, u, st, cls], i) => gauge({ v, unit: u, cls, nm: laneName(k), icon: laneIcon(k), st, lane: k, i })).join("")}</div>
      ${lanes.map(([k]) => laneBox(k, () => domLane(k))).join("")}</div>`;
  }

  /* ---------------- layer 2: the one warm alert ---------------- */
  const alertHtml = (sc) => (sc.alert ? `<div class="alert" role="status">${ic("warn")}<div class="tx"><b>${sc.alert.t}</b> ${sc.alert.s}</div><button class="btn warm" data-act="jump" data-id="${sc.alert.id}">Arreglarlo</button></div>` : "");

  /* ---------------- layer 3: «Haz esto», one card at a time ---------------- */
  const whereOf = (f) => (f.id.startsWith("bot-") ? "En tu robots.txt" : f.id === "llms" ? "En la raíz de tu web" : f.kind === "plan" ? "Tu plan de esta semana" : f.kind === "goal" ? "Tu plan de esta semana" : "En esta página");
  function plate(f, ctx) {
    const key = ctx + ":" + f.id, kind = f.kind || "local", done = S.done[key];
    const pts = kind === "goal" ? `<span class="pt q">Objetivo</span>` : f.unit === "en Agentes" ? `<span class="pt num">+${f.pts}<small>Agentes</small></span>` : `<span class="pt num">+${f.pts}<small>pt</small></span>`;
    let body = `<p class="why">${f.why}</p>`;
    if (f.how) body += `<p class="why">${f.how}</p>`;
    if (f.snippet) body += `<pre class="snip" tabindex="0">${esc(f.snippet)}</pre><div class="acts"><button class="btn line sm" data-act="copy" data-key="${esc(key)}">${ic("copy", "sm")}Copiar ${esc(f.copyWhat || "el código")}</button></div>`;
    if (kind === "plan") body += `<div class="acts"><button class="btn line sm" data-act="open" data-to="/dashboard" data-c="plan">Abrir en la consola${ic("arrowr", "sm")}</button></div>`;
    const tail = kind === "goal" ? `<div class="gline">${ic("trend", "sm")}<span>Objetivo</span><b>${esc(f.goal)}</b><span>Lo seguimos en cada foto</span></div>`
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
  const ctaOther = (host) => `<div class="deep">${arcSvg()}<p class="q" style="margin-top:0">¿Quieres seguir <b>${esc(host)}</b> en GenScore?</p><button class="btn onink" data-act="sample-only" data-what="analizar un dominio nuevo">Analizar como dominio<span class="dim"> · ${1 + SAMPLE.extraDomains.length} de ${SAMPLE.cap}</span></button><button class="btn lnd" data-act="sample-only" data-what="añadir un competidor">Añadir como competidor de ${esc(S.sample.domain)}</button><button class="lnk2" data-act="use-domain">Probar esta web como mi dominio de ejemplo</button></div>`;

  /* ---------------- header and foot ---------------- */
  const svgGs = (w = 16) => `<svg width="${w}" height="${Math.round(w * 1.03)}" aria-hidden="true"><use href="#e-gs"/></svg>`;
  function headNo(host) { return `<div class="ph">${svgGs(20)}<span class="who">${host ? `<b>Esta página</b>${esc(host)}` : `<b class="wm">GenScore</b>`}</span><button class="lnk" data-act="open" data-to="/login" data-c="entrar">Entrar</button></div>`; }
  function headAcct() {
    const d = S.sample.domain, cur = S.rec && S.rec.facts ? S.rec.facts.host : null;
    const doms = [d, ...SAMPLE.extraDomains];
    const menu = S.dd ? `<div class="dd-m" role="menu"><div class="mh" style="margin:6px 10px 4px">Prueba de Pro · 7 días<span class="r num">${doms.length} de ${SAMPLE.cap} dominios</span></div>${doms.map((x, i) => `<button class="dd-i ${i === 0 ? "on" : ""}" role="menuitem" data-act="${i === 0 ? "dd" : "sample-only"}" data-what="cambiar de dominio">${tile(x)}<span class="t">${esc(brandOf(x))}<span>${esc(x)}</span></span>${i === 0 ? ic("check", "sm ck") : ""}</button>`).join("")}<div class="dd-sep"></div>${cur && cur !== d ? `<button class="dd-i" role="menuitem" data-act="use-domain">${tile(cur)}<span class="t">Probar ${esc(cur)}<span>como mi dominio de ejemplo</span></span></button>` : ""}<button class="dd-i add" role="menuitem" data-act="sample-only" data-what="añadir un dominio"><span class="ico">${ic("plus", "sm")}</span><span class="t">Nuevo dominio</span><span class="cap num">${doms.length} de ${SAMPLE.cap}</span></button></div>` : "";
    return `<div class="ph">${svgGs(20)}<div class="dd"><button class="pj" data-act="dd" aria-expanded="${!!S.dd}" aria-haspopup="menu">${tile(d)}<span class="t"><b>${esc(brandOf(d))}</b><span class="d">${esc(d)}</span></span>${ic("updown", "sm")}</button>${menu}</div><button class="av" data-act="sample-only" data-what="abrir tu cuenta" aria-label="Tu cuenta">DM</button></div>
      <div class="ctx">${EJ}<span>Cuenta y escaneos inventados para probar. La revisión de la página es real.</span></div>`;
  }
  function foot(f) {
    const stamp = f ? `<div class="fine">Revisada en tu navegador ${f.ms < 1000 ? "en menos de un segundo" : "en " + (f.ms / 1000).toLocaleString("es-ES", { maximumFractionDigits: 1 }) + " s"}. No pasa por ningún servidor.</div>` : "";
    return `<div class="pf">${S.sample.on ? `<button class="open" data-act="open" data-to="/dashboard" data-c="abrir-consola">${svgGs()}Abrir la consola${ic("arrowr", "sm")}</button>` : ""}${stamp}
      <div class="sets"><button class="sw ${S.sample.on ? "on" : ""}" data-act="sample" role="switch" aria-checked="${S.sample.on}"><i></i>Cuenta de ejemplo</button><span class="sp"></span><button class="thb" data-act="theme" aria-label="Cambiar de tema">${ic(curTheme() === "dark" ? "sun" : "moon", "sm")}</button></div></div>`;
  }

  /* ---------------- views ---------------- */
  function viewIdle(paused) {
    return `<div class="px pfull">${S.sample.on ? headAcct() : headNo("")}<div class="paused"><span class="ring">${svgGs(30)}</span><h2>${paused ? "Has cambiado de página" : "Revisa la página que tienes abierta"}</h2>
      <p>Pulsa el icono de GenScore en la barra de Chrome. Chrome sólo nos deja leer la página cuando lo pulsas, y mientras navegas no se revisa nada.</p>
      <div class="kbd"><span class="k2">${svgGs(14)}</span>o<kbd>Alt</kbd>+<kbd>Mayús</kbd>+<kbd>G</kbd></div>
      <p class="tiny">En Mac, Opción en vez de Alt. ¿No ves el icono? Está en la pieza de puzle de la barra: fíjalo con la chincheta.</p></div>${foot(null)}</div>`;
  }
  function viewReading() {
    return `<div class="px pfull">${S.sample.on ? headAcct() : headNo("")}<div class="paused"><span class="ring spin">${svgGs(30)}</span><h2>Leyendo la página</h2><p>Su HTML, su robots.txt y su llms.txt. Desde tu navegador.</p></div></div>`;
  }
  function viewError(r) {
    const t = { blocked: ["Esta página no se puede revisar", "Chrome no deja que ninguna extensión lea sus propias páginas, la tienda ni los PDF."], perm: ["Pulsa el icono otra vez", "Chrome retiró el permiso al cambiar de página."], gone: ["La pestaña ya no está", "Abre la página y pulsa el icono."], other: ["No hemos podido leerla", "Recarga la página y pulsa el icono otra vez."] }[r] || ["No hemos podido leerla", ""];
    return `<div class="px pfull">${S.sample.on ? headAcct() : headNo("")}<div class="paused"><span class="ring">${ic("warn")}</span><h2>${t[0]}</h2><p>${t[1]}</p></div>${foot(null)}</div>`;
  }
  function viewReview(f, sc) {
    const rel = relation();
    let h = `<div class="px">${rel === "none" ? headNo(f.host) : headAcct()}`;
    const fixesCtx = "page:" + f.url;
    if (rel === "own") {
      const tab = S.tab || (f.path === "/" ? "dom" : "page");
      S.tab = tab;
      h += `<div class="seg pseg" role="tablist"><span class="ind"></span><button data-tab="dom" aria-pressed="${tab === "dom"}">Tu dominio</button><button data-tab="page" aria-pressed="${tab === "page"}">Esta página</button></div>`;
      if (tab === "dom") {
        h += `<div class="ey">Visión general · <span class="mono">${esc(S.sample.domain)}</span>${EJ}</div>${heroDom()}${alertHtml(sc)}${deck(SAMPLE.plan, "dom", "")}`;
        return h + foot(null) + "</div>";
      }
    }
    h += `<div class="ey">${rel === "none" ? "Revisión gratis" : "Esta página"} · <span class="mono">${esc(pathLabel(f))}</span></div>`;
    h += heroPage(sc, rel) + alertHtml(sc);
    h += deck(sc.fixes, fixesCtx, "Nada que arreglar en esta página. La pueden leer los cuatro motores y Google.");
    if (rel === "none") h += ctaNoAcct(f.host);
    if (rel === "other") h += ctaOther(f.host);
    return h + foot(f) + "</div>";
  }

  /* ---------------- draw ---------------- */
  let SC = null;
  function draw() {
    const pn = $("#panel");
    let html, ctx;
    if (!S.rec) { html = viewIdle(S.shown); ctx = "idle"; }
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

  async function sync() {
    const tab = await Env.activeTab();
    S.tabId = tab ? tab.id : null;
    S.rec = S.tabId != null ? await Env.result(S.tabId) : null;
    S.lane = null; S.dd = false;
    draw();
    noteDelta();
  }

  /* slide confirmed */
  async function confirm(key) {
    if (key.startsWith("page:")) {
      if (!S.tabId) return;
      const r = await Env.reread(S.tabId);
      if (!r || !r.ok) { toast("Recarga la página y pulsa el icono.", "Chrome retiró el permiso al cambiar de página.", "warn"); draw(); }
      return;
    }
    S.done[key] = true; draw();
    toast("Marcada como hecha.", "En la prueba no se guarda nada. En la cuenta real, se verá en el próximo escaneo.", "checkc", () => { S.done[key] = false; draw(); });
  }

  function findFix(key) {
    const [ctx, id] = [key.slice(0, key.lastIndexOf(":")), key.slice(key.lastIndexOf(":") + 1)];
    const list = ctx === "dom" ? SAMPLE.plan : SC ? SC.fixes : [];
    return list.find((x) => x.id === id);
  }

  /* ---------------- events ---------------- */
  document.addEventListener("click", async (ev) => {
    const t = ev.target.closest("[data-act],[data-lane],[data-tab],[data-dk],[data-dkgo]");
    if (!t) { if (S.dd && !ev.target.closest(".dd")) { S.dd = false; draw(); } return; }
    if (t.dataset.lane) { S.lane = S.lane === t.dataset.lane ? null : t.dataset.lane; draw(); return; }
    if (t.dataset.tab) { S.tab = t.dataset.tab; S.lane = null; draw(); return; }
    const hz = t.closest(".hz");
    if (t.dataset.dk && hz) { S.dk[hz.dataset.ctx] = (S.dk[hz.dataset.ctx] || 0) + +t.dataset.dk; draw(); return; }
    if (t.dataset.dkgo && hz) { S.dk[hz.dataset.ctx] = +t.dataset.dkgo; draw(); return; }
    const a = t.dataset.act;
    if (a === "copy") {
      const f = findFix(t.dataset.key);
      if (f && f.snippet) { try { await Env.copy(f.snippet); toast("Copiado.", "Pégalo en tu web, recarga la página y pulsa el icono.", "copy"); } catch (e) { toast("No se pudo copiar.", "Selecciona el código y cópialo a mano.", "warn"); } }
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
      S.tab = null; S.lane = null;
      await Env.setL("sample", S.sample);
      draw();
      if (S.sample.on) toast("Cuenta de ejemplo activada.", `Tu dominio de ejemplo es ${esc(S.sample.domain)}. Los datos de cuenta son inventados.`, "users");
    } else if (a === "use-domain") {
      if (S.rec && S.rec.facts) { S.sample.domain = S.rec.facts.host; S.dd = false; S.tab = null; await Env.setL("sample", S.sample); draw(); toast(`Ahora ${esc(S.sample.domain)} es tu dominio de ejemplo.`, "", "checkc"); }
    } else if (a === "sample-only") {
      S.dd = false; draw();
      toast(`En la prueba no se puede ${esc(t.dataset.what || "hacer esto")}.`, "Con la cuenta conectada, funciona igual que en la consola.", "notes");
    } else if (a === "dd") { S.dd = !S.dd; draw(); }
    else if (a === "theme") {
      document.documentElement.dataset.theme = curTheme() === "dark" ? "light" : "dark";
      try { localStorage.setItem("gs-ext-theme", document.documentElement.dataset.theme); } catch (e) {}
      draw();
    }
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && S.dd) { S.dd = false; draw(); } });
  addEventListener("resize", () => $$(".seg").forEach(segInd));

  /* ---------------- boot ---------------- */
  try { const th = localStorage.getItem("gs-ext-theme"); if (th) document.documentElement.dataset.theme = th; } catch (e) {}
  (async () => {
    const s = await Env.getL("sample");
    if (s && typeof s === "object") S.sample = { on: !!s.on, domain: s.domain || null };
    Env.listen((why) => (why === "tab" ? sync() : Env.result(S.tabId).then((r) => { S.rec = r; draw(); noteDelta(); })));
    await sync();
    document.fonts && document.fonts.ready.then(() => $$(".seg").forEach(segInd));
  })();
})();
