/* GenScore for WordPress: the plugin screen.
 *
 * The «Nota SEO + IA» is the Chrome extension's, computed the same way: each
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

  var S = { tab: "res", state: "loading", facts: null, score: null, error: null, bots: Object.assign({}, D.bots.settings), dirty: {}, msg: {}, llms: Object.assign({}, D.llms), llmsText: null, target: D.target || null, home: null, open: {}, web: { pages: (D.web && D.web.pages) || [], scores: (D.web && D.web.scores) || {}, running: false, first: false, left: 0 } };
  var ENG = [["chatgpt", "ChatGPT"], ["gemini", "Gemini"], ["claude", "Claude"], ["perplexity", "Perplexity"]];
  var SW_LABEL = {
    "chatgpt-search": ["ChatGPT", "Búsqueda y enlaces que abre ChatGPT"],
    "chatgpt-training": ["ChatGPT", "Entrenamiento de modelos"],
    "claude-search": ["Claude", "Búsqueda y enlaces que abre Claude"],
    "claude-training": ["Claude", "Entrenamiento de modelos"],
    "perplexity-search": ["Perplexity", "Búsqueda y enlaces que abre Perplexity"],
    "gemini": ["Gemini", "Respuestas y entrenamiento de Gemini"]
  };

  /* ---------------- helpers ---------------- */
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function ic(id, c) { return '<svg class="' + (c || "gs-i") + '" aria-hidden="true"><use href="#' + id + '"/></svg>'; }
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

  function dial(score, bands) {
    var cx = 150, cy = 150, g = "", i, a;
    for (i = 0; i <= 100; i++) {
      a = (135 + i * 2.7) * Math.PI / 180;
      var mj = i % 10 === 0, zone = bands.indexOf(i) >= 0 || i === 0 || i === 100, r1 = 140, r0 = zone ? 118 : mj ? 124 : 129;
      g += '<line class="gs-t ' + (i <= score ? "gs-on " : "") + (mj ? "gs-mj" : "") + '" x1="' + (cx + r0 * Math.cos(a)).toFixed(2) + '" y1="' + (cy + r0 * Math.sin(a)).toFixed(2) + '" x2="' + (cx + r1 * Math.cos(a)).toFixed(2) + '" y2="' + (cy + r1 * Math.sin(a)).toFixed(2) + '"/>';
    }
    [0].concat(bands, [100]).forEach(function (v) { var b = (135 + v * 2.7) * Math.PI / 180; g += '<text class="gs-lbl" x="' + (cx + 104 * Math.cos(b)).toFixed(1) + '" y="' + (cy + 104 * Math.sin(b) + 3.5).toFixed(1) + '" text-anchor="middle">' + v + "</text>"; });
    a = (135 + score * 2.7) * Math.PI / 180;
    g += '<line class="gs-needle" x1="' + (cx + 112 * Math.cos(a)).toFixed(1) + '" y1="' + (cy + 112 * Math.sin(a)).toFixed(1) + '" x2="' + (cx + 148 * Math.cos(a)).toFixed(1) + '" y2="' + (cy + 148 * Math.sin(a)).toFixed(1) + '"/>';
    return '<svg class="gs-dial" viewBox="0 0 300 300" role="img" aria-label="Nota SEO + IA ' + score + ' de 100">' + g + "</svg>";
  }
  var ARC = "M8 50 A30 30 0 1 1 64 50";
  function arc(v, cls) { return '<svg class="gs-arc" viewBox="0 0 72 56" aria-hidden="true"><path class="gs-tr" d="' + ARC + '"/><path class="gs-v gs-' + cls + '" d="' + ARC + '" pathLength="100" stroke-dasharray="' + (v == null ? 0 : v) + ' 100"/></svg>'; }
  function gauge(tab, nm, icon, v, st) {
    var b = band(v);
    return '<button class="gs-gau" data-tab="' + tab + '"><span class="gs-arcw">' + arc(v, b[0]) + '<b class="gs-num">' + (v == null ? "–" : v) + '</b></span><span class="gs-nm">' + icon + nm + '</span><span class="gs-st"><span class="gs-dot gs-' + b[0] + '"></span>' + esc(st || b[1]) + ic("i-chevr") + "</span></button>";
  }
  function lock() { return '<span class="gs-lock">' + ic("i-shield") + "</span>"; }
  function domainCta(where) { return ext(D.links.analyze.replace("utm_content=analizar", "utm_content=" + where), "Analizar <b>&nbsp;" + esc(D.site.domain) + "</b>"); }

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
  /* Which page is under review: the home page, or the one picked in the
     header (or arrived from «Revisar con GenScore» in a list of posts). */
  function tu() { return S.target ? "esta página" : "tu portada"; }
  function la() { return S.target ? "esta página" : "la portada"; }
  function cap(t) { return t.charAt(0).toUpperCase() + t.slice(1); }
  function switchWanted(id) {
    if (S.dirty[id]) return S.dirty[id] === "allow";
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
    return '<div class="gs-ph">' + siteMark() + '<span class="gs-who"><b>' + esc(D.site.name || "GenScore") + "</b><span>" + esc(D.site.domain) + '</span></span>' + (S.target ? '<button class="gs-btn gs-line gs-sm gs-back" data-act="back">' + ic("i-arrowl") + 'Tu web</button><span class="gs-who gs-pg-t"><b>' + esc(S.target.title || "") + "</b><span>" + esc(S.target.path) + "</span></span>" : "") + '<span class="gs-sp"></span><span class="gs-lgin">Identifícate en <b>GenScore</b> para el análisis completo</span>' + ext(D.links.login, "Entrar", "gs-btn gs-line gs-sm") + "</div>";
  }
  function tabs() {
    var T = [["res", "Resumen"], ["geo", "GEO"], ["seo", "SEO"], ["ag", "Agentes"]];
    return '<div class="gs-tabs" role="tablist" aria-label="Secciones">' + T.map(function (t) { return '<button role="tab" data-tab="' + t[0] + '" aria-selected="' + (S.tab === t[0]) + '" aria-pressed="' + (S.tab === t[0]) + '">' + t[1] + "</button>"; }).join("") + "</div>";
  }

  /* ---------------- «Tu dominio»: what an account adds, never a figure ---------------- */
  function domGeo() {
    return '<div class="gs-lyr gs-gs">Tu dominio<small>con tu cuenta de GenScore</small></div><div class="gs-tz"><div class="gs-ill">' + lock() + '<div class="gs-gh4">' + ENG.map(function (e) { return "<div>" + ic("e-" + e[0], "gs-lg") + '<span class="gs-q"></span>' + e[1] + '<span class="gs-bar"></span></div>'; }).join("") + '</div><div class="gs-ghr">' + [1, 2, 3, 4].map(function (n) { return '<div class="' + (n === 2 ? "gs-me" : "") + '"><span>' + n + '</span><i></i><em style="width:' + (80 - n * 10) + '%"></em><u></u></div>'; }).join("") + '</div></div><h3>Conoce cómo te citan los motores</h3><p>Cuánto te nombra cada motor, qué páginas tuyas citan y quién sale antes que tú.</p>' + domainCta("geo") + "</div>";
  }
  function domSeo() {
    return '<div class="gs-lyr gs-gs">Tu dominio<small>con tu cuenta de GenScore</small></div><div class="gs-tz"><div class="gs-ill">' + lock() + '<div class="gs-ghs"><span class="gs-ring"></span><div class="gs-ln"><i style="width:92%"></i><i style="width:70%"></i><i style="width:84%"></i></div></div><div class="gs-ghc"><svg viewBox="0 0 200 46" preserveAspectRatio="none" aria-hidden="true"><polyline points="0,36 25,32 50,34 75,26 100,28 125,20 150,22 175,14 200,12" fill="none" stroke="#d3d9e2" stroke-width="2"/></svg></div></div><h3>Conoce la Salud SEO de todo tu dominio</h3><p>Todas tus páginas clave, no solo esta, y con Search Console tus búsquedas de Google, tu puesto y tus clics.</p>' + domainCta("seo") + "</div>";
  }
  function domAg() {
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
      var G = webAgg().fixes.filter(function (g) { return g.lane === lane; });
      if (!G.length) return "";
      return '<div class="gs-card"><div class="gs-lab">Arreglar<small>en toda la web</small></div>' + G.slice(0, 5).map(function (g, i) { return webFixRow(g, i); }).join("") + "</div>";
    }
    var F = ((S.score && S.score.fixes) || []).filter(function (f) { return f.lane === lane; });
    if (!F.length) return "";
    return '<div class="gs-card"><div class="gs-lab">' + title + "</div>" + F.slice(0, 5).map(function (f, i) { return '<div class="gs-fx"><span class="gs-n">' + (i + 1) + '</span><span class="gs-tx">' + f.t + (f.why ? '<span class="gs-why">' + f.why + "</span>" : "") + '</span><span class="gs-pts">+' + f.pts + " " + esc(f.unit === "pt" ? "pt" : "") + "</span></div>"; }).join("") + "</div>";
  }

  function botsCard() {
    var site = D.site, blocked = !site.public || site.robotsFile || !site.rootInstall;
    var note = "";
    if (!site.public) note = '<div class="gs-hint gs-warm">WordPress pide a los buscadores que no indexen esta web, así que robots.txt cierra la puerta a todos. Cámbialo en <a href="' + esc(site.readingUrl) + '">Ajustes, Lectura</a>.</div>';
    else if (site.robotsFile) note = '<div class="gs-hint gs-warm">Tu web tiene un fichero robots.txt propio y el servidor lo sirve antes que WordPress. GenScore no lo modifica: copia las líneas de «Arreglar» en ese fichero.</div>';
    else if (!site.rootInstall) note = '<div class="gs-hint gs-warm">WordPress está instalado en una carpeta, y robots.txt sólo cuenta en la raíz del dominio. Pide a quien gestiona el dominio que añada las reglas allí.</div>';
    else if (starClosed()) note = '<div class="gs-hint gs-warm">Tu robots.txt cierra la web entera a todos los bots («User-agent: *» con «Disallow: /»), a menudo por un plugin de mantenimiento. Mientras siga así, «Permitir» no abre la web a ningún bot; «Bloquear» sí se guarda.</div>';
    var ids = Object.keys(D.bots.switches);
    var list = ids.map(function (id) {
      var on = switchWanted(id), L = SW_LABEL[id] || [id, ""];
      var tokens = D.bots.switches[id].tokens.join(", ");
      return '<div class="gs-bot"><span class="gs-tx"><b>' + esc(L[0]) + " · " + esc(L[1]) + "</b><small>" + esc(tokens) + '</small></span><button class="gs-sw" role="switch" data-sw="' + id + '" aria-checked="' + on + '" aria-label="' + esc(L[0] + ", " + L[1]) + '"' + (blocked ? " disabled" : "") + "></button></div>";
    }).join("");
    var dirty = Object.keys(S.dirty).length > 0;
    return '<div class="gs-card"><div class="gs-lab">Bots de IA<small>robots.txt</small></div>' + note + '<div class="gs-rows">' + list + '</div><div class="gs-hint">Los bots de búsqueda deciden si los motores pueden leerte y citarte. Cerrar los de entrenamiento es decisión tuya y no te quita de las respuestas con búsqueda.</div><div class="gs-acts"><button class="gs-btn gs-blue" data-act="save-bots"' + (dirty && !blocked ? "" : " disabled") + '>Guardar robots.txt</button><a class="gs-btn gs-line" href="' + esc(D.site.home + "robots.txt") + '" target="_blank" rel="noopener">Ver el fichero</a>' + (S.msg.bots ? S.msg.bots : "") + "</div></div>";
  }

  function llmsCard() {
    var L = S.llms;
    if (L.other) return '<div class="gs-card"><div class="gs-lab">llms.txt</div><div class="gs-hint">' + esc(L.other) + ' ya publica tu llms.txt. GenScore no lo sustituye para no duplicarlo: revísalo en sus ajustes.</div><div class="gs-acts"><a class="gs-btn gs-line" href="' + esc(L.url) + '" target="_blank" rel="noopener">Ver /llms.txt</a></div></div>';
    if (L.physical) return '<div class="gs-card"><div class="gs-lab">llms.txt</div><div class="gs-hint">Tu web ya tiene un fichero llms.txt en la raíz y el servidor lo sirve antes que WordPress. GenScore no lo toca.</div><div class="gs-acts"><a class="gs-btn gs-line" href="' + esc(L.url) + '" target="_blank" rel="noopener">Ver /llms.txt</a></div></div>';
    var text = S.llmsText != null ? S.llmsText : L.custom || L.generated;
    var live = S.facts && S.facts.llms && S.facts.llms.ok;
    var status = L.serving ? "publicado" : live ? "lo publica otra parte" : "no existe todavía";
    return '<div class="gs-card"><div class="gs-lab">llms.txt<small>' + status + '</small></div><div class="gs-bot" style="border:0;padding-top:0"><span class="gs-tx"><b style="font-size:14px;font-weight:600">Publicar /llms.txt</b><small style="font-family:var(--font);font-size:12.5px">Un resumen de tu web para los motores de IA: tus páginas, productos y artículos con su extracto. Puedes editarlo.</small></span><button class="gs-sw" role="switch" data-act="llms-toggle" aria-checked="' + !!L.enabled + '" aria-label="Publicar llms.txt"></button></div><label class="screen-reader-text" for="gs-llms-text">Contenido de llms.txt</label><textarea id="gs-llms-text" class="gs-code" spellcheck="false">' + esc(text) + '</textarea><div class="gs-acts"><button class="gs-btn gs-blue" data-act="save-llms">Guardar</button>' + (L.custom ? '<button class="gs-btn gs-line" data-act="llms-reset">Volver al generado</button>' : "") + (L.serving ? '<a class="gs-btn gs-line" href="' + esc(L.url) + '" target="_blank" rel="noopener">Ver /llms.txt</a>' : "") + (S.msg.llms || "") + "</div></div>";
  }

  function webGeo() {
    var acc = (S.score && S.score.access) || {};
    var cards = '<div class="gs-card"><div class="gs-lab">Quién puede leer ' + tu() + '<small>robots.txt</small></div><div class="gs-eng4">' + ENG.map(function (e) {
      var a = acc[e[0]];
      return '<div class="gs-ec' + (a === false ? " gs-no" : "") + '"><span class="gs-lgw">' + ic("e-" + e[0], "gs-lg") + "</span><b>" + e[1] + "</b><small>" + (a == null ? "Sin leer" : a ? "Puede leerla" : "Bloqueado") + "</small></div>";
    }).join("") + "</div></div>";
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
    var by = {};
    E.forEach(function (x) {
      (x.e.fixes || []).forEach(function (f) {
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
      g.pts = Math.max(1, Math.round(g.sum / E.length));
      g.where = g.hit.length === of ? (of === 1 ? "En la única " + nm[0] + " revisada" : "En todas tus " + nm[1] + " revisadas") : "En " + g.hit.length + " de " + of + " " + nm[1];
      g.hit.sort(function (a, b) { return a.e.nota - b.e.nota; });
      return g;
    }).sort(function (a, b) { return b.sum - a.sum; });
    return { n: E.length, nota: avg(E.map(function (x) { return x.e.nota; })), lanes: { ia: lane("ia"), google: lane("google"), agent: lane("agent") }, fixes: F, entries: E };
  }
  function webMode() { return !S.target && !!webAgg(); }
  function scoreChip(v) { var b = band(v); return '<span class="gs-sc gs-sc-' + b[0] + '">' + (v == null ? "–" : v) + "</span>"; }
  function pageRow(x, withFix) {
    var first = x.e.fixes && x.e.fixes[0] ? x.e.fixes[0].t.replace(/<[^>]+>/g, "") : "Nada urgente";
    var kind = x.page.type === "home" ? "Portada" : TYPE[x.page.type] || "";
    return '<div class="gs-pr">' + scoreChip(x.e.nota) + '<button class="gs-tx gs-prt" data-act="open-page" data-id="' + x.page.id + '"><b>' + esc(x.page.title || "(sin título)") + "</b><small>" + esc(kind + (withFix === false ? "" : " · " + first)) + "</small></button>" + (x.page.edit ? '<a class="gs-pr-e" href="' + esc(x.page.edit) + '">Editar</a>' : "") + "</div>";
  }
  function webFixRow(g, i) {
    var open = S.open[g.id] != null ? S.open[g.id] : i === 0;
    var pages = open ? '<div class="gs-prs">' + g.hit.slice(0, 5).map(function (x) { return pageRow(x, false); }).join("") + (g.hit.length > 5 ? '<p class="gs-more">Y ' + (g.hit.length - 5) + " más, en «Tus páginas».</p>" : "") + "</div>" : "";
    return '<div class="gs-fx gs-fxw"><span class="gs-n">' + (i + 1) + '</span><span class="gs-tx">' + g.t + '<span class="gs-why">+' + g.pts + " " + (g.unit === "pt" ? "puntos en la nota" : "en Agentes") + '</span><span class="gs-chip">' + esc(g.where) + "</span>" + pages + '</span><button class="gs-btn gs-line gs-sm" data-act="toggle-fix" data-id="' + esc(g.id) + '" aria-expanded="' + open + '">' + (open ? "Ocultar" : "Ver páginas") + "</button></div>";
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
    var hero = '<div class="gs-card gs-hero"><div class="gs-lab" style="width:100%">Revisión gratis<small class="gs-mono">' + esc(S.target ? S.target.path : W ? (W.n === 1 ? "tu portada" : "tu web · " + W.n + " páginas") : "portada") + '</small></div><div class="gs-dialbox">' + dial(nota, [50, 75]) + '<div class="gs-dial-c"><b class="gs-num">' + nota + '</b><span>Nota SEO + IA</span></div></div>'
      + '<div class="gs-bands"><span class="' + (nota < 50 ? "gs-on" : "") + '">Se frena</span><span class="' + (nota >= 50 && nota < 75 ? "gs-on" : "") + '">Mejorable</span><span class="' + (nota >= 75 ? "gs-on" : "") + '">Bien</span></div>'
      + '<p class="gs-say">' + esc(sc.say) + "</p>" + (W ? progressLine() : "")
      + '<div class="gs-gg3">' + gauge("geo", "GEO", ic("i-sparkles"), lanes.ia, blocked ? 4 - blocked + " de 4 la leen" : null) + gauge("seo", "SEO", ic("e-google", "gs-i"), lanes.google) + gauge("ag", "Agentes", ic("i-cart"), lanes.agent, lanes.agent == null ? "Sin tienda" : null) + "</div></div>";
    var F = sc.fixes.slice(0, 3);
    var tabOf = { ia: "geo", google: "seo", agent: "ag" };
    if (W) {
      var WF = W.fixes.slice(0, 3);
      var mine = '<div class="gs-card"><div class="gs-lab">Arregla primero<small>en toda la web</small></div>' + (WF.length ? WF.map(function (g, i) { return webFixRow(g, i); }).join("") : '<div class="gs-rw"><span class="gs-tx">Tu web está bien. No hay nada urgente.</span>' + ok("Bien") + "</div>") + "</div>";
      var list = W.entries.slice().sort(function (a, b) { return a.e.nota - b.e.nota; });
      var pagesCard = '<div class="gs-card"><div class="gs-lab">Tus páginas<small>peor nota primero</small></div><div class="gs-prs">' + list.map(function (x) { return pageRow(x); }).join("") + '</div><p class="gs-more">Revisamos tu portada, tu menú, tus productos y tus últimas entradas. Al publicar o actualizar algo, revisamos sólo esa página. ' + (S.web.running ? "" : '<button class="gs-link" data-act="rerun-web">Revisar todo ahora</button>') + "</p></div>";
      return '<div class="gs-cols"><div class="gs-col">' + hero + mine + '</div><div class="gs-col">' + pagesCard + deepCard() + acctCard() + "</div></div>";
    }
    var fixes = '<div class="gs-card"><div class="gs-lab">Arregla primero</div>' + (F.length ? F.map(function (f, i) { return '<div class="gs-fx"><span class="gs-n">' + (i + 1) + '</span><span class="gs-tx">' + f.t + '<span class="gs-why">+' + f.pts + " " + (f.unit === "pt" ? "puntos en la nota" : "en Agentes") + '</span></span><button class="gs-btn gs-line gs-sm" data-tab="' + tabOf[f.lane] + '">Arreglar</button></div>'; }).join("") : '<div class="gs-rw"><span class="gs-tx">' + cap(tu()) + ' está bien. No hay nada urgente.</span>' + ok("Bien") + "</div>") + "</div>";
    return '<div class="gs-cols"><div class="gs-col">' + hero + fixes + '</div><div class="gs-col">' + deepCard() + acctCard() + "</div></div>";
  }
  function deepCard() {
    return '<div class="gs-deep"><div class="gs-egs">' + ENG.map(function (e) { return "<span>" + ic("e-" + e[0], "gs-lg") + "</span>"; }).join("") + '</div><p class="gs-q">¿Quieres saber si ChatGPT, Gemini, Claude y Perplexity recomiendan <b>' + esc(D.site.domain) + "</b> y a sus competidores?</p>" + ext(D.links.analyze, "Analizar dominio", "gs-btn gs-onink") + '<p class="gs-ft">7 días de Pro gratis. Sin tarjeta.</p></div>';
  }
  function acctCard() {
    return '<div class="gs-card"><div class="gs-lab">Con tu cuenta</div>' + [["Auditoría GEO", "¿Te puede citar la IA?"], ["Auditoría SEO", "¿Te encuentra Google?"], ["Auditoría agéntica", "¿Puede un agente comprar en tu web?"]].map(function (a) { return '<div class="gs-aul"><span class="gs-sh">' + ic("i-shield") + '</span><span class="gs-t"><b>' + a[0] + "</b><small>" + a[1] + '</small></span><span class="gs-gh"></span></div>'; }).join("") + '<p style="font-size:13.5px;color:var(--ink-2)">Auditoría técnica completa de todo tu dominio: cómo está y qué mejorar primero.</p>' + ext(D.links.login.replace("utm_content=identificate", "utm_content=auditorias"), "Identifícate en GenScore", "gs-btn gs-line") + "</div>";
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
  function render() {
    var ta = document.getElementById("gs-llms-text");
    if (ta) S.llmsText = S.llmsEdited ? ta.value : null;
    app.innerHTML = head() + tabs() + body();
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

  /* What is stored of a page: its note, lanes and fixes, nothing else. */
  function entryOf(id, sc) {
    return { id: id, nota: sc.nota, ia: sc.lanes.ia, google: sc.lanes.google, agent: sc.lanes.agent, fixes: sc.fixes.slice(0, 12).map(function (f) { return { id: f.id, lane: f.lane, pts: f.pts, unit: f.unit === "pt" ? "pt" : "en Agentes", t: f.t }; }) };
  }
  function keep(id, sc) {
    var e = entryOf(id, sc);
    S.web.scores[id] = e;
    post("genscore_save_page", { page: JSON.stringify(e) }).catch(function () {});
  }
  function review() {
    S.state = "loading"; render();
    var target = S.target;
    readPage(target ? target.url : D.site.home).then(function (facts) {
      S.facts = facts;
      var raw = SC.scorePage(facts);
      keep(target ? target.id : 0, raw);
      // Only the home page borrows a product page for Agentes: a page opened
      // from the list is scored on its own.
      return target ? SC.scorePage(facts) : withProduct(SC.scorePage(facts));
    }).then(function (sc) {
      S.score = sc;
      if (!target) S.home = { facts: S.facts, score: sc };
      S.state = "ready";
      if (!target) reviewSite(false); else render();
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
    if (S.web.running) return;
    var todo = S.web.pages.filter(function (p) { return p.id && (all || !S.web.scores[p.id]); });
    var have = S.web.pages.filter(function (p) { return p.id && S.web.scores[p.id]; }).length;
    if (!todo.length) { render(); saveReview(); return; }
    S.web.running = true;
    S.web.first = have === 0;
    S.web.left = todo.length;
    render();
    var i = 0;
    function next() {
      if (i >= todo.length) return Promise.resolve();
      var p = todo[i++];
      return readPage(p.url).then(function (facts) { keep(p.id, SC.scorePage(facts)); }, function () { /* a page that will not open is left out */ })
        .then(function () { S.web.left--; if (!S.web.first && !S.target) render(); return next(); });
    }
    Promise.all([next(), next()]).then(function () {
      S.web.running = false; S.web.first = false;
      render();
      saveReview();
    });
  }
  function checkSitemap() {
    if (!D.site.sitemap) return;
    fetch(D.site.sitemap, { method: "GET", credentials: "omit", cache: "no-store" }).then(function (r) { S.sitemapOk = r.ok; if (S.tab === "seo") render(); }, function () { S.sitemapOk = false; if (S.tab === "seo") render(); });
  }

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
    if (!S.home) { review(); return; }
    S.facts = S.home.facts; S.score = S.home.score; S.state = "ready"; render();
    app.scrollIntoView({ block: "start" });
  }
  app.addEventListener("click", function (e) {
    var t = e.target.closest("[data-tab]");
    if (t) { S.tab = t.getAttribute("data-tab"); render(); app.scrollIntoView({ block: "start" }); return; }
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
        S.bots = r.data.settings; S.dirty = {}; S.msg.bots = '<span class="gs-saved">Guardado. Volvemos a revisar ' + tu() + '.</span>';
        review();
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
    if (act === "llms-reset") { saveLlms("reset"); }
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
      if (r.data.generated != null) S.llms.generated = r.data.generated;
      if ("text" in data) { S.llmsEdited = false; S.llmsText = null; }
      S.msg.llms = '<span class="gs-saved">' + (r.data.serving ? "Guardado. Ya se publica en /llms.txt." : "Guardado.") + "</span>";
      render();
    }).catch(function () { S.msg.llms = '<span class="gs-err">No se ha podido guardar. Vuelve a intentarlo.</span>'; render(); });
  }

  review();
  checkSitemap();
})();
