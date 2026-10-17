import { flattenNodes, parseJsonLd } from "@/lib/agentic-audit/html-signals";
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
 * caught by `isProductPage` on the fetched page.
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
