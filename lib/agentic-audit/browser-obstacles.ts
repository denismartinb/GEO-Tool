import { parseHTML } from "linkedom";
import { isChallengeResponse } from "@/lib/agentic-audit/challenge";
import { extractPageSignals } from "@/lib/agentic-audit/html-signals";
import { extractPageFacts } from "@/lib/agentic-audit/page-facts";
import { sanitizeField } from "@/lib/text/sanitize";

/**
 * AGENTS-BROWSER-1 (log §453): what an agent that browses like a person
 * (Grok Bot, Instinct, the ChatGPT agent) finds in front of the product, read
 * from the page as a real browser painted it (Cloudflare Browser Run, the
 * same render AI-READ-2 uses). JavaScript is not a problem for these agents,
 * so this never compares with the raw HTML: it reads what stands between them
 * and buying. Nothing is clicked: it is the page as it opens.
 *
 * Pure: no I/O, no clock (the caller stamps `measuredAt`).
 */

export type BrowserPriceState = "exact" | "from" | "missing";
export type BrowserOptionsState = "none" | "labeled" | "unlabeled";
export type BrowserBuyState = "named" | "unnamed" | "missing";

export type AgenticBrowserRead =
  | {
      state: "ok";
      measuredAt: string;
      /** A consent tool's banner is in the page as it opens. */
      cookies: boolean;
      price: { state: BrowserPriceState; text: string | null };
      /** Choices on the page (size, colour, plan) and whether each says what it chooses. */
      options: BrowserOptionsState;
      buy: { state: BrowserBuyState; text: string | null };
      /**
       * AGENTS-BROWSER-1 PR 2: what «Auditoría agéntica» compares with the
       * review without JavaScript. Optional: reads stored before it have none.
       */
      name?: string | null;
      /** Stock as the page shows it («En stock», «Agotado»), or null. */
      stock?: string | null;
      /** The page declares the product and its offer as data once JavaScript ran. */
      productData?: boolean;
    }
  /** The browser got a challenge instead of the page. Never counts against the site. */
  | { state: "blocked"; measuredAt: string }
  /** The render failed or the page was empty. */
  | { state: "unmeasured"; measuredAt: string };

type El = {
  tagName: string;
  id?: string;
  className?: unknown;
  textContent: string | null;
  parentElement: El | null;
  getAttribute(name: string): string | null;
  hasAttribute(name: string): boolean;
  querySelector(sel: string): El | null;
  querySelectorAll(sel: string): Iterable<El>;
  closest(sel: string): El | null;
  remove(): void;
};
type Doc = { body: El | null; querySelector(sel: string): El | null; querySelectorAll(sel: string): Iterable<El> };

/** Banners of the consent tools Spanish stores use, by their own root element. */
const CMP_ROOTS = [
  "#onetrust-banner-sdk",
  "#CybotCookiebotDialog",
  "#didomi-notice",
  "#didomi-popup",
  ".didomi-popup-container",
  ".cky-consent-container",
  "#cmplz-cookiebanner-container",
  ".cmplz-cookiebanner",
  "#usercentrics-root",
  "#usercentrics-cmp-ui",
  "#qc-cmp2-container",
  "#axeptio_overlay",
  "#iubenda-cs-banner",
  "#truste-consent-track",
  "#cookie-law-info-bar",
  "#moove_gdpr_cookie_info_bar",
  "#cookie-notice",
  "#shopify-pc__banner",
  ".cc-window",
  "#cookiescript_injected",
  "#BorlabsCookieBox",
  "#hs-eu-cookie-confirmation"
].join(",");
const COOKIE_WORD = /cookie|consent|gdpr|rgpd|privacy-banner/i;
const ACCEPT_TEXT = /\b(?:aceptar|acepto|aceptar todo|aceptar todas|permitir|de acuerdo|entendido|accept|allow|agree|got it)\b/i;

const BUY_TEXT =
  /\b(?:a[ñn]adir (?:al carrito|a la cesta|a la bolsa|a mi cesta)|agregar al carrito|comprar(?: ahora| ya)?|c[oó]mpralo|reservar(?: ahora)?|contratar|suscr[ií]b(?:ete|irse|irme)|empezar|empieza|prueba gratis|probar gratis|pedir cita|pide cita|add to (?:cart|bag|basket)|buy(?: now| it now)?|book now|subscribe|get started|start free|order now)\b/i;
const BUY_HINT = /add[-_ ]?to[-_ ]?cart|addtocart|add-to-bag|buy[-_ ]?now|product-form__submit|single_add_to_cart_button|btn-cart|button--add-to-cart/i;

