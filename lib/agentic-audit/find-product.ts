import { flattenNodes, parseJsonLd, PATH_KINDS, PRICING_PATH } from "@/lib/agentic-audit/html-signals";
import { parseJsonObject } from "@/lib/agentic-audit/interop";
import { isSameOrSubdomain, normalizeDomain } from "@/lib/domains/brand-domain";
import { parseSitemap } from "@/lib/web-audit/sitemap";

/**
 * AGENTIC-COMMERCE-1 Fase 2a (log §323): picks ONE product page of the store
 * from bytes the audit already downloaded. Pure: no network.
 *
 * Founder-approved scope (2026-10-17): the console audit may fetch exactly
 * one page more than the free checker, the product page found here. Nothing
 * here follows a link or opens a second sitemap, so the request list stays
 * fixed plus one; this is not a crawler (`.claude/rules/agentic-audit.md`).
 *
 * Order, first hit wins (the first product, not «the best»):
 * 1. The public catalogue (Shopify `/products.json`, WooCommerce Store API).
 * 2. `<loc>` entries of `/sitemap.xml` whose path looks like a product page.
 *    A sitemap index is not opened.
 * 3. The page itself: a Product in its JSON-LD with a `url`, or a link whose
 *    path looks like a product page.
 *
 * Every candidate must be https on the store's domain or a subdomain, and
 * never the page we already have. A wrong guess costs one request and is
 * caught by `classifyOffer` on the fetched page.
 *
 * Log §325: when there is no product page, `findSellCandidate` looks for the
 * page where the site sells something else, in the same bytes: a pricing or
 * plans page first, then a service, course, event, booking or subscription
 * page. It is the same single extra request, never a second one.
 */

export type ProductSource = "catalog" | "sitemap" | "home";
export type ProductCandidate = { url: string; source: ProductSource };

export type FindProductInput = {
  /** `https://host` of the page we read. */
  origin: string;
  baseDomain: string;
  /** The page already read, after redirects. Never returned as a candidate. */
  currentUrl: string;
  feedBody: string | null;
  feedPlatform: string | null;
  sitemapBody: string | null;
  pageHtml: string | null;
};

/**
 * Paths that usually hold one product: Shopify `/products/x`, WooCommerce
 * `/product/x` or `/producto/x`, `/p/x`, Amazon-like `/dp/x` and PrestaShop
 * `/123-nombre.html`. A collection like `/products` alone does not match.
 */
