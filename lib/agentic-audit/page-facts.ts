import type { AgenticPageFacts } from "@/lib/agentic-audit/api-contract";
import { flattenNodes, parseJsonLd } from "@/lib/agentic-audit/html-signals";

/**
 * AGENTIC-COMMERCE-1: a few literal facts read from the page, so the
 * checker can say what it found on THIS store («Zapatilla Trail Pro»,
 * «89,95 EUR»), not just that it found something. Pure.
 *
 * Every value is text the store itself published, read the same way an
 * agent without JavaScript reads it. A value we cannot read stays `null`
 * and the checker says nothing about it. Values are plain text, capped and
 * stripped of markup: they come from markup we do not control.
 */

const MAX_LEN = 80;

type JsonNode = Record<string, unknown>;

function clean(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const text = String(value)
    .replace(/<[^>]*>/g, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;|&apos;/gi, "'")
    .replace(/&nbsp;/gi, " ")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return null;
  return text.length > MAX_LEN ? `${text.slice(0, MAX_LEN - 1).trimEnd()}…` : text;
}

function typesOf(node: JsonNode): string[] {
  const t = node["@type"];
  return (Array.isArray(t) ? t : [t])
    .filter((x): x is string => typeof x === "string")
    .map((x) => x.replace(/^https?:\/\/schema\.org\//i, "").toLowerCase());
}

function first<T>(list: unknown, pick: (v: unknown) => T | null): T | null {
  for (const v of Array.isArray(list) ? list : [list]) {
    const out = pick(v);
    if (out !== null) return out;
  }
  return null;
}

function metaContent(html: string, property: string): string | null {
  const re = new RegExp(`<meta\\b[^>]*(?:property|name)\\s*=\\s*["']${property.replace(/[:.]/g, "\\$&")}["'][^>]*>`, "i");
  const tag = html.match(re)?.[0];
  return tag ? clean(tag.match(/content\s*=\s*["']([^"']*)["']/i)?.[1]) : null;
}

const AVAILABILITY: Record<string, string> = {
  instock: "En stock",
  instoreonly: "Sólo en tienda",
  limitedavailability: "Pocas unidades",
  onlineonly: "Sólo online",
  outofstock: "Agotado",
  soldout: "Agotado",
  preorder: "En preventa",
  presale: "En preventa",
  backorder: "Bajo pedido",
  discontinued: "Descatalogado"
};

function availabilityText(value: unknown): string | null {
  const raw = typeof value === "string" ? value.replace(/^https?:\/\/schema\.org\//i, "").toLowerCase() : "";
  return AVAILABILITY[raw] ?? null;
}

function formatPrice(price: unknown, currency: unknown): string | null {
  const amount = typeof price === "number" ? price : typeof price === "string" ? Number(price.replace(",", ".")) : NaN;
  const code = clean(currency);
  if (!Number.isFinite(amount) || !code || !/^[A-Z]{3}$/i.test(code)) return null;
  const formatted = amount.toLocaleString("es-ES", { minimumFractionDigits: amount % 1 ? 2 : 0, maximumFractionDigits: 2 });
  return `${formatted} ${code.toUpperCase()}`;
}

export function extractPageFacts(html: string): AgenticPageFacts {
  const nodes = flattenNodes(parseJsonLd(html)) as JsonNode[];
  const product = nodes.find((n) => typesOf(n).some((t) => t === "product" || t === "productgroup"));
  const offers = product
    ? (Array.isArray(product.offers) ? product.offers : [product.offers]).filter(
        (o): o is JsonNode => typeof o === "object" && o !== null
      )
    : [];
  const offer = offers[0];
  const nested = offer && Array.isArray(offer.offers) ? (offer.offers[0] as JsonNode | undefined) : undefined;
  const priceSpec = offer && typeof offer.priceSpecification === "object" ? (offer.priceSpecification as JsonNode) : undefined;

  const price =
    formatPrice(offer?.price ?? offer?.lowPrice ?? priceSpec?.price ?? nested?.price, offer?.priceCurrency ?? priceSpec?.priceCurrency ?? nested?.priceCurrency) ??
    formatPrice(metaContent(html, "product:price:amount") ?? metaContent(html, "og:price:amount"), metaContent(html, "product:price:currency") ?? metaContent(html, "og:price:currency"));

  const rating = product && typeof product.aggregateRating === "object" ? (product.aggregateRating as JsonNode) : undefined;
  const ratingValue = rating ? Number(String(rating.ratingValue ?? "").replace(",", ".")) : NaN;

  return {
    title: clean(html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1]) ?? metaContent(html, "og:title"),
    productName: (product ? clean(product.name) : null) ?? metaContent(html, "og:title"),
    brand: product ? first(product.brand, (b) => (typeof b === "object" && b !== null ? clean((b as JsonNode).name) : clean(b))) : null,
    price,
    availability: availabilityText(offer?.availability ?? nested?.availability),
    rating: Number.isFinite(ratingValue) && ratingValue > 0 ? ratingValue.toLocaleString("es-ES", { maximumFractionDigits: 1 }) : null
  };
}
