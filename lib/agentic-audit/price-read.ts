/**
 * AGENTS-TRUTH-1 (log §465): one reading of the prices a page shows, for the
 * review without JavaScript and for the browser read, so both say the same
 * thing about the same page. Pure.
 *
 * What the 33-page test found (Iberdrola, Endesa, Naturgy, Mapfre, Domestika,
 * Holded): a bare number is a false fact. A price carries its unit or period
 * («0,1499 €/kWh», «33,90 €/mes»), a power price is never shown when the
 * energy price is there, «desde» is kept, several plans read «Varios precios,
 * desde X», a free plan (0) never stands for the price when a paid one
 * exists, and a figure of 100.000 or more is not a price we trust.
 */

export type PriceUnit = "kWh" | "kW" | "mes" | "año" | "día" | "noche" | "semana" | null;

export type VisiblePrice = {
  value: number;
  /** «€», «$» or «£». */
  symbol: string;
  unit: PriceUnit;
  from: boolean;
  /** Decimals the page wrote («149,00» keeps two). */
  decimals: number;
  /** Offset in the text, for ordering. */
  at: number;
};

export type PriceReading = {
  state: "exact" | "from" | "missing";
  text: string | null;
  /** Every price kept, after the filters above. */
  prices: VisiblePrice[];
};

const AMOUNT = String.raw`(?<![\d.,'’])(?:\d{1,3}(?:[.\s]\d{3})+|\d+)(?:\s?[.,'’]\d{1,6})?`;
const MONEY = new RegExp(
  String.raw`(${AMOUNT})\s?(€|eur\b|euros?\b)|(€|\$|£)\s?(\d+(?:[.,]\d{1,6})?)`,
  "gi"
);
/** What follows the amount and says what it is per. */
const UNIT_AFTER =
  /^\s*(?:\/|al|a la|por|per|x)\s*(?:(kwh)|(kw)(?:\s*(?:y\s*)?(?:d[ií]a|mes|año))?|(mes|month|mo)\b|(año|ano|year|yr)\b|(d[ií]a|day)\b|(noche|night)\b|(semana|week)\b)/i;
const UNIT_SUFFIX = /^\s*(?:al|\/)\s*(mes|año)|^\s*(mensuales?|anuales?)\b/i;
const FROM_BEFORE = /(?:\bdesde|\ba partir de|\bfrom|\bstarting at|\bstarts at)\s*$/i;
/** Savings and discounts are amounts, not prices. */
const NOT_A_PRICE_BEFORE = /(?:ahorr\w*(?: hasta| de)?|descuento(?: de)?|dto\.?|regalo de|bono de|ll[eé]vate(?: hasta)?|gana(?: hasta)?|-)\s*$/i;
/** «50 € en puntos», «20 € de regalo»: a reward, not what it costs (endesa.com, log §465). */
const NOT_A_PRICE_AFTER = /^\s*(?:en puntos|de regalo|de descuento|de ahorro|en saldo|de saldo)\b/i;

export const MAX_PLAUSIBLE_PRICE = 100_000;

