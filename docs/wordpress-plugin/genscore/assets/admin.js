/* GenScore for WordPress: the plugin screen.
 *
 * The «Optimización técnica» (formerly «Nota SEO + IA») is the Chrome
 * extension's, computed the same way, and never the Puntuación GEO: each
 * page is opened in a hidden same-origin frame, vendor/collect.js reads it
 * there and vendor/score.js scores it. The screen reviews the home page and
 * the site's important pages (genscore_key_pages) by itself, and the note is
 * the site's. Each page's result is stored in this site's options, so the
 * next visit opens at once and only pages that changed are read again.
 * Nothing leaves this site. The only links to genscore.es are buttons the
 * person clicks.
 *
 * «Tu dominio» blocks never carry a figure: without a GenScore account there
 * is no data, so they are a drawing with a lock and a button.
 */
(function () {
  "use strict";
  var D = window.GS_WP || {};
  var SC = window.GS_SCORE;
  var app = document.getElementById("genscore-app");
  if (!app || !SC) return;

  var S = { tab: "res", state: "loading", facts: null, score: null, error: null, bots: Object.assign({}, D.bots.settings), dirty: {}, msg: {}, llms: Object.assign({}, D.llms), llmsText: null, target: D.target || null, home: null, open: {}, web: { pages: (D.web && D.web.pages) || [], scores: (D.web && D.web.scores) || {}, gen: (D.web && D.web.gen) || 0, running: false, first: false, left: 0 } };
  var ENG = [["chatgpt", "ChatGPT"], ["gemini", "Gemini"], ["claude", "Claude"], ["perplexity", "Perplexity"]];
  var SW_LABEL = {
    "chatgpt-search": ["ChatGPT", "Búsqueda y enlaces que abre ChatGPT"],
    "chatgpt-training": ["ChatGPT", "Entrenamiento de modelos"],
    "claude-search": ["Claude", "Búsqueda y enlaces que abre Claude"],
    "claude-training": ["Claude", "Entrenamiento de modelos"],
    "perplexity-search": ["Perplexity", "Búsqueda y enlaces que abre Perplexity"],
    "gemini": ["Gemini", "Respuestas y entrenamiento de Gemini"],
    "meta-search": ["Meta", "Búsqueda de Meta AI y Muse"],
    "meta-training": ["Meta", "Entrenamiento de modelos"]
  };

  /* ---------------- helpers ---------------- */
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function ic(id, c) { return '<svg class="' + (c || "gs-i") + '" aria-hidden="true"><use href="#' + id + '"/></svg>'; }
  /* The console's agent bands (agenticBand: below 50 fails, from 90 passes). */
  /* The console's GEO Score bands (Inicial below 40, Competitivo from 70). */
  function geoBand(v) { return v == null ? ["none", "Sin dato"] : v >= 70 ? ["pos", "Competitivo"] : v >= 40 ? ["mid", "Emergente"] : ["low", "Inicial"]; }
  function agBand(v) { return v == null ? ["none", "Sin dato"] : v >= 90 ? ["pos", "Bien"] : v >= 50 ? ["mid", "Mejorable"] : ["low", "Falla"]; }
  function band(v) { return v == null ? ["none", "Sin dato"] : v >= 75 ? ["pos", "Bien"] : v >= 50 ? ["mid", "Mejorable"] : ["low", "Se frena"]; }
  function ok(t) { return '<span class="gs-ok">' + ic("i-check") + esc(t) + "</span>"; }
  function ko(t) { return '<span class="gs-ko">' + ic("i-x") + esc(t) + "</span>"; }
  function na(t) { return '<span class="gs-na">' + esc(t) + "</span>"; }
  /* «149.90 EUR» from the page's data, written the Spanish way. */
  function money(v) {
    var m = typeof v === "string" && /^(\d+(?:\.\d+)?) ([A-Z]{3})$/.exec(v);
    if (!m) return v;
    try { return new Intl.NumberFormat("es-ES", { style: "currency", currency: m[2] }).format(Number(m[1])); } catch (e) { return v; }
  }
  function verdict(c) { var v = money(c.value); return c.v == null ? na(v) : c.v >= 1 ? ok(v) : ko(v); }
  function ext(href, label, cls) { return '<a class="' + (cls || "gs-btn gs-ink") + '" href="' + esc(href) + '" target="_blank" rel="noopener">' + label + ic("i-arrowr") + "</a>"; }

  function dial(score, bands, label) {
    var cx = 150, cy = 150, g = "", i, a;
    for (i = 0; i <= 100; i++) {
      a = (135 + i * 2.7) * Math.PI / 180;
      var mj = i % 10 === 0, zone = bands.indexOf(i) >= 0 || i === 0 || i === 100, r1 = 140, r0 = zone ? 118 : mj ? 124 : 129;
      g += '<line class="gs-t ' + (score != null && i <= score ? "gs-on " : "") + (mj ? "gs-mj" : "") + '" x1="' + (cx + r0 * Math.cos(a)).toFixed(2) + '" y1="' + (cy + r0 * Math.sin(a)).toFixed(2) + '" x2="' + (cx + r1 * Math.cos(a)).toFixed(2) + '" y2="' + (cy + r1 * Math.sin(a)).toFixed(2) + '"/>';
    }
    [0].concat(bands, [100]).forEach(function (v) { var b = (135 + v * 2.7) * Math.PI / 180; g += '<text class="gs-lbl" x="' + (cx + 104 * Math.cos(b)).toFixed(1) + '" y="' + (cy + 104 * Math.sin(b) + 3.5).toFixed(1) + '" text-anchor="middle">' + v + "</text>"; });
    a = (135 + (score || 0) * 2.7) * Math.PI / 180;
    if (score != null) g += '<line class="gs-needle" x1="' + (cx + 112 * Math.cos(a)).toFixed(1) + '" y1="' + (cy + 112 * Math.sin(a)).toFixed(1) + '" x2="' + (cx + 148 * Math.cos(a)).toFixed(1) + '" y2="' + (cy + 148 * Math.sin(a)).toFixed(1) + '"/>';
    return '<svg class="gs-dial" viewBox="0 0 300 300" role="img" aria-label="' + (label || "Puntuación GEO") + " " + (score == null ? "sin medir" : score + " de 100") + '">' + g + "</svg>";
  }
  var ARC = "M8 50 A30 30 0 1 1 64 50";
  function arc(v, cls) { return '<svg class="gs-arc" viewBox="0 0 72 56" aria-hidden="true"><path class="gs-tr" d="' + ARC + '"/><path class="gs-v gs-' + cls + '" d="' + ARC + '" pathLength="100" stroke-dasharray="' + (v == null ? 0 : v) + ' 100"/></svg>'; }
  function gauge(tab, nm, icon, v, st, bandFn) {
    var b = (bandFn || band)(v);
    return '<button class="gs-gau" data-tab="' + tab + '"><span class="gs-arcw">' + arc(v, b[0]) + '<b class="gs-num">' + (v == null ? "–" : v) + '</b></span><span class="gs-nm">' + icon + nm + '</span><span class="gs-st"><span class="gs-dot gs-' + b[0] + '"></span>' + esc(st || b[1]) + ic("i-chevr") + "</span></button>";
  }
  function lock() { return '<span class="gs-lock">' + ic("i-shield") + "</span>"; }
  /* Already a GenScore customer: connect. Not yet: analyse the domain (7-day Pro trial). */
  function domainCta(where) { return '<div class="gs-acts">' + connectBtn("gs-btn gs-ink") + ext(D.links.analyze.replace("utm_content=analizar", "utm_content=" + where), "Analizar <b>&nbsp;" + esc(D.site.domain) + "</b>", "gs-btn gs-line") + '</div><p class="gs-more">¿Aún sin cuenta? «Analizar» empieza 7 días de Pro gratis.</p>'; }

  /* ---------------- robots.txt, read the same way as the extension ---------------- */
  function switchAllowed(id) {
    if (!S.facts || !S.facts.robots || S.facts.robots.text == null) return null;
    var groups = SC.parseRobots(S.facts.robots.text);
    return D.bots.switches[id].tokens.every(function (t) { return SC.tokenVerdict(groups, t, "/").allowed; });
  }
  /* `*` closes the whole site: what any bot without its own group gets. */
  function starClosed() {
    if (!S.facts || !S.facts.robots || S.facts.robots.text == null) return false;
    return !SC.tokenVerdict(SC.parseRobots(S.facts.robots.text), "genscore-any-bot", "/").allowed;
  }
  /* Meta is not one of the four engines the note measures, but blocking its
     search bot keeps a site out of Meta AI and Muse: the screen says so,
     read from the same robots.txt and outside the note. */
  function metaAllowed() {
    if (!S.facts || !S.facts.robots || S.facts.robots.text == null || !D.bots.switches["meta-search"]) return null;
    var groups = SC.parseRobots(S.facts.robots.text);
    return D.bots.switches["meta-search"].tokens.every(function (t) { return SC.tokenVerdict(groups, t, S.facts.path || "/").allowed; });
  }
  function ptsLabel(n, unit) { return "+" + n + " " + (unit === "pt" ? (n === 1 ? "punto en la nota" : "puntos en la nota") : "en Agentes"); }
  /* Which page is under review: the home page, or the one picked in the
     header (or arrived from «Revisar con GenScore» in a list of posts). */
  function tu() { return S.target ? "esta página" : "tu portada"; }
  function la() { return S.target ? "esta página" : "la portada"; }
  function cap(t) { return t.charAt(0).toUpperCase() + t.slice(1); }
  function switchWanted(id) {
    if (S.dirty[id]) return S.dirty[id] === "allow";
    /* Just saved: the robots.txt on screen is the one read before the save,
       so the switch shows what was saved until the page is read again
       (it bounced back for 3 or 4 seconds). */
    if (S.botsPending) return S.bots[id] !== "block";
    var now = switchAllowed(id);
    return now == null ? S.bots[id] !== "block" : now;
  }

  /* ---------------- header and tabs ---------------- */
  /* The site's own mark: its WordPress site icon, or its initial. Never the
     GenScore logo, which read as if the screen were about GenScore itself. */
  function siteMark() {
    var name = D.site.name || D.site.domain || "";
    if (D.site.icon) return '<img class="gs-site" src="' + esc(D.site.icon) + '" alt="" width="32" height="32">';
    return '<span class="gs-site gs-ini" aria-hidden="true">' + esc((name.trim()[0] || "?").toUpperCase()) + "</span>";
  }
  function head() {
    return '<div class="gs-ph">' + siteMark() + '<span class="gs-who"><b>' + esc(D.site.name || "GenScore") + "</b><span>" + esc(D.site.domain) + '</span></span>' + (S.target ? '<button class="gs-btn gs-line gs-sm gs-back" data-act="back">' + ic("i-arrowl") + 'Tu web</button><span class="gs-who gs-pg-t"><b>' + esc(S.target.title || "") + "</b><span>" + esc(S.target.path) + "</span></span>" : "") + '<span class="gs-sp"></span>' + acctHead() + "</div>";
  }
  function tabs() {
    var T = [["res", "Resumen"], ["geo", "GEO"], ["seo", "SEO"], ["ag", "Agentes"]];
    return '<div class="gs-tabs" role="tablist" aria-label="Secciones">' + T.map(function (t) { return '<button role="tab" data-tab="' + t[0] + '" aria-selected="' + (S.tab === t[0]) + '" aria-pressed="' + (S.tab === t[0]) + '">' + t[1] + "</button>"; }).join("") + "</div>";
  }

  /* ---------------- «Tu dominio»: what an account adds, never a figure ---------------- */
  function domGeo() {
    if (acctOn()) return realGeo();
    if (acctLinked()) return acctWait();
    return '<div class="gs-lyr gs-gs">Tu dominio<small>con tu cuenta de GenScore</small></div><div class="gs-tz"><div class="gs-ill">' + lock() + '<div class="gs-gh4">' + ENG.map(function (e) { return "<div>" + ic("e-" + e[0], "gs-lg") + '<span class="gs-q"></span>' + e[1] + '<span class="gs-bar"></span></div>'; }).join("") + '</div><div class="gs-ghr">' + [1, 2, 3, 4].map(function (n) { return '<div class="' + (n === 2 ? "gs-me" : "") + '"><span>' + n + '</span><i></i><em style="width:' + (80 - n * 10) + '%"></em><u></u></div>'; }).join("") + '</div></div><h3>Conoce cómo te citan los motores</h3><p>Cuánto te nombra cada motor, qué páginas tuyas citan y quién sale antes que tú.</p>' + domainCta("geo") + "</div>";
  }
  function domSeo() {
    if (acctOn()) return realSeo();
    if (acctLinked()) return acctWait();
    return '<div class="gs-lyr gs-gs">Tu dominio<small>con tu cuenta de GenScore</small></div><div class="gs-tz"><div class="gs-ill">' + lock() + '<div class="gs-ghs"><span class="gs-ring"></span><div class="gs-ln"><i style="width:92%"></i><i style="width:70%"></i><i style="width:84%"></i></div></div><div class="gs-ghc"><svg viewBox="0 0 200 46" preserveAspectRatio="none" aria-hidden="true"><polyline points="0,36 25,32 50,34 75,26 100,28 125,20 150,22 175,14 200,12" fill="none" stroke="#d3d9e2" stroke-width="2"/></svg></div></div><h3>Conoce la Salud SEO de todo tu dominio</h3><p>Todas tus páginas clave, no solo esta, y con Search Console tus búsquedas de Google, tu puesto y tus clics.</p>' + domainCta("seo") + "</div>";
  }
  function domAg() {
    if (acctOn()) return realAg();
    if (acctLinked()) return acctWait();
    var N = ["Descubrimiento", "Comprensión", "Confianza", "Compra"];
    return '<div class="gs-lyr gs-gs">Tu dominio<small>con tu cuenta de GenScore</small></div><div class="gs-tz"><div class="gs-ill">' + lock() + '<div class="gs-ghg">' + N.map(function (n) { return '<div><svg viewBox="0 0 72 56" aria-hidden="true"><path d="' + ARC + '" fill="none" stroke="#e3e6eb" stroke-width="6" stroke-linecap="round"/></svg>' + n + "</div>"; }).join("") + '</div></div><h3>Conoce tu nota para agentes</h3><p>Cómo te descubren, te entienden, se fían y te compran los agentes de ChatGPT, Gemini y Perplexity.</p>' + domainCta("agentes") + "</div>";
  }

  /* ---------------- «Esta web» ---------------- */
  function criteria(lane, skipBots) {
    var C = (S.score && S.score.criteria) || [];
    return C.filter(function (c) { return c.lane === lane && !(skipBots && c.id.indexOf("bot-") === 0); });
  }
  function rows(list) { return '<div class="gs-rows">' + list.map(function (c) { return '<div class="gs-rw"><span class="gs-tx">' + esc(c.label) + "</span>" + verdict(c) + "</div>"; }).join("") + "</div>"; }
  function fixCard(lane, title) {
    if (webMode()) {
      var cov = coveredKinds({ ia: "geo", google: "seo", agent: "agent" }[lane]);
      var G = webAgg().fixes.filter(function (g) { var id = String(g.id).replace(/^shop-/, ""); return g.lane === lane && !cov[KIND_OF[id]] && !(cov["goto:llms"] && id === "llms") && !(cov["goto:bots"] && id.indexOf("bot-") === 0); });
      if (!G.length) return "";
      return '<div class="gs-card"><div class="gs-lab">Recomendaciones técnicas<small>en toda la web</small></div>' + G.slice(0, 5).map(function (g, i) { return webFixRow(g, i); }).join("") + "</div>";
    }
    var F = ((S.score && S.score.fixes) || []).filter(function (f) { return f.lane === lane; });
    if (!F.length) return "";
    return '<div class="gs-card"><div class="gs-lab">' + title + "</div>" + F.slice(0, 5).map(function (f, i) { return '<div class="gs-fx"><span class="gs-n">' + (i + 1) + '</span><span class="gs-tx">' + f.t + (f.why ? '<span class="gs-why">' + f.why + "</span>" : "") + '</span><span class="gs-pts">+' + f.pts + " " + esc(f.unit === "pt" ? "pt" : "") + "</span>" + fixBtn(f.id, S.target ? [S.target] : [{ type: "home" }]) + "</div>"; }).join("") + "</div>";
  }

  function botsCard() {
    var site = D.site, blocked = !site.public || site.robotsFile || !site.rootInstall;
    var note = "";
    if (!site.public) note = '<div class="gs-hint gs-warm">WordPress pide a los buscadores que no indexen esta web, así que robots.txt cierra la puerta a todos. Cámbialo en <a href="' + esc(site.readingUrl) + '">Ajustes, Lectura</a>.</div>';
    else if (site.robotsFile) note = '<div class="gs-hint gs-warm">Tu web tiene un fichero robots.txt propio y el servidor lo sirve antes que WordPress. GenScore no lo modifica: copia las líneas de «Arreglar» en ese fichero.</div>';
    else if (!site.rootInstall) note = '<div class="gs-hint gs-warm">WordPress está instalado en una carpeta, y robots.txt sólo cuenta en la raíz del dominio. Pide a quien gestiona el dominio que añada las reglas allí.</div>';
    else if (starClosed()) note = '<div class="gs-hint gs-warm">Tu robots.txt cierra la web entera a todos los bots («User-agent: *» con «Disallow: /»), a menudo por un plugin de mantenimiento. Mientras siga así, «Permitir» no abre la web a ningún bot; «Bloquear» sí se guarda.</div>';
    if (metaAllowed() === false) note += '<div class="gs-hint gs-warm">Tu robots.txt bloquea la búsqueda de Meta: Meta AI y Muse no pueden leer tu web para citarla. No resta en la nota, que mide ChatGPT, Gemini, Claude y Perplexity.</div>';
    var ids = Object.keys(D.bots.switches);
    var list = ids.map(function (id) {
      var on = switchWanted(id), L = SW_LABEL[id] || [id, ""];
      var tokens = D.bots.switches[id].tokens.join(", ");
      return '<div class="gs-bot"><span class="gs-tx"><b>' + esc(L[0]) + " · " + esc(L[1]) + "</b><small>" + esc(tokens) + '</small></span><button class="gs-sw" role="switch" data-sw="' + id + '" aria-checked="' + on + '" aria-label="' + esc(L[0] + ", " + L[1]) + '"' + (blocked ? " disabled" : "") + "></button></div>";
    }).join("");
    var dirty = Object.keys(S.dirty).length > 0;
    return '<div class="gs-card" id="gs-card-bots"><div class="gs-lab">Bots de IA<small>robots.txt</small></div>' + note + '<div class="gs-rows">' + list + '</div><div class="gs-hint">Los bots de búsqueda deciden si los motores pueden leerte y citarte. Cerrar los de entrenamiento es decisión tuya y no te quita de las respuestas con búsqueda.</div><div class="gs-hint">Cuando un agente entra a comprar por alguien (Muse, Dots, el agente de Gemini), no consulta robots.txt: lo que lo frena es tu protección anti-bots.</div><div class="gs-acts"><button class="gs-btn gs-blue" data-act="save-bots"' + (dirty && !blocked ? "" : " disabled") + '>Guardar robots.txt</button><a class="gs-btn gs-line" href="' + esc(D.site.home + "robots.txt") + '" target="_blank" rel="noopener">Ver el fichero</a>' + (S.msg.bots ? S.msg.bots : "") + "</div></div>";
  }

  function llmsCard() {
    var L = S.llms;
    if (L.other) return '<div class="gs-card"><div class="gs-lab">llms.txt</div><div class="gs-hint">' + esc(L.other) + ' ya publica tu llms.txt. GenScore no lo sustituye para no duplicarlo: revísalo en sus ajustes.</div><div class="gs-acts"><a class="gs-btn gs-line" href="' + esc(L.url) + '" target="_blank" rel="noopener">Ver /llms.txt</a></div></div>';
    if (L.physical) return '<div class="gs-card"><div class="gs-lab">llms.txt</div><div class="gs-hint">Tu web ya tiene un fichero llms.txt en la raíz y el servidor lo sirve antes que WordPress. GenScore no lo toca.</div><div class="gs-acts"><a class="gs-btn gs-line" href="' + esc(L.url) + '" target="_blank" rel="noopener">Ver /llms.txt</a></div></div>';
    var text = S.llmsText != null ? S.llmsText : L.custom || L.generated;
    var live = S.facts && S.facts.llms && S.facts.llms.ok;
    var status = L.serving ? "publicado" : live ? "lo publica otra parte" : "no existe todavía";
    return '<div class="gs-card" id="gs-card-llms"><div class="gs-lab">llms.txt<small>' + status + '</small></div><div class="gs-bot" style="border:0;padding-top:0"><span class="gs-tx"><b style="font-size:14px;font-weight:600">Publicar /llms.txt</b><small style="font-family:var(--font);font-size:12.5px">Un resumen de tu web para los motores de IA: tus páginas, productos y artículos con su extracto. Puedes editarlo.</small></span><button class="gs-sw" role="switch" data-act="llms-toggle" aria-checked="' + !!L.enabled + '" aria-label="Publicar llms.txt"></button></div><label class="screen-reader-text" for="gs-llms-text">Contenido de llms.txt</label><textarea id="gs-llms-text" class="gs-code" spellcheck="false">' + esc(text) + '</textarea><div class="gs-acts"><button class="gs-btn gs-blue" data-act="save-llms">Guardar</button>' + (L.custom ? '<button class="gs-btn gs-line" data-act="llms-reset">Volver al generado</button>' : "") + (L.serving ? '<a class="gs-btn gs-line" href="' + esc(L.url) + '" target="_blank" rel="noopener">Ver /llms.txt</a>' : "") + (S.msg.llms || "") + "</div></div>";
  }

  function metaRow() {
    var m = metaAllowed();
    return '<div class="gs-ecx' + (m === false ? " gs-no" : "") + '"><span class="gs-lgw">' + ic("e-meta", "gs-lg") + '</span><span class="gs-tx"><b>Meta AI y Muse</b><small>No cuenta en la nota</small></span><span class="gs-st">' + (m == null ? "Sin leer" : m ? "Puede leerla" : "Bloqueado") + "</span></div>";
  }
  function webGeo() {
    var acc = (S.score && S.score.access) || {};
    var cards = '<div class="gs-card"><div class="gs-lab">Quién puede leer ' + tu() + '<small>robots.txt</small></div><div class="gs-eng4">' + ENG.map(function (e) {
      var a = acc[e[0]];
      return '<div class="gs-ec' + (a === false ? " gs-no" : "") + '"><span class="gs-lgw">' + ic("e-" + e[0], "gs-lg") + "</span><b>" + e[1] + "</b><small>" + (a == null ? "Sin leer" : a ? "Puede leerla" : "Bloqueado") + "</small></div>";
    }).join("") + "</div>" + metaRow() + "</div>";
    return '<div class="gs-lyr">Esta web<small>se arregla aquí</small></div>' + cards + fixCard("ia", "Arreglar") + botsCard() + llmsCard() + '<div class="gs-card"><div class="gs-lab">En ' + la() + '</div>' + rows(criteria("ia", true)) + "</div>";
  }

  var ISSUE = { desc: "Sin meta descripción", duptitle: "Título repetido con otra página", notitle: "Sin título", alt: "Imágenes sin texto alternativo" };
  var TYPE = { page: "Página", post: "Entrada", product: "Producto" };
  function webSeo() {
    var s = D.site;
    var wp = '<div class="gs-card"><div class="gs-lab">En WordPress</div><div class="gs-rows">'
      + '<div class="gs-rw"><span class="gs-tx">Visible para los buscadores<small>Ajustes, Lectura</small></span>' + (s.public ? ok("Sí") : ko("No")) + "</div>"
      + '<div class="gs-rw"><span class="gs-tx">Mapa del sitio' + (s.sitemap ? "<small>" + esc(s.sitemap.replace(s.home, "/")) + "</small>" : "") + "</span>" + (s.sitemap ? (S.sitemapOk === false ? ko("No responde") : S.sitemapOk ? ok("Sí") : na("Comprobando")) : ko("No")) + "</div>"
      + '<div class="gs-rw"><span class="gs-tx">HTTPS</span>' + (s.https ? ok("Sí") : ko("No")) + "</div>"
      + '<div class="gs-rw"><span class="gs-tx">Enlaces permanentes legibles</span>' + (s.permalinkPlain ? ko("No") : ok("Sí")) + "</div>"
      + '<div class="gs-rw"><span class="gs-tx">Plugin SEO</span>' + (s.seoPlugin ? ok(s.seoPlugin) : na("Ninguno")) + "</div></div></div>";
    var P = D.pages, items = P.items || [];
    var R = P.reviewed || {};
    var scope = "Revisadas: " + ["page", "post", "product"].filter(function (k) { return R[k] != null; }).map(function (k) {
      var n = R[k], cap = P.limits[k];
      return (k === "page" ? "páginas" : k === "post" ? "entradas" : "productos") + (n >= cap ? " (las " + cap + " más recientes)" : "");
    }).join(", ") + ".";
    var list = items.length ? items.slice(0, 12).map(function (it) {
      var lab = it.issues.map(function (k) { return k === "alt" && it.noAlt > 1 ? it.noAlt + " imágenes sin texto alternativo" : ISSUE[k]; }).join(" · ");
      return '<div class="gs-rw"><span class="gs-dot gs-mid"></span><span class="gs-tx">' + esc(it.title || "(sin título)") + "<small>" + esc((TYPE[it.type] || "") + " · " + lab) + "</small></span>" + (it.edit ? '<a class="gs-btn gs-line gs-sm" href="' + esc(it.edit) + '">Editar</a>' : "") + "</div>";
    }).join("") + (items.length > 12 ? '<p class="gs-more">Y ' + (items.length - 12) + " más.</p>" : "") : '<div class="gs-rw"><span class="gs-tx">No vemos nada que revisar.</span>' + ok("Bien") + "</div>";
    var descNote = P.canCheckDescriptions ? "" : '<div class="gs-hint">' + (s.seoPlugin ? esc(s.seoPlugin) + " guarda las meta descripciones a su manera y no podemos leerlas desde aquí." : "Sin un plugin SEO, WordPress no escribe meta descripciones en tus páginas. La de " + la() + " la ves abajo.") + "</div>";
    var pages = '<div class="gs-card"><div class="gs-lab">Páginas que revisar</div>' + descNote + '<div class="gs-rows">' + list + '</div><p class="gs-more">' + esc(scope) + "</p></div>";
    return '<div class="gs-lyr">Esta web<small>se arregla aquí</small></div>' + fixCard("google", "Arreglar en " + la()) + wp + pages + '<div class="gs-card"><div class="gs-lab">Lo que ve Google en ' + la() + '</div>' + rows(criteria("google")) + "</div>";
  }

  function webAg() {
    var sc = S.score || {};
    var shop = sc.shop && sc.shop.state === "found" ? sc.shop : null;
    var C = shop ? shop.criteria : sc.commerce ? criteria("agent") : [];
    if (!C.length) {
      return '<div class="gs-lyr">Esta web<small>' + (D.site.woocommerce ? "WooCommerce detectado" : "se arregla aquí") + '</small></div><div class="gs-card"><div class="gs-lab">Qué lee un agente</div><p>No hemos encontrado nada a la venta en ' + tu() + ' ni en las páginas que enlaza.' + (D.site.woocommerce ? " Si vendes con WooCommerce, publica algún producto y enlázalo desde la portada o el menú." : " Si vendes algo (productos, servicios, reservas), enlaza la página desde la portada o el menú.") + "</p></div>";
    }
    var where = "<small>" + esc(shop ? shop.path : S.target ? S.target.path : "tu portada") + "</small>";
    return '<div class="gs-lyr">Esta web<small>' + (D.site.woocommerce ? "WooCommerce detectado" : "se arregla aquí") + '</small></div><div class="gs-card"><div class="gs-lab">Lo que lee un agente</div><div class="gs-rw" style="border:0;padding-top:0">' + ic("i-cart") + '<span class="gs-tx"><b style="font-weight:600">' + (shop ? (D.site.woocommerce ? "Ficha de producto analizada" : "Página de venta analizada") : cap(tu()) + " vende") + "</b>" + where + "</span></div>" + rows(C) + "</div>" + fixCard("agent", "Arreglar");
  }

  /* ---------------- the site review ---------------- */
  var TYPE_N = { page: ["página", "páginas"], post: ["entrada", "entradas"], product: ["producto", "productos"] };
  function kindOf(p) { return p.type === "home" ? "page" : p.type; }
  function webEntries() {
    return S.web.pages.map(function (p) { var e = S.web.scores[p.id]; return e && e.nota != null ? { page: p, e: e } : null; }).filter(Boolean);
  }
  function avg(list) { return list.length ? Math.round(list.reduce(function (a, b) { return a + b; }, 0) / list.length) : null; }
  /* The site's note: the mean of its pages. Agentes only counts pages that
     sell. A fix weighs what it gives on each page it affects, spread over
     every page reviewed, so one bad page does not outrank a site-wide gap. */
  function webAgg() {
    var E = webEntries();
    if (!E.length) return null;
    var lane = function (k) { return avg(E.map(function (x) { return x.e[k]; }).filter(function (v) { return v != null; })); };
    /* Agentes: the pages that sell by themselves; only if none does, one
       page that borrowed the shop it links to (they all borrowed the same). */
    var sellers = E.filter(function (x) { return x.e.agent != null && !x.e.via; });
    var agentPool = sellers.length ? sellers : E.filter(function (x) { return x.e.agent != null; }).slice(0, 1);
    var inPool = function (x) { return agentPool.indexOf(x) >= 0; };
    var by = {};
    E.forEach(function (x) {
      (x.e.fixes || []).forEach(function (f) {
        if (f.lane === "agent" && !inPool(x)) return;
        var g = by[f.id] || (by[f.id] = { id: f.id, lane: f.lane, t: f.t, unit: f.unit, sum: 0, hit: [] });
        g.sum += f.pts || 0;
        g.hit.push(x);
      });
    });
    var F = Object.keys(by).map(function (k) {
      var g = by[k];
      var types = {}; g.hit.forEach(function (x) { types[kindOf(x.page)] = 1; });
      var one = Object.keys(types).length === 1 ? Object.keys(types)[0] : null;
      var of = one ? E.filter(function (x) { return kindOf(x.page) === one; }).length : E.length;
      var nm = TYPE_N[one || "page"];
      g.pts = Math.max(1, Math.round(g.sum / (g.lane === "agent" ? agentPool.length : E.length)));
      var P = agentPool.length;
      if (g.lane === "agent") g.where = g.hit.length === P ? (P === 1 ? "En la única página que vende" : "En todas las páginas que venden") : "En " + g.hit.length + " de " + P + " páginas que venden";
      else g.where = g.hit.length === of ? (of === 1 ? "En la única " + nm[0] + " revisada" : "En todas tus " + nm[1] + " revisadas") : "En " + g.hit.length + " de " + of + " " + nm[1];
      g.hit.sort(function (a, b) { return a.e.nota - b.e.nota; });
      return g;
    }).sort(function (a, b) { return b.sum - a.sum; });
    return { n: E.length, nota: avg(E.map(function (x) { return x.e.nota; })), lanes: { ia: lane("ia"), google: lane("google"), agent: avg(agentPool.map(function (x) { return x.e.agent; })) }, fixes: F, entries: E };
  }
  function webMode() { return !S.target && !!webAgg(); }
  function scoreChip(v) { var b = band(v); return '<span class="gs-sc gs-sc-' + b[0] + '">' + (v == null ? "–" : v + "%") + "</span>"; }
  function pageRow(x, withFix) {
    var first = x.e.fixes && x.e.fixes[0] ? x.e.fixes[0].t.replace(/<[^>]+>/g, "") : "Nada urgente";
    var kind = x.page.type === "home" ? "Portada" : TYPE[x.page.type] || "";
    return '<div class="gs-pr">' + scoreChip(x.e.nota) + '<button class="gs-tx gs-prt" data-act="open-page" data-id="' + x.page.id + '"><b>' + esc(x.page.title || "(sin título)") + "</b><small>" + esc(kind + (withFix === false ? "" : " · " + first)) + "</small></button>" + (x.page.edit ? '<a class="gs-pr-e" href="' + esc(x.page.edit) + '">Editar</a>' : "") + "</div>";
  }
  function webFixRow(g, i) {
    var act = fixBtn(g.id, g.hit.map(function (x) { return x.page; }));
    if (act) return '<div class="gs-fx gs-fxw"><span class="gs-n">' + (i + 1) + '</span><span class="gs-tx">' + g.t + '<span class="gs-why">' + ptsLabel(g.pts, g.unit) + '</span><span class="gs-chip">' + esc(g.where) + "</span></span>" + act + "</div>";
    var open = S.open[g.id] != null ? S.open[g.id] : i === 0;
    var pages = open ? '<div class="gs-prs">' + g.hit.slice(0, 5).map(function (x) { return pageRow(x, false); }).join("") + (g.hit.length > 5 ? '<p class="gs-more">Y ' + (g.hit.length - 5) + " más, en «Tus páginas».</p>" : "") + "</div>" : "";
    return '<div class="gs-fx gs-fxw"><span class="gs-n">' + (i + 1) + '</span><span class="gs-tx">' + g.t + '<span class="gs-why">' + ptsLabel(g.pts, g.unit) + '</span><span class="gs-chip">' + esc(g.where) + "</span>" + pages + '</span><button class="gs-btn gs-line gs-sm" data-act="toggle-fix" data-id="' + esc(g.id) + '" aria-expanded="' + open + '">' + (open ? "Ocultar" : "Cómo hacerlo") + "</button></div>";
  }
  function progressLine() {
    if (!S.web.running) return "";
    return '<p class="gs-bgrev"><span class="gs-spin gs-spin-sm"></span>Revisando tus páginas más importantes para calcular tu nota</p>';
  }

  /* ---------------- Resumen ---------------- */
  function resumen() {
    var sc = S.score;
    var W = webMode() ? webAgg() : null;
    var nota = W ? W.nota : sc.nota, lanes = W ? W.lanes : sc.lanes;
    var blocked = sc.blockedEngines.length;
    var prep = prepCard(nota, lanes, sc, W), geo = geoCard() + bridge(nota);
    var F = sc.fixes.slice(0, 3);
    var tabOf = { ia: "geo", google: "seo", agent: "ag" };
    if (W) {
      var WF = W.fixes.slice(0, 3);
      var mine = '<div class="gs-card"><div class="gs-lab">Recomendaciones técnicas<small>en toda la web</small></div>' + (WF.length ? WF.map(function (g, i) { return webFixRow(g, i); }).join("") : '<div class="gs-rw"><span class="gs-tx">Tu web está bien. No hay nada urgente.</span>' + ok("Bien") + "</div>") + "</div>";
      var list = W.entries.slice().sort(function (a, b) { return a.e.nota - b.e.nota; });
      var pagesCard = '<div class="gs-card"><div class="gs-lab">Tus páginas<small>peor nota primero</small></div><div class="gs-prs">' + list.map(function (x) { return pageRow(x); }).join("") + '</div><p class="gs-more">Revisamos las páginas más relevantes para el análisis: tu portada, tu menú, tus productos y tus últimas entradas. Al publicar o actualizar algo, revisamos sólo esa página. ' + (S.web.running ? "" : '<button class="gs-link" data-act="rerun-web">Revisar todo ahora</button>') + "</p></div>";
      return '<div class="gs-cols gs-q2"><div class="gs-col">' + prep + mine + pagesCard + '</div><div class="gs-col">' + geo + recsCard() + batchesCard() + (acctLinked() ? "" : acctCard()) + "</div></div>";
    }
    var fixes = '<div class="gs-card"><div class="gs-lab">Recomendaciones técnicas</div>' + (F.length ? F.map(function (f, i) { return '<div class="gs-fx"><span class="gs-n">' + (i + 1) + '</span><span class="gs-tx">' + f.t + '<span class="gs-why">' + ptsLabel(f.pts, f.unit) + '</span></span>' + (fixBtn(f.id, S.target ? [S.target] : [{ type: "home" }]) || '<button class="gs-btn gs-line gs-sm" data-tab="' + tabOf[f.lane] + '">Ver</button>') + '</div>'; }).join("") : '<div class="gs-rw"><span class="gs-tx">' + cap(tu()) + ' está bien. No hay nada urgente.</span>' + ok("Bien") + "</div>") + "</div>";
    return '<div class="gs-cols gs-q2"><div class="gs-col">' + prep + fixes + '</div><div class="gs-col">' + geo + recsCard() + batchesCard() + (acctLinked() ? "" : acctCard()) + "</div></div>";
  }
  /* ---------------- two questions, two instruments ----------------
     The page review measures whether the site is ready for the engines and
     Google: it is a bar with a state, never a dial. The only dial on screen is
     the Puntuación GEO, whether the AI names the brand, the same figure as the
     console. A new site can be ready at 100% and still score near zero. */
  function readyBand(v) { return v == null ? ["none", "Sin dato"] : v >= 75 ? ["pos", "Optimizada"] : v >= 50 ? ["mid", "Mejorable"] : ["low", "Se frena"]; }
  function pbar(v, cls) { return '<span class="gs-pbar"><i class="gs-' + cls + '" style="width:' + (v == null ? 0 : v) + '%"></i></span>'; }
  function prepCard(nota, lanes, sc, W) {
    var b = readyBand(nota), blocked = sc.blockedEngines.length;
    var L = [["geo", "ia", "IA", ic("i-sparkles"), blocked ? 4 - blocked + " de 4 la leen" : null], ["seo", "google", "Google", ic("e-google", "gs-i"), null], ["ag", "agent", "Agentes", ic("i-cart"), lanes.agent == null ? "Sin tienda" : null]];
    var scope = S.target ? S.target.path : W ? (W.n === 1 ? "tu portada" : "tu web · " + W.n + " páginas") : "portada";
    return '<div class="gs-card gs-qc"><div class="gs-lab">Optimización técnica<small class="gs-mono">' + esc(scope) + '</small></div><p class="gs-qq">¿Está tu web optimizada para la IA y Google?</p>'
      + '<div class="gs-prh"><b class="gs-prw gs-' + b[0] + '">' + b[1] + '</b><span class="gs-prp gs-num">' + nota + "%</span></div>" + pbar(nota, b[0])
      + '<div class="gs-plns">' + L.map(function (l) { var v = lanes[l[1]], lb = readyBand(v); return '<button class="gs-pln" data-tab="' + l[0] + '"><span class="gs-nm">' + l[3] + l[2] + "</span>" + pbar(v, lb[0]) + '<span class="gs-pv gs-num">' + (v == null ? "–" : v + "%") + '</span><span class="gs-st"><span class="gs-dot gs-' + lb[0] + '"></span>' + esc(l[4] || lb[1]) + ic("i-chevr") + "</span></button>"; }).join("") + "</div>"
      + '<p class="gs-qs">' + esc(sc.say) + "</p>" + (W ? progressLine() : "") + '<p class="gs-qn">Depende de tu web y se arregla desde aquí. No mide si la IA te nombra.</p></div>';
  }
  function geoDial(v, center) {
    var b = geoBand(v);
    return '<div class="gs-dialbox">' + dial(v, [40, 70], "Puntuación GEO") + '<div class="gs-dial-c"><b class="gs-num">' + center + "</b><span>Puntuación GEO</span></div></div>"
      + '<div class="gs-bands"><span class="' + (v != null && v < 40 ? "gs-on" : "") + '">Inicial</span><span class="' + (v >= 40 && v < 70 ? "gs-on" : "") + '">Emergente</span><span class="' + (v >= 70 ? "gs-on" : "") + '">Competitivo</span></div>';
  }
  function geoCard() {
    var q = '<p class="gs-qq">¿Te nombra la IA cuando preguntan por lo tuyo?</p>';
    if (!acctLinked()) return '<div class="gs-card gs-qc gs-hero"><div class="gs-lab" style="width:100%">Puntuación GEO<small>sin medir</small></div>' + q + geoDial(null, "?") + '<p class="gs-qs">Para saberlo hay que preguntar a ChatGPT, Gemini, Claude y Perplexity por lo que vendes. Eso es lo que mide GenScore.</p>' + domainCta("puntuacion") + "</div>";
    if (!acctOn()) return '<div class="gs-card gs-qc">' + acctWait() + "</div>";
    var P = S.acct.project, ag = P.agentic && P.agentic.kind === "card" ? P.agentic.score : null, sb = auBlock("seo");
    return '<div class="gs-card gs-qc gs-hero gs-domc">' + domLyr(scanLabel(P)) + q + noScan(P) + geoDial(P.geoScore, P.geoScore == null ? "–" : P.geoScore) + (P.lede ? '<p class="gs-qs">' + esc(P.lede) + "</p>" : "")
      + '<div class="gs-mh">Auditoría de tu dominio</div><div class="gs-gg3 gs-gg2">' + gauge("seo", "Salud SEO", ic("e-google", "gs-i"), sb ? sb.score : P.seoScore, null) + (ag == null ? "" : gauge("ag", "Auditoría agéntica", ic("i-cart"), ag, null, agBand)) + "</div></div>";
  }
  /* The gap explained with the site's own figures, only when there is one. */
  function bridge(nota) {
    if (!acctLinked()) return nota >= 75 ? '<div class="gs-bridge">' + ic("i-sparkles") + "<span><b>Una web técnicamente optimizada no basta.</b> Que la IA pueda leerte no significa que te recomiende: eso depende también de lo que dicen de ti otras webs y de si respondes a las preguntas de los usuarios.</span></div>" : "";
    if (!acctOn() || S.acct.project.geoScore == null) return "";
    var g = S.acct.project.geoScore;
    if (nota >= 75 && g < 40) return '<div class="gs-bridge">' + ic("i-sparkles") + "<span><b>Lo normal al empezar.</b> Tu web ya está optimizada, pero la IA todavía no te nombra. La Puntuación GEO sube cuando otras webs hablan de ti y cuando respondes a las preguntas de los usuarios. Las recomendaciones de GenScore van por ahí.</span></div>";
    if (nota < 50) return '<div class="gs-bridge">' + ic("i-sparkles") + "<span><b>Primero, la optimización técnica.</b> Mientras tu web se frene, a la IA le cuesta citarte aunque hablen de ti. Empieza por las recomendaciones técnicas.</span></div>";
    return "";
  }
  /* What GenScore recommends for the domain, as the console has it: the plan
     of Visión general (to be named by the AI) and the top issues of each audit
     block (GEO, SEO, agentic). Nothing recomputed here. */
  function recsCard() {
    if (!acctOn()) return "";
    var P = S.acct.project, out = "";
    var plan = planRows(2);
    if (plan) out += '<div class="gs-mh">Para que la IA te nombre' + goApp("recommendations", "Ver", "plan", "gs-lnk") + "</div>" + plan;
    [["geo", "Auditoría GEO", "web-audit?bloque=geo", "auditoria-geo"], ["seo", "Auditoría SEO", "web-audit?bloque=seo", "auditoria-seo"], ["agent", "Auditoría agéntica", "agentic-visibility", "agentes"]].forEach(function (k) {
      var b = auBlock(k[0]);
      if (!b || !b.issues.length) return;
      out += '<div class="gs-mh">' + k[1] + "<small>" + b.score + (b.projected || b.projectedAll ? " → " + (b.projected || b.projectedAll) : "") + "</small>" + goApp(k[2], "Ver", k[3], "gs-lnk") + '</div><div class="gs-rows">' + recRows(b) + "</div>";
    });
    return out ? '<div class="gs-card gs-recs"><div class="gs-lab">Recomendaciones de GenScore<small>de tu consola</small></div>' + out + '<div class="gs-acts">' + goApp("recommendations", "Abrir en GenScore", "plan", "gs-btn gs-blue gs-sm") + "</div></div>" : "";
  }
  function acctCard() {
    return '<div class="gs-card"><div class="gs-lab">Con tu cuenta</div>' + [["Auditoría GEO", "¿Te puede citar la IA?"], ["Auditoría SEO", "¿Te encuentra Google?"], ["Auditoría agéntica", "¿Puede un agente comprar en tu web?"]].map(function (a) { return '<div class="gs-aul"><span class="gs-sh">' + ic("i-shield") + '</span><span class="gs-t"><b>' + a[0] + "</b><small>" + a[1] + '</small></span><span class="gs-gh"></span></div>'; }).join("") + '<p style="font-size:13.5px;color:var(--ink-2)">Auditoría técnica completa de todo tu dominio: cómo está y qué mejorar primero.</p>' + ext(D.links.login.replace("utm_content=identificate", "utm_content=auditorias"), "Identifícate en GenScore", "gs-btn gs-line") + "</div>";
  }

  /* ---------------- «Tu dominio» with the GenScore account (WP-PLUGIN-2, log §432) ----------------
     The figures come from GenScore's read-only API, through this site's server
     (the token never reaches the browser), and are the same the Chrome
     extension shows. Shares are printed as percentages, never counts. What
     GenScore did not return is not drawn. No prices and no payment here. */
  var AC = D.account || {};
  S.acct = AC.data || { state: AC.connected ? "loading" : "off" };
  function acctOn() { return S.acct.state === "connected"; }
  function acctLinked() { return ["connected", "not_found", "loading", "error"].indexOf(S.acct.state) >= 0; }
  function appUrl(path, content) { return D.links.app + path + (path.indexOf("?") >= 0 ? "&" : "?") + "utm_source=wordpress&utm_medium=plugin&utm_campaign=wp-plugin&utm_content=" + content; }
  function projPath(sub) {
    var P = S.acct.project, C = S.acct.context;
    var d = P && C && C.domains ? C.domains.filter(function (x) { return x.domain === P.domain; })[0] : null;
    return d ? "/dashboard/projects/" + encodeURIComponent(d.id) + (sub ? "/" + sub : "") : "/dashboard";
  }
  function goApp(sub, label, content, cls) { return ext(appUrl(projPath(sub), content), label, cls || "gs-btn gs-line gs-sm"); }
  function pct(s) { return s == null ? null : Math.round(s * 100); }
  function nES(n, d) { return Number(n).toLocaleString("es-ES", { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 }); }
  function connectBtn(cls) { return '<a class="' + (cls || "gs-btn gs-blue") + '" href="' + esc(AC.connect) + '">Conectar con GenScore' + ic("i-arrowr") + "</a>"; }
  function acctHead() {
    if (!acctLinked()) return '<span class="gs-lgin">Conecta tu cuenta de <b>GenScore</b> para ver tus cifras</span>' + connectBtn("gs-btn gs-blue gs-sm");
    var C = S.acct.context;
    var who = C ? esc(C.email || "") + (C.plan && C.plan.name ? " · " + esc(C.plan.name) : "") : "Conectado";
    return '<span class="gs-acct"><span class="gs-acav">' + ic("i-check") + '</span><span class="gs-acct-t">' + who + '</span></span><button class="gs-btn gs-line gs-sm" data-act="disconnect">Desconectar</button>';
  }
  /* «Actualizar» skips the plugin's cache: right after a scan the audit may still be on its way. */
  function domLyr(src) { return '<div class="gs-lyr gs-gs">Tu dominio<small>' + esc(src) + "</small>" + (acctOn() ? '<button type="button" class="gs-lnk gs-rf" data-act="acct-reload">' + ic("i-refresh") + "Actualizar</button>" : "") + "</div>"; }
  function scanLabel(P) {
    if (!P.scanDate) return "sin escaneo completado";
    var d = new Date(P.scanDate);
    return isNaN(d) ? "último escaneo" : "escaneo del " + d.toLocaleDateString("es-ES", { day: "numeric", month: "short" });
  }
  /* Signed in but the figures are not here (yet): loading, not in the account, or GenScore failed. */
  function acctWait() {
    var st = S.acct.state;
    if (st === "loading") return domLyr("leyendo tu cuenta") + '<div class="gs-card gs-pending"><span class="gs-spin"></span><p>Leyendo las cifras de ' + esc(D.site.domain) + " en GenScore…</p></div>";
    if (st === "error") return domLyr("tu cuenta de GenScore") + '<div class="gs-card"><p>No hemos podido leer tu cuenta de GenScore ahora mismo.</p><div class="gs-acts"><button class="gs-btn gs-line gs-sm" data-act="acct-reload">Volver a intentarlo</button></div></div>';
    var C = S.acct.context || {}, n = (C.domains || []).length, full = C.domainCap != null && n >= C.domainCap;
    var btn = full ? ext(appUrl("/dashboard/settings#plan", "plan-lleno"), "Ver tu plan", "gs-btn gs-line") : ext(appUrl("/dashboard/projects/new?dominio=" + encodeURIComponent(D.site.domain), "anadir-dominio"), "Añadir <b>&nbsp;" + esc(D.site.domain) + "</b>");
    return domLyr("tu cuenta de GenScore") + '<div class="gs-card"><p>Tu cuenta no tiene <b>' + esc(D.site.domain) + "</b>. Añádelo para ver aquí sus cifras.</p>" + (full ? '<p class="gs-more">Tu plan ya tiene todos sus dominios ocupados.</p>' : "") + '<div class="gs-acts">' + btn + "</div></div>";
  }
  function noScan(P) { return P.scanDate ? "" : '<div class="gs-hint">Todavía no hay un escaneo completado de este dominio. En cuanto termine, verás aquí sus cifras.</div>'; }
  function realGeo() {
    var P = S.acct.project, E = P.engines || [], R = P.rivals || [];
    var max = Math.max.apply(null, [1].concat(R.map(function (r) { return pct(r.share) || 0; })));
    var engines = E.length ? '<div class="gs-card"><div class="gs-lab">Te nombran por motor</div><div class="gs-eng4">' + E.map(function (e) {
      var v = pct(e.mentionShare), k = String(e.provider || "").toLowerCase().replace("openai", "chatgpt");
      return '<div class="gs-ec gs-ecv"><span class="gs-lgw">' + ic("e-" + k, "gs-lg") + '</span><span class="gs-pc gs-num">' + v + "<small>%</small></span><b>" + esc(e.label) + '</b><span class="gs-tb"><i style="width:' + v + '%"></i></span></div>';
    }).join("") + "</div></div>" : "";
    var rivals = R.length ? '<div class="gs-card"><div class="gs-lab">Frente a tus rivales<small>te nombran</small></div><div class="gs-xk">' + R.map(function (r, i) {
      var v = pct(r.share);
      return '<div class="gs-xq' + (r.isBrand ? " gs-me" : "") + '"><span class="gs-ps gs-num">' + (i + 1) + '</span><span class="gs-n">' + esc(r.name) + '</span><span class="gs-tb"><i style="width:' + Math.round((v / max) * 100) + '%"></i></span><span class="gs-v gs-num">' + v + "<small>%</small></span></div>";
    }).join("") + '</div><div class="gs-acts">' + goApp("competitors", "Ver competidores", "competidores") + "</div></div>" : "";
    return domLyr(scanLabel(P)) + noScan(P) + (P.lede ? '<p class="gs-say gs-say-l">' + esc(P.lede) + "</p>" : "") + planCard() + auditRecsCard("geo", "Auditoría GEO") + engines + rivals;
  }
  function auBlock(key) { var A = S.acct.project.audits; return A && A.blocks ? A.blocks.filter(function (b) { return b.key === key; })[0] : null; }
  var SEVC = { critical: "low", high: "low", medium: "mid", low: "mid", agentic: "mid" };
  function issueRows(b) {
    return b.issues.map(function (x) { return '<div class="gs-rw"><span class="gs-dot gs-' + (SEVC[x.severity] || "mid") + '"></span><span class="gs-tx">' + esc(x.label) + (x.scope ? "<small>" + esc(x.scope) + "</small>" : "") + "</span>" + (x.points == null ? "" : '<span class="gs-pts">+' + nES(x.points, x.points % 1 ? 1 : 0) + " pt</span>") + "</div>"; }).join("");
  }
  /* WP-PLUGIN-3 (log §432): what each console check becomes here. A kind opens
     the one-click fix sheet with the audit's pages already ticked; «goto»
     takes to the switch on this screen; anything else is «Cómo hacerlo» in
     the console, because it means rewriting content or the theme. */
  var CHECK_KIND = { structured_data: "ld", answer_first_intro: "lead", freshness: "fresh", description_length: "desc", title_length: "title", canonical: "canon", returns: "returns", product_data: "product", price: "product", availability: "product", identifiers: "gtin", shipping: "shipping", reviews: "rating", two_h2: "h2", single_h1: "h1", open_graph: "og", hreflang: "hreflang", image_alt_missing: "alt", noindex: "noindex", snippet_blocked: "snippet", list_or_table: "specs", cancellation: "cancel", sitemap_missing: "site:sitemap", sitemap: "site:sitemap", viewport_missing: "site:viewport", local_business_missing: "site:local", identity: "site:org", llms_txt_missing: "goto:llms", bot_blocked: "goto:bots", robots_agents: "goto:bots" };
  var AUDIT_PATH = { geo: ["web-audit?bloque=geo", "auditoria-geo"], seo: ["web-audit?bloque=seo", "auditoria-seo"], agent: ["agentic-visibility", "agentes"] };
  function pathOf(u) { try { var x = new URL(u, D.site.home); return (decodeURIComponent(x.pathname).replace(/\/+$/, "") || "/"); } catch (e) { return null; } }
  function issueKind(x) { var k = CHECK_KIND[x.check]; if (!k || k.indexOf("goto:") === 0) return k || null; if (k.indexOf("site:") === 0) return siteOk(siteKind(k)) ? k : null; return FX.available && FX.available[k] === true ? k : null; }
  /* site:local and site:org are the same switch: who is behind the site. */
  function siteKind(k) { k = k.replace(/^site:/, ""); return k === "local" || k === "org" ? "identity" : k; }
  function siteOk(k) { var A = (FX.site || {}).available || {}; return A[k] === true; }
  function siteOn(k) { var X = FX.site || {}, on = (X.on || {})[siteKind(k)]; return k === "site:local" ? !!on && (X.identity || {}).type === "LocalBusiness" : !!on; }
  /* Fixed here already: the pages the audit named were read again on this site
     and none of them asks for this fix any more. Without a match, no claim. */
  function fixedHere(kind, urls) {
    if (kind.indexOf("site:") === 0) return siteOn(kind);
    if (!urls || !urls.length) return false;
    /* Kinds the page revision does not read: fixed here only if a publish
       that can still be undone covers every page the audit named. */
    if (!LOCAL_KINDS[kind]) {
      var pub = {};
      (FX.batches || []).forEach(function (b) { if (b.kind === kind) (b.paths || []).forEach(function (q) { pub[pathOf(q)] = 1; }); });
      return urls.map(pathOf).every(function (q) { return q && pub[q]; });
    }
    if (!webMode()) return false;
    var want = urls.map(pathOf), E = webAgg().entries.filter(function (x) { return want.indexOf(pathOf(x.page.url || x.page.path || "")) >= 0; });
    if (!E.length) return false;
    return E.every(function (x) { return !(x.e.fixes || []).some(function (f) { return KIND_OF[String(f.id).replace(/^shop-/, "")] === kind; }); });
  }
  function recAction(x, key) {
    var k = issueKind(x);
    if (k === "goto:llms") return '<button class="gs-btn gs-line gs-sm" data-act="goto" data-to="llms">Ir a llms.txt' + ic("i-arrowr") + "</button>";
    if (k === "goto:bots") return '<button class="gs-btn gs-line gs-sm" data-act="goto" data-to="bots">Ir a los bots' + ic("i-arrowr") + "</button>";
    if (k && fixedHere(k, x.urls)) return ok("Arreglado aquí");
    if (k && k.indexOf("site:") === 0) return '<button class="gs-btn gs-blue gs-sm" data-act="site" data-kind="' + siteKind(k) + '"' + (k === "site:local" ? ' data-local="1"' : "") + ">Arreglar</button>";
    var g = !k && (FX.gotos || {})[x.check];
    if (g) return '<a class="gs-btn gs-line gs-sm" href="' + esc(g.url) + '">' + esc(g.label) + ic("i-arrowr") + "</a>";
    if (k) return '<button class="gs-btn gs-blue gs-sm" data-act="fix" data-kind="' + k + '" data-urls="' + esc(JSON.stringify((x.urls || []).map(pathOf).filter(Boolean))) + '">Arreglar</button>';
    var a = AUDIT_PATH[key] || AUDIT_PATH.geo;
    return goApp(a[0], "Cómo hacerlo", a[1] + "-como", "gs-btn gs-line gs-sm");
  }
  function recRows(b) {
    return b.issues.map(function (x) {
      var k = issueKind(x), done = k && k.indexOf("goto:") !== 0 && fixedHere(k, x.urls);
      return '<div class="gs-rw gs-rwa"><span class="gs-dot gs-' + (SEVC[x.severity] || "mid") + '"></span><span class="gs-tx">' + esc(x.label) + "<small>" + (done ? "Lo verá el próximo escaneo de GenScore" : esc(x.scope || "")) + "</small></span>" + '<span class="gs-ra">' + (x.points == null ? "" : '<span class="gs-pts">+' + nES(x.points, x.points % 1 ? 1 : 0) + " pt</span>") + recAction(x, b.key) + "</span></div>";
    }).join("");
  }
  /* The kinds a domain audit block already offers, so «Arreglar» on the right does not repeat them. */
  function coveredKinds(key) {
    if (!acctOn()) return {};
    var b = auBlock(key), out = {};
    (b ? b.issues : []).forEach(function (x) { var k = issueKind(x); if (k) out[k] = 1; });
    return out;
  }
  /* The key a draft is remembered by: same rule as genscore_draft_key(). */
  function draftKey(x) {
    var Q = x.questions || [];
    if (x.type === "close_competitor_gap") return x.rival ? "compare:" + x.rival : null;
    if (x.type === "add_comparison_content") return "rivals:" + x.title;
    if (x.type === "address_negative_narrative") return "critics:" + x.title;
    return Q.length ? Q[0] : null;
  }
  function fixable(kind) { return FX.available && FX.available[kind] === true; }
  /* What WordPress can do with each item of the plan (WP-PLUGIN-4): a draft
     for a new page, the fix sheet on the page it names, the questions added
     to that page, or the editor. Everything else is done in GenScore. */
  function planAction(x, i) {
    var DR = D.drafts || {}, pg = (D.planPages || {})[i], Q = x.questions || [], key = draftKey(x);
    if (x.draft && key) return DR[key] ? '<a class="gs-btn gs-line gs-sm" href="' + esc(DR[key]) + '" target="_blank" rel="noopener">Abrir borrador' + ic("i-arrowr") + "</a>" : '<button class="gs-btn gs-blue gs-sm" data-act="draft" data-plan="' + i + '">Crear borrador</button>';
    var urls = pg ? esc(JSON.stringify([pg.path])) : "";
    if (pg && x.type === "lever_definition" && fixable("lead")) return '<button class="gs-btn gs-blue gs-sm" data-act="fix" data-kind="lead" data-urls="' + urls + '">Arreglar</button>';
    if (pg && x.type === "update_stale_content" && fixable("fresh")) return '<button class="gs-btn gs-blue gs-sm" data-act="fix" data-kind="fresh" data-urls="' + urls + '">Arreglar</button>';
    if (x.type === "strengthen_brand_entity_clarity" && fixable("lead") && Number(D.site.frontPage)) return '<button class="gs-btn gs-blue gs-sm" data-act="fix" data-kind="lead" data-urls="' + esc(JSON.stringify(["/"])) + '">Arreglar</button>';
    if (pg && Q.length && (x.type === "increase_brand_visibility" || x.type === "create_faq_section") && fixable("faq")) return '<button class="gs-btn gs-blue gs-sm" data-act="faq" data-plan="' + i + '">' + (pg.faq && pg.faq.length ? "Editar preguntas" : "Añadir preguntas") + "</button>";
    if (pg && (x.type === "add_citation_block" || x.type === "improve_citation_readiness")) return '<button class="gs-btn gs-blue gs-sm" data-act="cite" data-plan="' + i + '">' + (pg.cite ? "Editar dato" : "Añadir dato") + "</button>";
    if (pg && pg.table && pg.edit) return '<button class="gs-btn gs-line gs-sm" data-act="compare-copy" data-plan="' + i + '">Copiar tabla y abrir' + ic("i-arrowr") + "</button>";
    if (pg && pg.edit) return '<a class="gs-btn gs-line gs-sm" href="' + esc(pg.edit) + '" target="_blank" rel="noopener">Abrir en el editor' + ic("i-arrowr") + "</a>";
    return goApp("recommendations", "Ver en GenScore", "plan-" + (i + 1), "gs-btn gs-line gs-sm");
  }
  function planRows(withQ) {
    var P = S.acct.project;
    return (P.plan || []).map(function (x, i) {
      var Q = x.questions || [];
      var q = Q.slice(0, withQ).map(function (t) { return "<small>«" + esc(t) + "»</small>"; }).join("");
      var btn = planAction(x, i);
      return '<div class="gs-fx gs-fxa"><span class="gs-n">' + (i + 1) + '</span><span class="gs-tx">' + esc(x.title) + (x.firstStep ? '<span class="gs-why">' + esc(x.firstStep) + "</span>" : "") + q + "</span>" + btn + "</div>";
    }).join("");
  }
  function planCard() {
    if (!acctOn() || !(S.acct.project.plan || []).length) return "";
    return '<div class="gs-card"><div class="gs-lab">Para que la IA te nombre<small>plan de tu consola</small></div>' + planRows(3) + '<div class="gs-acts">' + goApp("recommendations", "Ver Recomendaciones", "plan", "gs-btn gs-line gs-sm") + "</div></div>";
  }
  function auditRecsCard(key, title) {
    var b = auBlock(key);
    if (!b || !b.issues.length) return "";
    var a = AUDIT_PATH[key];
    return '<div class="gs-card gs-recs"><div class="gs-lab">Recomendaciones de GenScore<small>de tu consola</small></div><div class="gs-mh">' + title + "<small>" + b.score + (b.projected || b.projectedAll ? " → " + (b.projected || b.projectedAll) : "") + "</small>" + goApp(a[0], "Ver", a[1], "gs-lnk") + '</div><div class="gs-rows">' + recRows(b) + "</div></div>";
  }
  function dPct(x) { return x == null ? "" : '<span class="d ' + (x >= 0 ? "gs-up" : "gs-down") + '">' + (x >= 0 ? "+" : "") + nES(x) + "%</span>"; }
  function gscCard() {
    var g = S.acct.project.searchConsole;
    if (!g || g.state === "off" || g.state === "error") return "";
    var head = '<div class="gs-lab">' + ic("e-google", "gs-i") + "Google<small>últimos 28 días</small></div>";
    if (g.state === "disconnected" || g.state === "reconnect") return '<div class="gs-card">' + head + "<p>" + (g.state === "reconnect" ? "Google ha retirado el permiso de Search Console. Vuelve a conectarlo en GenScore." : "Conecta Search Console en GenScore para ver aquí tus búsquedas, tu puesto y tus clics.") + '</p><div class="gs-acts">' + goApp("search-console", g.state === "reconnect" ? "Volver a conectar" : "Conectar con Google", "search-console") + "</div></div>";
    if (g.state === "pick_property") return '<div class="gs-card">' + head + "<p>Search Console está conectado. Elige en GenScore qué propiedad corresponde a " + esc(S.acct.project.domain) + '.</p><div class="gs-acts">' + goApp("search-console", "Elegir propiedad", "search-console") + "</div></div>";
    var t = g.trend || {};
    var pos = g.position == null || g.position === 0 ? "–" : nES(g.position, 1);
    var dp = t.positionDelta == null || Math.abs(t.positionDelta) < 0.05 ? "" : '<span class="d ' + (t.positionDelta > 0 ? "gs-up" : "gs-down") + '">' + (t.positionDelta > 0 ? "▲" : "▼") + " " + nES(Math.abs(t.positionDelta), 1) + "</span>";
    var k3 = '<div class="gs-k3"><div><span>Clics</span><b class="gs-num">' + nES(g.clicks) + "</b>" + dPct(t.clicksDeltaPct) + '</div><div><span>Impresiones</span><b class="gs-num">' + nES(t.impressions || 0) + "</b>" + dPct(t.impressionsDeltaPct) + '</div><div><span>Puesto medio</span><b class="gs-num">' + pos + "</b>" + dp + "</div></div>";
    var q = (t.queries || []).map(function (r) { return '<div class="gs-rw"><span class="gs-pp gs-num">' + nES(r.position, 1) + '</span><span class="gs-tx">' + esc(r.query) + '</span><span class="gs-pts">' + nES(r.clicks) + (r.clicks === 1 ? " clic" : " clics") + "</span></div>"; }).join("");
    var near = (t.near || []).map(function (r) { return '<div class="gs-rw"><span class="gs-pp gs-num">' + nES(r.position, 1) + '</span><span class="gs-tx">' + esc(r.query) + '</span><span class="gs-pts">' + nES(r.impressions) + " impr.</span></div>"; }).join("");
    return '<div class="gs-card">' + head + k3 + (q ? '<div class="gs-mh">Tus búsquedas con más clics</div><div class="gs-rows">' + q + "</div>" : "") + (near ? '<div class="gs-mh">Casi en la página 1<small>puestos 11 a 20</small></div><div class="gs-rows">' + near + "</div>" : "") + '<div class="gs-acts">' + goApp("search-console", "Ver Posición en Google", "search-console") + "</div></div>";
  }
  function realSeo() {
    var P = S.acct.project, b = auBlock("seo");
    var audit = b ? '<div class="gs-card"><div class="gs-lab">Salud SEO<small>' + (b.projected ? b.score + " → " + b.projected + " si lo arreglas" : "todo el dominio") + '</small></div><div class="gs-big gs-num">' + b.score + "<small>/100</small></div>" + (b.issues.length ? '<div class="gs-mh">Recomendaciones de GenScore<small>lo que más resta en tu dominio</small></div><div class="gs-rows">' + recRows(b) + "</div>" : "") + '<div class="gs-acts">' + goApp("web-audit?bloque=seo", "Ver la Auditoría SEO", "auditoria-seo") + "</div></div>" : '<div class="gs-card"><p>Todavía no hay auditoría técnica de este dominio. Se hace sola tras cada escaneo.</p></div>';
    return domLyr(P.audits && P.audits.auditedAt ? "auditoría del " + new Date(P.audits.auditedAt).toLocaleDateString("es-ES", { day: "numeric", month: "short" }) : "auditoría SEO") + audit + gscCard();
  }
  function realAg() {
    var P = S.acct.project, a = P.agentic;
    if (a && a.kind === "upsell") return domLyr("auditoría agéntica") + '<div class="gs-card"><p>La auditoría agéntica de todo tu dominio no está incluida en tu plan.</p><div class="gs-acts">' + ext(appUrl("/precios", "agentes-plan"), "Ver planes", "gs-btn gs-line gs-sm") + "</div></div>";
    if (!a || a.kind !== "card") return domLyr("auditoría agéntica") + '<div class="gs-card"><p>Todavía no hay auditoría agéntica de este dominio. Se hace sola tras cada escaneo cuando GenScore encuentra algo que vendes.</p></div>';
    var b = auBlock("agent");
    return domLyr("auditoría agéntica") + '<div class="gs-card"><div class="gs-lab">Auditoría agéntica<small>' + esc(a.headline || "") + '</small></div><div class="gs-gg4">' + a.components.map(function (c) {
      var v = c.points == null ? null : Math.round((c.points / c.weight) * 100), bb = agBand(v);
      return '<div class="gs-gau gs-gau-s"><span class="gs-arcw">' + arc(v, bb[0]) + '<b class="gs-num">' + (v == null ? "–" : v) + '</b></span><span class="gs-nm">' + esc(c.name) + '</span><span class="gs-st"><span class="gs-dot gs-' + bb[0] + '"></span>' + esc(bb[1]) + "</span></div>";
    }).join("") + "</div>" + (b && b.issues.length ? '<div class="gs-mh">Recomendaciones de GenScore<small>lo primero</small></div><div class="gs-rows">' + recRows(b) + "</div>" : "") + '<div class="gs-acts">' + goApp("agentic-visibility", "Ver visibilidad en agentes", "agentes") + "</div></div>";
  }
  /* Resumen: the account's three figures and its plan, next to the site review. */
  var acctTimer = 0, acctPolls = 0;
  function loadAccount(fresh) {
    if (!AC.connected) return;
    if (!S.acct.state || S.acct.state === "off" || S.acct.state === "error") S.acct = { state: "loading" };
    post("genscore_account", fresh ? { fresh: "1" } : {}).then(function (r) {
      S.acct = r && r.success && r.data ? r.data : { state: "error" };
      /* A scan just finished and its audit is still on its way: ask again in a
         minute (the server keeps that answer only a minute), a few times. */
      clearTimeout(acctTimer);
      var Pj = S.acct.state === "connected" && S.acct.project;
      if (Pj && Pj.scanDate && !(Pj.audits && Pj.audits.auditedAt) && acctPolls < 10) { acctPolls++; acctTimer = setTimeout(function () { loadAccount(true); }, 60000); }
      if (AC.result === "connected") { AC.result = ""; toast(S.acct.state === "connected" ? "Conectada con GenScore. Ya ves aquí las cifras de tu cuenta." : S.acct.state === "not_found" ? "Conectada con GenScore. Añade este dominio a tu cuenta para ver aquí sus cifras." : "Conectada con GenScore."); }
      if (S.acct.state === "expired" || S.acct.state === "off") { AC.connected = false; if (S.acct.state === "expired") toast("Tu conexión con GenScore ha caducado. Vuelve a conectar para ver tus cifras."); S.acct = { state: "off" }; }
      render();
    }, function () { S.acct = { state: "error" }; render(); });
  }

  /* ---------------- render ---------------- */
  function body() {
    if (S.state === "loading" || (S.web.running && S.web.first && !S.target)) return '<div class="gs-card gs-pending"><span class="gs-spin"></span><p>' + (S.target ? "Revisando " + tu() + " como la ven los motores…" : "Revisando tus páginas más importantes para calcular tu nota") + "</p></div>";
    if (S.state === "error") return '<div class="gs-card gs-pending"><p><b>No hemos podido revisar ' + tu() + '.</b></p><p>' + esc(S.error) + '</p><button class="gs-btn gs-blue" data-act="rerun">Volver a intentarlo</button></div>';
    if (S.tab === "res") return resumen();
    var d = S.tab === "geo" ? domGeo() : S.tab === "seo" ? domSeo() : domAg();
    var w = S.tab === "geo" ? webGeo() : S.tab === "seo" ? webSeo() : webAg();
    return '<div class="gs-cols gs-dom"><div class="gs-col">' + d + '</div><div class="gs-col">' + w + "</div></div>";
  }
  /* Re-rendering swaps the screen's HTML: keep the scroll where it was and
     the focus on the same control, or every refresh while pages are read
     jumps the page (Denis, 2026-11-01: «se vuelve hacia arriba solo»). */
  function render() {
    var ta = document.getElementById("gs-llms-text");
    if (ta) S.llmsText = S.llmsEdited ? ta.value : null;
    var y = window.scrollY, h = document.documentElement.style.minHeight;
    var fa = document.activeElement && app.contains(document.activeElement) ? focusKey(document.activeElement) : null;
    /* The control the person last touched stays put on screen: if a row
       above it appears or goes away, the page moves with it instead of
       shifting it (Instinct: the llms.txt switch jumped ~100 px). */
    var ak = uniqueKey(fa) || uniqueKey(S.anchor), ae = ak ? app.querySelector(ak) : null, at = ae ? ae.getBoundingClientRect().top : null;
    if (at != null && (at < 0 || at > window.innerHeight)) at = null; // out of sight: nothing to hold
    document.documentElement.style.minHeight = document.documentElement.scrollHeight + "px";
    app.innerHTML = head() + tabs() + body();
    document.documentElement.style.minHeight = h;
    if (Math.abs(window.scrollY - y) > 1) window.scrollTo(0, y);
    var el = ak && uniqueKey(ak) ? app.querySelector(ak) : null;
    if (el && at != null) { var dy = el.getBoundingClientRect().top - at; if (Math.abs(dy) > 1) window.scrollBy(0, dy); }
    if (fa) { var fe = app.querySelector(fa); if (fe) fe.focus({ preventScroll: true }); }
  }
  /* A key only anchors the scroll when it names one control. */
  function uniqueKey(k) { return k && app.querySelectorAll(k).length === 1 ? k : null; }
  function focusKey(el) {
    if (el.id) return "#" + el.id;
    var n = ["data-sw", "data-act", "data-tab"].filter(function (k) { return el.hasAttribute(k); })[0];
    return n ? "[" + n + '="' + el.getAttribute(n) + '"]' : null;
  }

  /* ---------------- the review ---------------- */
  /* Opens one page of this site in a hidden same-origin frame and reads it
     with the extension's collect.js. */
  function readPage(url) {
    return new Promise(function (resolve, reject) {
      var frame = document.createElement("iframe");
      var done = false;
      frame.setAttribute("aria-hidden", "true");
      frame.tabIndex = -1;
      frame.style.cssText = "position:absolute;left:-10000px;top:0;width:1280px;height:900px;visibility:hidden;border:0";
      function end(err, facts) { if (done) return; done = true; clearTimeout(timer); frame.remove(); if (err) reject(err); else resolve(facts); }
      var timer = setTimeout(function () { end(cap(la()) + " ha tardado demasiado en cargar. Puede que tu servidor esté lento ahora mismo."); }, 25000);
      frame.onload = function () {
        var doc;
        try { doc = frame.contentDocument; } catch (e) { doc = null; }
        if (!doc || !doc.body) { end("Tu web no deja abrir " + la() + " dentro del escritorio (cabecera X-Frame-Options o una regla de seguridad)."); return; }
        var bar = doc.getElementById("wpadminbar");
        if (bar) bar.remove();
        var s = doc.createElement("script");
        s.src = D.assets + "vendor/collect.js?ver=" + encodeURIComponent(D.version);
        s.onload = function () {
          frame.contentWindow.collectPageFacts().then(function (facts) { end(null, facts); }, function () { end("No hemos podido leer " + la() + "."); });
        };
        s.onerror = function () { end("No se ha podido cargar el lector de la página."); };
        doc.head.appendChild(s);
      };
      frame.src = url;
      document.body.appendChild(frame);
    });
  }

  /* WooCommerce: the home page is a shop window, and what an agent reads to
     buy is a product page. Agentes is that page's score, and the screen says
     which page it is (same shape the extension uses for a shop found on
     another page). The nota stays the home page's. */
  function withProduct(sc) {
    var url = D.site.product;
    if (!D.site.woocommerce || !url || (sc.shop && sc.shop.state === "found")) return Promise.resolve(sc);
    var path;
    try { var u = new URL(url); path = u.pathname + u.search; } catch (e) { return Promise.resolve(sc); }
    if (S.facts && S.facts.path === path) return Promise.resolve(sc);
    return readPage(url).then(function (facts) {
      var ps = SC.scorePage(facts);
      if (!ps.commerce) return sc;
      sc.lanes.agent = ps.lanes.agent;
      sc.criteria = sc.criteria.filter(function (c) { return c.lane !== "agent"; });
      sc.fixes = sc.fixes.filter(function (f) { return f.lane !== "agent"; }).concat(ps.fixes.filter(function (f) { return f.lane === "agent"; }).map(function (f) { return Object.assign({}, f, { id: "shop-" + f.id, where: path }); }));
      sc.shop = { state: "found", path: path, url: url, criteria: ps.criteria.filter(function (c) { return c.lane === "agent"; }) };
      return sc;
    }, function () { return sc; });
  }

  /* What is stored of a page: its note, lanes and fixes, nothing else.
     A page that sells nothing borrows Agentes from the shop page score.js
     found (fixes «shop-…»): that is the shop page's result, not this page's,
     so it is stored as borrowed («via») with the plain ids, and the site
     review counts it only when no reviewed page sells by itself. The home
     page is never where a product's JSON-LD goes, so it never carries the
     price, stock or product fixes. */
  var PRODUCT_FIX = { prod: 1, price: 1, avail: 1 };
  function entryOf(id, sc) {
    var via = !!(sc.shop && sc.shop.state === "found" && !sc.commerce);
    var F = sc.fixes.map(function (f) { return Object.assign({}, f, { id: String(f.id).replace(/^shop-/, "") }); })
      .filter(function (f) { return !(id === 0 && f.lane === "agent" && PRODUCT_FIX[f.id]); });
    return { id: id, nota: sc.nota, ia: sc.lanes.ia, google: sc.lanes.google, agent: sc.lanes.agent, via: via, fixes: F.slice(0, 12).map(function (f) { return { id: f.id, lane: f.lane, pts: f.pts, unit: f.unit === "pt" ? "pt" : "en Agentes", t: f.t }; }) };
  }
  /* `gen`: the generation the page was read in. A pass that started before
     a robots.txt or llms.txt save carries the old one, and the server drops
     its scores instead of storing them over the fresh ones (1.1.3). */
  function keep(id, sc, gen) {
    var e = entryOf(id, sc);
    if (gen !== S.web.gen) return;
    e.gen = gen;
    S.web.scores[id] = e;
    post("genscore_save_page", { page: JSON.stringify(e) }).catch(function () {});
  }
  /* `all`: after a site-wide change (robots.txt, llms.txt) every important
     page is read again, not only the ones without a stored score. */
  /* `quiet`: the page is already on screen (a save, a publish): read it
     again behind it instead of swapping the screen for the spinner. */
  function review(all, quiet) {
    if (!(quiet && S.score)) { S.state = "loading"; render(); }
    var target = S.target, gen = S.web.gen;
    readPage(target ? target.url : D.site.home).then(function (facts) {
      S.facts = facts; S.botsPending = false;
      var raw = SC.scorePage(facts);
      keep(target ? target.id : 0, raw, gen);
      // Only the home page borrows a product page for Agentes: a page opened
      // from the list is scored on its own.
      return target ? SC.scorePage(facts) : withProduct(SC.scorePage(facts));
    }).then(function (sc) {
      S.score = sc;
      if (!target) S.home = { facts: S.facts, score: sc };
      S.state = "ready";
      if (!target) { S.stale = false; reviewSite(!!all); } else { if (all) S.stale = true; render(); }
    }, function (msg) {
      S.state = "error"; S.error = typeof msg === "string" ? msg : "No hemos podido leer " + la() + "."; render();
    });
  }

  function post(action, data) {
    var fd = new FormData();
    fd.append("action", action);
    fd.append("nonce", D.nonce);
    Object.keys(data || {}).forEach(function (k) {
      var v = data[k];
      if (v && typeof v === "object") Object.keys(v).forEach(function (kk) { fd.append(k + "[" + kk + "]", v[kk]); });
      else fd.append(k, v == null ? "" : v);
    });
    return fetch(D.ajax, { method: "POST", credentials: "same-origin", body: fd }).then(function (r) { return r.json(); });
  }
  /* The Escritorio widget shows the site's note. */
  function saveReview() {
    var W = webAgg();
    if (!W) return;
    post("genscore_save_review", { nota: W.nota, ia: W.lanes.ia, google: W.lanes.google, agent: W.lanes.agent == null ? "" : W.lanes.agent }).catch(function () {});
  }
  /* Reads the important pages that have no stored score yet (or all of them),
     two at a time. The first time, the screen waits with the spinner; after
     that it shows what it has and refreshes as pages come in. */
  function reviewSite(all) {
    /* A save while pages are being read makes what they read stale: run
       again as soon as this pass ends. */
    if (S.web.running) { S.web.again = true; S.web.againAll = S.web.againAll || !!all; return; }
    var todo = S.web.pages.filter(function (p) { return p.id && (all || !S.web.scores[p.id]); });
    var have = S.web.pages.filter(function (p) { return p.id && S.web.scores[p.id]; }).length;
    if (!todo.length) { render(); saveReview(); return; }
    S.web.running = true;
    var gen = S.web.gen;
    S.web.first = have === 0;
    S.web.left = todo.length;
    render();
    var i = 0;
    function next() {
      if (i >= todo.length) return Promise.resolve();
      var p = todo[i++];
      return readPage(p.url).then(function (facts) { keep(p.id, SC.scorePage(facts), gen); }, function () { /* a page that will not open is left out */ })
        .then(function () { S.web.left--; if (!S.web.first && !S.target) render(); return next(); });
    }
    Promise.all([next(), next()]).then(function () {
      S.web.running = false; S.web.first = false;
      if (S.web.again) { var a = S.web.againAll; S.web.again = false; S.web.againAll = false; reviewSite(a); return; }
      render();
      saveReview();
    });
  }
  function checkSitemap() {
    if (!D.site.sitemap) return;
    fetch(D.site.sitemap, { method: "GET", credentials: "omit", cache: "no-store" }).then(function (r) { S.sitemapOk = r.ok; if (S.tab === "seo") render(); }, function () { S.sitemapOk = false; if (S.tab === "seo") render(); });
  }

  /* ---------------- one-click fixes ----------------
     «Arreglar» opens the pages of that fix with GenScore's proposal for each
     (built in PHP from WordPress data, no model involved). Every page that
     needs it starts ticked; the person can search, filter, tick, untick, open
     a page and edit its proposal. «Publicar» asks once more, because it goes
     live, then writes it in chunks. Each publish can be undone. */
  var FX = D.fixes || { available: {}, batches: [], returns: { days: 30, country: "ES" }, chunk: 50 };
  var KIND_OF = { ld: "ld", prod: "product", price: "product", avail: "product", desc: "desc", title: "title", canon: "canon", fresh: "fresh", returns: "returns", lead: "lead", index: "noindex", snippet: "snippet" };
  var LOCAL_KINDS = {}; Object.keys(KIND_OF).forEach(function (k) { LOCAL_KINDS[KIND_OF[k]] = 1; });
  var KIND = {
    ld: ["Datos estructurados", "Le dicen a Google y a la IA qué es cada página: un artículo, un producto o una página de tu empresa."],
    product: ["Datos de producto", "Nombre, precio y stock de cada producto, sacados de WooCommerce, para que un agente lo entienda."],
    desc: ["Descripciones", "Te proponemos una por página a partir de su extracto o de su primer párrafo. Edítala si quieres."],
    title: ["Títulos", "«Página · Tu web», de 65 caracteres como mucho. Edítalo si quieres."],
    canon: ["URL canónica", "Le dice a Google cuál es la dirección buena de cada página: su enlace permanente."],
    fresh: ["Fecha de actualización", "«Actualizado el…» bajo el título, siempre con la fecha real de tu última edición."],
    returns: ["Política de devoluciones", "Tus días de devolución y el país, en los datos de cada producto, para que un agente los lea."],
    lead: ["Respuesta al principio", "Un párrafo corto justo bajo el título que responde a qué es la página. Lo proponemos desde su extracto o su descripción; edítalo si quieres."],
    h2: ["Títulos de sección (<h2>)", "La IA y Google entienden mejor una página dividida en secciones. Proponemos como títulos las líneas cortas en negrita que ya tiene; si no tiene, escríbelos tú."],
    h1: ["Un solo título principal (<h1>)", "Tu tema ya pone el título de la página como <h1>. Los <h1> que hay dentro del texto se sirven como <h2>."],
    og: ["Etiquetas Open Graph", "Título, descripción e imagen de la página para cuando alguien la comparte o un asistente la enlaza."],
    hreflang: ["Idioma de la página (hreflang)", "Le dice a Google en qué idioma está cada página. Tu web está en un idioma: se declara ese y x-default."],
    shipping: ["Envío en tus productos", "Un agente de compra necesita saber cuánto cuesta el envío y cuándo llega antes de recomendar tu producto."],
    rating: ["Valoración de tus productos", "La valoración media y el número de reseñas reales de WooCommerce, en los datos de cada producto. Sin reseñas no se publica nada."],
    gtin: ["Código de producto (GTIN)", "El código de barras de cada producto (EAN o UPC), para que un agente sepa que es el mismo producto en otras tiendas."],
    faq: ["Preguntas frecuentes", "Respuestas que escribiste a las preguntas de GenScore, al final de la página."],
    alt: ["Texto alternativo de las imágenes", "Describe cada imagen para quien no la ve: Google, la IA y los lectores de pantalla. Lo proponemos desde el título de la imagen o de la página; edítalo si quieres."],
    noindex: ["Quitar el noindex", "Con noindex, Google deja la página fuera de sus resultados, y los motores que buscan en Google tampoco la encuentran."],
    snippet: ["Quitar el nosnippet", "Pide a Google y a la IA que no citen el texto de la página. Es lo contrario de lo que buscas."],
    specs: ["Tabla de características", "Los atributos, el peso y las medidas de cada producto en WooCommerce, en una tabla bajo su descripción, para que la IA y un agente los lean de un vistazo."],
    cancel: ["Política de cancelación", "Las condiciones de cancelación o reembolso, con el enlace a tu página que las explica, en los datos de cada página que vende."],
    cite: ["Dato con fuente", "Un dato que se puede comprobar, con su fuente y su fecha."],
    sitemap: ["Sitemap", "La lista de tus páginas que leen Google, la IA y los agentes."],
    viewport: ["Vista móvil (viewport)", "Le dice al móvil que muestre la página a su tamaño."],
    identity: ["Quién está detrás de tu web", "Tu empresa en los datos de la web: nombre, contacto y dirección."]
  };
  var BOT_SW = { "bot-chatgpt": "chatgpt-search", "bot-claude": "claude-search", "bot-perplexity": "perplexity-search", "bot-gemini": "gemini" };
  /* Which pages each fix can be published on: a fix found only on pages it
     cannot reach (product data on the shop listing, a date on a product)
     keeps its «Cómo hacerlo» instead of an «Arreglar» that would open empty. */
  var KIND_TYPES = { ld: ["home", "page", "post", "product"], product: ["product", "shop"], desc: ["home", "page", "post", "product"], title: ["home", "page", "post", "product"], canon: ["home", "page", "post", "product"], fresh: ["page", "post", "shop"], returns: ["product", "shop"], lead: ["page", "post", "product", "shop"], h2: ["page", "post", "product"], h1: ["page", "post", "product"], og: ["home", "page", "post", "product"], hreflang: ["home", "page", "post", "product"], shipping: ["product"], rating: ["product"], gtin: ["product"], alt: ["page", "post", "product"], noindex: ["page", "post", "product"], snippet: ["page", "post", "product"], specs: ["product"], cancel: ["page", "post", "product"] };
  function pageType(p) { if (p.type === "home") return Number(D.site.frontPage) ? "page" : "home"; return p.id && Number(p.id) === Number(D.site.shopPage) ? "shop" : p.type; }
  function fixKind(id, pages) {
    var k = KIND_OF[String(id).replace(/^shop-/, "")];
    if (!k || !FX.available || FX.available[k] !== true) return null;
    if (pages && !pages.some(function (p) { return KIND_TYPES[k].indexOf(pageType(p)) >= 0; })) return null;
    return k;
  }
  function fixBtn(id, pages) {
    var cls = "";
    var k = fixKind(id, pages);
    if (k) return '<button class="gs-btn gs-blue gs-sm' + (cls || "") + '" data-act="fix" data-kind="' + k + '">Arreglar</button>';
    if (id === "llms") return '<button class="gs-btn gs-line gs-sm' + (cls || "") + '" data-act="goto" data-to="llms">Ir a llms.txt' + ic("i-arrowr") + "</button>";
    if (String(id).indexOf("bot-") === 0) return '<button class="gs-btn gs-line gs-sm' + (cls || "") + '" data-act="goto" data-to="bots" data-sw-id="' + esc(BOT_SW[id] || "") + '">Ir a bots' + ic("i-arrowr") + "</button>";
    return "";
  }
  function gotoCard(to, sw) {
    S.tab = "geo"; render();
    var card = document.getElementById(to === "llms" ? "gs-card-llms" : "gs-card-bots");
    if (!card) return;
    card.scrollIntoView({ block: "center", behavior: "smooth" });
    var hit = sw ? card.querySelector('[data-sw="' + sw + '"]') : null;
    [card, hit].forEach(function (el) { if (!el) return; el.classList.remove("gs-flash"); void el.offsetWidth; el.classList.add("gs-flash"); });
    if (hit) setTimeout(function () { hit.focus({ preventScroll: true }); }, 400);
  }
  function ago(at) {
    var s = Math.max(0, Math.round(Date.now() / 1000 - at));
    return s < 90 ? "hace un momento" : s < 5400 ? "hace " + Math.round(s / 60) + " min" : s < 129600 ? "hace " + Math.round(s / 3600) + " h" : "hace " + Math.round(s / 86400) + " días";
  }
  function batchesCard() {
    var B = (FX.batches || []).slice(0, 5);
    if (!B.length) return "";
    return '<div class="gs-card"><div class="gs-lab">Publicado por GenScore<small>se puede deshacer</small></div><div class="gs-rows">' + B.map(function (b) {
      return '<div class="gs-rw"><span class="gs-tx">' + esc((KIND[b.kind] || [b.kind])[0]) + "<small>" + (b.site ? "toda la web" : b.n + " " + (b.n === 1 ? "página" : "páginas")) + " · " + ago(b.at) + '</small></span><button class="gs-btn gs-line gs-sm" data-act="undo" data-batch="' + esc(b.id) + '">Deshacer</button></div>';
    }).join("") + "</div></div>";
  }

  var host = app.parentNode;
  var M = null;
  var fm = document.createElement("div");
  fm.id = "gs-fixm";
  fm.hidden = true;
  host.appendChild(fm);
  function narrow() { return window.matchMedia("(max-width: 782px)").matches; }
  function openFix(kind, opener, urls) {
    M = { urls: urls && urls.length ? urls : null, kind: kind, type: "all", q: "", items: [], counts: {}, ready: [], more: false, loading: true, sel: {}, first: true, edits: {}, bad: {}, cur: S.target ? S.target.id : null, opener: opener, step: "pick", busy: "", returns: { days: FX.returns.days || 30, country: FX.returns.country || "ES" }, ship: shipState(), cancel: Object.assign({ page: 0, days: 14, country: "ES" }, FX.cancel || {}) };
    fm.hidden = false;
    document.documentElement.classList.add("gs-fm-open");
    drawModal();
    loadList(true);
  }
  function shipState() {
    var x = FX.shipping || {};
    return { cost: x.cost == null ? "" : String(x.cost), free: x.free == null ? "" : String(x.free), country: x.country || "ES", hmin: x.hmin == null ? 0 : x.hmin, hmax: x.hmax == null ? 1 : x.hmax, tmin: x.tmin == null ? 1 : x.tmin, tmax: x.tmax == null ? 3 : x.tmax };
  }
  function shipOk(x) {
    var n = function (v) { return v !== "" && !isNaN(Number(String(v).replace(",", "."))) && Number(String(v).replace(",", ".")) >= 0; };
    var d = function (v) { return /^\d+$/.test(String(v)) && Number(v) <= 60; };
    return n(x.cost) && (x.free === "" || n(x.free)) && /^[A-Z]{2}$/.test(x.country) && d(x.hmin) && d(x.hmax) && d(x.tmin) && d(x.tmax) && Number(x.hmin) <= Number(x.hmax) && Number(x.tmin) <= Number(x.tmax);
  }
  /* «Añadir preguntas a la página»: the plan's questions on the page it
     names; the person writes each answer. Same confirm and undo as a fix. */
  function openFaq(i, opener) {
    var x = (S.acct.project.plan || [])[i], pg = (D.planPages || {})[i];
    if (!x || !pg) return;
    var old = {}; (pg.faq || []).forEach(function (p) { old[p.q] = p.a; });
    M = { mode: "faq", kind: "faq", plan: i, page: pg, questions: (x.questions || []).slice(0, 8), answers: (x.questions || []).slice(0, 8).map(function (q) { return old[q] || ""; }), step: "pick", busy: "", opener: opener, sel: {}, edits: {}, bad: {}, items: [] };
    fm.hidden = false;
    document.documentElement.classList.add("gs-fm-open");
    drawModal();
  }
  function faqCount() { return M.answers.filter(function (a) { return a.trim().split(/\s+/).filter(Boolean).length >= 5; }).length; }
  function drawFaq() {
    var n = faqCount();
    var rows = M.questions.map(function (q, k) { var w = M.answers[k].trim() ? M.answers[k].trim().split(/\s+/).length : 0; return '<div class="gs-fm-field gs-fm-q"><label for="gs-faq-' + k + '">' + esc(q) + '</label><textarea id="gs-faq-' + k + '" data-faq="' + k + '" placeholder="Tu respuesta, con tus palabras">' + esc(M.answers[k]) + '</textarea><span class="gs-fm-cnt' + (w && w < 5 ? " gs-over" : "") + '">' + (w ? w + " palabras" + (w < 5 ? " (mínimo 5)" : "") : "Sin responder: no se publica") + "</span></div>"; }).join("");
    var confirm = M.step === "confirm" ? '<div class="gs-fm-cf" role="alertdialog" aria-modal="true" aria-labelledby="gs-fm-cft"><div class="gs-fm-cfb"><span class="gs-fm-cfi">!</span><h3 id="gs-fm-cft">¿Publicar ' + n + " " + (n === 1 ? "respuesta" : "respuestas") + ' en «' + esc(M.page.title) + '»?</h3><p>Se publica ya en tu web en producción, al final de la página. Podrás deshacerlo desde GenScore.</p><div class="gs-fm-cfa"><button type="button" class="gs-btn gs-line" data-fm="no">No, volver</button><button type="button" class="gs-btn gs-blue" data-fm="yes">Sí, publicar</button></div></div></div>' : "";
    fm.innerHTML = '<div class="gs-fm-scrim" data-fm="scrim"></div><div class="gs-fm gs-fm-faq" role="dialog" aria-modal="true" aria-labelledby="gs-fm-t"><div class="gs-fm-h"><div><h2 id="gs-fm-t">Añadir preguntas a la página</h2><p>Son las preguntas en las que la IA no te nombra. Respóndelas tú: salen al final de <a href="' + esc(M.page.url) + '" target="_blank" rel="noopener">' + esc(M.page.title) + "</a>" + (D.site.seoPlugin && /Yoast|Rank Math|All in One/.test(D.site.seoPlugin) ? "." : " y en sus datos estructurados (FAQPage).") + '</p></div><button type="button" class="gs-fm-x" data-fm="close" aria-label="Cerrar">' + ic("i-x") + '</button></div><div class="gs-fm-qs">' + rows + '</div><div class="gs-fm-f"><span class="gs-fm-safe">' + ic("i-check") + 'Sólo se publica lo que escribes aquí. El texto de la página no cambia y se puede deshacer.</span><button type="button" class="gs-btn gs-line" data-fm="close">Cancelar</button><button type="button" class="gs-btn gs-blue" data-fm="publish"' + (n && !M.busy ? "" : " disabled") + ">" + esc(M.busy || (n ? "Publicar " + n + " " + (n === 1 ? "respuesta" : "respuestas") : "Responde alguna pregunta")) + "</button></div>" + confirm + "</div>";
    var focus = M.step === "confirm" ? fm.querySelector('[data-fm="no"]') : (fm.contains(document.activeElement) ? null : fm.querySelector("textarea"));
    if (focus) focus.focus({ preventScroll: true });
  }
  function publishFaq() {
    var batch = rid();
    M.step = "pick"; M.busy = "Publicando…"; drawFaq();
    post("genscore_faq_publish", { plan: M.plan, batch: batch, answers: JSON.stringify(M.answers) }).then(function (r) {
      if (!r || !r.success) throw new Error((r && r.data && r.data.message) || "");
      FX.batches = r.data.batches;
      var pg = (D.planPages || {})[M.plan];
      if (pg) pg.faq = M.questions.map(function (q, k) { return { q: q, a: M.answers[k] }; }).filter(function (p) { return p.a.trim(); });
      M.busy = ""; closeFix();
      toast("Preguntas publicadas en la página.", batch);
      render();
    }).catch(function (e) { M.busy = ""; drawFaq(); alertIn((e && e.message) || "No se ha podido publicar. Vuelve a intentarlo."); });
  }
  /* Site-wide fixes (sitemap, viewport, who is behind the site): one switch
     for the whole web, same confirm, toast and undo as a page fix. */
  function shell(title, sub, bodyHtml, cta, confirmTitle, confirmText, cls, safe) {
    var confirm = M.step === "confirm" ? '<div class="gs-fm-cf" role="alertdialog" aria-modal="true" aria-labelledby="gs-fm-cft"><div class="gs-fm-cfb"><span class="gs-fm-cfi">!</span><h3 id="gs-fm-cft">' + confirmTitle + "</h3><p>" + confirmText + '</p><div class="gs-fm-cfa"><button type="button" class="gs-btn gs-line" data-fm="no">No, volver</button><button type="button" class="gs-btn gs-blue" data-fm="yes">Sí, publicar</button></div></div></div>' : "";
    fm.innerHTML = '<div class="gs-fm-scrim" data-fm="scrim"></div><div class="gs-fm gs-fm-faq ' + (cls || "") + '" role="dialog" aria-modal="true" aria-labelledby="gs-fm-t"><div class="gs-fm-h"><div><h2 id="gs-fm-t">' + title + "</h2><p>" + sub + '</p></div><button type="button" class="gs-fm-x" data-fm="close" aria-label="Cerrar">' + ic("i-x") + '</button></div><div class="gs-fm-qs">' + bodyHtml + '</div><div class="gs-fm-f"><span class="gs-fm-safe">' + ic("i-check") + esc(safe || "Se publica en toda la web y se puede deshacer.") + '</span><button type="button" class="gs-btn gs-line" data-fm="close">Cancelar</button><button type="button" class="gs-btn gs-blue" data-fm="publish"' + (M.busy ? " disabled" : "") + ">" + esc(M.busy || cta) + "</button></div>" + confirm + "</div>";
    var focus = M.step === "confirm" ? fm.querySelector('[data-fm="no"]') : (fm.contains(document.activeElement) ? null : fm.querySelector("input,select,textarea,[data-fm=publish]"));
    if (focus) focus.focus({ preventScroll: true });
  }
  function openSite(kind, local, opener) {
    var X = FX.site || {};
    var id = Object.assign({}, X.identity || {});
    if (local) id.type = "LocalBusiness";
    M = { mode: "site", kind: kind, local: !!local, id: id, step: "pick", busy: "", opener: opener, sel: {}, edits: {}, bad: {}, items: [] };
    fm.hidden = false;
    document.documentElement.classList.add("gs-fm-open");
    drawModal();
  }
  function field(k, label, opts) {
    opts = opts || {};
    var v = M.id[k] == null ? "" : M.id[k];
    var inp = opts.area ? '<textarea id="gs-sid-' + k + '" data-sid="' + k + '" rows="3" placeholder="' + esc(opts.ph || "") + '">' + esc(v) + "</textarea>" : '<input id="gs-sid-' + k + '" type="' + (opts.type || "text") + '" data-sid="' + k + '"' + (opts.max ? ' maxlength="' + opts.max + '"' : "") + ' placeholder="' + esc(opts.ph || "") + '" value="' + esc(v) + '">';
    return '<div class="gs-fm-field' + (opts.half ? " gs-fm-half" : "") + '"><label for="gs-sid-' + k + '">' + label + "</label>" + inp + (opts.note ? '<span class="gs-fm-note">' + opts.note + "</span>" : "") + "</div>";
  }
  function siteFormOk() {
    if (M.kind !== "identity") return true;
    var i = M.id, t = function (k) { return String(i[k] || "").trim(); };
    if (!t("name")) return "Escribe el nombre de tu negocio.";
    if (!t("email") && !t("telephone") && !t("street")) return "Pon al menos una forma de contacto: email, teléfono o dirección.";
    if (i.type === "LocalBusiness" && (!t("street") || !t("city") || !t("country"))) return "Un negocio local necesita la dirección completa: calle, ciudad y país.";
    if (t("country") && !/^[A-Z]{2}$/.test(t("country"))) return "El país va en dos letras, como ES.";
    var bad = t("hours").split(/\n/).filter(function (l) { return l.trim() && !/^(Mo|Tu|We|Th|Fr|Sa|Su)(-(Mo|Tu|We|Th|Fr|Sa|Su))?(,(Mo|Tu|We|Th|Fr|Sa|Su)(-(Mo|Tu|We|Th|Fr|Sa|Su))?)* ([01]\d|2[0-3]):[0-5]\d-([01]\d|2[0-4]):[0-5]\d$/.test(l.trim()); });
    if (bad.length) return "El horario va una línea por tramo, como «Mo-Fr 09:00-18:00».";
    return true;
  }
  function drawSite() {
    var X = FX.site || {}, k = M.kind;
    if (k === "sitemap") return shell("Publicar tu sitemap", "El mapa de tu web para Google y los motores de IA: la lista de tus páginas, entradas y productos públicos. Lo genera WordPress con tus páginas reales.", '<p class="gs-fm-txt">Activamos el sitemap de WordPress y hacemos que <code>/sitemap.xml</code> lleve a él. WordPress ya lo anuncia en tu robots.txt; no tocamos nada más.</p>' + (X.sitemap ? '<p class="gs-fm-txt">Quedará en <a href="' + esc(X.sitemap) + '" target="_blank" rel="noopener">' + esc(X.sitemap) + "</a>.</p>" : ""), "Publicar sitemap", "¿Publicar tu sitemap?", "Se publica ya en tu web en producción. Podrás deshacerlo desde GenScore.");
    if (k === "viewport") return shell("Adaptar tu web al móvil", "Tu tema no le dice al móvil que la página se adapta a su ancho, así que el móvil la pinta en miniatura. Google mide la versión móvil.", '<p class="gs-fm-txt">Añadimos esta línea en la cabecera de todas tus páginas:</p><pre class="gs-fm-pre gs-fm-code">&lt;meta name="viewport" content="width=device-width, initial-scale=1"&gt;</pre>', "Añadir a todas las páginas", "¿Añadir la línea a todas tus páginas?", "Se publica ya en tu web en producción. Podrás deshacerlo desde GenScore.");
    var loc = M.id.type === "LocalBusiness";
    var body = '<div class="gs-fm-field"><label for="gs-sid-type">Qué eres</label><select id="gs-sid-type" data-sid="type"><option value="Organization"' + (loc ? "" : " selected") + '>Una empresa o marca</option><option value="LocalBusiness"' + (loc ? " selected" : "") + ">Un negocio con local al público</option></select></div>"
      + field("name", "Nombre") + '<div class="gs-fm-pair">' + field("email", "Email", { type: "email", half: true }) + field("telephone", "Teléfono", { type: "tel", half: true }) + "</div>"
      + field("street", "Dirección" + (loc ? "" : " (opcional)")) + '<div class="gs-fm-pair">' + field("city", "Ciudad", { half: true }) + field("postal", "Código postal", { half: true }) + "</div>" + '<div class="gs-fm-pair">' + field("region", "Provincia", { half: true }) + field("country", "País", { half: true, max: 2, ph: "ES" }) + "</div>"
      + (loc ? field("hours", "Horario", { area: true, ph: "Mo-Fr 09:00-18:00\nSa 10:00-14:00", note: "Una línea por tramo. Días en inglés abreviados (Mo, Tu, We, Th, Fr, Sa, Su)." }) : "")
      + field("sameAs", "Tus perfiles (opcional)", { area: true, ph: "https://www.linkedin.com/company/…", note: "Un enlace por línea: redes, Google Business, directorios. Ayudan a que la IA sepa que eres tú." })
      + (X.logo ? '<div class="gs-fm-field"><label>Logo</label><img class="gs-fm-logo" src="' + esc(X.logo) + '" alt="" height="40"><span class="gs-fm-note">El logo de tu tema. Se cambia en Apariencia.</span></div>' : "");
    shell(loc ? "Datos de tu negocio local" : "Quién está detrás de tu web", "Los datos que los motores de IA y Google usan para saber quién eres y fiarse. Salen de WordPress y WooCommerce: revísalos.", body, "Publicar datos", "¿Publicar estos datos en toda la web?", "Se publican como datos estructurados en todas tus páginas, ya en producción. Podrás deshacerlo desde GenScore.", "gs-fm-site");
  }
  function publishSite() {
    var batch = rid(), kind = M.kind;
    M.step = "pick"; M.busy = "Publicando…"; drawModal();
    var data = { kind: kind, batch: batch };
    if (M.kind === "identity") data.identity = M.id;
    post("genscore_site_publish", data).then(function (r) {
      if (!r || !r.success) throw new Error((r && r.data && r.data.message) || "");
      FX.batches = r.data.batches; FX.site = r.data.site;
      S.web.scores = {};
      M.busy = ""; closeFix();
      toast(kind === "sitemap" ? "Sitemap publicado." : "Publicado en toda la web.", batch);
      review(true, true);
    }).catch(function (e) { M.busy = ""; drawModal(); alertIn((e && e.message) || "No se ha podido publicar. Vuelve a intentarlo."); });
  }
  /* «Añadir dato»: one checkable fact with its source and date, on the page
     the plan names. The person writes it; nothing is invented. */
  function citeOk(c) {
    if (String(c.text || "").trim().split(/\s+/).filter(Boolean).length < 4) return "Escribe el dato: cuatro palabras o más.";
    if (String(c.text).length > 300) return "Déjalo en 300 caracteres como mucho.";
    if (!/^https?:\/\/[^\s/]+\.[^\s]+$/.test(String(c.url || "").trim())) return "Pon el enlace a la fuente, empezando por https://";
    var d = String(c.date || "").trim(), m = d.match(/^(\d{4})-(\d{2})(?:-(\d{2}))?$/);
    if (!m || Number(m[2]) < 1 || Number(m[2]) > 12) return "La fecha va como 2026-10 o 2026-10-15.";
    if (d > new Date().toISOString().slice(0, 10)) return "La fecha no puede ser futura.";
    return true;
  }
  function openCite(i, opener) {
    var x = (S.acct.project.plan || [])[i], pg = (D.planPages || {})[i];
    if (!x || !pg) return;
    M = { mode: "cite", plan: i, page: pg, item: x, cite: Object.assign({ text: "", url: "", date: "" }, pg.cite || {}), step: "pick", busy: "", opener: opener, sel: {}, edits: {}, bad: {}, items: [] };
    fm.hidden = false;
    document.documentElement.classList.add("gs-fm-open");
    drawModal();
  }
  function drawCite() {
    var c = M.cite;
    var body = '<div class="gs-fm-field"><label for="gs-ct-text">El dato</label><textarea id="gs-ct-text" data-cite="text" rows="3" maxlength="300" placeholder="Por ejemplo: el 92% de nuestros clientes repite en menos de tres meses.">' + esc(c.text) + '</textarea><span class="gs-fm-note">Una cifra o un hecho que alguien pueda comprobar. La IA cita lo que puede verificar.</span></div>'
      + field2("url", "Enlace a la fuente", "https://", "url") + field2("date", "Fecha del dato", "2026-10", "text")
      + '<p class="gs-fm-txt">Sale en un párrafo tras la entradilla de <a href="' + esc(M.page.url) + '" target="_blank" rel="noopener">' + esc(M.page.title) + "</a>, con la fuente y la fecha enlazadas.</p>";
    shell("Añadir un dato con fuente", esc(M.item.title || "Un dato que la IA pueda citar"), body, M.page && M.page.cite ? "Guardar dato" : "Publicar dato", "¿Publicar el dato en «" + esc(M.page.title) + "»?", "Se publica ya en tu web en producción. Podrás deshacerlo desde GenScore.", "", "Sólo se publica lo que escribes aquí. El texto de la página no cambia y se puede deshacer.");
    var pb = fm.querySelector('[data-fm="publish"]'); if (pb && !M.busy) pb.disabled = citeOk(M.cite) !== true;
  }
  function field2(k, label, ph, type) { return '<div class="gs-fm-field"><label for="gs-ct-' + k + '">' + label + '</label><input id="gs-ct-' + k + '" type="' + type + '" data-cite="' + k + '" placeholder="' + esc(ph) + '" value="' + esc(M.cite[k] || "") + '"></div>'; }
  function publishCite() {
    var batch = rid(), i = M.plan;
    M.step = "pick"; M.busy = "Publicando…"; drawModal();
    post("genscore_cite_publish", { plan: i, batch: batch, cite: { text: M.cite.text.trim(), url: M.cite.url.trim(), date: M.cite.date.trim() } }).then(function (r) {
      if (!r || !r.success) throw new Error((r && r.data && r.data.message) || "");
      FX.batches = r.data.batches;
      var pg = (D.planPages || {})[i]; if (pg) pg.cite = r.data.cite;
      M.busy = ""; closeFix();
      toast("Dato publicado en la página.", batch);
      render();
    }).catch(function (e) { M.busy = ""; drawModal(); alertIn((e && e.message) || "No se ha podido publicar. Vuelve a intentarlo."); });
  }
  /* «Copiar tabla y abrir»: the comparison table (the rival's cells always
     «[Pendiente…]») goes to the clipboard and the page opens in the editor,
     where the person pastes it and fills the rival's data with sources. */
  function compareCopy(a) {
    var pg = (D.planPages || {})[Number(a.getAttribute("data-plan"))];
    if (!pg || !pg.table) return;
    var tmp = document.createElement("div"); tmp.innerHTML = pg.table;
    var txt = Array.prototype.map.call(tmp.querySelectorAll("tr"), function (tr) { return Array.prototype.map.call(tr.children, function (c) { return c.textContent.trim(); }).join("\t"); }).join("\n");
    function done(ok) {
      toast(ok ? "Tabla copiada. Pégala en la página y completa las celdas pendientes." : "No se ha podido copiar la tabla. Ábrela en el editor y escríbela a mano.", null);
      if (pg.edit) window.open(pg.edit, "_blank", "noopener");
    }
    try {
      if (window.ClipboardItem && navigator.clipboard && navigator.clipboard.write) {
        navigator.clipboard.write([new ClipboardItem({ "text/html": new Blob([pg.table], { type: "text/html" }), "text/plain": new Blob([txt], { type: "text/plain" }) })]).then(function () { done(true); }, function () {
          navigator.clipboard.writeText(txt).then(function () { done(true); }, function () { done(false); });
        });
      } else if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(function () { done(true); }, function () { done(false); });
      else done(false);
    } catch (err) { done(false); }
  }
  function closeFix() {
    if (!M || M.busy) return;
    var op = M.opener; M = null;
    fm.hidden = true; fm.innerHTML = "";
    document.documentElement.classList.remove("gs-fm-open");
    if (op && document.body.contains(op)) op.focus();
  }
  var listSeq = 0;
  function loadList(reset) {
    var seq = ++listSeq;
    M.loading = true; if (reset) { M.items = []; } drawList();
    post("genscore_fix_list", { kind: M.kind, type: M.type, q: M.q, offset: reset ? 0 : M.items.length }).then(function (r) {
      if (!M || seq !== listSeq) return;
      if (!r || !r.success) throw new Error(r && r.data && r.data.message);
      M.counts = r.data.counts; M.ready = r.data.ready; M.more = r.data.more;
      M.items = reset ? r.data.items : M.items.concat(r.data.items);
      if (M.first) {
        M.first = false;
        /* From a GenScore recommendation: tick the pages its audit named, if any is ready here. */
        var named = M.urls ? M.items.filter(function (x) { return x.status === "ready" && M.urls.indexOf(pathOf(x.url || x.path || "")) >= 0; }).map(function (x) { return x.id; }) : [];
        (named.length ? named : M.ready).forEach(function (id) { M.sel[id] = true; });
        var firstReady = named.length ? named[0] : (M.items.filter(function (x) { return x.status === "ready"; })[0] || {}).id;
        if (M.cur == null && !narrow() && firstReady) M.cur = firstReady;
      }
      M.loading = false; M.err = "";
      /* Every page already has it: the review that flagged it is older than
         the fix. Read those pages again so «Arreglar» stops offering it. */
      if (reset && !M.q && M.type === "all" && !M.more && M.items.length && M.items.every(function (x) { return x.status === "has" || x.status === "na"; }) && !S.web.running) {
        var front = Number(D.site.frontPage || 0);
        var home = false;
        M.items.forEach(function (x) { delete S.web.scores[x.id]; if (x.id === front || x.id === 0) { delete S.web.scores[0]; home = true; } });
        M.allDone = true;
        setTimeout(function () { if (S.target || home) review(false, true); else reviewSite(false); }, 0);
      }
      drawModal();
    }).catch(function (e) { if (!M) return; M.loading = false; M.err = (e && e.message) || "No se ha podido cargar la lista. Vuelve a intentarlo."; drawModal(); });
  }
  function selCount() { return Object.keys(M.sel).filter(function (k) { return M.sel[k]; }).length; }
  function itemOf(id) { return M.items.filter(function (x) { return x.id === id; })[0]; }
  function where() {
    var seo = FX.seo;
    if (M.kind === "desc" || M.kind === "title" || M.kind === "canon") return seo ? "Se guarda en el campo de " + esc(seo) + " de esta página." : "Se guarda en la página y sale en su código.";
    if (M.kind === "fresh") return "Es la fecha de tu última edición y no se edita a mano. También va en los datos de la página.";
    if (M.kind === "returns" || M.kind === "shipping" || M.kind === "rating" || M.kind === "gtin") return "Se añade a los datos de cada producto que marques.";
    if (M.kind === "h2" || M.kind === "h1") return "Se sirve así al mostrar la página. El texto guardado de la página no cambia.";
    if (M.kind === "og") return "La descripción es la de la página y la imagen, la destacada (o el logo). Salen en su código.";
    if (M.kind === "hreflang") return "Sale en el código de la página, con su dirección canónica.";
    if (M.kind === "alt") return "Se guarda en tu biblioteca de medios, si la imagen no tenía, y se sirve en las imágenes de esta página. El texto guardado de la página no cambia.";
    if (M.kind === "noindex") return "Se quita en " + (FX.seo ? "el campo de " + esc(FX.seo) : "la página") + ". La página entrará en Google la próxima vez que pase.";
    if (M.kind === "snippet") return "Se quita " + (FX.seo ? "en el campo de " + esc(FX.seo) + " y " : "") + "al servir la página, lo ponga quien lo ponga.";
    if (M.kind === "specs") return "Se lee de WooCommerce al servir la página: si cambias un atributo, la tabla cambia sola.";
    if (M.kind === "cancel") return "Se añade a los datos de la página, con el enlace a tu política.";
    return "Hecho con los datos de WordPress" + (D.site.woocommerce ? " y WooCommerce" : "") + ". Se guarda en la página y sale en su código.";
  }
  function editor(it) {
    if (!it) return '<p class="gs-fm-hint">' + (M.allDone ? "Ya está en todas tus páginas. Las volvemos a revisar para que deje de salir en la lista." : "Toca una página para ver su propuesta.") + "</p>";
    var head = '<div class="gs-fm-ph"><b>' + esc(it.title) + '</b><a href="' + esc(it.url) + '" target="_blank" rel="noopener">Ver la página</a></div>';
    if (it.status === "has") return head + '<p class="gs-fm-hint">Esta página ya lo tiene y no se toca.</p>' + (it.value && M.kind === "fresh" ? '<pre class="gs-fm-pre">Actualizado el ' + esc(it.value) + "</pre>" : it.value && M.kind !== "returns" ? '<pre class="gs-fm-pre">' + esc(it.value) + "</pre>" : "");
    if (it.status === "na") return head + '<p class="gs-fm-hint">Esta página no lo necesita y no se toca.</p>';
    if (it.status === "missing") return head + '<p class="gs-fm-hint gs-warm">' + esc(it.note) + ". Esta página no se publica.</p>";
    var v = M.edits[it.id] != null ? M.edits[it.id] : it.value;
    var f = "";
    if (it.live) f = '<label>Lista de productos que se publicará</label><pre class="gs-fm-pre gs-fm-code">' + esc(it.value) + '</pre><span class="gs-fm-note">Se genera al momento con tus productos: nombre, precio y stock siempre al día. ' + (FX.returnsSet ? "Incluye tu política de devoluciones." : "La política de devoluciones se añade desde su propio arreglo.") + "</span>";
    else if (M.kind === "ld" || M.kind === "product") f = '<label for="gs-fm-in">JSON-LD que se publicará</label><textarea id="gs-fm-in" class="gs-fm-code" spellcheck="false">' + esc(v) + "</textarea>";
    else if (M.kind === "desc") f = '<label for="gs-fm-in">Descripción que se publicará</label><textarea id="gs-fm-in">' + esc(v) + '</textarea><span class="gs-fm-cnt" data-max="155"></span>';
    else if (M.kind === "lead") f = '<label for="gs-fm-in">Párrafo que saldrá bajo el título</label><textarea id="gs-fm-in">' + esc(v) + '</textarea><span class="gs-fm-cnt" data-words="20-120"></span>';
    else if (M.kind === "title") f = '<label for="gs-fm-in">Título que se publicará</label><input id="gs-fm-in" type="text" value="' + esc(v) + '"><span class="gs-fm-cnt" data-max="65"></span>';
    else if (M.kind === "canon") f = '<label for="gs-fm-in">URL canónica que se publicará</label><input id="gs-fm-in" type="url" value="' + esc(v) + '">';
    else if (M.kind === "fresh") f = '<label>Se publicará bajo el título</label><pre class="gs-fm-pre">Actualizado el ' + esc(v) + "</pre>";
    else if (M.kind === "h2") f = '<label for="gs-fm-in">Títulos que se publicarán, uno por línea</label><textarea id="gs-fm-in">' + esc(v) + '</textarea><span class="gs-fm-note">Una línea en negrita con el mismo texto pasa a ser título; los demás se reparten entre los párrafos.</span>';
    else if (M.kind === "h1") f = '<label>Pasarán a ser &lt;h2&gt;</label><pre class="gs-fm-pre">' + esc(v) + "</pre>";
    else if (M.kind === "og") f = '<label for="gs-fm-in">og:title que se publicará</label><input id="gs-fm-in" type="text" value="' + esc(v) + '"><span class="gs-fm-cnt" data-max="95"></span>';
    else if (M.kind === "hreflang") f = '<label>Se publicará</label><pre class="gs-fm-pre">' + esc(v) + "</pre>";
    else if (M.kind === "rating") f = '<label>Valoración real de WooCommerce</label><pre class="gs-fm-pre">' + esc(v) + "</pre>";
    else if (M.kind === "gtin") f = '<label for="gs-fm-in">Código de barras (EAN o UPC)</label><input id="gs-fm-in" type="text" inputmode="numeric" value="' + esc(v) + '"><span class="gs-fm-note">El que viene en el envase, de 8, 12, 13 o 14 cifras. Si no tiene, déjalo sin marcar.</span>';
    else if (M.kind === "shipping") { var sx = M.ship, rate = sx.cost === "" ? null : Number(String(sx.cost).replace(",", ".")); f = '<label>Se añadirá a sus datos</label><pre class="gs-fm-pre gs-fm-code">' + esc(JSON.stringify({ shippingDetails: { shippingRate: { value: rate, currency: D.site.currency || "EUR" }, shippingDestination: { addressCountry: sx.country }, deliveryTime: { handlingTime: sx.hmin + "-" + sx.hmax + " días", transitTime: sx.tmin + "-" + sx.tmax + " días" } } }, null, 2)) + '</pre><span class="gs-fm-note">' + (sx.free !== "" ? "Si el precio llega a " + esc(sx.free) + ", el envío sale gratis. " : "") + "El precio se lee de WooCommerce al servir la página.</span>"; }
    else if (M.kind === "alt") { var L = []; try { L = JSON.parse(v) || []; } catch (e) { L = []; } f = '<label>Texto de cada imagen</label><div class="gs-fm-alts">' + L.map(function (im, k) { return '<div class="gs-fm-alt">' + (im.src ? '<img src="' + esc(im.src) + '" alt="" width="56" height="56">' : '<span class="gs-fm-noimg"></span>') + '<input type="text" data-alt="' + k + '" aria-label="Texto alternativo de la imagen ' + (k + 1) + '" value="' + esc(im.alt) + '"></div>'; }).join("") + '</div><input type="hidden" id="gs-fm-in" value="' + esc(v) + '"><span class="gs-fm-note">Di qué se ve, en pocas palabras. Una imagen decorativa puede ir sin texto: déjala en blanco.</span>'; }
    else if (M.kind === "noindex" || M.kind === "snippet") f = '<label>Se publicará</label><pre class="gs-fm-pre">' + esc(v) + "</pre>";
    else if (M.kind === "specs") f = '<label>Características que saldrán en una tabla</label><pre class="gs-fm-pre">' + esc(v) + "</pre>";
    else if (M.kind === "cancel") { var cp = (FX.cancelPages || []).filter(function (p) { return Number(p.id) === Number(M.cancel.page); })[0]; f = '<label>Se añadirá a sus datos</label><pre class="gs-fm-pre gs-fm-code">' + esc(JSON.stringify({ "@type": "MerchantReturnPolicy", applicableCountry: M.cancel.country, merchantReturnDays: Number(M.cancel.days), merchantReturnLink: cp ? cp.title : "(elige la página)" }, null, 2)) + "</pre>"; }
    else if (M.kind === "returns") f = '<label>Se añadirá a sus datos</label><pre class="gs-fm-pre">' + esc(JSON.stringify({ "@type": "MerchantReturnPolicy", applicableCountry: M.returns.country, merchantReturnDays: Number(M.returns.days), returnMethod: "https://schema.org/ReturnByMail" }, null, 2)) + "</pre>";
    return head + '<div class="gs-fm-field">' + f + (M.bad[it.id] ? '<span class="gs-fm-bad">' + esc(M.bad[it.id]) + "</span>" : "") + '</div><p class="gs-fm-hint">' + where() + "</p>";
  }
  function tag(it) {
    if (it.status === "has") return '<span class="gs-fm-st gs-has">Ya lo tiene</span>';
    if (it.status === "na") return '<span class="gs-fm-st gs-has">No aplica</span>';
    if (it.status === "missing") return '<span class="gs-fm-st gs-miss">' + esc(it.note) + "</span>";
    if (M.bad[it.id]) return '<span class="gs-fm-st gs-miss">Revisar</span>';
    if (M.edits[it.id] != null) return '<span class="gs-fm-st gs-ed">Editada</span>';
    if (!it.value) return '<span class="gs-fm-st gs-ed">Escríbelo tú</span>';
    if (it.short) return '<span class="gs-fm-st gs-miss">Muy corto</span>';
    return '<span class="gs-fm-st gs-ok">Propuesta lista</span>';
  }
  var TYPES = [["all", "Todas"], ["page", "Páginas"], ["post", "Entradas"], ["product", "Productos"]];
  function drawList() {
    var box = fm.querySelector(".gs-fm-list");
    if (!box || !M) return;
    var nw = narrow();
    var h = M.items.map(function (it) {
      var can = it.status === "ready", on = can && !!M.sel[it.id], cur = M.cur === it.id;
      var row = '<div class="gs-fm-it' + (cur ? " gs-cur" : "") + (can ? "" : " gs-off") + '" data-id="' + it.id + '"><button type="button" class="gs-fm-cb" role="checkbox" aria-checked="' + on + '" aria-label="Publicar en ' + esc(it.title) + '"' + (can ? "" : " disabled") + ">" + ic("i-check") + '</button><button type="button" class="gs-fm-nm" data-open="' + it.id + '" aria-expanded="' + cur + '"><b>' + esc(it.title || "(sin título)") + "</b><small>" + esc(it.path) + "</small></button>" + tag(it) + "</div>";
      if (nw && cur) row += '<div class="gs-fm-inl">' + editor(it) + "</div>";
      return row;
    }).join("");
    if (!M.items.length && !M.loading) h = '<p class="gs-fm-empty">' + (M.err ? esc(M.err) : M.q ? "Ninguna página coincide con «" + esc(M.q) + "»." : "No hay páginas de este tipo.") + "</p>";
    if (M.loading) h += '<p class="gs-fm-empty"><span class="gs-spin gs-spin-sm"></span> Preparando las propuestas…</p>';
    else if (M.more) h += '<button type="button" class="gs-fm-more" data-fm="more">Cargar más</button>';
    box.innerHTML = h;
    bindInput(box);
  }
  function drawSide() {
    var side = fm.querySelector(".gs-fm-side");
    if (!side || !M) return;
    side.innerHTML = '<div class="gs-fm-lab">Propuesta para esta página</div>' + editor(itemOf(M.cur));
    bindInput(side);
  }
  function bindInput(root) {
    var inp = root.querySelector("#gs-fm-in");
    if (!inp || !M) return;
    var id = M.cur, cnt = root.querySelector(".gs-fm-cnt");
    function upd(first) {
      if (cnt && cnt.hasAttribute("data-words")) { var w = inp.value.trim() ? inp.value.trim().split(/\s+/).length : 0; cnt.textContent = w + " palabras (mejor entre 20 y 120)"; cnt.classList.toggle("gs-over", w < 20 || w > 120); }
      else if (cnt) { var mx = Number(cnt.getAttribute("data-max")); cnt.textContent = inp.value.length + " / " + mx; cnt.classList.toggle("gs-over", inp.value.length > mx); }
      if (first) return;
      M.edits[id] = inp.value;
      if (M.kind === "alt") { var AL = []; try { AL = JSON.parse(inp.value) || []; } catch (e2) { AL = []; } if (AL.some(function (r) { return String(r.alt || "").trim().length >= 2; })) delete M.bad[id]; else M.bad[id] = "Escribe el texto de alguna imagen."; }
      else if (M.kind === "ld" || M.kind === "product") { try { var o = JSON.parse(inp.value); if (!o || typeof o !== "object" || !o["@type"]) throw 0; delete M.bad[id]; } catch (e) { M.bad[id] = "El JSON no es válido: revísalo o deshaz el cambio."; } }
      else if (!inp.value.trim()) M.bad[id] = "No puede quedar vacío.";
      else if (M.kind === "desc" && (inp.value.trim().length < 50 || inp.value.trim().length > 160)) M.bad[id] = "Déjala entre 50 y 160 caracteres para que cuente.";
      else if (M.kind === "lead" && inp.value.trim().split(/\s+/).length < 20) M.bad[id] = "Escribe al menos 20 palabras: con menos, la revisión lo sigue marcando.";
      else if (M.kind === "gtin" && !gtinOk(inp.value)) M.bad[id] = "No es un código válido: revisa las cifras.";
      else if (M.kind === "h2" && inp.value.split(/\n/).filter(function (l) { return l.trim().length >= 2; }).length < 1) M.bad[id] = "Escribe al menos un título.";
      else { delete M.bad[id]; if (!M.sel[id]) { M.sel[id] = true; var cb = fm.querySelector('.gs-fm-it[data-id="' + id + '"] .gs-fm-cb'); if (cb) cb.setAttribute("aria-checked", "true"); drawFoot(); } }
      var row = fm.querySelector('.gs-fm-it[data-id="' + id + '"] .gs-fm-st');
      var it = itemOf(id);
      if (row && it) row.outerHTML = tag(it);
      var bad = root.querySelector(".gs-fm-bad");
      if (M.bad[id] && !bad) inp.insertAdjacentHTML("afterend", '<span class="gs-fm-bad">' + esc(M.bad[id]) + "</span>");
      else if (bad) { if (M.bad[id]) bad.textContent = M.bad[id]; else bad.remove(); }
      drawFoot();
    }
    inp.addEventListener("input", function () { upd(false); });
    if (M.kind === "alt") root.querySelectorAll("[data-alt]").forEach(function (a) {
      a.addEventListener("input", function () {
        var L = []; try { L = JSON.parse(inp.value) || []; } catch (e) { L = []; }
        var k = Number(a.getAttribute("data-alt")); if (L[k]) L[k].alt = a.value;
        inp.value = JSON.stringify(L); upd(false);
      });
    });
    upd(true);
  }
  function gtinOk(v) {
    var d = String(v).replace(/[\s-]/g, "");
    if (!/^(\d{8}|\d{12,14})$/.test(d)) return false;
    var sum = 0, body = d.slice(0, -1).split("").reverse();
    body.forEach(function (c, i) { sum += Number(c) * (i % 2 === 0 ? 3 : 1); });
    return (10 - sum % 10) % 10 === Number(d.slice(-1));
  }
  function drawFoot() {
    var b = fm.querySelector('[data-fm="publish"]');
    if (!b || !M) return;
    var n = selCount(), bad = Object.keys(M.bad).filter(function (k) { return M.sel[k]; }).length;
    b.disabled = !n || !!bad || !!M.busy;
    b.textContent = M.busy || (bad ? "Revisa " + (bad === 1 ? "la página marcada" : "las " + bad + " páginas marcadas") : n ? "Publicar en " + n + " " + (n === 1 ? "página" : "páginas") : "Elige alguna página");
  }
  function drawModal() {
    if (!M) return;
    if (M.mode === "faq") { drawFaq(); return; }
    if (M.mode === "site") { drawSite(); return; }
    if (M.mode === "cite") { drawCite(); return; }
    var K = KIND[M.kind];
    var chips = TYPES.filter(function (t) { return t[0] === "all" || M.counts[t[0]] != null; }).map(function (t) { return '<button type="button" class="gs-fm-chip" data-type="' + t[0] + '" aria-pressed="' + (M.type === t[0]) + '">' + t[1] + (M.counts[t[0]] != null ? "<em>" + M.counts[t[0]] + "</em>" : "") + "</button>"; }).join("");
    var ship = M.kind === "shipping" ? '<div class="gs-fm-ret gs-fm-ship"><label>Coste (' + esc(D.site.currencySymbol || "€") + ')<input type="text" inputmode="decimal" data-ship="cost" value="' + esc(M.ship.cost) + '"></label><label>Gratis desde<input type="text" inputmode="decimal" placeholder="Opcional" data-ship="free" value="' + esc(M.ship.free) + '"></label><label>País<input type="text" maxlength="2" data-ship="country" value="' + esc(M.ship.country) + '"></label><label>Preparación (días)<span class="gs-fm-rng"><input type="number" min="0" max="60" data-ship="hmin" value="' + esc(M.ship.hmin) + '"><i>a</i><input type="number" min="0" max="60" data-ship="hmax" value="' + esc(M.ship.hmax) + '"></span></label><label>Transporte (días)<span class="gs-fm-rng"><input type="number" min="0" max="60" data-ship="tmin" value="' + esc(M.ship.tmin) + '"><i>a</i><input type="number" min="0" max="60" data-ship="tmax" value="' + esc(M.ship.tmax) + '"></span></label><p class="gs-fm-note">Coste y envío gratis salen de tus zonas de envío de WooCommerce. WooCommerce no guarda plazos: escríbelos una vez.</p></div>' : "";
    var ret = M.kind === "returns" ? '<div class="gs-fm-ret"><label>Días para devolver<input type="number" min="1" max="365" data-ret="days" value="' + esc(M.returns.days) + '"></label><label>País<input type="text" maxlength="2" data-ret="country" value="' + esc(M.returns.country) + '"></label></div>' : "";
    var canc = M.kind === "cancel" ? '<div class="gs-fm-ret gs-fm-canc"><label>Página que la explica<select data-cancel="page"><option value="0">Elige una página</option>' + (FX.cancelPages || []).map(function (p) { return '<option value="' + Number(p.id) + '"' + (Number(p.id) === Number(M.cancel.page) ? " selected" : "") + ">" + esc(p.title) + "</option>"; }).join("") + '</select></label><label>Días para cancelar<input type="number" min="1" max="365" data-cancel="days" value="' + esc(M.cancel.days) + '"></label><label>País<input type="text" maxlength="2" data-cancel="country" value="' + esc(M.cancel.country) + '"></label><p class="gs-fm-note">Los agentes leen el plazo y el enlace a tu página de cancelación. Escríbelos una vez.</p></div>' : "";
    var n = selCount();
    var confirm = M.step === "confirm" ? '<div class="gs-fm-cf" role="alertdialog" aria-modal="true" aria-labelledby="gs-fm-cft"><div class="gs-fm-cfb"><span class="gs-fm-cfi">!</span><h3 id="gs-fm-cft">¿Publicar en ' + n + " " + (n === 1 ? "página" : "páginas") + '?</h3><p>Se publica ya en tu web en producción: lo verán tus visitantes, Google y los asistentes de IA. Podrás deshacerlo desde GenScore.</p><ul><li><b>' + esc(K[0]) + "</b></li><li>" + n + " " + (n === 1 ? "página" : "páginas") + (function () { var e = Object.keys(M.edits).filter(function (k) { return M.sel[k]; }).length; return e ? " · " + e + " " + (e === 1 ? "editada" : "editadas") + " por ti" : ""; })() + '</li></ul><div class="gs-fm-cfa"><button type="button" class="gs-btn gs-line" data-fm="no">No, volver</button><button type="button" class="gs-btn gs-blue" data-fm="yes">Sí, publicar</button></div></div></div>' : "";
    fm.innerHTML = '<div class="gs-fm-scrim" data-fm="scrim"></div><div class="gs-fm" role="dialog" aria-modal="true" aria-labelledby="gs-fm-t"><div class="gs-fm-h"><div><h2 id="gs-fm-t">' + esc(K[0]) + "</h2><p>" + esc(K[1]) + '</p></div><button type="button" class="gs-fm-x" data-fm="close" aria-label="Cerrar">' + ic("i-x") + '</button></div><div class="gs-fm-b"><div class="gs-fm-pick"><div class="gs-fm-tools">' + ret + ship + canc + '<div class="gs-fm-search">' + ic("i-search") + '<input type="search" placeholder="Buscar por título" aria-label="Buscar páginas" value="' + esc(M.q) + '"></div><div class="gs-fm-row"><div class="gs-fm-chips">' + chips + '</div><div class="gs-fm-all"><button type="button" data-fm="all">Seleccionar todas</button><button type="button" data-fm="none">Deseleccionar todas</button></div></div></div><div class="gs-fm-list" role="list"></div></div><div class="gs-fm-side"></div></div><div class="gs-fm-f"><span class="gs-fm-safe">' + ic("i-check") + 'Solo se publica lo que revisas aquí. Se puede deshacer.</span><button type="button" class="gs-btn gs-line" data-fm="close">Cancelar</button><button type="button" class="gs-btn gs-blue" data-fm="publish"></button></div>' + confirm + "</div>";
    drawList(); drawSide(); drawFoot();
    var focus = M.step === "confirm" ? fm.querySelector('[data-fm="no"]') : null;
    if (focus) focus.focus();
    else if (!fm.contains(document.activeElement)) { var s = fm.querySelector(".gs-fm-search input"); if (s) s.focus({ preventScroll: true }); }
  }
  var qTimer;
  fm.addEventListener("input", function (e) {
    if (!M) return;
    if (e.target.matches(".gs-fm-search input")) { clearTimeout(qTimer); var v = e.target.value; qTimer = setTimeout(function () { M.q = v; loadList(true); }, 250); }
    var r = e.target.getAttribute && e.target.getAttribute("data-ret");
    if (r) { M.returns[r] = r === "country" ? e.target.value.toUpperCase() : e.target.value; drawSide(); }
    var fq = e.target.getAttribute && e.target.getAttribute("data-faq");
    if (fq != null && M.mode === "faq") {
      M.answers[Number(fq)] = e.target.value;
      var w = e.target.value.trim() ? e.target.value.trim().split(/\s+/).length : 0, c = e.target.parentNode.querySelector(".gs-fm-cnt");
      if (c) { c.textContent = w ? w + " palabras" + (w < 5 ? " (mínimo 5)" : "") : "Sin responder: no se publica"; c.classList.toggle("gs-over", w > 0 && w < 5); }
      var pb = fm.querySelector('[data-fm="publish"]'), n = faqCount();
      if (pb) { pb.disabled = !n; pb.textContent = n ? "Publicar " + n + " " + (n === 1 ? "respuesta" : "respuestas") : "Responde alguna pregunta"; }
    }
    var cn = e.target.getAttribute && e.target.getAttribute("data-cancel");
    if (cn) { M.cancel[cn] = cn === "country" ? e.target.value.toUpperCase() : cn === "page" ? Number(e.target.value) : e.target.value; drawSide(); }
    var sd = e.target.getAttribute && e.target.getAttribute("data-sid");
    if (sd && M.mode === "site") { M.id[sd] = sd === "country" ? e.target.value.toUpperCase() : e.target.value; if (sd === "type") drawSite(); }
    var ct = e.target.getAttribute && e.target.getAttribute("data-cite");
    if (ct && M.mode === "cite") { M.cite[ct] = e.target.value; var cb2 = fm.querySelector('[data-fm="publish"]'); if (cb2) cb2.disabled = !citeOk(M.cite); }
    var sh = e.target.getAttribute && e.target.getAttribute("data-ship");
    if (sh) { M.ship[sh] = sh === "country" ? e.target.value.toUpperCase() : e.target.value; drawSide(); }
  });
  fm.addEventListener("click", function (e) {
    if (!M) return;
    var b = e.target.closest("[data-fm],[data-type],[data-open],.gs-fm-cb");
    if (!b) return;
    var act = b.getAttribute("data-fm");
    if (act === "close" || act === "scrim") { if (M.step === "confirm") { M.step = "pick"; drawModal(); } else closeFix(); return; }
    if (act === "more") { loadList(false); return; }
    if (act === "all" || act === "none") { M.ready.forEach(function (id) { M.sel[id] = act === "all"; }); drawList(); drawFoot(); return; }
    if (M.mode === "faq") {
      if (act === "publish") { if (faqCount()) { M.step = "confirm"; drawFaq(); } return; }
      if (act === "no") { M.step = "pick"; drawFaq(); return; }
      if (act === "yes") { publishFaq(); return; }
      return;
    }
    if (M.mode === "site" || M.mode === "cite") {
      var ok2 = M.mode === "cite" ? citeOk(M.cite) : siteFormOk();
      if (act === "publish") { if (ok2 === true) { M.step = "confirm"; drawModal(); } else alertIn(ok2 || "Revisa los datos."); return; }
      if (act === "no") { M.step = "pick"; drawModal(); return; }
      if (act === "yes") { if (M.mode === "cite") publishCite(); else publishSite(); return; }
      return;
    }
    if (act === "publish") {
      if (M.kind === "shipping" && !shipOk(M.ship)) { alertIn("Revisa el envío: coste, país en dos letras y días de 0 a 60."); return; }
      if (M.kind === "cancel" && !(Number(M.cancel.page) > 0 && Number(M.cancel.days) >= 1 && Number(M.cancel.days) <= 365 && /^[A-Z]{2}$/.test(M.cancel.country))) { alertIn("Elige la página de cancelación y pon los días (1 a 365) y el país en dos letras."); return; }
      if (M.kind === "returns" && !(Number(M.returns.days) >= 1 && Number(M.returns.days) <= 365 && /^[A-Z]{2}$/.test(M.returns.country))) { M.err = ""; alertIn("Pon los días (1 a 365) y el país en dos letras, como ES."); return; }
      M.step = "confirm"; drawModal(); return;
    }
    if (act === "no") { M.step = "pick"; drawModal(); return; }
    if (act === "yes") { publishFix(); return; }
    if (b.hasAttribute("data-type")) { M.type = b.getAttribute("data-type"); drawModal(); loadList(true); return; }
    if (b.classList.contains("gs-fm-cb")) {
      var id = Number(b.closest(".gs-fm-it").getAttribute("data-id")); M.sel[id] = !M.sel[id]; b.setAttribute("aria-checked", String(!!M.sel[id]));
      var it0 = itemOf(id);
      /* an empty answer-first row: open it so the person can write it */
      if (M.sel[id] && it0 && (!it0.value || it0.short) && M.edits[id] == null) { M.bad[id] = it0.short ? "Amplíalo a 20 palabras o más antes de publicar." : M.kind === "desc" ? "Escribe la descripción antes de publicar." : M.kind === "h2" ? "Escribe los títulos antes de publicar." : M.kind === "gtin" ? "Escribe el código antes de publicar." : "Escribe el párrafo antes de publicar."; M.cur = id; drawList(); drawSide(); }
      drawFoot(); return;
    }
    if (b.hasAttribute("data-open")) { var oid = Number(b.getAttribute("data-open")); M.cur = narrow() && M.cur === oid ? null : oid; drawList(); drawSide(); }
  });
  function alertIn(msg) { var f = fm.querySelector(".gs-fm-f .gs-fm-safe"); if (f) { f.className = "gs-fm-safe gs-err"; f.textContent = msg; } }
  fm.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && M) { e.preventDefault(); if (M.step === "confirm") { M.step = "pick"; drawModal(); } else closeFix(); return; }
    if (e.key === "Tab") {
      var scope = fm.querySelector(M && M.step === "confirm" ? ".gs-fm-cfb" : ".gs-fm");
      var f = scope ? Array.prototype.filter.call(scope.querySelectorAll("button:not([disabled]),input,textarea,a[href]"), function (x) { return x.offsetParent !== null; }) : [];
      if (!f.length) return;
      if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
    }
  });
  function rid() { var a = "abcdefghijklmnopqrstuvwxyz0123456789", s = ""; for (var i = 0; i < 12; i++) s += a[Math.floor(Math.random() * a.length)]; return s; }
  function publishFix() {
    var ids = Object.keys(M.sel).filter(function (k) { return M.sel[k]; }).map(Number);
    var batch = rid(), chunk = FX.chunk || 50, done = [], skipped = [], i = 0, kind = M.kind;
    M.step = "pick"; drawModal();
    function next() {
      if (i >= ids.length) return Promise.resolve();
      var part = ids.slice(i, i + chunk); i += chunk;
      M.busy = "Publicando " + Math.min(i, ids.length) + " de " + ids.length + "…"; drawFoot();
      var edits = {}; part.forEach(function (id) { if (M.edits[id] != null) edits[id] = M.edits[id]; });
      var data = { kind: kind, ids: part, edits: JSON.stringify(edits), batch: batch };
      if (kind === "returns") { data.days = M.returns.days; data.country = M.returns.country; }
      if (kind === "shipping") data.ship = M.ship;
      if (kind === "cancel") data.cancel = M.cancel;
      return post("genscore_fix_publish", data).then(function (r) {
        if (!r || !r.success) throw new Error((r && r.data && r.data.message) || "");
        done = done.concat(r.data.done); skipped = skipped.concat(r.data.skipped); FX.batches = r.data.batches;
        return next();
      });
    }
    next().then(function () {
      if (kind === "returns") FX.returns = { days: Number(M.returns.days), country: M.returns.country };
      if (kind === "shipping") FX.shipping = M.ship;
      if (kind === "cancel") FX.cancel = M.cancel;
      M.busy = ""; closeFix();
      afterPublish(done, skipped, batch);
    }).catch(function (e) {
      M.busy = "";
      if (done.length) { closeFix(); afterPublish(done, skipped, batch, true); return; }
      drawFoot(); alertIn((e && e.message) || "No se ha podido publicar. Vuelve a intentarlo.");
    });
  }
  function afterPublish(done, skipped, batch, cut) {
    var front = Number(D.site.frontPage || 0);
    done.forEach(function (id) { delete S.web.scores[id]; if (id === front) delete S.web.scores[0]; if (id === 0) delete S.web.scores[0]; });
    var msg = "Publicado en " + done.length + " " + (done.length === 1 ? "página" : "páginas") + (skipped.length ? " · " + skipped.length + " sin publicar" : "") + (cut ? " · se cortó antes de terminar" : "");
    toast(msg, done.length ? batch : null);
    if (S.target) review(false, true); else if (S.web.scores[0]) reviewSite(false); else review(false, true);
  }
  var tTimer;
  /* Every real change to the site (robots.txt, llms.txt, a publish, an
     undo) confirms itself in a floating message that goes away on its own
     (Denis, 2026-11-01). */
  function toast(msg, batch) {
    var t = document.getElementById("gs-toast");
    if (!t) { t = document.createElement("div"); t.id = "gs-toast"; t.setAttribute("role", "status"); host.appendChild(t); }
    t.innerHTML = "<span>" + esc(msg) + "</span>" + (batch ? '<button type="button" data-batch="' + esc(batch) + '">Deshacer</button>' : "");
    t.hidden = false;
    clearTimeout(tTimer); tTimer = setTimeout(function () { t.hidden = true; }, batch ? 8000 : 4500);
  }
  /* «Crear borrador»: a draft post with the plan's questions as headings.
     Never published; the person writes and publishes it in the editor. */
  function createDraft(a) {
    if (a.disabled) return;
    a.disabled = true;
    post("genscore_create_draft", { plan: a.getAttribute("data-plan") }).then(function (r) {
      if (!r || !r.success) throw new Error((r && r.data && r.data.message) || "");
      D.drafts = D.drafts || {};
      D.drafts[r.data.key] = r.data.edit;
      toast(r.data.reused ? "Ya tenías ese borrador. Ábrelo en el editor." : "Borrador creado. Ábrelo en el editor.", null);
      render();
    }).catch(function (e) { a.disabled = false; toast((e && e.message) || "No se ha podido crear el borrador.", null); });
  }
  function undo(batch) {
    post("genscore_fix_undo", { batch: batch }).then(function (r) {
      if (!r || !r.success) throw new Error((r && r.data && r.data.message) || "");
      FX.batches = r.data.batches;
      if (r.data.site) FX.site = r.data.site;
      toast("Deshecho. Volvemos a revisar tu web.", null);
      review(true, true);
    }).catch(function (e) { toast((e && e.message) || "No se ha podido deshacer.", null); });
  }
  host.addEventListener("click", function (e) {
    var b = e.target.closest("#gs-toast [data-batch]");
    if (b) { b.closest("#gs-toast").hidden = true; undo(b.getAttribute("data-batch")); }
  });
  var wasNarrow = narrow();
  window.addEventListener("resize", function () { var n = narrow(); if (n === wasNarrow) return; wasNarrow = n; if (M && M.step === "pick") { drawList(); drawSide(); } });


  /* ---------------- events ---------------- */
  function setAddress() {
    try {
      var u = new URL(location.href);
      if (S.target) u.searchParams.set("post", S.target.id); else u.searchParams.delete("post");
      history.replaceState(null, "", u.toString());
    } catch (err) { /* the address only helps a reload */ }
  }
  function goHome() {
    S.target = null; setAddress();
    if (!S.home || S.stale) { S.stale = false; review(true); return; }
    S.facts = S.home.facts; S.score = S.home.score; S.state = "ready"; render();
    app.scrollIntoView({ block: "start" });
  }
  app.addEventListener("click", function (e) {
    var t = e.target.closest("[data-tab]");
    if (t) { S.anchor = null; S.tab = t.getAttribute("data-tab"); render(); app.scrollIntoView({ block: "start" }); return; }
    var ctl = e.target.closest("[data-sw],[data-act]");
    if (ctl && app.contains(ctl)) S.anchor = uniqueKey(focusKey(ctl));
    var sw = e.target.closest("[data-sw]");
    if (sw && !sw.disabled) {
      var id = sw.getAttribute("data-sw");
      var next = sw.getAttribute("aria-checked") !== "true";
      var now = switchAllowed(id);
      if (now === next && S.bots[id] === undefined) delete S.dirty[id]; else S.dirty[id] = next ? "allow" : "block";
      S.msg.bots = "";
      render();
      return;
    }
    var a = e.target.closest("[data-act]");
    if (!a) return;
    var act = a.getAttribute("data-act");
    if (act === "rerun") { review(); return; }
    if (act === "fix") { var U = null; try { U = JSON.parse(a.getAttribute("data-urls") || "null"); } catch (err) { U = null; } openFix(a.getAttribute("data-kind"), a, U); return; }
    if (act === "draft") { createDraft(a); return; }
    if (act === "faq") { openFaq(Number(a.getAttribute("data-plan")), a); return; }
    if (act === "cite") { openCite(Number(a.getAttribute("data-plan")), a); return; }
    if (act === "site") { openSite(a.getAttribute("data-kind"), a.hasAttribute("data-local"), a); return; }
    if (act === "compare-copy") { compareCopy(a); return; }
    if (act === "goto") { gotoCard(a.getAttribute("data-to"), a.getAttribute("data-sw-id")); return; }
    if (act === "undo") { a.disabled = true; undo(a.getAttribute("data-batch")); return; }
    if (act === "rerun-web") { reviewSite(true); return; }
    if (act === "toggle-fix") { var fid = a.getAttribute("data-id"); S.open[fid] = a.getAttribute("aria-expanded") !== "true"; render(); return; }
    if (act === "open-page") {
      var pid = Number(a.getAttribute("data-id"));
      if (!pid) { goHome(); S.tab = "res"; render(); return; }
      S.target = S.web.pages.filter(function (p) { return p.id === pid; })[0] || null;
      if (!S.target) return;
      setAddress(); review(); app.scrollIntoView({ block: "start" });
      return;
    }
    if (act === "back") { goHome(); return; }
    if (act === "save-bots") {
      var next2 = Object.assign({}, S.bots, S.dirty);
      a.disabled = true;
      post("genscore_save_bots", { bots: next2 }).then(function (r) {
        if (!r || !r.success) throw new Error();
        S.bots = r.data.settings; S.dirty = {}; S.msg.bots = "";
        if (r.data.gen != null) S.web.gen = r.data.gen;
        S.botsPending = true;
        toast("robots.txt guardado y publicado en tu web.");
        render();
        review(true, true);
      }).catch(function () { S.msg.bots = '<span class="gs-err">No se ha podido guardar. Vuelve a intentarlo.</span>'; render(); });
      return;
    }
    if (act === "llms-toggle") {
      var en = a.getAttribute("aria-checked") !== "true";
      S.llms.enabled = en;
      saveLlms("toggle");
      return;
    }
    if (act === "save-llms") { saveLlms("edit"); return; }
    if (act === "llms-reset") { saveLlms("reset"); return; }
    if (act === "acct-reload") { S.acct = { state: "loading" }; render(); loadAccount(true); return; }
    if (act === "disconnect") {
      a.disabled = true;
      post("genscore_disconnect", {}).then(function () { AC.connected = false; S.acct = { state: "off" }; toast("Tu web ya no está conectada a GenScore."); render(); }, function () { a.disabled = false; });
    }
  });
  /* The text only travels when the person typed in the box: saving the
     generated text untouched must never store a copy of it (a post published
     meanwhile, or an encoded URL, would freeze). «Volver al generado» sends an
     empty text, which means «use the generated one». */
  app.addEventListener("input", function (e) { if (e.target && e.target.id === "gs-llms-text") S.llmsEdited = true; });
  function saveLlms(mode) {
    var ta = document.getElementById("gs-llms-text");
    var data = { enabled: S.llms.enabled ? "1" : "0" };
    if (mode === "reset") data.text = "";
    else if (mode === "edit" && S.llmsEdited && ta) data.text = ta.value;
    post("genscore_save_llms", data).then(function (r) {
      if (!r || !r.success) throw new Error();
      S.llms.enabled = r.data.enabled; S.llms.serving = r.data.serving; S.llms.custom = r.data.custom;
      if (r.data.gen != null) S.web.gen = r.data.gen;
      if (r.data.generated != null) S.llms.generated = r.data.generated;
      if ("text" in data) { S.llmsEdited = false; S.llmsText = null; }
      S.msg.llms = "";
      toast(r.data.serving ? "llms.txt guardado. Ya se publica en /llms.txt." : mode === "toggle" ? "llms.txt despublicado de tu web." : "llms.txt guardado. No se publica hasta que lo actives.");
      // llms.txt counts on every page: the stored scores are stale now (the
      // server already dropped them), so every page is read again.
      render();
      review(true, true);
    }).catch(function () { S.msg.llms = '<span class="gs-err">No se ha podido guardar. Vuelve a intentarlo.</span>'; render(); });
  }

  if (AC.result) {
    /* «connected» waits for the account figures (loadAccount): it only says
       «ya ves tus cifras» when this domain is in the account. */
    var RES = { denied: "No se ha conectado: has cancelado el permiso en GenScore.", expired: "El permiso ha tardado demasiado. Vuelve a pulsar «Conectar con GenScore».", unreachable: "No hemos podido hablar con GenScore. Vuelve a intentarlo en un momento." };
    if (RES[AC.result]) toast(RES[AC.result]);
  }
  review();
  checkSitemap();
  loadAccount(false);
})();
