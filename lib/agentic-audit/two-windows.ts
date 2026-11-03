import type {
  AgenticCheck,
  AgenticCheckResult,
} from "@/lib/agentic-audit/api-contract";
import {
  cookiesCover,
  isAgenticBrowserRead,
  type AgenticBrowserRead,
} from "@/lib/agentic-audit/browser-obstacles";
import { NAV_STATE_LINE, type NavState } from "@/lib/agentic-audit/agent-lanes";

/**
 * AGENTS-BROWSER-1 PR 2 (log §454): «Con navegador y sin él» on «Auditoría
 * agéntica». The same product page, as an agent that reads the HTML sees it
 * (the stored review) and as one that opens a browser sees it
 * (`result.browser`). Design: docs/design-reference/agents-browser-1/maqueta-v3.html.
 *
 * Pure: every word the card prints is here. Nothing here changes the score.
 */

export type CellTone = "ok" | "mid" | "no" | "na";
export type Cell = { tone: CellTone; text: string; code?: boolean };
export type RowId =
  | "name"
  | "price"
  | "stock"
  | "buy"
  | "data"
  | "challenge"
  | "cover";
export type Row = {
  id: RowId;
  title: string;
  note?: string;
  pin: number | null;
  gap: boolean;
  raw: Cell;
  nav: Cell;
};

export type Slot = {
  id: "price" | "stock" | "buy";
  pin: number | null;
  text: string;
  tone: CellTone;
};

export type WindowFix = { title: string; line: string; gains: string[] };

export type TwoWindows =
  | {
      state: "measured";
      url: string;
      name: string | null;
      rows: Row[];
      read: { slots: Slot[]; foot: string; footTone: "ok" | "no" };
      nav: {
        slots: Slot[];
        cookiesPin: number | null;
        foot: string;
        footTone: "ok" | "no";
      };
      verdict: { title: string; line: string } | null;
      fixes: WindowFix[];
    }
  | { state: Exclude<NavState, "measured">; line: string };

type Ok = Extract<AgenticBrowserRead, { state: "ok" }>;

const RANK: Record<CellTone, number> = { no: 0, mid: 1, ok: 2, na: 3 };

function checkOf(
  result: AgenticCheckResult,
  ...ids: string[]
): AgenticCheck | undefined {
  for (const c of result.components)
    for (const k of c.checks) if (ids.includes(k.id)) return k;
  return undefined;
}

function rawPrice(result: AgenticCheckResult): Cell {
  const c = checkOf(result, "price");
  if (!c || c.state === "unknown")
    return result.facts?.price
      ? { tone: "ok", text: result.facts.price, code: true }
      : { tone: "no", text: "No aparece" };
  if (c.state === "pass")
    return {
      tone: "ok",
      text: result.facts?.price ?? "Se lee",
      code: Boolean(result.facts?.price),
    };
  if (c.state === "avg") return { tone: "mid", text: "Sólo como texto" };
  return { tone: "no", text: "No aparece" };
}

function navPrice(read: Ok): Cell {
  if (read.price.state === "exact")
    return {
      tone: "ok",
      text: read.price.text ?? "Se ve",
      code: Boolean(read.price.text),
    };
  if (read.price.state === "from")
    return { tone: "mid", text: read.price.text ?? "Sólo «desde»" };
  return { tone: "no", text: "No aparece" };
}

function rawStock(result: AgenticCheckResult): Cell | null {
  const c = checkOf(result, "availability");
  if (!c) return null;
  if (c.state === "pass")
    return { tone: "ok", text: result.facts?.availability ?? "Declarado" };
  if (c.state === "unknown") return { tone: "na", text: "Sin medir" };
  return { tone: "no", text: "No aparece" };
}

function navStock(read: Ok): Cell {
  if (read.stock === undefined) return { tone: "na", text: "Sin medir" };
  return read.stock
    ? { tone: "ok", text: read.stock }
    : { tone: "no", text: "No aparece" };
}

