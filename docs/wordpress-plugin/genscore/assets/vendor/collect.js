/* GenScore test extension: what the page itself says.
   collectPageFacts() runs INSIDE the reviewed tab (chrome.scripting.executeScript
   with func), only after the user clicks the toolbar icon. It must stay
   self-contained: no closures, no imports. It reads the DOM and fetches three
   same-origin files (robots.txt, llms.txt and a HEAD of the page for
   X-Robots-Tag). Nothing leaves the browser. */
async function collectPageFacts() {
  const T0 = performance.now();
  const q = (s) => document.querySelector(s);
  const qa = (s) => Array.from(document.querySelectorAll(s));
  const meta = (n) => {
    const el = q(`meta[name="${n}" i]`) || q(`meta[property="${n}" i]`);
    return el ? (el.getAttribute("content") || "").trim() : null;
  };
  const clean = (s) => String(s || "").replace(/\s+/g, " ").trim();
  const words = (s) => (clean(s).match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) || []).length;

  async function get(path, opts = {}) {
    const { max = 200000, ms = 4000, ...o } = opts;
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), ms);
    try {
      const r = await fetch(path, { credentials: "omit", cache: "no-store", redirect: "follow", signal: ctl.signal, ...o });
      const type = r.headers.get("content-type") || "";
      const text = o.method === "HEAD" ? "" : (await r.text()).slice(0, max);
      return { status: r.status, type, text, headers: r.headers };
    } catch (e) {
      return { status: 0, type: "", text: "", headers: null };
    } finally {
      clearTimeout(t);
    }
  }

  /* ---------- head ---------- */
  const title = clean(document.title);
  const description = meta("description");
  const robotsMeta = clean([meta("robots"), meta("googlebot")].filter(Boolean).join(", ")).toLowerCase();
  const canonEl = q('link[rel="canonical" i]');
  const canonical = canonEl ? canonEl.href : null;
  const lang = (document.documentElement.getAttribute("lang") || "").trim();
  const h1 = qa("h1").map((h) => clean(h.textContent)).filter(Boolean);
  const og = { type: meta("og:type"), price: meta("product:price:amount") || meta("og:price:amount") };

  /* ---------- JSON-LD (of this page, or of the shop page found below) ---------- */
  const isT = (n, ...ts) => [].concat(n["@type"] || []).some((x) => ts.includes(String(x)));
  function readLd(root) {
    const types = new Set();
    let ldErrors = 0;
    const nodes = [];
    const walk = (n) => {
      if (!n || typeof n !== "object") return;
      if (Array.isArray(n)) return n.forEach(walk);
      const t = n["@type"];
      if (t) {
        (Array.isArray(t) ? t : [t]).forEach((x) => types.add(String(x)));
        nodes.push(n);
      }
      if (n["@graph"]) walk(n["@graph"]);
      for (const k of ["mainEntity", "offers", "itemListElement", "hasVariant", "isVariantOf"]) if (n[k] && typeof n[k] === "object") walk(n[k]);
    };
    Array.from(root.querySelectorAll('script[type="application/ld+json" i]')).forEach((s) => {
      try { walk(JSON.parse(s.textContent)); } catch (e) { ldErrors++; }
    });
    /* a Book with its offer is the product of a bookshop (log §464) */
    const prodNode = nodes.find((n) => isT(n, "Product", "ProductGroup") || (isT(n, "Book") && n.offers));
    let product = null;
    if (prodNode) {
      const offers = [].concat(prodNode.offers || []).flatMap((o) => (o && o.offers ? [].concat(o.offers) : [o])).filter(Boolean);
      const o = offers[0] || {};
      const price = o.price ?? o.lowPrice ?? (o.priceSpecification && o.priceSpecification.price) ?? null;
      product = {
        name: clean(prodNode.name),
        price: price != null && price !== "" ? String(price) : null,
        currency: o.priceCurrency || (o.priceSpecification && o.priceSpecification.priceCurrency) || null,
        availability: o.availability ? String(o.availability).replace(/^https?:\/\/schema\.org\//, "") : null,
        returns: !!(o.hasMerchantReturnPolicy || prodNode.hasMerchantReturnPolicy),
        shipping: !!o.shippingDetails
      };
    }
    const artNode = nodes.find((n) => isT(n, "Article", "NewsArticle", "BlogPosting", "WebPage", "TechArticle"));
    const article = artNode ? { published: artNode.datePublished || null, modified: artNode.dateModified || null } : null;
    const faq = nodes.some((n) => isT(n, "FAQPage"));
    const org = nodes.some((n) => isT(n, "Organization", "LocalBusiness", "OnlineStore", "Store"));
    const offerCount = nodes.filter((n) => isT(n, "Offer", "AggregateOffer")).length;
    /* what a non-goods page sells (software, a service, a course): the first
       typed node with offers that is not a Product or an Offer itself */
    const offNode = prodNode ? null : nodes.find((n) => n.offers && !isT(n, "Product", "ProductGroup", "Offer", "AggregateOffer"));
    let offering = null;
    if (offNode) {
      const o = [].concat(offNode.offers || []).flatMap((x) => (x && x.offers ? [].concat(x.offers) : [x])).filter(Boolean)[0] || {};
      const price = o.price ?? o.lowPrice ?? (o.priceSpecification && o.priceSpecification.price) ?? null;
      offering = {
        type: String([].concat(offNode["@type"])[0]),
        name: clean(offNode.name),
        price: price != null && price !== "" ? String(price) : null,
        currency: o.priceCurrency || (o.priceSpecification && o.priceSpecification.priceCurrency) || null
      };
    }
    return { types: [...types], errors: ldErrors, product, offering, article, faq, org, offerCount };
  }
  const LD = readLd(document);
  const { product, article } = LD;

  const microPrice = !!q('[itemprop="price"]');

  /* ---------- visible date ---------- */
  let visibleDate = null;
  const tEl = q("article time[datetime], main time[datetime], time[datetime]");
  if (tEl) visibleDate = tEl.getAttribute("datetime");
  const metaDate = meta("article:modified_time") || meta("article:published_time");

  /* ---------- main text and the first paragraph ---------- */
  const root = q("main") || q("article") || q('[role="main"]') || document.body;
  const mainText = clean(root ? root.innerText : "");
  const visible = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const paras = qa("p").filter((p) => root.contains(p) && visible(p) && !p.closest("nav,header,footer,aside,form,[role=navigation]"));
  const startAt = h1.length ? q("h1") : null;
  const after = startAt ? paras.filter((p) => startAt.compareDocumentPosition(p) & Node.DOCUMENT_POSITION_FOLLOWING) : paras;
  const firstP = (after.length ? after : paras).find((p) => words(p.textContent) >= 12) || null;
  const leadText = firstP ? clean(firstP.textContent) : "";
  const before = firstP ? (after.length ? after : paras).slice(0, (after.length ? after : paras).indexOf(firstP)).reduce((a, p) => a + words(p.textContent), 0) : null;
  const lead = { text: leadText.slice(0, 400), words: words(leadText), wordsBefore: before };

  /* ---------- buy and returns ---------- *
     AGENTS-READ-FIX-1 (log §464): three kinds of button, not two. «buy»
     sells now (Comprar, Añadir, Contratar, Reservar, La quiero…), «lead» asks
     to be called or to price (Pide presupuesto, Te llamamos, Me interesa,
     Calcula tu seguro), and none. The label must START with the action: a FAQ
     question («¿Puedo contratar…?») or a sentence with the verb inside is not
     a button. Buttons inside a FAQ, an accordion, a dialog, a recommender or
     the site's chrome are never the product's. Icon names that leak into the
     text («tote-simple», «shopping_cart») are dropped. Same rules as the
     browser read (lib/agentic-audit/browser-obstacles.ts). */
  const actionable = qa('button, a[href], input[type="submit"], [role="button"]').filter(visible);
  const ICON_WORD = /^(?:[a-z0-9]+(?:[-_][a-z0-9]+)+|icon|icono|chevron|arrow)$/;
  const cleanLabel = (s) => clean(s).split(" ").filter((w) => !ICON_WORD.test(w)).join(" ");
  const label = (el) => cleanLabel(el.innerText || el.value || el.getAttribute("aria-label") || "");
  const BUY = /^(?:\+\s*)?(?:a[ñn]adir(?! a (?:mi )?(?:lista|favoritos|deseos|comparar))|agregar(?! a (?:mi )?(?:lista|favoritos))|add\b(?! to (?:wishlist|list))|comprar\b|c[oó]mpra(?:lo|la)?\b|buy\b|reserv(?:ar|a ya|a ahora)\b|suscr[ií]b(?:ete|irme|irse)|contr[aá]t(?:a|ar|alo|ala)\b|la quiero|lo quiero|las quiero|los quiero|hazte cliente|pru[eé]ba(?:lo|la)? gratis|empieza gratis|empezar (?:la )?prueba|elige (?:tu |este )?plan|elegir (?:este )?plan|choose (?:a |your |this )?plan|select plan|pide (?:tu )?cita|pedir cita|solicitar? cita|get started|start (?:a |your )?free trial|try (?:it )?(?:for )?free|order now|book now|subscribe)|a[ñn]adir al carrito|a[ñn]adir a la (?:cesta|bolsa)|agregar al carrito|add to (?:cart|bag|basket)/i;
  const LEAD = /^(?:pide|pedir|solicita|solicitar)\s+(?:tu\s+|un\s+|el\s+)?presupuesto|^presupuesto|te llamamos|ll[aá]mame|que te llamemos|que me llamen|^me interesa|^calcula(?:r)?\s+(?:tu|el|mi)\s+(?:precio|seguro|tarifa|cuota|prima)|^(?:solicita|solicitar|pide|pedir|quiero)\s+informaci[oó]n/i;
  const NOT_BUY = /recomendador|simulador|calculadora|volver a empezar|empezar de nuevo|test\b|quiz|comparador/i;
  const AWAY = "header,nav,footer,[role=navigation],[role=banner],[role=contentinfo],details,summary,dialog,[role=dialog],[role=alertdialog],[aria-modal=true]";
  const AWAY_CLASS = /faq|accordion|acordeon|preguntas|modal|popup|pop-up|lightbox|overlay|recomendador|recommender|quiz|simulador|calculadora|cookie|consent/i;
  const awayFrom = (el) => {
    if (el.closest(AWAY)) return true;
    for (let n = el, i = 0; n && i < 8; n = n.parentElement, i++) {
      const c = typeof n.className === "string" ? n.className : (n.className && n.className.baseVal) || "";
      if (AWAY_CLASS.test(c + " " + (n.id || ""))) return true;
    }
    return false;
  };
  /* "buy", "lead" or null for one element */
  const ctaKind = (el, lab) => {
    const t = lab(el);
    if (!t || t.length >= 40 || /[¿?]/.test(t) || NOT_BUY.test(t) || awayFrom(el)) return null;
    return BUY.test(t) ? "buy" : LEAD.test(t) ? "lead" : null;
  };
  const buyEl = actionable.find((el) => ctaKind(el, label) === "buy");
  const leadEl = buyEl ? null : actionable.find((el) => ctaKind(el, label) === "lead");
  const sellCta = !!(buyEl || leadEl);
  const CHROME = "header,nav,footer,[role=navigation],[role=banner],[role=contentinfo]";
  /* ---------- prices, stock and cancellation, as the page prints them ----------
     AGENTS-READ-FIX-1 (log §464): every amount of the page body (no menu,
     footer, FAQ or dialog) with what follows it (€/kWh, al mes, /año, por
     noche) and whether «desde» comes before. score.js picks what to show. */
  function bodyText(scope) {
    if (!scope) return "";
    const c = scope.cloneNode(true);
    for (const n of Array.from(c.querySelectorAll("script,style,noscript,template,svg,iframe," + AWAY))) n.remove();
    for (const n of Array.from(c.querySelectorAll("*"))) {
      const k = typeof n.className === "string" ? n.className : "";
      if (/faq|accordion|acordeon|modal|popup|cookie|consent/i.test(k + " " + (n.id || ""))) n.remove();
    }
    // textContent glues blocks («No disponible» + «Añadir» = «disponibleAñadir»):
    // a space after every element keeps words apart. It is a clone.
    const doc = c.ownerDocument || document;
    for (const n of Array.from(c.querySelectorAll("*"))) n.appendChild(doc.createTextNode(" "));
    return clean(c.textContent);
  }
  const AMOUNT = /(?:(desde|a partir de|from|starting at)\s+)?(?:(?<![\d.,'’])(\d{1,3}(?:\.\d{3})+|\d+)(?:\s?([.,'’])(\d{1,6}))?\s?(?:€|eur\b|euros?\b)(?:\s*(?:\/|al|a la|por|per|cada)\s*(kwh|kw(?:\s*(?:y\s*|al\s*|por\s*|\/\s*)?(?:d[ií]a|mes|a[ñn]o))?|mes|a[ñn]o|d[ií]a|noche|semana|month|year))?|€\s?(\d+)(?:[.,](\d{1,2}))?)/gi;
  function pricesOf(text) {
    const out = [];
    text = String(text);
    for (const m of text.matchAll(AMOUNT)) {
      if (out.length >= 40) break;
      /* savings and rewards are amounts, not prices (same rule as lib/agentic-audit/price-read.ts) */
      const at = m.index || 0;
      if (/(?:ahorr\w*(?: hasta| de)?|descuento(?: de)?|dto\.?|regalo de|bono de|ll[eé]vate(?: hasta)?|gana(?: hasta)?)\s*$/i.test(text.slice(Math.max(0, at - 24), at))) continue;
      if (/^\s*(?:en puntos|de regalo|de descuento|de ahorro|en saldo|de saldo)\b/i.test(text.slice(at + m[0].length, at + m[0].length + 20))) continue;
      let int = m[2] || m[6], sep = m[3], dec = m[4] || m[7] || "";
      if (!m[6] && sep === "." && dec.length === 3) { int += dec; dec = ""; }
      const a = Number(int.replace(/\./g, "") + (dec ? "." + dec : ""));
      if (!Number.isFinite(a)) continue;
      const u = m[5] ? m[5].toLowerCase().replace(/\s+/g, " ").replace(/^kw\b.*(d[ií]a)/, "kw/día").replace(/^kw\b.*mes/, "kw/mes").replace(/^kw\b.*a[ñn]o/, "kw/año").replace("ano", "año").replace("dia", "día").replace("month", "mes").replace("year", "año") : null;
      out.push({ a, s: (int.replace(/\./g, "").replace(/\B(?=(\d{3})+(?!\d))/g, ".")) + (dec ? "," + dec : ""), u, from: !!m[1] });
    }
    return out;
  }
  const STOCK_OUT = /\b(?:no (?:est[aá] |se encuentra )?disponible|agotad[oa]s?|sin stock|sin existencias|fuera de stock|out of stock|sold out)\b/i;
  const STOCK_IN = /\b(?:en stock|in stock|disponible para (?:env[ií]o|entrega|recoger)|[uú]ltimas unidades|quedan \d+)\b/i;
  const CANCEL = /sin permanencia|permanencia|desistimiento|cancela(?:r|lo|la)? (?:cuando quieras|en cualquier momento)|cancel (?:anytime|at any time)|darte de baja|darse de baja/i;
  const factsText = bodyText(root);
  const pagePrices = pricesOf(factsText);
  const stockText = STOCK_OUT.test(factsText) && !STOCK_IN.test(factsText) ? "out" : STOCK_IN.test(factsText) ? "in" : null;
  const cancelInfo = CANCEL.test(factsText) ? "text" : qa("a[href]").some((a) => CANCEL.test(label(a)) || /permanencia|desistimiento|cancelaci/i.test(a.getAttribute("href") || "")) ? "link" : null;
  const RET = /(devoluci|devolver|cambios y devol|returns?\b|refund)/i;
  const retEl = qa("a[href]").find((a) => RET.test(label(a)) || /devoluc|returns|refund/i.test(a.getAttribute("href") || ""));

  /* ---------- menu and footer links, for the llms.txt draft ----------
     Real links with their own text, same origin. Account, basket and search
     are left out; legal pages go to the «Optional» section. */
  const SKIP_LINK = /(login|signin|sign-in|registro|register|cuenta|account|mi-area|cart|cesta|carrito|checkout|wishlist|favoritos|buscar|search)/i;
  const LEGAL_LINK = /(privacidad|privacy|cookies|aviso-legal|legal|condiciones|terminos|terms|accesibilidad)/i;
  function siteLinks() {
    const seen = new Set([location.pathname.replace(/\/+$/, "") || "/"]);
    const out = { main: [], footer: [], legal: [] };
    for (const a of qa("header a[href], nav a[href], [role=navigation] a[href], [role=banner] a[href], footer a[href], [role=contentinfo] a[href]")) {
      let u; try { u = new URL(a.getAttribute("href"), location.href); } catch (e) { continue; }
      if (u.origin !== location.origin || !/^https?:$/.test(u.protocol)) continue;
      const key = u.pathname.replace(/\/+$/, "") || "/";
      const text = clean(a.innerText || a.textContent || a.getAttribute("aria-label") || a.getAttribute("title") || "").replace(/[[\]]/g, "").replace(/(?<=\p{Ll}|\s)(Nuevo|New)$/u, "").trim();
      if (seen.has(key) || text.length < 2 || text.length > 48 || SKIP_LINK.test(key)) continue;
      seen.add(key);
      const item = { text, url: u.origin + u.pathname };
      if (LEGAL_LINK.test(key) || LEGAL_LINK.test(text)) out.legal.push(item);
      else if (a.closest("footer,[role=contentinfo]")) out.footer.push(item);
      else out.main.push(item);
    }
    /* a mega menu lists dozens of children: take one link per section first */
    const spread = (list, n) => {
      const segs = list.map((x) => new URL(x.url).pathname.split("/").filter(Boolean));
      let d = 0; while (segs.length > 1 && segs.every((s) => s[d] && s[d] === segs[0][d])) d++;
      const first = [], rest = [], used = new Set();
      list.forEach((x, i) => { const k = segs[i][d] || ""; (used.has(k) ? rest : (used.add(k), first)).push(x); });
      return first.concat(rest).slice(0, n);
    };
    return { main: spread(out.main, 12), footer: spread(out.footer, 8), legal: out.legal.slice(0, 4) };
  }
  const links = siteLinks();
  const siteName = meta("og:site_name") || meta("application-name") || null;

  /* ---------- same-origin files ---------- */
  /* A timeout, a 429 or a 5xx is not «missing»: ask once more before saying the
     file is absent (a llms.txt that answers 200 was read as absent while many
     pages were reviewed at once, 2026-11-02). */
  const retried = async (path) => {
    const r = await get(path);
    return r.status === 0 || r.status === 429 || r.status >= 500 ? get(path, { ms: 6000 }) : r;
  };
  const [robots, llms, head] = await Promise.all([retried("/robots.txt"), retried("/llms.txt"), get(location.href, { method: "HEAD" })]);
  const xRobots = head.headers ? clean(head.headers.get("x-robots-tag") || "").toLowerCase() : "";
  const looksHtml = (r) => /html/i.test(r.type) || /^\s*<(!doctype|html)/i.test(r.text);

  /* ---------- what this page sells, and the shop when it sells nothing ----------
     EXT-SHOP-FIND-1, SHOP-DETECT-2 (log §407). Same idea as the console's
     find-product.ts, without any LLM. A page sells when it declares a product
     or an offer, is a pricing page, or prints a price next to a buy button in
     its body. A home page, or a product listing that sells nothing itself,
     looks for one page that does: on a shop window a product (catalogue,
     product links and cards, the link before a printed price, the sitemap);
     elsewhere the pricing page from the menu first («Precios», «Tarifas»,
     «Planes»), then any selling page. At most two candidates are read, same
     origin only, with the site's own cookies: big shops sit behind a bot
     check, and without the visitor's pass they answer a challenge page. */
  const PRICE_TXT = /(?:\d{1,3}(?:[.\s]\d{3})+|\d+)(?:[,.]\d{1,2})?\s?(?:€|EUR\b)|€\s?\d+|\$\s?\d+(?:[.,]\d{2})?|\d+(?:[.,]\d{2})?\s?(?:USD|\$)/g;
  const PRICING_PATH = /\/(?:[\w%-]*[-_])?(?:precios?|pricing|prices|planes|plans|tarifas?)(?:[-_][\w%-]*)?\/?$/i;
  const EXACT_PRICING = /\/(?:precios?|pricing|prices|planes|plans|tarifas?)\/?$/i;
  const PRICING_TEXT = /^(?:ver |nuestr[oa]s |consulta (?:los |las )?)?(?:precios?|pricing|prices|tarifas?|planes|plans)\b/i;
  const SELL_PATH = /\/(?:reservar?|reservas|cita|citas|pedir-cita|pide-cita|cita-previa|booking|book|appointment)(?:\/|$)|\/(?:cursos?|courses?|formacion|masters?)\/[^/]+|\/(?:suscripci[oó]n|subscribe|subscription|membres[ií]a|membership|hazte-socio)\/?$|\/(?:servicios?|services?)\/[^/]+|\/(?:presupuesto|quote)\/?$|\/(?:contrata(?:r|cion)?|seguros?)(?:-[^/]*)?(?:\/|$)/i;
  const PRODUCT_PATH = /\/(?:products?|productos?|p|dp|item|articulo)\/[^/?#]+\/?$|\/\d+-[a-z0-9-]+\.html$|\/[^/?#]*\d[^/?#]*\/p\/?$|-p-?\d+\.html$/i;
  const CARD = /\bproduct(?:[-_]?(?:item|card|tile|link|name|title|photo|image|url|box))?\b/i;
  const isCard = (a) => CARD.test(a.className && a.className.baseVal == null ? a.className : "") || CARD.test(a.id || "") || a.hasAttribute("data-product-id") || a.hasAttribute("data-productid") || a.hasAttribute("data-product");
  const pricesIn = (text) => (String(text).match(PRICE_TXT) || []).length;
  /* leaf elements that print a price: product cards in a shop window */
  const priceLeaves = (doc) => Array.from(doc.querySelectorAll("span,div,p,strong,b,ins,bdi")).filter((el) => !el.children.length && el.textContent.length < 40 && pricesIn(el.textContent) && !el.closest(CHROME)).slice(0, 60);
  const ARTICLE_T = ["Article", "NewsArticle", "BlogPosting", "TechArticle"];
  function sellsPage(ld, path, priceCount, cta, extra) {
    if (ld.product || ld.offerCount || ld.offering || extra) return true;
    if (ld.types.some((t) => ARTICLE_T.includes(t))) return false;
    return PRICING_PATH.test(path) || (priceCount > 0 && cta);
  }
  const herePrices = pricesIn(mainText);
  const cartHere = !!(buyEl && /(carrito|cesta|comprar|cart|bag|basket|buy)/i.test(label(buyEl)));
  /* the home, a locale root (/es/, /es-es/) or a top section (/hogar,
     /particulares): pages that point to the shop rather than sell themselves */
  const segs = location.pathname.split("/").filter(Boolean);
  const isHome = segs.length === 0 || (segs.length === 1 && !(LD.types || []).some((t) => ARTICLE_T.includes(t)));
  const allLinks = qa("a[href]");
  const cardLinks = allLinks.filter(isCard);
  const leaves = priceLeaves(document);
  /* a shop window (cards, several prices) is not a sales page by its prices
     and buttons alone: it is where the products are linked from */
  const window_ = !product && !LD.offering && (cardLinks.length >= 3 || leaves.length >= 4) && !PRICING_PATH.test(location.pathname);
  const sellsHere = sellsPage(LD, location.pathname, window_ ? 0 : herePrices, !window_ && sellCta, microPrice || (og.type && /product/i.test(og.type)) || cartHere);
  const listing = window_ && !sellsHere && !isHome;
  const storefront = cartHere || window_;

  async function findShop() {
    const SHOP_WORD = /^(tienda( online)?|shop|store|productos|cat[aá]logo|comprar|dispositivos|m[oó]viles|ofertas)$/i;
    const SHOP_PATH = /^\/(tienda|shop|store|productos|catalogo|dispositivos|moviles|collections\/all|ofertas)\/?$/i;
    const same = (h) => { try { const u = new URL(h, location.href); return u.origin === location.origin && u.pathname !== location.pathname && u.pathname.length > 1 ? u : null; } catch (e) { return null; } };
    const tries = [];
    const add = (u, source, kind) => { if (u && !tries.some((x) => x[0] === u.pathname + u.search)) tries.push([u.pathname + u.search, source, kind]); };
    const firstOf = (list, src, kind) => { for (const u of list) if (u) return add(u, src, kind); };
    const json = (r) => { try { return r.status === 200 && /json/i.test(r.type) ? JSON.parse(r.text) : null; } catch (e) { return null; } };
    const sp = json(await get("/products.json?limit=1"));
    if (sp && sp.products && sp.products[0] && sp.products[0].handle) add(same("/products/" + encodeURIComponent(sp.products[0].handle)), "catalog", "product");
    if (!tries.length) {
      const wc = json(await get("/wp-json/wc/store/v1/products?per_page=1"));
      if (Array.isArray(wc) && wc[0] && wc[0].permalink) add(same(wc[0].permalink), "catalog", "product");
    }
    const linkU = (a) => same(a.getAttribute("href"));
    const productLinks = () => {
      firstOf(allLinks.map((a) => { const u = linkU(a); return u && PRODUCT_PATH.test(u.pathname) ? u : null; }), "link", "product");
      firstOf(cardLinks.map(linkU), "link", "product");
      /* the link of the card around a printed price */
      firstOf(leaves.map((el) => { for (let n = el, i = 0; n && i < 7; n = n.parentElement, i++) { const a = n.matches && n.matches("a[href]") ? n : n.querySelector && n.querySelector("a[href]"); const u = a && linkU(a); if (u) return u; } return null; }), "link", "product");
    };
    const pricingLinks = () => {
      const scored = allLinks.map((a) => { const u = linkU(a); if (!u) return null; const t = label(a); const r = EXACT_PRICING.test(u.pathname) || (t.length <= 40 && PRICING_TEXT.test(t)) ? 0 : PRICING_PATH.test(u.pathname) ? 1 : null; return r == null ? null : [r, u]; }).filter(Boolean);
      scored.sort((x, y) => x[0] - y[0]);
      firstOf(scored.map((x) => x[1]), "menu", "pricing");
    };
    const sellLinks = () => firstOf(allLinks.map((a) => { const u = linkU(a); return u && SELL_PATH.test(u.pathname) ? u : null; }), "menu", "sell");
    const shopMenu = () => { const m = allLinks.find((a) => { const u = linkU(a); return u && (SHOP_WORD.test(label(a)) || SHOP_PATH.test(u.pathname)); }); if (m) add(linkU(m), "menu", "shop"); };
    async function sitemapProduct() {
      /* every sitemap robots.txt names (big shops split them by section), and
         one level of sitemap index, preferring a child that names products.
         At most four sitemap files are read; .gz is skipped. */
      const locs = (t) => [...t.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1].replace(/&amp;/g, "&"));
      const sameAny = (h) => { try { const u = new URL(h, location.href); return u.origin === location.origin && !/\.gz$/i.test(u.pathname) ? u.pathname + u.search : null; } catch (e) { return null; } };
      const queue = ((robots.status === 200 && [...robots.text.matchAll(/^\s*sitemap:\s*(\S+)/gim)].map((m) => sameAny(m[1])).filter(Boolean)) || []);
      if (!queue.length) queue.push("/sitemap.xml");
      const PRODUCTISH = /product|producto|articulo|item|food|tienda|shop|catalog|tecno|p-\d/i;
      const before = tries.length;
      for (let read = 0; read < 4 && queue.length && tries.length === before; read++) {
        const r = await get(queue.shift(), { max: 3000000, ms: 6000, credentials: "same-origin" });
        if (r.status !== 200) continue;
        if (/<sitemapindex/i.test(r.text)) {
          const kids = locs(r.text).map(sameAny).filter(Boolean);
          const pick = kids.find((k) => PRODUCTISH.test(k)) || kids[0];
          if (pick) queue.unshift(pick);
        } else if (/<urlset/i.test(r.text)) {
          add(locs(r.text).map(same).find((u) => u && PRODUCT_PATH.test(u.pathname)), "sitemap", "product");
        }
      }
    }
    if (storefront || listing) {
      productLinks();
      if (!listing) shopMenu();
      if (!tries.some((x) => x[2] === "product")) await sitemapProduct();
      if (!listing) { pricingLinks(); sellLinks(); }
    } else {
      pricingLinks();
      productLinks();
      sellLinks();
      if (!tries.length) await sitemapProduct();
      shopMenu();
    }
    /* two reads at most, and the second of another kind than the first */
    const picks = tries.length ? [tries[0]].concat(tries.filter((x) => x[2] !== tries[0][2]).slice(0, 1)) : [];
    for (const [path, source] of picks) {
      const r = await get(path, { max: 3000000, ms: 6000, credentials: "same-origin" });
      if (r.status !== 200 || !/html/i.test(r.type)) continue;
      const doc = new DOMParser().parseFromString(r.text, "text/html");
      const ld = readLd(doc);
      const lab = (el) => clean(el.textContent || el.value || el.getAttribute("aria-label") || "");
      const acts = Array.from(doc.querySelectorAll('button, a[href], input[type="submit"], [role="button"]'));
      const lab2 = (el) => cleanLabel(lab(el));
      const b = acts.find((el) => ctaKind(el, lab2) === "buy");
      const l = b ? null : acts.find((el) => ctaKind(el, lab2) === "lead");
      const cta = !!(b || l);
      const body = doc.querySelector("main") || doc.querySelector("article") || doc.body;
      const priceCount = pricesIn(body ? body.textContent : "");
      const m = (n) => { const el = doc.querySelector(`meta[property="${n}" i], meta[name="${n}" i]`); return el ? el.getAttribute("content") : null; };
      const micro = !!doc.querySelector('[itemprop="price"]');
      const ogT = m("og:type");
      const pathname = new URL(path, location.href).pathname;
      /* a listing is not the page to judge: it needs a product or an offer in its data */
      const isList = !ld.product && !ld.offering && (Array.from(doc.querySelectorAll("a[href]")).filter(isCard).length >= 3 || priceLeaves(doc).length >= 4) && !PRICING_PATH.test(pathname);
      if (isList && !ld.offerCount) continue;
      if (!sellsPage(ld, pathname, priceCount, cta, micro || (ogT && /product/i.test(ogT)))) continue;
      return {
        state: "found", path, source,
        facts: {
          url: new URL(path, location.href).href, path, ld,
          og: { type: ogT, price: m("product:price:amount") || m("og:price:amount") },
          microPrice: micro,
          buy: b ? lab2(b).slice(0, 40) : null,
          ask: l ? lab2(l).slice(0, 40) : null,
          h1: Array.from(doc.querySelectorAll("h1")).map((h) => clean(h.textContent)).filter(Boolean),
          title: clean((doc.querySelector("title") || {}).textContent || ""),
          prices: pricesOf(bodyText(body)),
          stockText: (() => { const t = bodyText(body); return STOCK_OUT.test(t) && !STOCK_IN.test(t) ? "out" : STOCK_IN.test(t) ? "in" : null; })(),
          cancelInfo: CANCEL.test(bodyText(body)) ? "text" : null,
          priceSeen: priceCount > 0,
          sellCta: cta,
          pricingPath: PRICING_PATH.test(pathname),
          returnsLink: Array.from(doc.querySelectorAll("a[href]")).some((a) => RET.test(lab(a)) || /devoluc|returns|refund/i.test(a.getAttribute("href") || ""))
        }
      };
    }
    return { state: "none" };
  }
  /* AGENTS-READ-FIX-1 (log §464): the root page and a shop window are never
     the page to judge, even with prices and «Añadir» buttons on them: the
     agents score comes from one product or pricing page found from here. */
  const rootPage = segs.length === 0;
  const notProduct = !product && !LD.offering && (rootPage || window_);
  const shop = (!sellsHere && (isHome || listing)) || notProduct ? await findShop() : null;

  return {
    v: 1,
    url: location.href,
    host: location.hostname.replace(/^www\./, ""),
    path: location.pathname + location.search,
    title,
    description,
    robotsMeta,
    xRobots,
    canonical,
    lang,
    h1,
    og,
    ld: LD,
    microPrice,
    visibleDate: visibleDate || metaDate || (article && (article.modified || article.published)) || null,
    lead,
    shop,
    listing,
    priceSeen: !window_ && herePrices > 0,
    sellCta: !window_ && sellCta,
    pricingPath: PRICING_PATH.test(location.pathname),
    links,
    siteName,
    words: words(mainText),
    buy: buyEl ? label(buyEl).slice(0, 40) : null,
    ask: leadEl ? label(leadEl).slice(0, 40) : null,
    prices: pagePrices,
    stockText,
    cancelInfo,
    rootPage,
    notProduct,
    returnsLink: !!retEl,
    robots: { status: robots.status, text: robots.status === 200 && !looksHtml(robots) ? robots.text : null },
    llms: { status: llms.status, ok: llms.status === 200 && !looksHtml(llms) && llms.text.trim().length > 20 },
    ms: Math.round(performance.now() - T0),
    at: new Date().toISOString()
  };
}
if (typeof module !== "undefined") module.exports = { collectPageFacts };
