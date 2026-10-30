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
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 4000);
    try {
      const r = await fetch(path, { credentials: "omit", cache: "no-store", redirect: "follow", signal: ctl.signal, ...opts });
      const type = r.headers.get("content-type") || "";
      const text = opts.method === "HEAD" ? "" : (await r.text()).slice(0, 200000);
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

  /* ---------- JSON-LD ---------- */
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
  qa('script[type="application/ld+json" i]').forEach((s) => {
    try { walk(JSON.parse(s.textContent)); } catch (e) { ldErrors++; }
  });
  const isT = (n, ...ts) => [].concat(n["@type"] || []).some((x) => ts.includes(String(x)));
  const prodNode = nodes.find((n) => isT(n, "Product", "ProductGroup"));
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

  /* ---------- buy and returns ---------- */
  const actionable = qa('button, a[href], input[type="submit"], [role="button"]').filter(visible);
  const label = (el) => clean(el.innerText || el.value || el.getAttribute("aria-label") || "");
  const BUY = /(añadir al carrito|añadir a la cesta|agregar al carrito|comprar( ahora| ya)?$|^comprar|add to (cart|bag|basket)|buy( it)? now|reservar|suscríbete|suscribirme|contratar)/i;
  const buyEl = actionable.find((el) => BUY.test(label(el)) && label(el).length < 40);
  const RET = /(devoluci|devolver|cambios y devol|returns?\b|refund)/i;
  const retEl = qa("a[href]").find((a) => RET.test(label(a)) || /devoluc|returns|refund/i.test(a.getAttribute("href") || ""));

  /* ---------- same-origin files ---------- */
  const [robots, llms, head] = await Promise.all([get("/robots.txt"), get("/llms.txt"), get(location.href, { method: "HEAD" })]);
  const xRobots = head.headers ? clean(head.headers.get("x-robots-tag") || "").toLowerCase() : "";
  const looksHtml = (r) => /html/i.test(r.type) || /^\s*<(!doctype|html)/i.test(r.text);

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
    ld: { types: [...types], errors: ldErrors, product, article, faq, org, offerCount },
    microPrice,
    visibleDate: visibleDate || metaDate || (article && (article.modified || article.published)) || null,
    lead,
    words: words(mainText),
    buy: buyEl ? label(buyEl).slice(0, 40) : null,
    returnsLink: !!retEl,
    robots: { status: robots.status, text: robots.status === 200 && !looksHtml(robots) ? robots.text : null },
    llms: { status: llms.status, ok: llms.status === 200 && !looksHtml(llms) && llms.text.trim().length > 20 },
    ms: Math.round(performance.now() - T0),
    at: new Date().toISOString()
  };
}
if (typeof module !== "undefined") module.exports = { collectPageFacts };
