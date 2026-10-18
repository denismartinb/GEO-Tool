/**
 * AGENTIC-COMMERCE-1: what an agent can read from ONE page's HTML, without
 * running JavaScript. Pure: a string in, facts out. No network, no DOM.
 *
 * It reads what an agent with a plain HTTP client would read: JSON-LD,
 * schema.org microdata, Open Graph product tags, links, and the visible
 * text. A fact that only exists after JavaScript runs is, for that agent,
 * not there, and saying so is the point of the check.
 *
 * Every regex here is a heuristic over markup we do not control. When one
 * is unsure it leans to "not found", because the product then says "we did
 * not see it", which stays true; claiming a signal we did not see would not.
 */

import type { AgenticOfferKind } from "@/lib/agentic-audit/api-contract";

type JsonNode = Record<string, unknown>;

export type ProductSignals = {
  /** A Product (or ProductGroup) in JSON-LD or microdata. */
  hasProductData: boolean;
  /** That product carries at least one Offer. */
  hasOffer: boolean;
  /** Offer price and currency, from JSON-LD or microdata. */
  structuredPrice: boolean;
  /** A price only in Open Graph tags or the visible text. */
  textPrice: boolean;
  availability: boolean;
  gtin: boolean;
  skuOrMpn: boolean;
  shippingData: boolean;
  returnPolicyData: boolean;
  reviewData: boolean;
  organizationData: boolean;
  /** `og:type` = product. */
  ogProduct: boolean;
};

export type PageSignals = ProductSignals & {
  visibleTextChars: number;
  links: { returns: boolean; shipping: boolean; legal: boolean; contact: boolean; cancellation: boolean };
  /** A store platform (Shopify, WooCommerce…). Drives the catalogue probe. */
  platform: string | null;
  /**
   * Log §324: what the page sells according to its structured data, besides
   * a physical product (software, service, course, event, booking).
   */
  offerTypes: AgenticOfferKind[];
  /** Any Offer anywhere in the structured data, whatever it is attached to. */
  anyOffer: boolean;
  /** A price per month or per year, in the data or the text. */
  recurringPrice: boolean;
  /** A buy, hire, start, book or quote button or link in the HTML. */
  buyCta: boolean;
  /** A booking widget or link (Calendly, Doctoralia, TheFork…). */
  bookingWidget: string | null;
  /** A checkout or selling platform that is not a store (Stripe, Paddle, Eventbrite…). */
  paymentPlatform: string | null;
  addToCart: boolean;
  quickPay: string[];
  captcha: string | null;
};

const PRODUCT_TYPES = new Set(["product", "productgroup", "individualproduct", "productmodel"]);
const ORG_TYPES = new Set(["organization", "onlinestore", "onlinebusiness", "store", "localbusiness", "corporation"]);