function rawBuy(result: AgenticCheckResult): Cell | null {
  const c = checkOf(result, "add_to_cart", "buy_button");
  if (!c) return null;
  if (c.state === "pass") return { tone: "ok", text: "Está en el HTML" };
  if (c.state === "unknown") return { tone: "na", text: "Agotado ahora" };
  return { tone: "no", text: "No aparece" };
}

function navBuy(read: Ok): Cell {
  if (read.buy.state === "named")
    return {
      tone: "ok",
      text: read.buy.text ? `«${read.buy.text}»` : "Con nombre claro",
    };
  if (read.buy.state === "unnamed")
    return { tone: "mid", text: "Un icono sin texto" };
  return { tone: "no", text: "No aparece" };
}

function rawData(result: AgenticCheckResult): Cell | null {
  const c = checkOf(result, "product_data");
  if (!c) return null;
  if (c.state === "pass") return { tone: "ok", text: "Están" };
  if (c.state === "avg") return { tone: "mid", text: "Sin la oferta" };
  if (c.state === "unknown") return { tone: "na", text: "Sin medir" };
  return { tone: "no", text: "No están" };
}

function navData(read: Ok, raw: Cell): Cell {
  if (read.productData === undefined) return { tone: "na", text: "Sin medir" };
  if (!read.productData) return { tone: "no", text: "No están" };
  return raw.tone === "ok"
    ? { tone: "ok", text: "Están" }
    : { tone: "mid", text: "Los añade un script" };
}

function rawChallenge(result: AgenticCheckResult): Cell {
  if (result.challenge) return { tone: "no", text: "Reto anti-bots" };
  const captcha = checkOf(result, "no_captcha");
  if (captcha?.state === "fail") return { tone: "no", text: "Captcha" };
  return { tone: "ok", text: "Ninguno" };
}

