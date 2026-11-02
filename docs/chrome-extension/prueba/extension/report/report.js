/* GenScore extension 1.5.0 (log §446): the page report, approved by Denis on
   2026-11-02 (option A, light cover). The panel stores the reading in
   chrome.storage.session under "rep:<id>" and opens report.html#<id>; this
   page lays it out on A4 sheets and prints. Nothing is sent anywhere.

   Every figure is the panel's own: the note, lanes, criteria and fixes come
   from GS_SCORE.scorePage, «Lo que lee la IA» from readAiView, the evidence
   from robotsEvidence. Strings that come from the page go through esc();
   `t` and `why` of a fix are score.js HTML (escaped there), as in the panel. */
(function (root) {
  "use strict";
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const IMG = "report/img/";
  const MES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  const ENG = [["chatgpt", "ChatGPT", "OAI-SearchBot · ChatGPT-User"], ["gemini", "Gemini", "Google-Extended"], ["claude", "Claude", "Claude-SearchBot · Claude-User"], ["perplexity", "Perplexity", "PerplexityBot · Perplexity-User"]];
  const LANE = { ia: "IA", google: "Google", agent: "Agentes" };
  const band = (v) => (v >= 75 ? ["ok", "Optimizada"] : v >= 50 ? ["mid", "Mejorable"] : ["bad", "Se frena"]);
  const code = (s) => String(s || "").replace(/<code class="p">/g, '<code class="i">');
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  /* «Café Ventura – Café de especialidad…» → «Café Ventura»; only a short first part counts as a name */
  const titleBrand = (t) => { const p = String(t || "").split(/\s[–—|·-]\s/); return p.length > 1 && p[0].trim().length >= 2 && p[0].trim().length <= 32 ? p[0].trim() : null; };
  const brandOf = (host) => { const b = String(host || "").replace(/^www\./, "").split(".")[0].replace(/-/g, " "); return cap(b); };
  function ticks(v, n, cls = "tk") {
    const on = Math.round(((v || 0) / 100) * n);
    let h = "";
    for (let i = 0; i < n; i++) h += `<i class="${i < on ? "on" : ""}${i % 10 === 0 ? " mj" : ""}"></i>`;
    return `<div class="${cls}">${h}</div>`;
  }
  function arc() {
    let g = "";
    for (let i = 0; i < 100; i++) {
      const a = (i * 3.6 * Math.PI) / 180, r1 = i % 10 === 0 ? 236 : 226;
      g += `<line x1="${(250 + 200 * Math.cos(a)).toFixed(1)}" y1="${(250 + 200 * Math.sin(a)).toFixed(1)}" x2="${(250 + r1 * Math.cos(a)).toFixed(1)}" y2="${(250 + r1 * Math.sin(a)).toFixed(1)}" stroke="#dbe4f5" stroke-width="1.4" stroke-linecap="round"/>`;
    }
    return `<svg viewBox="0 0 500 500" class="arc" aria-hidden="true">${g}</svg>`;
  }
  function dateLong(ms) {
    const d = new Date(ms);
    return `${d.getDate()} ${MES[d.getMonth()].slice(0, 3)} ${d.getFullYear()}, ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  }
  function access(sc, k) { const v = sc.access ? sc.access[k] : null; return v == null ? ["u", "Sin comprobar"] : v ? ["y", "Puede leerla"] : ["x", "Bloqueado"]; }
  function lanesOf(sc) {
    const shop = sc.shop && sc.shop.state === "found";
    const out = [["ia", sc.lanes.ia], ["google", sc.lanes.google]];
    if ((sc.commerce || shop) && sc.lanes.agent != null) out.push(["agent", sc.lanes.agent]);
    return out;
  }
  function criteriaOf(sc, lane) {
    if (lane === "agent" && sc.shop && sc.shop.state === "found") return sc.shop.criteria;
    return sc.criteria.filter((c) => c.lane === lane && !c.id.startsWith("bot-"));
  }
  function fixesOf(sc) {
    const seen = new Set(), out = [];
    for (const f of sc.fixes.concat((sc.shop && sc.shop.fixes) || [])) if (!seen.has(f.id)) { seen.add(f.id); out.push(f); }
    return out;
  }
  const SNIP_MAX = 26;
  const snip = (s) => { const l = String(s).split("\n"); return l.length > SNIP_MAX ? l.slice(0, SNIP_MAX).join("\n") + "\n…" : String(s); };

  /* The parts of the report. Pure: node tests call it with a stored reading. */
  function buildParts(data) {
    const f = data.facts, sc = data.sc, at = data.at || Date.now();
    const brand = f.siteName || titleBrand(f.title) || brandOf(f.host);
    const where = f.path === "/" ? "la portada" : "la página";
    const [bc, bw] = band(sc.nota);
    const d = new Date(at), when = dateLong(at);
    const lanes = lanesOf(sc);
    const cover = `<section class="pg cv">${arc()}
<div class="top"><img style="height:24px" src="${IMG}genscore-logo.svg" alt="GenScore"><span class="ey">Informe de página</span></div>
<div class="ey" style="color:#1b4fd6;margin-top:52px;position:relative">Optimización técnica · ${cap(MES[d.getMonth()])} ${d.getFullYear()}</div><h1 style="margin-top:16px">¿Puede la IA leer y citar esta página?</h1>
<p class="lede">Revisión técnica de ${where} de ${esc(brand)} para ChatGPT, Gemini, Claude, Perplexity, Google y los agentes de compra.</p>
<div class="frame"><div class="bar"><i></i><i></i><i></i><span>${esc(f.url)}</span></div>${data.shot ? `<img src="${esc(data.shot)}" alt="">` : `<div class="ph"><b>${esc(f.title || brand)}</b><span>${esc(f.host + f.path)}</span></div>`}</div>
<div class="score"><div class="ey">Optimización técnica</div><div class="n"><b>${sc.nota}</b><span>/100</span></div><span class="pill ${bc}">${bw}</span>
${ticks(sc.nota, 50, "rl")}<div class="rlb">${["Se frena", "Mejorable", "Optimizada"].map((x) => `<span class="${x === bw ? "on" : ""}">${x}</span>`).join("")}</div>
<div class="sl">${lanes.map(([k, v]) => `<div><span>${LANE[k]}</span>${ticks(v, 30)}<b>${v == null ? "–" : v + "%"}</b></div>`).join("")}</div></div>
<div class="cve"><div class="ey">Quién puede leerla hoy</div><div class="chips">${ENG.map(([k, n]) => { const [c, t] = access(sc, k); return `<div class="chip"><div class="lg"><img src="${IMG}${k}.svg" alt=""></div><div><b>${n}</b><span class="${c}">${t}</span></div></div>`; }).join("")}</div></div>
<div class="meta"><div><div class="k">Página</div><div class="v m">${esc((f.host + f.path).slice(0, 44))}</div></div><div><div class="k">Revisada</div><div class="v">${when}</div></div><div><div class="k">Desde</div><div class="v">Extensión de GenScore para Chrome</div></div></div>
</section>`;

    const ok = `<span class="tag">Comprobado</span>`;
    const one = [];
    one.push(`<div class="sec"><span class="num">01</span><h2>Lo esencial</h2></div><p class="big-l">${esc(sc.say)}</p>`);
    if (data.hist && data.hist.prev !== data.hist.now) {
      const dd = data.hist.now - data.hist.prev;
      one.push(`<div class="hs"><span>Desde tu revisión anterior en este navegador (${esc(dateLong(data.hist.prevAt))})${data.hist.fixed && data.hist.fixed.length ? `. Arreglado: ${data.hist.fixed.slice(0, 3).map(esc).join(", ")}.` : "."}</span><b class="${dd > 0 ? "up" : "down"}">${data.hist.prev} → ${data.hist.now}</b></div>`);
    }
    if (sc.alert) {
      const ev = data.ev;
      one.push(`<div class="alert"><div class="ic">!</div><div><b>${esc(sc.alert.t)}</b><p>${esc(sc.alert.s)}${ev ? ` Lo dice ${ev.where.startsWith("robots.txt") ? `<code class="i">robots.txt</code>${esc(ev.where.slice(10))}` : "la " + esc(ev.where.charAt(0).toLowerCase() + ev.where.slice(1))}. ${ok}` : ""}</p></div></div>`);
    }
    one.push(`<div class="lbl"><span class="ey" style="color:#0b1426">Quién puede leerla</span><span class="ey">Según tu robots.txt</span></div><div class="engs">${ENG.map(([k, n, t]) => { const [c, s] = access(sc, k); return `<div class="en${c === "x" ? " no" : c === "u" ? " na" : ""}"><img src="${IMG}${k}.svg" alt=""><b>${n}</b><small>${t}</small><div class="s">${s}</div></div>`; }).join("")}</div>`);
    const v = f.aiView;
    if (v && v.state === "ok") {
      const all = v.pct >= 95, miss = all ? [] : (v.missing || []).slice(0, 4);
      one.push(`<div class="lbl"><span class="ey" style="color:#0b1426">Lo que lee la IA</span><span class="ey">Sin JavaScript</span></div><div class="read"><div class="v">${v.pct}<span>%</span></div><div><p>del texto visible llega en el HTML, que es lo que leen los bots de IA.${all ? "" : miss.length ? " El resto sólo aparece con JavaScript, y ChatGPT, Claude y Perplexity no lo ejecutan." : " Lo que falta está fuera del contenido principal (menú, cabecera o pie) o son textos cortos."} ${ok}</p>${ticks(v.pct, 60)}${miss.length ? `<div class="miss">${miss.map((m) => `<div><span>${esc(m.t)}</span><em>Sólo con JavaScript</em></div>`).join("")}</div>` : ""}</div></div>`);
    }
    const shopPath = sc.shop && sc.shop.state === "found" && sc.shop.path ? sc.shop.path : null;
    one.push(`<div class="lbl"><span class="ey" style="color:#0b1426">Detalle por carril</span><span class="ey">${shopPath ? `Agentes: ficha ${esc(shopPath.length > 34 ? shopPath.slice(0, 33) + "…" : shopPath)}` : "En esta página"}</span></div>
<div class="cols" style="grid-template-columns:repeat(${lanes.length},1fr)">${lanes.map(([k, val]) => `<div class="col"><h3>${LANE[k]}<span>${val == null ? "–" : val + "%"}</span></h3>${ticks(val, 40)}${criteriaOf(sc, k).map((c) => `<div class="cr"><span class="d ${c.v == null ? "mid" : c.v >= 1 ? "ok" : c.v > 0 ? "mid" : "bad"}"></span><div>${esc(c.label)}<small>${esc(c.value)}</small></div></div>`).join("")}</div>`).join("")}</div>`);

    const fx = fixesOf(sc);
    const two = [`<div class="sec"><span class="num">02</span><h2>Qué arreglar, en este orden</h2></div><p class="big-l" style="font-size:15px">${fx.length ? "Cada paso dice cuántos puntos sube la optimización técnica de la página y trae lo que hay que pegar." : "Nada que arreglar en esta página. La pueden leer los cuatro motores y Google."}</p>`];
    fx.forEach((x, i) => {
      const pts = x.pts == null ? "" : `<span class="pts">+${x.pts} ${x.unit === "en Agentes" ? "Agentes" : "pt"}</span>`;
      two.push(`<div class="fx"><div class="n">${String(i + 1).padStart(2, "0")}</div><div><div class="h"><b>${code(x.t)}</b>${pts}</div><div class="lane">${LANE[x.lane] || ""}</div><p>${code(x.why)} ${ok}</p>${x.how ? `<p>${code(x.how)}</p>` : ""}${x.snippet ? `<pre>${esc(snip(x.snippet))}</pre>` : ""}${x.where ? `<div class="where">En ${esc(x.where)}</div>` : ""}</div></div>`);
    });
    two.push(`<div class="end">${arc()}<div class="ey">Siguiente paso</div><h3>Esta es una página. La Puntuación GEO mide tu marca entera.</h3><p>En la consola de GenScore: si ChatGPT, Gemini, Claude y Perplexity te nombran en tus preguntas principales de búsqueda, frente a quién y qué cambiar primero. genscore.es</p></div>`);
    two.push(`<div class="leg"><div><b>Comprobado</b>Leído en la página o en sus ficheros (robots.txt, llms.txt) en el momento de la revisión, desde tu navegador.</div><div><b>Puntos</b>Lo que sube la optimización técnica de esta página al aplicar el paso.</div></div>`);
    return { cover, sections: [one, two], brand, when, title: `Informe GenScore · ${f.host}${f.path === "/" ? "" : f.path} · ${d.getDate()} ${MES[d.getMonth()].slice(0, 3)} ${d.getFullYear()}` };
  }

  /* Lays the blocks on A4 sheets, measuring each one: a block that does not
     fit starts a new sheet. Each section starts on its own sheet. */
  function layout(doc, parts) {
    doc.innerHTML = parts.cover;
    const sheets = [];
    const sheet = () => {
      const pg = document.createElement("section");
      pg.className = "pg in";
      pg.innerHTML = `<div class="hd"><img src="${IMG}genscore-logo.svg" alt="GenScore"><span class="ey">${esc(parts.brand)} · Informe de página</span></div><div class="bd"></div><div class="ft"><span>GenScore · genscore.es · Revisada el ${esc(parts.when)}</span><span class="pn"></span></div>`;
      doc.appendChild(pg);
      sheets.push(pg);
      return pg.querySelector(".bd");
    };
    for (const blocks of parts.sections) {
      let bd = sheet();
      for (const html of blocks) {
        const t = document.createElement("template");
        t.innerHTML = html;
        const nodes = [...t.content.childNodes];
        nodes.forEach((n) => bd.appendChild(n));
        if (bd.scrollHeight > bd.clientHeight + 1 && bd.childNodes.length > nodes.length) {
          nodes.forEach((n) => n.remove());
          bd = sheet();
          nodes.forEach((n) => bd.appendChild(n));
        }
      }
    }
    const total = sheets.length + 1;
    sheets.forEach((pg, i) => { pg.querySelector(".pn").textContent = `${i + 2} / ${total}`; });
  }

  async function boot() {
    const doc = document.getElementById("doc");
    const id = location.hash.slice(1);
    let data = null;
    try { data = id ? (await chrome.storage.session.get("rep:" + id))["rep:" + id] : null; } catch (e) { data = null; }
    if (!data || !data.facts || !data.sc) {
      doc.innerHTML = `<div class="empty"><b>Este informe ya no está disponible</b>Los informes se guardan sólo mientras Chrome está abierto. Vuelve a la página, revísala con GenScore y pulsa «Descarga el informe de esta página».</div>`;
      document.getElementById("print").disabled = true;
      return;
    }
    const parts = buildParts(data);
    document.title = parts.title;
    try { await document.fonts.ready; } catch (e) {}
    layout(doc, parts);
    await Promise.all([...doc.querySelectorAll("img")].map((im) => (im.complete ? 0 : new Promise((ok) => { im.onload = im.onerror = ok; }))));
    document.getElementById("print").addEventListener("click", () => window.print());
  }

  const api = { buildParts };
  root.GS_REPORT = api;
  if (typeof module !== "undefined") module.exports = api;
  else if (typeof document !== "undefined") boot();
})(typeof self !== "undefined" ? self : this);
