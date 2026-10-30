/* GenScore test extension: from page facts to the «Nota SEO + IA».
   Pure: no DOM, no chrome.*, no clock except the `now` argument. Runs in the
   side panel and in node (score.test.mjs). Never called «Puntuación GEO»:
   that number belongs to a scan and only the console computes it.

   Weights (task-intake-report.md §16):
     IA 55 / Google 45. Agentes only when the page sells something, and it
     stays outside the nota.
   A criterion that cannot be measured (robots.txt unreadable, freshness on a
   product page) is left out and the lane is renormalised over the rest:
   counting it as a failure would be a fake metric. */
(function (root) {
  "use strict";

  /* Same tokens as lib/agentic-audit/agents.ts: an engine counts as let in
     only when every one of its tokens is. Training-only tokens are left out. */
  const ENGINE_TOKENS = {
    chatgpt: ["ChatGPT-User", "OAI-SearchBot"],
    gemini: ["Googlebot", "Google-Extended"],
    claude: ["Claude-User", "Claude-SearchBot"],
    perplexity: ["Perplexity-User", "PerplexityBot"]
  };
  const ENGINE_NAME = { chatgpt: "ChatGPT", gemini: "Gemini", claude: "Claude", perplexity: "Perplexity" };
  const ENGINES = Object.keys(ENGINE_TOKENS);
  const LANE_WEIGHT = { ia: 0.55, google: 0.45 };

  /* ---------------- robots.txt (RFC 9309) ---------------- */
  function parseRobots(text) {
    const groups = [];
    let cur = null;
    let lastWasAgent = false;
    for (const raw of String(text || "").split(/\r?\n/)) {
      const line = raw.replace(/#.*$/, "").trim();
      const m = line.match(/^([A-Za-z-]+)\s*:\s*(.*)$/);
      if (!m) continue;
      const key = m[1].toLowerCase();
      const val = m[2].trim();
      if (key === "user-agent") {
        if (!cur || !lastWasAgent) { cur = { agents: [], rules: [] }; groups.push(cur); }
        cur.agents.push(val.toLowerCase());
        lastWasAgent = true;
      } else if (key === "allow" || key === "disallow") {
        if (cur) cur.rules.push({ allow: key === "allow", path: val, raw: `${m[1]}: ${val}` });
        lastWasAgent = false;
      } else {
        lastWasAgent = false;
      }
    }
    return groups;
  }
  function groupsFor(groups, token) {
    const t = token.toLowerCase();
    const named = groups.filter((g) => g.agents.includes(t));
    if (named.length) return { named: true, groups: named };
    return { named: false, groups: groups.filter((g) => g.agents.includes("*")) };
  }
  function ruleMatches(rulePath, path) {
    if (!rulePath) return false;
    const anchored = rulePath.endsWith("$");
    const body = anchored ? rulePath.slice(0, -1) : rulePath;
    const re = new RegExp("^" + body.split("*").map((s) => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*") + (anchored ? "$" : ""));
    return re.test(path);
  }
  /* Longest matching rule wins; on a tie, Allow wins. No rule: allowed. */
  function tokenVerdict(groups, token, path) {
    const sel = groupsFor(groups, token);
    let best = null;
    for (const g of sel.groups) for (const r of g.rules) {
      if (!r.path && !r.allow) continue; // "Disallow:" with nothing blocks nothing
      if (!ruleMatches(r.path, path)) continue;
      const len = r.path.replace(/\$$/, "").length;
      if (!best || len > best.len || (len === best.len && r.allow && !best.rule.allow)) best = { len, rule: r };
    }
    return { allowed: !best || best.rule.allow, rule: best ? best.rule : null, named: sel.named, groups: sel.groups };
  }
  /* Per engine: true, false or null (could not read robots.txt). */
  function engineAccess(robots, path) {
    const out = {};
    if (!robots || robots.status === 0 || robots.status >= 500) {
      ENGINES.forEach((e) => (out[e] = { allowed: null, blocked: [] }));
      return out;
    }
    if (robots.status !== 200 || robots.text == null) {
      ENGINES.forEach((e) => (out[e] = { allowed: true, blocked: [] }));
      return out;
    }
    const groups = parseRobots(robots.text);
    for (const e of ENGINES) {
      const blocked = ENGINE_TOKENS[e].map((t) => ({ token: t, v: tokenVerdict(groups, t, path) })).filter((x) => !x.v.allowed);
      out[e] = { allowed: blocked.length === 0, blocked };
    }
    out._groups = groups;
    return out;
  }
  /* The lines to paste so the blocked tokens can read this path. A named group
     makes the crawler ignore «*» entirely, so the group repeats every other
     rule of the group it came from, minus the ones that block this page. */
  function robotsFix(access, engine, path) {
    const blocked = access[engine].blocked;
    const keep = [];
    const seen = new Set();
    const star = (access._groups || []).filter((g) => g.agents.includes("*"));
    for (const g of [...blocked.flatMap((b) => b.v.groups), ...(blocked.some((b) => b.v.named) ? star : [])]) for (const r of g.rules) {
      if (!r.allow && ruleMatches(r.path, path)) continue;
      if (r.allow && r.path === "/") continue;
      if (!seen.has(r.raw)) { seen.add(r.raw); keep.push(r.raw); }
    }
    const named = blocked.some((b) => b.v.named);
    const lines = [...blocked.map((b) => `User-agent: ${b.token}`), ...keep, "Allow: /"];
    return { snippet: lines.join("\n"), named, tokens: blocked.map((b) => b.token), rule: blocked[0] && blocked[0].v.rule ? blocked[0].v.rule.raw : null };
  }

  /* ---------------- small helpers ---------------- */
  const has = (s, w) => new RegExp(`(^|[\\s,;:])${w}([\\s,;:]|$)`).test(String(s || ""));
  const esc = (s) => String(s || "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const attr = (s) => String(s || "").replace(/"/g, "&quot;");
  const iso = (d) => d.toISOString().slice(0, 10);
  const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
  const longDate = (d) => `${d.getUTCDate()} de ${MONTHS[d.getUTCMonth()]} de ${d.getUTCFullYear()}`;
  function trimTo(s, n) {
    s = String(s || "").replace(/\s+/g, " ").trim();
    if (s.length <= n) return s;
    const cut = s.slice(0, n - 1);
    return cut.slice(0, Math.max(cut.lastIndexOf(" "), n - 20)).replace(/[,;:.\s]+$/, "") + "…";
  }
  function ageDays(dateStr, now) {
    const d = new Date(dateStr);
    if (isNaN(d)) return null;
    return Math.floor((now - d) / 86400000);
  }
  function sameUrl(a, b) {
    try {
      const x = new URL(a), y = new URL(b);
      const n = (u) => (u.hostname.replace(/^www\./, "") + u.pathname.replace(/\/$/, "")).toLowerCase();
      return n(x) === n(y);
    } catch (e) { return false; }
  }
  function listNames(keys) {
    const n = keys.map((k) => ENGINE_NAME[k]);
    return n.length > 1 ? n.slice(0, -1).join(", ") + " y " + n[n.length - 1] : n[0] || "";
  }

  /* ---------------- scoring ---------------- */
  function scorePage(f, now = Date.now()) {
    const path = (f.path || "/").split("#")[0] || "/";
    const access = engineAccess(f.robots, path);
    const noindex = has(f.robotsMeta, "noindex") || has(f.robotsMeta, "none") || has(f.xRobots, "noindex") || has(f.xRobots, "none");
    const nosnippet = has(f.robotsMeta, "nosnippet") || has(f.xRobots, "nosnippet") || /max-snippet\s*:\s*0\b/.test((f.robotsMeta || "") + " " + (f.xRobots || ""));
    const ld = f.ld || { types: [], errors: 0 };
    const product = ld.product;
    /* «Reservar» or «Contratar» alone do not make a shop: a clinic or a gestoría
       has them too, and an Agentes 20 there alarms for nothing. */
    const cartButton = !!f.buy && /(carrito|cesta|comprar|cart|bag|basket|buy)/i.test(f.buy);
    const commerce = !!(product || cartButton || f.microPrice || (f.og && /product/i.test(f.og.type || "")) || ld.offerCount);
    const titleLen = (f.title || "").length;
    const descLen = (f.description || "").length;
    const lead = f.lead || { words: 0 };
    const leadOk = lead.words >= 20 && lead.words <= 120 && (lead.wordsBefore == null || lead.wordsBefore <= 40);
    const age = f.visibleDate ? ageDays(f.visibleDate, now) : null;
    const gBlocked = access.gemini && access.gemini.blocked.some((b) => b.token === "Googlebot");

    const C = []; // {id, lane, w, v (0..1|null), label, value}
    const add = (id, lane, w, v, label, value) => C.push({ id, lane, w, v, label, value });

    /* IA */
    for (const e of ENGINES) {
      const a = access[e].allowed;
      add("bot-" + e, "ia", 10, a == null ? null : a ? 1 : 0, ENGINE_NAME[e], a == null ? "Sin leer" : a ? "Puede leerla" : "Bloqueado");
    }
    add("lead", "ia", 15, leadOk ? 1 : lead.words >= 12 ? 0.5 : 0, "Responde en las primeras líneas",
      leadOk ? `Sí, ${lead.words} palabras` : lead.words >= 12 ? (lead.words > 120 ? "Párrafo muy largo" : "Tarda en llegar") : "No");
    add("fresh", "ia", 15, commerce ? null : age == null ? 0 : age <= 365 ? 1 : age <= 730 ? 0.5 : 0.2, "Fecha visible y reciente",
      commerce ? "No aplica en una ficha" : age == null ? "Sin fecha" : age <= 365 ? "Sí" : `Hace ${Math.round(age / 30)} meses`);
    add("ld", "ia", 15, ld.types.length ? (ld.errors ? 0.5 : 1) : ld.errors ? 0.25 : 0, "Datos estructurados",
      ld.types.length ? ld.types.slice(0, 3).join(", ") + (ld.errors ? " (con errores)" : "") : ld.errors ? "Con errores" : "No");
    add("llms", "ia", 5, f.llms && f.llms.ok ? 1 : 0, "llms.txt", f.llms && f.llms.ok ? "Sí" : "No");
    add("snippet", "ia", 10, nosnippet ? 0 : 1, "Deja citar su texto", nosnippet ? "nosnippet" : "Sí");

    /* Google */
    add("title", "google", 20, !titleLen ? 0 : titleLen >= 15 && titleLen <= 65 ? 1 : 0.5, "Título", titleLen ? `${titleLen} caracteres` : "No");
    add("desc", "google", 20, !descLen ? 0 : descLen >= 50 && descLen <= 160 ? 1 : 0.5, "Descripción", descLen ? `${descLen} caracteres` : "No");
    add("index", "google", 25, noindex || gBlocked ? 0 : 1, "Indexable", noindex ? "noindex" : gBlocked ? "robots.txt lo bloquea" : "Sí");
    add("canon", "google", 10, !f.canonical ? 0 : sameUrl(f.canonical, f.url) ? 1 : 0.5, "Canónica", !f.canonical ? "No" : sameUrl(f.canonical, f.url) ? "Sí" : "Apunta a otra");
    add("h1", "google", 10, f.h1 && f.h1.length === 1 ? 1 : f.h1 && f.h1.length > 1 ? 0.5 : 0, "Un solo h1", !f.h1 || !f.h1.length ? "No hay" : f.h1.length === 1 ? "Sí" : `Hay ${f.h1.length}`);
    add("lang", "google", 5, f.lang ? 1 : 0, "Idioma declarado", f.lang || "No");
    add("ldg", "google", 10, ld.types.length ? (ld.errors ? 0.5 : 1) : 0, "Datos estructurados", ld.types.length ? "Sí" : "No");

    /* Agentes, only when the page sells something */
    if (commerce) {
      add("prod", "agent", 30, product && product.name ? 1 : ld.offerCount ? 0.5 : 0, "Entiende el producto", product && product.name ? trimTo(product.name, 28) : "No");
      add("price", "agent", 25, product && product.price ? 1 : f.microPrice || (f.og && f.og.price) ? 0.5 : 0, "Precio en los datos",
        product && product.price ? `${product.price}${product.currency ? " " + product.currency : ""}` : f.microPrice || (f.og && f.og.price) ? "Sólo fuera del JSON-LD" : "No");
      add("avail", "agent", 15, product && product.availability ? 1 : 0, "Disponibilidad", product && product.availability ? product.availability : "No");
      add("buy", "agent", 20, f.buy ? 1 : 0, "Botón de compra claro", f.buy ? `«${f.buy}»` : "No");
      add("returns", "agent", 10, product && product.returns ? 1 : f.returnsLink ? 0.5 : 0, "Devoluciones", product && product.returns ? "En los datos" : f.returnsLink ? "Sólo un enlace" : "No");
    }

    const laneScore = (k) => {
      const xs = C.filter((c) => c.lane === k && c.v != null);
      const W = xs.reduce((a, c) => a + c.w, 0);
      return W ? Math.round((xs.reduce((a, c) => a + c.w * c.v, 0) / W) * 100) : null;
    };
    const lanes = { ia: laneScore("ia"), google: laneScore("google"), agent: commerce ? laneScore("agent") : null };
    const nota = Math.round(LANE_WEIGHT.ia * lanes.ia + LANE_WEIGHT.google * lanes.google);
    /* what each criterion is worth in the nota (or in its own lane, for Agentes) */
    const laneW = (k) => C.filter((c) => c.lane === k && c.v != null).reduce((a, c) => a + c.w, 0);
    const gain = (c) => {
      if (c.v == null || c.v >= 1) return 0;
      const share = (c.w * (1 - c.v)) / laneW(c.lane) * 100;
      return Math.max(1, Math.round(c.lane === "agent" ? share : share * LANE_WEIGHT[c.lane]));
    };

    const readers = ENGINES.filter((e) => access[e].allowed === true);
    const blockedEngines = ENGINES.filter((e) => access[e].allowed === false);
    const fixes = buildFixes(f, C, gain, { access, path, product, commerce, noindex, nosnippet, gBlocked, now });

    /* layer 2: the one warm alert */
    let alert = null;
    if (noindex) alert = { id: "index", t: "Google no la indexará.", s: "La página pide noindex." };
    else if (gBlocked) alert = { id: "index", t: "Google no puede leerla.", s: "Tu robots.txt bloquea a Googlebot." };
    else if (blockedEngines.length) alert = { id: "bot-" + blockedEngines[0], t: `${listNames(blockedEngines)} no ${blockedEngines.length > 1 ? "pueden" : "puede"} leer esta página.`, s: "Tu robots.txt lo bloquea." };
    else if (nosnippet) alert = { id: "snippet", t: "Pide que no se cite su texto.", s: "Lleva nosnippet." };

    /* one sentence under the dial */
    const known = ENGINES.filter((e) => access[e].allowed != null).length;
    let say;
    if (!known) say = "No hemos podido leer su robots.txt.";
    else if (readers.length === 4) say = "Los cuatro motores pueden leerla";
    else if (!readers.length) say = "Ningún motor de IA puede leerla";
    else say = `${listNames(readers)} pueden leerla, ${listNames(blockedEngines)} no`;
    if (known) say += noindex || gBlocked ? ", pero Google no la indexará." : ", y Google la indexa.";

    return { nota, lanes, criteria: C, fixes, alert, say, commerce, readers, blockedEngines, access: ENGINES.reduce((o, e) => ((o[e] = access[e].allowed), o), {}) };
  }

  /* ---------------- «Haz esto»: one card per failing criterion ---------------- */
  function buildFixes(f, C, gain, x) {
    const out = [];
    const byId = Object.fromEntries(C.map((c) => [c.id, c]));
    const push = (id, o) => {
      const c = byId[id];
      if (!c || c.v == null || c.v >= 1) return;
      out.push(Object.assign({ id, lane: c.lane, pts: gain(c), unit: c.lane === "agent" ? "en Agentes" : "pt" }, o));
    };
    const today = new Date(x.now);
    const host = f.host || "";
    const brand = host.split(".")[0].replace(/-/g, " ").replace(/^\w/, (m) => m.toUpperCase());
    const cleanUrl = (() => { try { const u = new URL(f.url); return u.origin + u.pathname; } catch (e) { return f.url; } })();
    const h1 = (f.h1 && f.h1[0]) || f.title || brand;

    if (byId.index && byId.index.v === 0) {
      push("index", x.noindex
        ? { t: "Quita el <code class=\"p\">noindex</code> de esta página", why: "Con él, Google la deja fuera de sus resultados, y los motores que buscan en Google tampoco la encuentran.", how: "Busca <code class=\"p\">noindex</code> en la etiqueta <code class=\"p\">meta name=\"robots\"</code> o en la cabecera <code class=\"p\">X-Robots-Tag</code> de tu servidor y quítalo." }
        : { t: "Deja entrar a Googlebot en tu <code class=\"p\">robots.txt</code>", why: "Sin Googlebot no hay Google, ni Gemini.", snippet: robotsFix(x.access, "gemini", x.path).snippet, copyWhat: "las líneas para tu robots.txt" });
    }
    for (const e of ["chatgpt", "gemini", "claude", "perplexity"]) {
      if (x.access[e].allowed !== false || (e === "gemini" && x.gBlocked)) continue;
      const fx = robotsFix(x.access, e, x.path);
      const others = ["chatgpt", "gemini", "claude", "perplexity"].filter((k) => k !== e && x.access[k].allowed);
      push("bot-" + e, {
        t: `Deja entrar a ${ENGINE_NAME[e]} en tu <code class="p">robots.txt</code>`,
        why: `Lo bloquea <code class="p">${esc(fx.rule || "Disallow")}</code> para ${fx.tokens.join(" y ")}.` + (others.length ? ` ${listNames(others)} sí pueden leerla.` : "") + (fx.named ? ` Cambia su grupo por estas líneas, que mantienen tus otras reglas.` : " El grupo nuevo repite tus otras reglas, porque un grupo con nombre ignora el de «*»."),
        snippet: fx.snippet, copyWhat: "las líneas para tu robots.txt"
      });
    }
    push("snippet", { t: "Quita el <code class=\"p\">nosnippet</code>", why: "Pide a los buscadores que no citen el texto de la página. Es lo contrario de lo que buscas en la IA.", how: "Está en la etiqueta <code class=\"p\">meta name=\"robots\"</code> o en la cabecera <code class=\"p\">X-Robots-Tag</code>." });
    push("lead", { t: "Responde en las primeras líneas", why: "Justo bajo el título, un párrafo de dos o tres frases que conteste la pregunta de la página. Es el texto que los motores suelen citar.", how: x.commerce ? "En una ficha: qué es, para quién y qué la diferencia, antes de la galería y las opciones." : "Empieza por la respuesta y deja el contexto para después." });
    push("desc", {
      t: f.description ? "Deja la descripción entre 50 y 160 caracteres" : "Añade una descripción",
      why: f.description ? `Ahora tiene ${(f.description || "").length} caracteres.` : "Es el texto que Google enseña bajo el título. Esta sale del primer párrafo de la página: revísala antes de pegarla.",
      snippet: `<meta name="description" content="${attr(trimTo(f.lead && f.lead.text ? f.lead.text : f.title, 155))}">`, copyWhat: "la etiqueta de descripción"
    });
    push("title", { t: f.title ? "Deja el título entre 15 y 65 caracteres" : "Añade un título", why: !f.title ? "Sin título, Google se inventa uno." : f.title.length > 65 ? `Ahora tiene ${f.title.length}. Google corta lo que pasa de unos 65 y se pierde el final.` : `Ahora tiene ${f.title.length}. Tan corto no dice de qué va la página.`, how: "Lo que la página resuelve primero, y la marca al final." });
    push("ld", x.commerce ? {
      t: "Describe el producto con JSON-LD", why: "Es lo que leen Google y los agentes para saber qué vendes, a qué precio y si hay stock. Rellena lo que va en mayúsculas.",
      snippet: productLd(h1, cleanUrl, x.product), copyWhat: "el bloque JSON-LD"
    } : {
      t: (f.ld && f.ld.errors) ? "Arregla el JSON-LD que no se puede leer" : "Añade datos estructurados (JSON-LD)",
      why: (f.ld && f.ld.errors) ? "Hay un bloque con un error de sintaxis y nadie lo puede leer." : "Dicen a Google y a la IA qué es la página y quién la publica.",
      snippet: (f.ld && f.ld.errors) ? null : JSON.stringify({ "@context": "https://schema.org", "@type": "WebPage", name: f.title || h1, description: f.description || trimTo(f.lead && f.lead.text, 155) || undefined, url: cleanUrl, inLanguage: f.lang || "es", dateModified: iso(today), publisher: { "@type": "Organization", name: brand, url: (() => { try { return new URL(f.url).origin; } catch (e) { return ""; } })() } }, null, 2).replace(/^/, '<script type="application/ld+json">\n') + "\n</script>",
      copyWhat: "el bloque JSON-LD"
    });
    push("fresh", { t: "Pon una fecha de actualización visible", why: "Los motores prefieren lo reciente y miran la fecha. Que se vea en la página y que coincida con <code class=\"p\">dateModified</code>.", snippet: `<time datetime="${iso(today)}">Actualizado el ${longDate(today)}</time>`, copyWhat: "la fecha" });
    push("canon", { t: f.canonical ? "Revisa la canónica: apunta a otra página" : "Añade una URL canónica", why: f.canonical ? "Google tomará la otra como la buena." : "Evita que Google dude entre versiones de la misma página.", snippet: f.canonical ? null : `<link rel="canonical" href="${attr(cleanUrl)}">`, copyWhat: "la etiqueta canónica" });
    push("h1", { t: f.h1 && f.h1.length > 1 ? `Deja un solo h1 (ahora hay ${f.h1.length})` : "Añade un h1 con el tema de la página", why: "Es el título que leen Google y la IA dentro de la página." });
    push("lang", { t: "Declara el idioma de la página", why: "Ayuda a Google y a la IA a enseñarla en el idioma correcto.", snippet: '<html lang="es">', copyWhat: "el atributo de idioma" });
    push("llms", { t: "Publica un <code class=\"p\">llms.txt</code>", why: "Un resumen de tu web para los motores de IA, en la raíz del dominio. Este parte de esta página: añade tus páginas principales.", snippet: `# ${brand}\n\n> ${trimTo(f.description || (f.lead && f.lead.text) || f.title, 200)}\n\n## Páginas principales\n\n- [${(f.title || h1).replace(/[[\]]/g, "")}](${cleanUrl})`, copyWhat: "el llms.txt" });
    push("prod", { t: "Di qué producto es con JSON-LD", why: "Un agente no adivina: lee <code class=\"p\">Product</code> con su nombre, precio y stock.", snippet: productLd(h1, cleanUrl, x.product), copyWhat: "el bloque JSON-LD" });
    push("price", { t: "Pon el precio en los datos del producto", why: "Si sólo está en la página, un agente puede no verlo. Va en <code class=\"p\">offers.price</code>.", snippet: offerLd(x.product, cleanUrl), copyWhat: "la oferta" });
    push("avail", { t: "Di si hay stock", why: "Un agente no recomienda lo que no sabe si puede comprar.", snippet: offerLd(x.product, cleanUrl), copyWhat: "la oferta" });
    /* price and stock paste the same Offer: one card, both gains */
    const pi = out.findIndex((r) => r.id === "price"), ai = out.findIndex((r) => r.id === "avail");
    if (pi > -1 && ai > -1) {
      out[pi] = Object.assign({}, out[pi], { t: "Pon el precio y el stock en los datos del producto", why: "Si sólo están en la página, un agente puede no verlos. Van en <code class=\"p\">offers</code>: cambia PRECIO por el tuyo.", pts: out[pi].pts + out[ai].pts });
      out.splice(ai, 1);
    }
    push("buy", { t: "Que el botón de compra diga lo que hace", why: "«Añadir al carrito» o «Comprar», a la vista y como botón de verdad. Un agente busca esas palabras." });
    push("returns", { t: "Pon tu política de devoluciones en los datos", why: "Es lo que más pregunta quien compra a través de un agente. Ajusta los días.", snippet: JSON.stringify({ "@type": "MerchantReturnPolicy", applicableCountry: "ES", returnPolicyCategory: "https://schema.org/MerchantReturnFiniteReturnWindow", merchantReturnDays: 30, returnMethod: "https://schema.org/ReturnByMail" }, null, 2), copyWhat: "la política de devoluciones" });

    /* a domain-wide fix first only when it blocks; then by points */
    const crit = (r) => (r.id === "index" ? 3 : r.id.startsWith("bot-") ? 2 : r.id === "snippet" ? 1 : 0);
    out.sort((a, b) => crit(b) - crit(a) || (b.unit === "pt") - (a.unit === "pt") || b.pts - a.pts);
    /* two fixes that paste the same block are one card */
    const seen = new Set();
    return out.filter((r) => (r.snippet ? (seen.has(r.snippet) ? false : seen.add(r.snippet)) : true));
  }
  function offerLd(p, url) {
    return JSON.stringify({ "@type": "Offer", url, price: (p && p.price) || "PRECIO", priceCurrency: (p && p.currency) || "EUR", availability: "https://schema.org/InStock" }, null, 2);
  }
  function productLd(name, url, p) {
    return '<script type="application/ld+json">\n' + JSON.stringify({ "@context": "https://schema.org", "@type": "Product", name: (p && p.name) || name, description: "DESCRIPCIÓN EN UNA FRASE", image: "URL DE LA IMAGEN", offers: JSON.parse(offerLd(p, url)) }, null, 2) + "\n</script>";
  }

  const api = { scorePage, parseRobots, tokenVerdict, engineAccess, robotsFix, ENGINES, ENGINE_NAME, ENGINE_TOKENS };
  root.GS_SCORE = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof self !== "undefined" ? self : globalThis);