const FROM_BEFORE = /(?:\bdesde|\ba partir de|\bfrom|\bstarting at|\bstarts at)\s*$/i;
const MONEY = /(?:\d{1,3}(?:[.\s]\d{3})*|\d+)(?:[.,]\d{1,2})?\s?(?:€|eur\b|euros?\b)|(?:€|\$|£)\s?\d+(?:[.,]\d{1,2})?/gi;

const OPTION_CONTROLS =
  "select, [role=radiogroup], fieldset";
const OPTION_HINT = /variant|variation|option|attribute|swatch|talla|size|color|colour|plan|modelo|capacidad|product-form|add-to-cart|addtocart|cart/i;

function one(s: string | null | undefined): string {
  return String(s ?? "").replace(/\s+/g, " ").trim();
}

function docOf(html: string): Doc {
  const { document } = parseHTML(html.replace(/</g, " <")) as unknown as { document: Doc };
  return document;
}

function classOf(el: El): string {
  return `${el.id ?? ""} ${typeof el.className === "string" ? el.className : ""}`;
}

/** Hidden by the page itself, not by a stylesheet we did not load. */
function hiddenInline(el: El): boolean {
  for (let cur: El | null = el, i = 0; cur && i < 8; cur = cur.parentElement, i++) {
    if (cur.hasAttribute("hidden") || cur.getAttribute("aria-hidden") === "true") return true;
    const style = (cur.getAttribute("style") ?? "").replace(/\s+/g, "").toLowerCase();
    if (style.includes("display:none") || style.includes("visibility:hidden")) return true;
  }
  return false;
}

function hasCookieBanner(doc: Doc): boolean {
  for (const el of doc.querySelectorAll(CMP_ROOTS)) if (!hiddenInline(el)) return true;
  // Hand-made banners: a box named «cookie…» with an accept button inside.
  for (const el of doc.querySelectorAll("div,section,aside,dialog,form")) {
    if (!COOKIE_WORD.test(classOf(el)) || hiddenInline(el)) continue;
    for (const b of el.querySelectorAll("button,a,input[type=button],input[type=submit]")) {
      if (ACCEPT_TEXT.test(one(b.textContent) || b.getAttribute("value") || "")) return true;
    }
  }
  return false;
}

/** Visible text outside navigation, footers and consent banners. */
function mainText(doc: Doc): string {
  for (const n of [...doc.querySelectorAll("script,style,template,svg,noscript,iframe,nav,footer,header")]) n.remove();
  for (const n of [...doc.querySelectorAll(CMP_ROOTS)]) n.remove();
  const scope = doc.querySelector("main,[role=main],article") ?? doc.body;
  return one(scope?.textContent);
}

function readPrice(renderedHtml: string, text: string): { state: BrowserPriceState; text: string | null } {
  const facts = extractPageFacts(renderedHtml);
  for (const m of text.matchAll(MONEY)) {
    const before = text.slice(Math.max(0, (m.index ?? 0) - 16), m.index ?? 0);
    const shown = sanitizeField(m[0].trim(), 24);
    if (FROM_BEFORE.test(before)) return { state: "from", text: sanitizeField(`${before.match(FROM_BEFORE)?.[0].trim() ?? ""} ${shown}`.trim(), 40) };
    return { state: "exact", text: facts.price ?? shown };
  }
  if (facts.price) return { state: "exact", text: facts.price };
  return { state: "missing", text: null };
}

function labelled(doc: Doc, el: El): boolean {
  if (one(el.getAttribute("aria-label")) || el.getAttribute("aria-labelledby")) return true;
  if (el.tagName.toLowerCase() === "fieldset") return Boolean(one(el.querySelector("legend")?.textContent));
  if (el.closest("label")) return true;
  const id = el.id;
  if (id) for (const l of doc.querySelectorAll("label")) if (l.getAttribute("for") === id && one(l.textContent)) return true;
  return false;
}

function readOptions(doc: Doc): BrowserOptionsState {
  const controls = [...doc.querySelectorAll(OPTION_CONTROLS)].filter((el) => {
    if (hiddenInline(el) || el.closest("nav,footer,header,#onetrust-banner-sdk,#CybotCookiebotDialog")) return false;
    if (el.tagName.toLowerCase() === "fieldset" && !el.querySelector("input[type=radio]")) return false;
    // Only choices that belong to the product: by their own name or the form around them.
    const own = `${classOf(el)} ${el.getAttribute("name") ?? ""} ${el.getAttribute("data-option") ?? ""}`;
    const form = el.closest("form");
    return OPTION_HINT.test(own) || Boolean(form && OPTION_HINT.test(`${classOf(form)} ${form.getAttribute("action") ?? ""}`));
  });
  if (controls.length === 0) return "none";
  return controls.every((el) => labelled(doc, el)) ? "labeled" : "unlabeled";
}