export function parseAmount(raw: string): number {
  // «30'00 €/mes»: some shops write the decimals after an apostrophe.
  const s = raw.replace(/\s/g, "").replace(/['’]/g, ",");
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  let normalized: string;
  if (lastComma >= 0 && lastDot >= 0) {
    normalized = lastComma > lastDot ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  } else if (lastComma >= 0) {
    normalized = s.replace(",", ".");
  } else if (lastDot >= 0) {
    // «1.234» is a thousand; «12.5» and «0.1499» are decimals.
    normalized = /\.\d{3}$/.test(s) && !/^0\./.test(s) ? s.replace(/\./g, "") : s;
  } else {
    normalized = s;
  }
  return Number(normalized);
}

function unitOf(after: string): PriceUnit {
  const m = after.match(UNIT_AFTER);
  if (m) {
    if (m[1]) return "kWh";
    if (m[2]) return "kW";
    if (m[3]) return "mes";
    if (m[4]) return "año";
    if (m[5]) return "día";
    if (m[6]) return "noche";
    if (m[7]) return "semana";
  }
  const s = after.match(UNIT_SUFFIX);
  if (s) return /^a/i.test(s[1] ?? s[2] ?? "") ? "año" : "mes";
  return null;
}

/** Every price in the text, in order, with the filters of the header. */
export function visiblePrices(text: string): VisiblePrice[] {
  const out: VisiblePrice[] = [];
  for (const m of text.matchAll(MONEY)) {
    const at = m.index ?? 0;
    const before = text.slice(Math.max(0, at - 24), at);
    if (NOT_A_PRICE_BEFORE.test(before)) continue;
    const raw = m[1] ?? m[4] ?? "";
    const symbol = m[3] ?? "€";
    const value = parseAmount(raw);
    if (!Number.isFinite(value) || value >= MAX_PLAUSIBLE_PRICE) continue;
    const after = text.slice(at + m[0].length, at + m[0].length + 20);
    if (NOT_A_PRICE_AFTER.test(after)) continue;
    const decimals = raw.match(/[.,'’](\d{1,6})$/)?.[1]?.length ?? 0;
    out.push({ value, symbol, unit: unitOf(after), from: FROM_BEFORE.test(before), decimals: /[.,]\d{3}$/.test(raw) && value >= 1000 ? 0 : decimals, at });
  }
  return keepMeaningful(out);
}

function keepMeaningful(prices: VisiblePrice[]): VisiblePrice[] {
  let kept = prices;
  if (kept.some((p) => p.value > 0)) kept = kept.filter((p) => p.value > 0);
  // The energy price is the one a customer compares; the power price is not shown with it.
  if (kept.some((p) => p.unit === "kWh")) kept = kept.filter((p) => p.unit !== "kW");
  return kept;
}

const UNIT_TEXT: Record<Exclude<PriceUnit, null>, string> = {
  kWh: "/kWh",
  kW: "/kW",
  mes: "/mes",
  año: "/año",
  día: "/día",
  noche: "/noche",
  semana: "/semana"
};

export function formatVisiblePrice(p: Pick<VisiblePrice, "value" | "symbol" | "unit"> & { decimals?: number }): string {
  const decimals = p.decimals ? Math.min(4, Math.max(2, p.decimals)) : p.value % 1 === 0 ? 0 : 2;
  const amount = p.value.toLocaleString("es-ES", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  const unit = p.unit ? UNIT_TEXT[p.unit] : "";
  return p.symbol === "€" ? `${amount} €${unit}` : `${p.symbol}${amount}${unit}`;
}

function distinct(prices: VisiblePrice[]): VisiblePrice[] {
  const seen = new Set<string>();
  return prices.filter((p) => {
    const key = `${p.value}|${p.unit ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** What the page shows as its price, in one short text. */
export function readVisiblePrice(text: string): PriceReading {
  const prices = visiblePrices(text);
  if (prices.length === 0) return { state: "missing", text: null, prices };
  const unique = distinct(prices);
  if (unique.length >= 3) {
    // Several plans or rates: the cheapest of the most common unit.
    const counts = new Map<PriceUnit, number>();
    for (const p of unique) counts.set(p.unit, (counts.get(p.unit) ?? 0) + 1);
    const unit = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
    const min = unique.filter((p) => p.unit === unit).sort((a, b) => a.value - b.value)[0];
    return { state: "from", text: `Varios precios, desde ${formatVisiblePrice(min)}`, prices };
  }
  const first = prices[0];
  if (first.from) return { state: "from", text: `Desde ${formatVisiblePrice(first)}`, prices };
  return { state: "exact", text: formatVisiblePrice(first), prices };
}

/**
 * The declared price (JSON-LD) is not one of the prices the page shows. Only
 * said when the page shows prices: a page without visible prices is a
 * different finding («no se ve el precio»).
 */
export function declaredPriceConflicts(declared: number | null, prices: VisiblePrice[]): boolean {
  if (declared === null || !Number.isFinite(declared) || prices.length === 0) return false;
  return !prices.some((p) => Math.abs(p.value - declared) < 0.005);
}

/** The amount of a formatted declared price («149,5 EUR»), or null. */
export function amountOfDeclared(price: string | null | undefined): number | null {
  if (!price) return null;
  const m = price.match(/(\d[\d.\s]*(?:,\d+)?)/);
  if (!m) return null;
  const value = parseAmount(m[1].trim());
  return Number.isFinite(value) ? value : null;
}

const OUT_OF_STOCK_TEXT = /\b(?:agotado|sin stock|sin existencias|no est[aá] disponible|no disponible|out of stock|sold out|temporalmente sin stock)\b/i;

/** The data says it is in stock while the text says it is not (Druni). */
export function stockConflicts(declared: string | null | undefined, text: string): boolean {
  return declared === "En stock" && OUT_OF_STOCK_TEXT.test(text);
}

export { OUT_OF_STOCK_TEXT };