const PRODUCT_PATH =
  /\/(?:products?|productos?|p|dp|item|articulo)\/[^/?#]+\/?$|\/\d+-[a-z0-9-]+\.html$/i;

function onStore(raw: string, base: URL, baseDomain: string): URL | null {
  let url: URL;
  try {
    url = new URL(raw, base);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (url.username || url.password) return null;
  if (!isSameOrSubdomain(normalizeDomain(url.hostname), baseDomain)) return null;
  url.protocol = "https:";
  url.hash = "";
  return url;
}

function sameAs(a: URL, b: string): boolean {
  try {
    const other = new URL(b);
    const strip = (u: URL) => `${normalizeDomain(u.hostname)}${u.pathname.replace(/\/$/, "")}`;
    return strip(a) === strip(other);
  } catch {
    return false;
  }
}

function fromCatalog(input: FindProductInput, base: URL): string | null {
  if (!input.feedBody) return null;
  if (input.feedPlatform === "Shopify") {
    const parsed = parseJsonObject(input.feedBody);
    const products = Array.isArray(parsed?.products) ? (parsed.products as unknown[]) : [];
    for (const product of products) {
      const handle = (product as { handle?: unknown } | null)?.handle;
      if (typeof handle === "string" && /^[\p{L}\p{N}][\p{L}\p{N}._%-]{0,200}$/u.test(handle)) {
        return `${input.origin}/products/${encodeURIComponent(handle)}`;
      }
    }
    return null;
  }
  if (input.feedPlatform === "WooCommerce") {
    let parsed: unknown;
    try {
      parsed = JSON.parse(input.feedBody);
    } catch {
      return null;
    }
    for (const product of Array.isArray(parsed) ? parsed : []) {
      const permalink = (product as { permalink?: unknown } | null)?.permalink;
      if (typeof permalink === "string") {
        const url = onStore(permalink, base, input.baseDomain);
        if (url) return url.toString();
      }
    }
  }
  return null;
}

function fromSitemap(input: FindProductInput, base: URL): string | null {
  const report = parseSitemap(input.sitemapBody);
  if (!report || report.kind !== "urlset") return null;
  for (const loc of report.locs) {
    const url = onStore(loc, base, input.baseDomain);
    if (url && PRODUCT_PATH.test(url.pathname)) return url.toString();
  }
  return null;
}

const HREF_RE = /<a\b[^>]*?\bhref\s*=\s*["']([^"'#][^"']*)["']/gi;

function fromPage(input: FindProductInput, base: URL): string | null {
  if (!input.pageHtml) return null;
  for (const node of flattenNodes(parseJsonLd(input.pageHtml))) {
    const types = (Array.isArray(node["@type"]) ? node["@type"] : [node["@type"]]).filter(
      (t): t is string => typeof t === "string"
    );
    if (!types.some((t) => /^(?:https?:\/\/schema\.org\/)?product(?:group)?$/i.test(t))) continue;
    if (typeof node.url !== "string") continue;
    const url = onStore(node.url, base, input.baseDomain);
    if (url && !sameAs(url, input.currentUrl)) return url.toString();
  }
  for (const match of input.pageHtml.matchAll(HREF_RE)) {
    const raw = match[1].replace(/&amp;/g, "&").trim();
    const url = onStore(raw, base, input.baseDomain);
    if (url && PRODUCT_PATH.test(url.pathname) && !sameAs(url, input.currentUrl)) return url.toString();
  }
  return null;
}

export type SellCandidate = { url: string; source: "sitemap" | "home" };

/**
 * A menu entry that names the price list: «Precios», «Pricing», «Tarifas»,
 * «Planes y precios». It can point anywhere (`/fibra-movil`), so the text
 * counts as much as a pricing path (SHOP-DETECT-2, log §407).
 */
const PRICING_TEXT = /^(?:ver |nuestr[oa]s |consulta (?:los |las )?)?(?:precios?|pricing|prices|tarifas?|planes|plans)\b/i;

/** Old exact pricing path: the whole last segment is the word. */
const EXACT_PRICING_PATH = /\/(?:precios?|pricing|prices|planes|plans|tarifas?)\/?$/i;

/**
 * Rank of a path for `findSellCandidate`. `null` = not a selling path.
 * 0 a pricing page by its path (`/precios`), 1 a link whose text names the
 * prices or whose path has a pricing word in it, then booking, course, subscription and service. An event page
 * goes last: a home links «/eventos/black-friday» or a webinar far more often
 * than it sells tickets (SHOP-DETECT-2, log §407).
 */
const KIND_RANK: Record<string, number> = { booking: 2, course: 3, subscription: 4, service: 5, event: 6 };
function sellRank(pathname: string, text = ""): number | null {
  if (EXACT_PRICING_PATH.test(pathname)) return 0;
  if ((text.length <= 40 && PRICING_TEXT.test(text)) || PRICING_PATH.test(pathname)) return 1;
  let best: number | null = null;
  for (const [kind, re] of PATH_KINDS) {
    const r = KIND_RANK[kind];
    if (r !== undefined && re.test(pathname) && (best === null || r < best)) best = r;
  }
  return best;
}

/** Every `<a href>` of the page with its visible text, in document order. */
const ANCHOR_RE = /<a\b([^>]*?)\bhref\s*=\s*["']([^"'#][^"']*)["']([^>]*)>([\s\S]{0,600}?)<\/a>/gi;
type Anchor = { href: string; attrs: string; text: string };
function anchors(html: string): Anchor[] {
  const out: Anchor[] = [];
  for (const m of html.matchAll(ANCHOR_RE)) {
    out.push({
      href: m[2].replace(/&amp;/g, "&").trim(),
      attrs: `${m[1]} ${m[3]}`,
      text: m[4].replace(/<[^>]+>/g, " ").replace(/&nbsp;|&#160;/g, " ").replace(/\s+/g, " ").trim()
    });
  }
  return out;
}

/**
 * Log §325: the best selling page that is not a product page, from the page's
 * own links first (what the site puts in front of a visitor) and then the
 * sitemap. Lowest rank wins; ties keep the first seen.
 */
export function findSellCandidate(
  input: Omit<FindProductInput, "feedBody" | "feedPlatform">,
  maxRank = Infinity
): SellCandidate | null {
  let base: URL;
  try {
    base = new URL(input.currentUrl);
  } catch {
    return null;
  }
  let best: (SellCandidate & { rank: number }) | null = null;
  const consider = (raw: string, source: SellCandidate["source"], text = "") => {
    const url = onStore(raw, base, input.baseDomain);
    if (!url || sameAs(url, input.currentUrl) || FILE_PATH.test(url.pathname)) return;
    const rank = sellRank(url.pathname, text);
    if (rank === null || rank > maxRank || (best && best.rank <= rank)) return;
    best = { url: url.toString(), source, rank };
  };
  if (input.pageHtml) for (const a of anchors(input.pageHtml)) consider(a.href, "home", a.text);
  const report = parseSitemap(input.sitemapBody);
  if (report && report.kind === "urlset") for (const loc of report.locs) consider(loc, "sitemap");
  const found = best as (SellCandidate & { rank: number }) | null;
  return found ? { url: found.url, source: found.source } : null;
}

/** A price as shops print it: «31,41 €», «€ 9.99», «1.299,00 EUR». */
const CARD_PRICE = /(?:\d{1,3}(?:[.\s]\d{3})*|\d+)[,.]\d{2}\s?(?:€|&euro;|EUR)|€\s?\d+[,.]\d{2}/g;
/** A product card's own link: `class="product-item-link"`, `data-product-id`, `product-tile`… */
const CARD_ATTR = /(?:class|id|data-[\w-]+)\s*=\s*["'][^"']*\bproduct(?:[-_]?(?:item|card|tile|link|name|title|photo|image|url|box))?\b[^"']*["']|\bdata-product(?:-id|id)?\b/i;

/**
 * SHOP-DETECT-2 (log §407): whether the page looks like a shop window — a
 * store platform, an add-to-cart or product cards. Printed prices alone do
 * not count: a telco or a theme park prints them too, and there the price
 * list in the menu is the page to judge.
 * On such a page a product is the page to judge; elsewhere (software, a
 * telco, a clinic) the pricing page is, and a «/product/x» feature page in
 * the sitemap must not win over the «Precios» link in the menu.
 */
export function looksLikeStorefront(html: string | null, platform: string | null, addToCart: boolean): boolean {
  if (platform || addToCart) return true;
  if (!html) return false;
  return anchors(html).filter((a) => CARD_ATTR.test(a.attrs)).length >= 3;
}

/**
 * SHOP-DETECT-2 (log §407): a product link from the shop window itself, for
 * stores whose product URLs carry no `/p/` or `/product/` (Magento, custom
 * platforms): first a product card's own link, then the link closest before a
 * printed price. Only on a storefront; a wrong guess is caught by
 * `classifyOffer` on the fetched page.
 */
/** Help, account, basket and legal pages: never a product, whatever sits next to them. */
const NOT_A_PRODUCT =
  /(?:^|[/_-])(?:faq|ayuda|help|soporte|support|contacto|contact|cuenta|account|login|registro|carrito|cart|cesta|checkout|wishlist|favoritos|blog|noticias|legal|aviso|politica|privacidad|privacy|cookies|condiciones|terminos|terms|envios?|shipping|devoluciones|returns|tiendas|stores|sobre-nosotros|about)(?:[/?_-]|$)/i;

/** A file, not a page: a PDF price list or an image is never the page to judge. */
const FILE_PATH = /\.(?:pdf|jpe?g|png|gif|webp|svg|zip|docx?|xlsx?|mp4|mp3)$/i;

function fromShopWindow(input: FindProductInput, base: URL): string | null {
  if (!input.pageHtml) return null;
  const ok = (url: URL | null): url is URL =>
    !!url &&
    url.pathname.length > 1 &&
    !NOT_A_PRODUCT.test(url.pathname) &&
    !FILE_PATH.test(url.pathname) &&
    !sameAs(url, input.currentUrl);
  for (const a of anchors(input.pageHtml)) {
    if (!CARD_ATTR.test(a.attrs)) continue;
    const url = onStore(a.href, base, input.baseDomain);
    if (ok(url)) return url.toString();
  }
  const html = input.pageHtml;
  for (const m of html.matchAll(CARD_PRICE)) {
    const back = html.slice(Math.max(0, (m.index ?? 0) - 3000), m.index);
    const hrefs = [...back.matchAll(/<a\b[^>]*?\bhref\s*=\s*["']([^"'#][^"']*)["']/gi)];
    for (let i = hrefs.length - 1; i >= 0 && i >= hrefs.length - 2; i--) {
      const url = onStore(hrefs[i][1].replace(/&amp;/g, "&").trim(), base, input.baseDomain);
      if (ok(url)) return url.toString();
    }
  }
  return null;
}

export type DiscoveryCandidate = { url: string; source: ProductSource };

/**
 * SHOP-DETECT-2 (log §407): the ONE extra page the console may read
 * (`.claude/rules/agentic-audit.md`), chosen in an order that depends on what
 * the page is. Still one candidate and one fetch: only the order changed.
 *
 * - On a storefront: catalogue, a product from the page (JSON-LD, product
 *   path, product card, the link before a price), a product in the sitemap,
 *   then any selling page.
 * - Elsewhere: catalogue, the pricing page linked from the page, a product
 *   from the page or the sitemap, a pricing page from the sitemap, the link
 *   before a printed price, then any other selling page.
 */
export function findDiscoveryCandidate(input: FindProductInput & { storefront: boolean }): DiscoveryCandidate | null {
  let base: URL;
  try {
    base = new URL(input.currentUrl);
  } catch {
    return null;
  }
  const keep = (url: string | null, source: ProductSource): DiscoveryCandidate | null =>
    url && !sameAs(new URL(url), input.currentUrl) ? { url, source } : null;
  const catalog = () => keep(fromCatalog(input, base), "catalog");
  const page = () => keep(fromPage(input, base), "home");
  const sitemap = () => keep(fromSitemap(input, base), "sitemap");
  const sell = (maxRank?: number) => findSellCandidate(input, maxRank);
  if (input.storefront) {
    return catalog() ?? page() ?? keep(fromShopWindow(input, base), "home") ?? sitemap() ?? sell();
  }
  const pricing = sell(1);
  return (
    catalog() ??
    (pricing?.source === "home" ? pricing : null) ??
    page() ??
    sitemap() ??
    pricing ??
    keep(fromShopWindow(input, base), "home") ??
    sell()
  );
}

export function findProductCandidate(input: FindProductInput): ProductCandidate | null {
  let base: URL;
  try {
    base = new URL(input.currentUrl);
  } catch {
    return null;
  }
  const keep = (url: string | null, source: ProductSource): ProductCandidate | null =>
    url && !sameAs(new URL(url), input.currentUrl) ? { url, source } : null;
  return (
    keep(fromCatalog(input, base), "catalog") ??
    keep(fromSitemap(input, base), "sitemap") ??
    keep(fromPage(input, base), "home")
  );
}