function readBuy(doc: Doc): { state: BrowserBuyState; text: string | null } {
  let unnamed = false;
  for (const el of doc.querySelectorAll("button,a,input[type=submit],input[type=button],[role=button]")) {
    if (hiddenInline(el) || el.closest("nav,footer,header")) continue;
    const text = one(el.textContent) || one(el.getAttribute("value"));
    const name = text || one(el.getAttribute("aria-label")) || one(el.getAttribute("title"));
    if (name && name.length <= 60 && BUY_TEXT.test(name)) return { state: "named", text: sanitizeField(name, 40) };
    const hint = `${classOf(el)} ${el.getAttribute("name") ?? ""} ${el.getAttribute("data-action") ?? ""}`;
    if (!name && BUY_HINT.test(hint)) unnamed = true;
  }
  return unnamed ? { state: "unnamed", text: null } : { state: "missing", text: null };
}

const STOCK_TEXT: Array<[RegExp, string]> = [
  [/\b(?:agotado|sin stock|sin existencias|no disponible|out of stock|sold out)\b/i, "Agotado"],
  [/\b(?:[uú]ltimas unidades|pocas unidades|quedan \d+)\b/i, "Pocas unidades"],
  [/\b(?:en stock|disponible|in stock|entrega en|env[ií]o en \d|recíbelo)\b/i, "En stock"]
];

function readStock(renderedHtml: string, text: string): string | null {
  const declared = extractPageFacts(renderedHtml).availability;
  if (declared) return declared;
  for (const [re, label] of STOCK_TEXT) if (re.test(text)) return label;
  return null;
}

function readName(renderedHtml: string, doc: Doc): string | null {
  const facts = extractPageFacts(renderedHtml);
  const h1 = one(doc.querySelector("main h1, h1")?.textContent);
  const name = facts.productName ?? (h1 || null) ?? facts.title;
  return name ? sanitizeField(name, 80) : null;
}

const MIN_TEXT_CHARS = 200;

export function readBrowserObstacles(renderedHtml: string, measuredAt: string): AgenticBrowserRead {
  if (isChallengeResponse({ status: 200, headers: {}, body: renderedHtml })) return { state: "blocked", measuredAt };
  const doc = docOf(renderedHtml);
  if (!doc.body) return { state: "unmeasured", measuredAt };
  const cookies = hasCookieBanner(doc);
  const options = readOptions(doc);
  const buy = readBuy(doc);
  const name = readName(renderedHtml, doc);
  const signals = extractPageSignals(renderedHtml);
  const productData = signals.hasProductData && signals.hasOffer;
  const text = mainText(doc);
  if (text.length < MIN_TEXT_CHARS) return { state: "unmeasured", measuredAt };
  return {
    state: "ok",
    measuredAt,
    cookies,
    price: readPrice(renderedHtml, text),
    options,
    buy,
    name,
    stock: readStock(renderedHtml, text),
    productData
  };
}

/** One week, like the rest of the browser measurements. */
export const BROWSER_READ_REFRESH_MS = 7 * 24 * 60 * 60 * 1000;
/** A failed render is tried again after a day. */
export const BROWSER_READ_RETRY_MS = 24 * 60 * 60 * 1000;

export function isAgenticBrowserRead(v: unknown): v is AgenticBrowserRead {
  if (!v || typeof v !== "object") return false;
  const r = v as Record<string, unknown>;
  if (typeof r.measuredAt !== "string") return false;
  if (r.state === "blocked" || r.state === "unmeasured") return true;
  return (
    r.state === "ok" &&
    typeof r.cookies === "boolean" &&
    typeof (r.price as { state?: unknown } | null)?.state === "string" &&
    typeof r.options === "string" &&
    typeof (r.buy as { state?: unknown } | null)?.state === "string"
  );
}

export function browserReadIsFresh(read: AgenticBrowserRead | undefined, now: number): boolean {
  if (!read) return false;
  const age = now - Date.parse(read.measuredAt);
  if (!Number.isFinite(age)) return false;
  return age < (read.state === "unmeasured" ? BROWSER_READ_RETRY_MS : BROWSER_READ_REFRESH_MS);
}