function typesOf(node: JsonNode): string[] {
  const t = node["@type"];
  const list = Array.isArray(t) ? t : [t];
  return list
    .filter((x): x is string => typeof x === "string")
    .map((x) => x.replace(/^https?:\/\/schema\.org\//i, "").toLowerCase());
}

function isObject(value: unknown): value is JsonNode {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asList(value: unknown): unknown[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function hasValue(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (typeof value === "number") return Number.isFinite(value);
  if (Array.isArray(value)) return value.some(hasValue);
  if (isObject(value)) return Object.keys(value).length > 0;
  return Boolean(value);
}

/** Every JSON-LD block that parses. A block that does not parse is skipped, never guessed at. */
export function parseJsonLd(html: string): unknown[] {
  const blocks: unknown[] = [];
  const re = /<script\b[^>]*type\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) {
    const raw = match[1].trim().replace(/^<!--/, "").replace(/-->$/, "").trim();
    if (!raw) continue;
    try {
      blocks.push(JSON.parse(raw));
    } catch {
      // Malformed JSON-LD is common (trailing commas, raw newlines in strings).
      // An agent's parser fails on it too, so it counts as absent.
    }
  }
  return blocks;
}

/** Flattens blocks, arrays, `@graph` and nested objects into one list of nodes. */
export function flattenNodes(blocks: unknown[]): JsonNode[] {
  const out: JsonNode[] = [];
  const seen = new Set<unknown>();
  const visit = (value: unknown, depth: number) => {
    if (depth > 12 || value === null || typeof value !== "object" || seen.has(value)) return;
    seen.add(value);
    if (Array.isArray(value)) {
      for (const item of value) visit(item, depth + 1);
      return;
    }
    const node = value as JsonNode;
    out.push(node);
    for (const child of Object.values(node)) visit(child, depth + 1);
  };
  for (const block of blocks) visit(block, 0);
  return out;
}

function offerHasPrice(offer: JsonNode): boolean {
  const price = offer.price ?? offer.lowPrice ?? (isObject(offer.priceSpecification) ? offer.priceSpecification.price : undefined);
  const currency =
    offer.priceCurrency ?? (isObject(offer.priceSpecification) ? offer.priceSpecification.priceCurrency : undefined);
  return hasValue(price) && hasValue(currency);
}

const SOFTWARE_TYPES = new Set(["softwareapplication", "webapplication", "mobileapplication", "videogame"]);
const SERVICE_TYPES = new Set(["service", "professionalservice", "financialproduct", "broadcastservice", "cableorsatelliteservice", "governmentservice", "taxiservice", "foodservice"]);
const COURSE_TYPES = new Set(["course", "courseinstance", "educationaloccupationalprogram"]);
const OFFER_TYPES = new Set(["offer", "aggregateoffer", "offercatalog"]);

/** Log §324: what the structured data says the page sells, besides a physical product. */
function offerTypesFromJsonLd(nodes: JsonNode[]): { kinds: AgenticOfferKind[]; anyOffer: boolean; anyPrice: boolean; recurring: boolean } {
  const kinds = new Set<AgenticOfferKind>();
  for (const node of nodes) {
    const types = typesOf(node);
    if (types.some((t) => SOFTWARE_TYPES.has(t))) kinds.add("software");
    if (types.some((t) => COURSE_TYPES.has(t))) kinds.add("course");
    if (types.some((t) => t.endsWith("event"))) kinds.add("event");
    if (types.some((t) => SERVICE_TYPES.has(t))) kinds.add("service");
    if (types.includes("reserveaction") || node.acceptsReservations === true || /^(?:true|yes|s[ií])$/i.test(String(node.acceptsReservations ?? "")))
      kinds.add("booking");
    const action = node.potentialAction;
    if (asList(action).some((a) => isObject(a) && typesOf(a).includes("reserveaction"))) kinds.add("booking");
  }
  const offers = nodes.filter((n) => typesOf(n).some((t) => OFFER_TYPES.has(t)) || hasValue(n.priceSpecification));
  const specs = nodes.filter((n) => typesOf(n).some((t) => t.endsWith("pricespecification")));
  const recurring =
    specs.some((n) => hasValue(n.billingDuration) || /^(?:mon|ann|month|year)/i.test(String(n.unitCode ?? n.unitText ?? ""))) ||
    offers.some((n) => /^(?:mon|ann)$/i.test(String(n.unitCode ?? "")));
  return { kinds: [...kinds], anyOffer: offers.length > 0, anyPrice: offers.some(offerHasPrice), recurring };
}

function productSignalsFromJsonLd(nodes: JsonNode[]): Omit<ProductSignals, "ogProduct" | "textPrice"> {
  const products = nodes.filter((n) => typesOf(n).some((t) => PRODUCT_TYPES.has(t)));
  // A ProductGroup's variants carry the offers; they are already in `nodes`
  // because flattening walks `hasVariant`.
  const offers = products.flatMap((p) => asList(p.offers)).filter(isObject);
  const nestedOffers = offers.flatMap((o) => asList(o.offers)).filter(isObject); // AggregateOffer.offers
  const allOffers = [...offers, ...nestedOffers];

  const anyNode = (pred: (n: JsonNode) => boolean) => nodes.some(pred);
  const anyType = (type: string) => anyNode((n) => typesOf(n).includes(type));

  return {
    hasProductData: products.length > 0,
    hasOffer: allOffers.length > 0,
    structuredPrice: allOffers.some(offerHasPrice),
    availability: allOffers.some((o) => hasValue(o.availability)),
    gtin: [...products, ...allOffers].some((n) =>
      ["gtin", "gtin8", "gtin12", "gtin13", "gtin14", "isbn"].some((k) => hasValue(n[k]))
    ),
    skuOrMpn: [...products, ...allOffers].some((n) => hasValue(n.sku) || hasValue(n.mpn)),
    shippingData: anyNode((n) => hasValue(n.shippingDetails)) || anyType("offershippingdetails"),
    returnPolicyData: anyNode((n) => hasValue(n.hasMerchantReturnPolicy)) || anyType("merchantreturnpolicy"),
    reviewData: products.some((p) => hasValue(p.aggregateRating) || hasValue(p.review)) || anyType("aggregaterating"),
    organizationData: nodes.some(
      (n) =>
        typesOf(n).some((t) => ORG_TYPES.has(t)) &&
        (hasValue(n.address) || hasValue(n.telephone) || hasValue(n.email) || hasValue(n.contactPoint))
    )
  };
}

function hasItemprop(html: string, prop: string): boolean {
  return new RegExp(`itemprop\\s*=\\s*["'][^"']*\\b${prop}\\b`, "i").test(html);
}

function metaContent(html: string, property: string): string | null {
  const re = new RegExp(
    `<meta\\b[^>]*(?:property|name)\\s*=\\s*["']${property.replace(/[:.]/g, "\\$&")}["'][^>]*>`,
    "i"
  );
  const tag = html.match(re)?.[0];
  if (!tag) return null;
  return tag.match(/content\s*=\s*["']([^"']*)["']/i)?.[1]?.trim() ?? null;
}

/** Visible text: scripts, styles and markup removed, entities left as they are (we only count). */
export function visibleText(html: string): string {
  return html
    .replace(/<(script|style|noscript|template|svg|head)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const PRICE_IN_TEXT =
  /(?:\d{1,3}(?:[.\s]\d{3})*|\d+)(?:[.,]\d{2})?\s?(?:€|eur\b|euros?\b)|€\s?\d+(?:[.,]\d{2})?|\$\s?\d+(?:[.,]\d{2})?/i;

/** A price per month or year: «29 €/mes», «al mes», «/año», «per month». */
const RECURRING_IN_TEXT =
  /(?:€|eur\b|euros?\b|\$)\s*(?:\/|al|por|a\s+la|per)\s*(?:mes|año|ano|month|year|mo\b|semana)|\b(?:al mes|al año|mensuales?|anuales?|per month|per year|\/mes|\/año|\/month|\/year)\b/i;

type LinkFlags = PageSignals["links"];

function linkFlags(html: string): LinkFlags {
  const flags: LinkFlags = { returns: false, shipping: false, legal: false, contact: false, cancellation: false };
  const re = /<a\b[^>]*href\s*=\s*["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) {
    const haystack = `${match[1]} ${match[2].replace(/<[^>]+>/g, " ")}`.toLowerCase();
    if (/devoluci|returns?\b|refund|reembolso|desistimiento/.test(haystack)) flags.returns = true;
    if (/env[ií]os?\b|envio|shipping|gastos de env|plazos de entrega|delivery/.test(haystack)) flags.shipping = true;
    if (/aviso[- ]legal|legal[- ]notice|imprint|impressum|condiciones[- ]generales|terminos|términos|terms/.test(haystack))
      flags.legal = true;
    if (/contact/.test(haystack)) flags.contact = true;
    if (/cancelaci|cancela|cancel|reembolso|refund|darse de baja|garant[ií]a de devoluci/.test(haystack)) flags.cancellation = true;
  }
  return flags;
}

const PLATFORMS: Array<[string, RegExp]> = [
  ["Shopify", /cdn\.shopify\.com|shopify\.theme|shopify-section|myshopify\.com/i],
  ["WooCommerce", /woocommerce|wc-block-|\/wc-ajax=/i],
  ["PrestaShop", /prestashop/i],
  ["Magento", /magento_|data-mage-init|mage\/cookies/i],
  ["BigCommerce", /bigcommerce\.com/i],
  ["Shopware", /shopware/i],
  ["VTEX", /vtex(?:assets|commercestable|\.com)/i],
  ["Wix", /static\.wixstatic\.com|wix-ecommerce/i],
  ["Squarespace", /static1\.squarespace\.com/i]
];

export function detectPlatform(html: string): string | null {
  for (const [name, re] of PLATFORMS) if (re.test(html)) return name;
  return null;
}

/** Log §324: selling platforms that are not a store, for software, courses, events and bookings. */
const PAYMENT_PLATFORMS: Array<[string, RegExp]> = [
  ["Stripe", /js\.stripe\.com|checkout\.stripe\.com|buy\.stripe\.com|billing\.stripe\.com/i],
  ["Paddle", /cdn\.paddle\.com|paddle\.js|checkout\.paddle\.com/i],
  ["Lemon Squeezy", /lemonsqueezy\.com/i],
  ["Gumroad", /gumroad\.com/i],
  ["Hotmart", /hotmart\.com/i],
  ["Teachable", /teachable\.com/i],
  ["Thinkific", /thinkific\.com/i],
  ["Kajabi", /kajabi(?:-cdn)?\.com/i],
  ["Eventbrite", /eventbrite\.(?:com|es)/i],
  ["Chargebee", /chargebee\.com/i]
];

const BOOKING_WIDGETS: Array<[string, RegExp]> = [
  ["Calendly", /calendly\.com/i],
  ["Cal.com", /\bcal\.com\//i],
  ["Doctoralia", /doctoralia\.(?:es|com)/i],
  ["TheFork", /thefork\.|eltenedor\./i],
  ["OpenTable", /opentable\./i],
  ["Booksy", /booksy\.com/i],
  ["Treatwell", /treatwell\./i],
  ["SimplyBook", /simplybook\./i],
  ["Acuity", /acuityscheduling\.com/i],
  ["Bookitit", /bookitit\.com/i],
  ["Reservio", /reservio\.com/i],
  ["CoverManager", /covermanager\.com/i],
  ["Mirai", /mirai\.com/i],
  ["SiteMinder", /siteminder\.com|thebookingbutton/i],
  ["Cloudbeds", /cloudbeds\.com/i],
  ["SynXis", /synxis\.com/i]
];

/** Visible text of every link, button and submit input. */
function ctaTexts(html: string): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(/<(a|button)\b[^>]*>([\s\S]*?)<\/\1>/gi)) out.push(m[2].replace(/<[^>]+>/g, " "));
  for (const m of html.matchAll(/<input\b[^>]*type\s*=\s*["']?submit["']?[^>]*>/gi)) {
    const value = m[0].match(/value\s*=\s*["']([^"']*)["']/i)?.[1];
    if (value) out.push(value);
  }
  return out.map((t) => t.replace(/\s+/g, " ").trim().toLowerCase()).filter((t) => t.length > 0 && t.length <= 60);
}

const BUY_CTA =
  /\b(?:comprar?|c[oó]mpralo|contratar?|contrata|empezar|empieza|comenzar|comienza|suscr[ií]b|reservar?|pide cita|pedir cita|solicitar? cita|pide presupuesto|pedir presupuesto|solicitar? presupuesto|presupuesto sin compromiso|inscr[ií]b|matric[uú]la|hazte socio|prueba gratis|probar gratis|empieza gratis|elegir plan|elige tu plan|apuntarme|ap[uú]ntate|buy|get started|start free|try (?:it )?free|subscribe|book now|book a|sign up|order now|get tickets)\b/i;

const ADD_TO_CART =
  /add[-_ ]?to[-_ ]?cart|\/cart\/add|addtocart|a[ñn]adir al carrito|a[ñn]adir a la cesta|agregar al carrito|a[ñn]adir a mi cesta|name\s*=\s*["']add["']/i;

const QUICK_PAY: Array<[string, RegExp]> = [
  ["Apple Pay", /apple[-_ ]?pay/i],
  ["Google Pay", /google[-_ ]?pay|pay\.google\.com|\bgpay\b/i],
  ["Shop Pay", /shop[-_ ]?pay|shopify-payment-button/i],
  ["PayPal", /paypal\.com\/sdk|paypal-button|data-paypal|paypalobjects/i],
  ["Bizum", /bizum/i],
  ["Klarna", /klarna/i]
];

const CAPTCHAS: Array<[string, RegExp]> = [
  ["reCAPTCHA", /google\.com\/recaptcha|recaptcha\/api\.js|g-recaptcha|recaptcha\.net/i],
  ["hCaptcha", /hcaptcha\.com|h-captcha/i],
  ["Turnstile", /challenges\.cloudflare\.com\/turnstile|cf-turnstile/i],
  ["Arkose", /arkoselabs|funcaptcha/i],
  ["Friendly Captcha", /friendlycaptcha|frc-captcha/i]
];

export function extractPageSignals(html: string): PageSignals {
  const nodes = flattenNodes(parseJsonLd(html));
  const ld = productSignalsFromJsonLd(nodes);

  const microProduct = /itemtype\s*=\s*["']https?:\/\/schema\.org\/Product(?:Group)?["']/i.test(html);
  const microOffer = /itemtype\s*=\s*["']https?:\/\/schema\.org\/(?:Aggregate)?Offer["']/i.test(html);
  const microPrice = hasItemprop(html, "price") && hasItemprop(html, "priceCurrency");
  const ogType = metaContent(html, "og:type");
  const text = visibleText(html);
  const offered = offerTypesFromJsonLd(nodes);
  const microTypes: AgenticOfferKind[] = [];
  if (/itemtype\s*=\s*["']https?:\/\/schema\.org\/(?:Service|ProfessionalService)["']/i.test(html)) microTypes.push("service");
  if (/itemtype\s*=\s*["']https?:\/\/schema\.org\/(?:SoftwareApplication|WebApplication)["']/i.test(html)) microTypes.push("software");
  if (/itemtype\s*=\s*["']https?:\/\/schema\.org\/Course["']/i.test(html)) microTypes.push("course");
  if (/itemtype\s*=\s*["']https?:\/\/schema\.org\/\w*Event["']/i.test(html)) microTypes.push("event");
  const bookingWidget = BOOKING_WIDGETS.find(([, re]) => re.test(html))?.[0] ?? null;

  return {
    hasProductData: ld.hasProductData || microProduct,
    hasOffer: ld.hasOffer || microOffer,
    structuredPrice: ld.structuredPrice || offered.anyPrice || microPrice,
    textPrice:
      Boolean(metaContent(html, "product:price:amount") || metaContent(html, "og:price:amount")) ||
      PRICE_IN_TEXT.test(text),
    availability: ld.availability || hasItemprop(html, "availability"),
    gtin: ld.gtin || /itemprop\s*=\s*["']gtin(?:8|12|13|14)?["']/i.test(html),
    skuOrMpn: ld.skuOrMpn || hasItemprop(html, "sku") || hasItemprop(html, "mpn"),
    shippingData: ld.shippingData,
    returnPolicyData: ld.returnPolicyData,
    reviewData: ld.reviewData || hasItemprop(html, "aggregateRating"),
    organizationData: ld.organizationData,
    ogProduct: (ogType ?? "").toLowerCase().startsWith("product"),
    visibleTextChars: text.length,
    links: linkFlags(html),
    platform: detectPlatform(html),
    addToCart: ADD_TO_CART.test(html),
    quickPay: QUICK_PAY.filter(([, re]) => re.test(html)).map(([name]) => name),
    captcha: CAPTCHAS.find(([, re]) => re.test(html))?.[0] ?? null,
    offerTypes: [...new Set([...offered.kinds, ...microTypes])],
    anyOffer: ld.hasOffer || offered.anyOffer || microOffer,
    recurringPrice: offered.recurring || RECURRING_IN_TEXT.test(text),
    buyCta: ctaTexts(html).some((t) => BUY_CTA.test(t)),
    bookingWidget,
    paymentPlatform: PAYMENT_PLATFORMS.find(([, re]) => re.test(html))?.[0] ?? null
  };
}

/** A product page is one that declares a product. A grid with «add to cart» buttons is not enough. */
export function isProductPage(signals: Pick<PageSignals, "hasProductData" | "ogProduct">): boolean {
  return signals.hasProductData || signals.ogProduct;
}

/** Pricing and plans pages, in Spanish and English. */
export const PRICING_PATH = /\/(?:precios?|pricing|prices|planes|plans|tarifas?)\/?$/i;

/** Log §324: paths that usually sell one kind of thing, checked after the structured data. */
export const PATH_KINDS: Array<[AgenticOfferKind, RegExp]> = [
  ["booking", /\/(?:reservar?|reservas|cita|citas|pedir-cita|pide-cita|cita-previa|booking|book|reserve|appointment)(?:\/|$)/i],
  ["event", /\/(?:entradas|tickets|eventos?|events?|conciertos?)\/[^/]+|\/(?:entradas|tickets)\/?$/i],
  ["course", /\/(?:cursos?|courses?|formacion|formaci%c3%b3n|masters?|academia)\/[^/]+/i],
  ["subscription", /\/(?:suscripci[oó]n|suscripcion|suscribete|subscribe|subscription|membres[ií]a|membership|hazte-socio|socios)\/?$/i],
  ["service", /\/(?:servicios?|services?)\/[^/]+|\/(?:presupuesto|solicitar-presupuesto|quote)\/?$/i]
];

export type OfferReading = { kind: AgenticOfferKind; pricingPage: boolean };

/**
 * Log §324: what this page sells, or `null` when it sells nothing we can
 * see. It detects generously on purpose (founder, 2026-10-18: «mejor detectar
 * de más que de menos»): a wrong page is fixed with «Elegir otra página», an
 * empty screen is not.
 *
 * Order: a declared product, then the other declared types, a price per
 * month or year, the path, a booking widget, and the safety net (a visible
 * price and a buy button). The path and the safety net are not used on a
 * store platform page that is not a product: on a shop, a category or a home
 * with prices is not the page to judge; a product page is.
 */
export function classifyOffer(signals: PageSignals, url: string): OfferReading | null {
  let path = "/";
  try {
    path = new URL(url).pathname;
  } catch {
    // keep "/"
  }
  const pricingPage = PRICING_PATH.test(path);
  const declared = (kind: AgenticOfferKind): OfferReading => ({ kind, pricingPage });

  if (signals.offerTypes.includes("software") && (signals.anyOffer || pricingPage)) return declared("software");
  if (isProductPage(signals)) return declared("physical");
  for (const kind of ["event", "course", "booking", "service", "software"] as const) {
    if (signals.offerTypes.includes(kind)) return declared(kind);
  }
  if (signals.platform) return null;

  const priced = signals.structuredPrice || signals.textPrice;
  if (pricingPage) return declared(signals.recurringPrice ? "subscription" : signals.offerTypes.includes("software") ? "software" : "offer");
  for (const [kind, re] of PATH_KINDS) if (re.test(path)) return declared(kind);
  if (signals.bookingWidget) return declared("booking");
  if (priced && signals.recurringPrice && signals.buyCta) return declared("subscription");
  if (priced && signals.buyCta) return declared("offer");
  return null;
}
