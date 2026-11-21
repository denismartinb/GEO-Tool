import { parseHTML } from "linkedom";
import { isChallengeResponse, isRenderedChallenge, isRenderedErrorPage, isRenderedNotFoundText } from "@/lib/agentic-audit/challenge";
import { extractPageSignals, LEAD_CTA, NOT_BUY, PRICING_PATH } from "@/lib/agentic-audit/html-signals";
import { extractPageFacts } from "@/lib/agentic-audit/page-facts";
import { amountOfDeclared, declaredPriceConflicts, readVisiblePrice, stockConflicts } from "@/lib/agentic-audit/price-read";
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
/** AGENTS-TRUTH-1 (log §465): `lead` is a «Pide presupuesto» or «Te llamamos», not a way to buy. */
export type BrowserBuyState = "named" | "lead" | "unnamed" | "missing";
export type BrowserConflict = "price" | "stock";

export type AgenticBrowserRead =
  | {
      state: "ok";
      measuredAt: string;
      /** A consent tool's banner is in the page as it opens. */
      cookies: boolean;
      /**
       * AGENTS-COOKIES-1 (log §457): the banner sits on top of the page (a
       * window with a backdrop, or the page's scroll locked) instead of a
       * strip that leaves the product in view. Only this counts against the
       * site. Missing in reads stored before it: read as not covering.
       */
      cookieCover?: boolean;
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
      /**
       * AGENTS-TRUTH-1 (log §465): a home or listing, not one product. Price
       * and button are not judged there. Missing in older reads: no.
       */
      listing?: boolean;
      /** A tariff, plan or policy: it has no stock. */
      tariff?: boolean;
      /** What the page's data says differently from what it shows. */
      conflicts?: BrowserConflict[];
      rules?: number;
    }
  /** The browser got a challenge instead of the page. Never counts against the site. */
  | { state: "blocked"; measuredAt: string; rules?: number }
  /**
   * The render failed or the page was empty. `not_found` and `error`
   * (log §465): the browser opened an error page, never the product.
   */
  | { state: "unmeasured"; measuredAt: string; reason?: "not_found" | "error"; rules?: number };

/**
 * AGENTS-TRUTH-1 (log §465 adenda): the version of the rules that read a
 * render. Only the reading is stored, never the HTML, so a fix to these rules
 * reaches a stored read only when the page is rendered again. A read made
 * with older rules (or none) is due once, whatever its age. Bump this when a
 * change here would make a stored read say something false; each bump costs
 * one render per agentic page, inside the pass's own budget and quota.
 */
export const BROWSER_READ_RULES = 2;

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
  /\b(?:a[ñn]adir (?:al carrito|a la cesta|a la bolsa|a mi cesta)|agregar al carrito|comprar(?: ahora| ya)?|c[oó]mpralo|reservar(?: ahora)?|contratar|contrata(?: ahora| ya)?|suscr[ií]b(?:ete|irse|irme)|empezar|empieza|l[oa] quiero|hazte cliente|(?:prueba|probar)(?: [\wáéíóú]+)? gratis|pedir cita|pide cita|add to (?:cart|bag|basket)|buy(?: now| it now)?|book now|subscribe|get started|start free|order now)\b/i;
/** «¿Qué potencia de luz contratar?» is a link to a guide, not a buy button (holaluz.com, log §465). */
const QUESTION_LABEL = /^[¿\s]*(?:qu[eé]|c[oó]mo|cu[aá]l(?:es)?|cu[aá]nt[oa]s?|por qu[eé]|d[oó]nde|cu[aá]ndo)(?=\s|$)|\?/i;
/** A button whose whole label is «Añadir» (dia.es, many grocers): next to a price it is the cart, never «Añadir a mi lista». */
const BARE_ADD = /^[+\s]*(?:a[ñn]adir|agregar|add)[+\s]*$/i;
/** FAQ answers, dialogs, accordions and menus: never where the product is bought (log §465). */
const OUTSIDE_PURCHASE =
  "nav,footer,header,details,dialog,[role=dialog],[role=alertdialog],[aria-modal=true],[class*=faq],[class*=Faq],[class*=FAQ],[id*=faq],[class*=accordion],[class*=Accordion],[class*=modal],[class*=Modal],[class*=popup],[class*=Popup]";
/** Where the product is bought: its form, its card, a block named for buying. */
const PURCHASE_ZONE =
  "form,[itemtype*=Product],[itemtype*=Offer],[class*=product],[class*=Product],[class*=buy],[class*=Buy],[class*=price],[class*=Price],[class*=offer],[class*=Offer],[class*=tarifa],[class*=plan],[class*=cart]";
const BUY_HINT = /add[-_ ]?to[-_ ]?cart|addtocart|add-to-bag|buy[-_ ]?now|product-form__submit|single_add_to_cart_button|btn-cart|button--add-to-cart/i;


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

/**
 * Signs that a consent banner covers the page rather than sitting in a strip.
 * The render brings no geometry, so this reads what the tools write in the
 * DOM: their layout classes, `aria-modal`, a backdrop element, or a scroll
 * lock on the page. Without any of them the banner is not counted as covering.
 */