/** «a», «a y b», «a, b y c». */
function list(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} y ${items[items.length - 1]}`;
}

function readFoot(
  price: Cell,
  stock: Cell | null,
  buy: Cell | null,
): { foot: string; footTone: "ok" | "no" } {
  const unknown = [
    price.tone === "no" ? "cuánto cuesta" : null,
    stock?.tone === "no" ? "si queda" : null,
  ].filter((x): x is string => Boolean(x));
  const first = unknown.length ? `No sabe ${unknown.join(" ni ")}` : null;
  if (buy?.tone === "no")
    return {
      foot: first ? `${first} ni ve el botón` : "No ve el botón de compra",
      footTone: "no",
    };
  if (first) return { foot: first, footTone: "no" };
  return { foot: "Tiene lo que necesita para comprar", footTone: "ok" };
}

function navFoot(read: Ok): { foot: string; footTone: "ok" | "no" } {
  if (read.buy.state === "missing")
    return { foot: "No encuentra cómo comprar", footTone: "no" };
  if (read.buy.state === "unnamed")
    return { foot: "Ve un botón, pero no sabe qué hace", footTone: "no" };
  if (read.price.state === "missing")
    return { foot: "Ve el botón, pero no el precio", footTone: "no" };
  return {
    foot: cookiesCover(read)
      ? "Llega a comprar, tras aceptar las cookies"
      : "Llega a comprar",
    footTone: "ok",
  };
}

const SLOT_NAME = { price: "Precio", stock: "Stock", buy: "Botón" } as const;
const GAIN_NAME: Record<"price" | "stock" | "buy", string> = {
  price: "el precio",
  stock: "el stock",
  buy: "el botón",
};
const VERDICT_NAME: Record<"price" | "stock" | "buy", string> = {
  price: "tu precio",
  stock: "tu stock",
  buy: "tu botón",
};

const NAV_FIX: Record<string, WindowFix> = {
  cookies: {
    title: "Que el aviso de cookies no tape la ficha",
    line: "Una franja abajo deja ver el producto y el botón sin cerrarla.",
    gains: ["Lo que tapa la ficha"],
  },
  "price-missing": {
    title: "Pon el precio a la vista en la ficha",
    line: "Tampoco lo vemos con un navegador.",
    gains: ["Precio"],
  },
  "buy-missing": {
    title: "Pon un botón de compra a la vista",
    line: "Tampoco lo vemos con un navegador.",
    gains: ["Botón de compra"],
  },
  "buy-unnamed": {
    title: "Pon texto al botón de compra",
    line: "Un icono solo no le dice a un agente qué hace.",
    gains: ["Botón de compra"],
  },
};

export function twoWindows(result: AgenticCheckResult): TwoWindows {
  const read = isAgenticBrowserRead(result.browser)
    ? result.browser
    : undefined;
  if (!read || read.state !== "ok") {
    const state = read ? read.state : "measuring";
    return { state, line: NAV_STATE_LINE[state] };
  }

  const name =
    read.name ?? result.facts?.productName ?? result.facts?.title ?? null;
  const rawName: Cell = result.facts?.productName
    ? { tone: "ok", text: result.facts.productName }
    : { tone: "no", text: "No aparece" };
  const navName: Cell = read.name
    ? { tone: "ok", text: read.name }
    : { tone: "no", text: "No aparece" };

  const price = { raw: rawPrice(result), nav: navPrice(read) };
  const stockRaw = rawStock(result);
  const stock = stockRaw ? { raw: stockRaw, nav: navStock(read) } : null;
  const buyRaw = rawBuy(result);
  const buy = buyRaw ? { raw: buyRaw, nav: navBuy(read) } : null;
  const dataRaw = rawData(result);
  const data = dataRaw ? { raw: dataRaw, nav: navData(read, dataRaw) } : null;

  const draft: Array<Omit<Row, "pin" | "gap">> = [
    { id: "name", title: "Qué vendes", raw: rawName, nav: navName },
    { id: "price", title: "Precio", ...price },
    ...(stock ? [{ id: "stock" as const, title: "Stock", ...stock }] : []),
    ...(buy ? [{ id: "buy" as const, title: "Botón de compra", ...buy }] : []),
    ...(data
      ? [
          {
            id: "data" as const,
            title: "Datos del producto",
            note: "schema.org Product y Offer",
            ...data,
          },
        ]
      : []),
    {
      id: "challenge",
      title: "Reto anti-bots",
      raw: rawChallenge(result),
      nav: { tone: "ok", text: "Ninguno" },
    },
    {
      id: "cover",
      title: "Lo que tapa la ficha",
      raw: { tone: "na", text: "No aplica" },
      nav: cookiesCover(read)
        ? { tone: "mid", text: "Aviso de cookies encima hasta aceptarlo" }
        : {
            tone: "ok",
            text: read.cookies
              ? "Nada (el aviso de cookies no la tapa)"
              : "Nada",
          },
    },
  ];
  const rows: Row[] = draft.map((r, i) => ({
    ...r,
    pin: r.id === "name" ? null : i,
    gap:
      r.raw.tone !== "na" &&
      r.nav.tone !== "na" &&
      RANK[r.raw.tone] < RANK[r.nav.tone],
  }));
  const row = (id: RowId) => rows.find((r) => r.id === id);

  const slotIds = (["price", "stock", "buy"] as const).filter((id) => row(id));
  const readSlots: Slot[] = slotIds.map((id) => {
    const r = row(id)!;
    const shown =
      r.raw.tone === "ok"
        ? id === "buy"
          ? (read.buy.text ?? "Comprar")
          : r.raw.text
        : `${SLOT_NAME[id]} · no llega`;
    return {
      id,
      pin: r.pin,
      text: shown,
      tone: r.raw.tone === "ok" ? "ok" : r.raw.tone === "na" ? "na" : "no",
    };
  });
  const navSlots: Slot[] = slotIds.map((id) => {
    const r = row(id)!;
    const shown =
      r.nav.tone === "no"
        ? `${SLOT_NAME[id]} · no se ve`
        : id === "buy"
          ? (read.buy.text ?? "Comprar")
          : r.nav.text;
    return { id, pin: r.pin, text: shown, tone: r.nav.tone };
  });

  // What exists only once JavaScript runs.
  const jsOnly = slotIds.filter((id) => {
    const r = row(id)!;
    return r.raw.tone === "no" && (r.nav.tone === "ok" || r.nav.tone === "mid");
  });
  const dataByScript = row("data")?.nav.text === "Los añade un script";

  const rf = readFoot(price.raw, stock?.raw ?? null, buy?.raw ?? null);
  const nf = navFoot(read);
  const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
  const verdict = jsOnly.length
    ? {
        title: `${list(jsOnly.map((id) => VERDICT_NAME[id])).replace(/^t/, "T")} ${jsOnly.length > 1 ? "existen" : "existe"}, pero sólo con JavaScript.`,
        line: `Un agente que no abre navegador ${lower(rf.foot)}. Uno que sí lo abre ${lower(nf.foot)}.`,
      }
    : null;

  const fixes: WindowFix[] = [];
  if (jsOnly.length) {
    fixes.push({
      title: `Pon ${list(jsOnly.map((id) => GAIN_NAME[id]))} en el HTML que sirve el servidor`,
      line: `Ya ${jsOnly.length > 1 ? "están" : "está"} en tu ficha: sólo hay que ${jsOnly.length > 1 ? "servirlos" : "servirlo"} sin esperar a JavaScript.`,
      gains: jsOnly.map((id) => SLOT_NAME[id]),
    });
  }
  if (dataByScript) {
    fixes.push({
      title: "Escribe los datos del producto en el HTML, no con un script",
      line: "Hoy los añade una etiqueta que se ejecuta en el navegador.",
      gains: ["Datos del producto"],
    });
  }
  const navKeys = [
    read.buy.state !== "named" ? `buy-${read.buy.state}` : null,
    read.price.state === "missing" ? "price-missing" : null,
    cookiesCover(read) ? "cookies" : null,
  ].filter((k): k is string => Boolean(k));
  for (const key of navKeys) if (fixes.length < 3) fixes.push(NAV_FIX[key]);

  return {
    state: "measured",
    url: result.url,
    name,
    rows,
    read: { slots: readSlots, ...rf },
    nav: {
      slots: navSlots,
      cookiesPin: cookiesCover(read) ? (row("cover")?.pin ?? null) : null,
      ...nf,
    },
    verdict,
    fixes,
  };
}

/**
 * The line under a check of the review without JavaScript, once the browser
 * says whether the value exists: «Con navegador sí se ve…» means the fix is to
 * serve it; «Tampoco con navegador» means it is missing from the page.
 */
export function browserCheckNotes(
  result: AgenticCheckResult,
): Record<string, string> {
  const read =
    isAgenticBrowserRead(result.browser) && result.browser.state === "ok"
      ? result.browser
      : null;
  if (!read) return {};
  const notes: Record<string, string> = {};
  const failed = (id: string) => {
    const c = checkOf(result, id);
    return c && c.state === "fail" ? c.id : null;
  };
  const price = failed("price");
  if (price) {
    notes[price] =
      read.price.state === "missing"
        ? "Tampoco lo vemos con navegador: tu página no enseña precio. Ponlo a la vista y en los datos."
        : `Con navegador sí se ve (${read.price.text ?? "el precio"}): sólo llega con JavaScript. Sírvelo en el HTML.`;
  }
  const stock = failed("availability");
  if (stock && read.stock !== undefined) {
    notes[stock] = read.stock
      ? `Con navegador sí se ve («${read.stock}»): sólo llega con JavaScript.`
      : "Tampoco lo vemos con navegador.";
  }
  const buy = failed("add_to_cart") ?? failed("buy_button");
  if (buy) {
    notes[buy] =
      read.buy.state === "named"
        ? `Con navegador sí se ve («${read.buy.text ?? "el botón"}»): sólo llega con JavaScript.`
        : read.buy.state === "unnamed"
          ? "Con navegador se ve un botón, pero sin texto."
          : "Tampoco lo vemos con navegador.";
  }
  const data = failed("product_data");
  if (data && read.productData !== undefined) {
    notes[data] = read.productData
      ? "Con navegador sí están: los añade un script. Escríbelos en el HTML."
      : "Tampoco están con navegador.";
  }
  return notes;
}