const COVER_CLASS = /(?:^|[\s_-])(?:modal|popup|pop-up|overlay|lightbox|interstitial|center|centered|middle|wall)(?:$|[\s_-])|otCenterRounded|didomi-popup/i;
const BACKDROP = /(?:cookie|consent|cmp|gdpr|rgpd|cky|cmplz|cybot)[\w-]{0,30}(?:overlay|backdrop|underlay)|(?:overlay|backdrop|underlay)[\w-]{0,30}(?:cookie|consent|cmp|gdpr|rgpd)/i;
const SCROLL_LOCK_CLASS = /modal-open|no-?scroll|overflow-hidden|scroll-?lock|didomi-popup-open|cookie[\w-]*open/i;

function coversPage(doc: Doc, banner: El): boolean {
  for (let cur: El | null = banner, i = 0; cur && i < 4; cur = cur.parentElement, i++) {
    if (cur.getAttribute("aria-modal") === "true") return true;
    if (COVER_CLASS.test(classOf(cur))) return true;
    const template = cur.getAttribute("data-template");
    if (template && /popup|overlay|center/i.test(template)) return true;
  }
  if (banner.querySelector("[aria-modal=true]")) return true;
  for (const el of doc.querySelectorAll("div,span,section")) {
    if (BACKDROP.test(classOf(el)) && !hiddenInline(el)) return true;
  }
  for (const el of [doc.querySelector("html"), doc.body]) {
    if (!el) continue;
    const style = (el.getAttribute("style") ?? "").replace(/\s+/g, "").toLowerCase();
    if (style.includes("overflow:hidden") || SCROLL_LOCK_CLASS.test(classOf(el))) return true;
  }
  return false;
}

function readCookies(doc: Doc): { present: boolean; cover: boolean } {
  for (const el of doc.querySelectorAll(CMP_ROOTS)) if (!hiddenInline(el)) return { present: true, cover: coversPage(doc, el) };
  // Hand-made banners: a box named «cookie…» with an accept button inside.
  for (const el of doc.querySelectorAll("div,section,aside,dialog,form")) {
    if (!COOKIE_WORD.test(classOf(el)) || hiddenInline(el)) continue;
    for (const b of el.querySelectorAll("button,a,input[type=button],input[type=submit]")) {
      if (ACCEPT_TEXT.test(one(b.textContent) || b.getAttribute("value") || "")) {
        const modalDialog = el.tagName.toLowerCase() === "dialog" && el.hasAttribute("open") && el.getAttribute("aria-modal") === "true";
        return { present: true, cover: modalDialog || coversPage(doc, el) };
      }
    }
  }
  return { present: false, cover: false };
}

/** The consent banner stands in front of the product (log §457). Old reads without the field: no. */
export function cookiesCover(read: { cookies: boolean; cookieCover?: boolean }): boolean {
  return read.cookies && read.cookieCover === true;
}

/** Visible text outside navigation, footers and consent banners. */
function mainText(doc: Doc): string {
  for (const n of [...doc.querySelectorAll("script,style,template,svg,noscript,iframe,nav,footer,header")]) n.remove();
  for (const n of [...doc.querySelectorAll(CMP_ROOTS)]) n.remove();
  const scope = doc.querySelector("main,[role=main],article") ?? doc.body;
  return one(scope?.textContent);
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

/**
 * The label as a person reads it: icon names that leak into the text
 * («tote-simple Añadir al carrito», «shopping_cart Comprar») are dropped.
 */
export function cleanButtonLabel(label: string): string {
  return one(
    label
      .split(/\s+/)
      .filter((w) => !/^[a-z0-9]+(?:[-_][a-z0-9]+)+$/.test(w) && !/^(?:icon|ico|svg|material-icons?)$/i.test(w))
      .join(" ")
  );
}

function readBuy(doc: Doc): { state: BrowserBuyState; text: string | null } {
  let unnamed = false;
  let lead: string | null = null;
  const inZone: string[] = [];
  const elsewhere: string[] = [];
  for (const el of doc.querySelectorAll("button,a,input[type=submit],input[type=button],[role=button]")) {
    if (hiddenInline(el) || el.closest(OUTSIDE_PURCHASE)) continue;
    const text = cleanButtonLabel(one(el.textContent) || one(el.getAttribute("value")));
    const name = text || cleanButtonLabel(one(el.getAttribute("aria-label")) || one(el.getAttribute("title")));
    if (name && name.length <= 60 && !NOT_BUY.test(name)) {
      if (LEAD_CTA.test(name)) {
        lead ??= name;
        continue;
      }
      if ((BUY_TEXT.test(name) && !QUESTION_LABEL.test(name)) || BARE_ADD.test(name)) {
        (el.closest(PURCHASE_ZONE) ? inZone : elsewhere).push(name);
        continue;
      }
    }
    const hint = `${classOf(el)} ${el.getAttribute("name") ?? ""} ${el.getAttribute("data-action") ?? ""}`;
    if (!name && BUY_HINT.test(hint)) unnamed = true;
  }
  const best = inZone[0] ?? elsewhere[0];
  if (best) return { state: "named", text: sanitizeField(best, 40) };
  if (unnamed) return { state: "unnamed", text: null };
  if (lead) return { state: "lead", text: sanitizeField(lead, 40) };
  return { state: "missing", text: null };
}

/** «Disponible» alone says nothing (it is in every menu); only stock words count (log §465). */
const STOCK_TEXT: Array<[RegExp, string]> = [
  [/\b(?:agotado|sin stock|sin existencias|no est[aá] disponible|no disponible|out of stock|sold out)\b/i, "Agotado"],
  [/\b(?:[uú]ltimas unidades|pocas unidades|quedan \d+)\b/i, "Pocas unidades"],
  [/\b(?:en stock|in stock|entrega en|env[ií]o en \d|rec[ií]belo)\b/i, "En stock"]
];

function readStock(declared: string | null, text: string): string | null {
  // What the page shows wins over what its data says: that is what the agent repeats.
  for (const [re, label] of STOCK_TEXT) if (re.test(text)) return label;
  return declared;
}

/** The main heading names the product; the marketing title is the fallback (log §465). */
function readName(doc: Doc, facts: ReturnType<typeof extractPageFacts>): string | null {
  const h1 = one(doc.querySelector("main h1, h1")?.textContent);
  const name = (h1 && h1.length <= 90 ? h1 : null) ?? facts.productName ?? facts.title;
  return name ? sanitizeField(name, 80) : null;
}

function pathOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).pathname;
  } catch {
    return null;
  }
}

const MIN_TEXT_CHARS = 200;

export function readBrowserObstacles(renderedHtml: string, measuredAt: string, url?: string): AgenticBrowserRead {
  return { ...readRender(renderedHtml, measuredAt, url), rules: BROWSER_READ_RULES };
}

function readRender(renderedHtml: string, measuredAt: string, url?: string): AgenticBrowserRead {
  if (isChallengeResponse({ status: 200, headers: {}, body: renderedHtml })) return { state: "blocked", measuredAt };
  const doc = docOf(renderedHtml);
  if (!doc.body) return { state: "unmeasured", measuredAt };
  const facts = extractPageFacts(renderedHtml);
  const title = facts.title ?? "";
  const h1 = one(doc.querySelector("h1")?.textContent);
  // Log §465: a challenge in Spanish, or an error page, is not the store.
  const error = isRenderedErrorPage(title, h1);
  if (error === "blocked") return { state: "blocked", measuredAt };
  if (error) return { state: "unmeasured", measuredAt, reason: error };
  const cookie = readCookies(doc);
  const options = readOptions(doc);
  const buy = readBuy(doc);
  const name = readName(doc, facts);
  const signals = extractPageSignals(renderedHtml);
  // Same reading as the review without JavaScript (log §458): a Product, or
  // what else is sold (SoftwareApplication, Service…), with its offer.
  const productData = (signals.hasProductData && signals.hasOffer) || (signals.offerTypes.length > 0 && signals.anyOffer);
  const text = mainText(doc);
  if (isRenderedChallenge(title, text)) return { state: "blocked", measuredAt };
  if (isRenderedNotFoundText(text)) return { state: "unmeasured", measuredAt, reason: "not_found" };
  if (text.length < MIN_TEXT_CHARS) return { state: "unmeasured", measuredAt };
  const tariff = signals.tariff === true;
  const path = pathOf(url);
  const listing =
    !tariff &&
    !signals.hasProductData &&
    signals.offerTypes.length === 0 &&
    !(path && PRICING_PATH.test(path)) &&
    (signals.listing === true || path === "/");
  const price = readVisiblePrice(text);
  const conflicts: BrowserConflict[] = [];
  if (!listing && declaredPriceConflicts(amountOfDeclared(facts.price), price.prices)) conflicts.push("price");
  const stock = tariff || listing ? null : readStock(facts.availability, text);
  if (!tariff && !listing && stockConflicts(facts.availability, text)) conflicts.push("stock");
  return {
    state: "ok",
    measuredAt,
    cookies: cookie.present,
    cookieCover: cookie.cover,
    price: listing ? { state: "missing", text: null } : { state: price.state, text: price.text },
    options: listing ? "none" : options,
    buy: listing ? { state: "missing", text: null } : buy,
    name,
    stock,
    productData,
    ...(listing ? { listing: true } : {}),
    ...(tariff ? { tariff: true } : {}),
    ...(conflicts.length ? { conflicts } : {})
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
  if ((read.rules ?? 1) < BROWSER_READ_RULES) return false;
  const age = now - Date.parse(read.measuredAt);
  if (!Number.isFinite(age)) return false;
  // A render that failed is retried after a day; an error page (log §465) waits the
  // week like a reading, so a dead link does not spend Cloudflare's free minutes daily.
  const retry = read.state === "unmeasured" && !read.reason;
  return age < (retry ? BROWSER_READ_RETRY_MS : BROWSER_READ_REFRESH_MS);
}
