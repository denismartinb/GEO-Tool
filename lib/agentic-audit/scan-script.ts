import type { AgenticCheck, AgenticCheckResult, CheckState } from "@/lib/agentic-audit/api-contract";
import { ASSISTANT_ROBOTS_TOKENS, ASSISTANTS } from "@/lib/agentic-audit/agents";
import { interopProbePaths } from "@/lib/agentic-audit/interop";

/**
 * AGENTIC-COMMERCE-1: the script the checker's wait animation plays. Pure.
 *
 * The server reads everything in parallel in a few seconds; the animation
 * spreads that over ~10 s so the visitor can follow it. Only the pacing is
 * staged. Every request line is a URL the server really fetches, every lane
 * lists checks the engine really runs, and every value after the response
 * (product, price, which assistants get in) is read from the response. There
 * is no percentage anywhere: nothing knows how far the server has gone.
 *
 * Times are in scripted seconds. The clock holds at `SCAN_HOLD_AT` until the
 * response arrives, because nothing past that point can be said without it.
 */

export const SCAN_DURATION_S = 10.2;
export const SCAN_HOLD_AT = 1.8;
/** Shortest stretch the post-response part may be squeezed into, for a slow response. */
export const SCAN_MIN_TAIL_S = 4;

export type ScanTone = "req" | "info" | "ok" | "bad";
export type ScanLine = { at: number; tone: ScanTone; text: string };
export type ScanItem = { label: string; detail: string | null; state: CheckState | null };
export type ScanLaneId = "discovery" | "understanding" | "trust" | "purchase" | "interop";
export type ScanLane = { id: ScanLaneId; name: string; t0: number; t1: number; items: ScanItem[]; note: string | null };
export type ScanPhrase = { at: number; text: string };
export type ScanScript = { lines: ScanLine[]; lanes: ScanLane[]; phrases: ScanPhrase[] };

export type ScanTarget = { host: string; url: string };

/** The host and URL the server will fetch, for the request lines. Mirrors `normalizeTarget` loosely: display only. */
export function scanTargetFromInput(input: string): ScanTarget | null {
  const trimmed = input.trim();
  if (!trimmed) return null;
  try {
    const parsed = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`);
    parsed.protocol = "https:";
    parsed.hash = "";
    const host = parsed.hostname.toLowerCase();
    if (!host.includes(".")) return null;
    return { host, url: parsed.toString() };
  } catch {
    return null;
  }
}

const LANES: Array<{ id: ScanLaneId; name: string; t0: number; t1: number }> = [
  { id: "discovery", name: "Descubrimiento", t0: 0, t1: 2.6 },
  { id: "understanding", name: "Comprensión", t0: 1.8, t1: 5.2 },
  { id: "trust", name: "Confianza", t0: 4.2, t1: 7.2 },
  { id: "purchase", name: "Compra", t0: 6.2, t1: 8.8 },
  { id: "interop", name: "Interoperabilidad", t0: 7.8, t1: 9.8 }
];

/** Short names of the engine's checks, in the order `score.ts` runs them. */
const SHORT: Record<string, string> = {
  no_challenge: "Retos anti-bots",
  sitemap: "Sitemap",
  product_data: "Datos de producto",
  price: "Precio",
  availability: "Stock",
  identifiers: "GTIN y referencias",
  readable_text: "Texto sin JavaScript",
  returns: "Devoluciones",
  shipping: "Envío",
  reviews: "Reseñas",
  identity: "Quién está detrás",
  add_to_cart: "Botón de compra",
  no_captcha: "Captchas",
  quick_pay: "Pagos rápidos",
  platform: "Plataforma"
};

const PLACEHOLDER: Record<ScanLaneId, string[]> = {
  discovery: [...ASSISTANTS, SHORT.no_challenge, SHORT.sitemap],
  understanding: ["product_data", "price", "availability", "identifiers", "readable_text"].map((id) => SHORT[id]),
  trust: ["returns", "shipping", "reviews", "identity"].map((id) => SHORT[id]),
  purchase: ["add_to_cart", "no_captcha", "quick_pay", "platform"].map((id) => SHORT[id]),
  interop: ["Perfil UCP", "Servidor MCP", "Tarjeta de agente A2A", "Catálogo público"]
};

const STATE_SHORT: Record<CheckState, string> = {
  pass: "Correcto",
  avg: "Mejorable",
  fail: "Falla",
  unknown: "No se pudo medir"
};

const GLYPH: Record<CheckState, string> = { pass: "✓", avg: "!", fail: "✗", unknown: "?" };

function placeholderLanes(): ScanLane[] {
  return LANES.map((lane) => ({
    ...lane,
    items: PLACEHOLDER[lane.id].map((label) => ({ label, detail: null, state: null })),
    note: null
  }));
}

/** Text inside the engine's parentheses: «Ofreces pagos rápidos (Apple Pay, Shop Pay)» → «Apple Pay, Shop Pay». */
function inParens(label: string): string | null {
  return label.match(/\(([^)]+)\)\s*$/)?.[1] ?? null;
}

function checkDetail(check: AgenticCheck, result: AgenticCheckResult): string {
  const f = result.facts;
  if (check.state === "pass") {
    if (check.id === "product_data" && f?.productName) return f.productName;
    if (check.id === "price" && f?.price) return f.price;
    if (check.id === "availability" && f?.availability) return f.availability;
    if (check.id === "reviews" && f?.rating) return `Valoración media ${f.rating}`;
    if (check.id === "quick_pay" || check.id === "no_captcha") return inParens(check.label) ?? STATE_SHORT.pass;
    if (check.id === "platform" && result.platform) return result.platform;
    if (check.id === "sitemap") return "Publicado";
    if (check.id === "no_challenge") return "Sin retos";
  }
  if (check.id === "no_captcha" && check.state === "fail") return inParens(check.label) ?? STATE_SHORT.fail;
  return STATE_SHORT[check.state];
}

function componentItems(result: AgenticCheckResult, id: ScanLaneId): AgenticCheck[] {
  return result.components.find((c) => c.id === id)?.checks ?? [];
}

function resultLanes(result: AgenticCheckResult): ScanLane[] {
  return LANES.map((lane) => {
    let items: ScanItem[] = [];
    let note: string | null = null;
    if (lane.id === "discovery") {
      const checks = componentItems(result, "discovery");
      items = [
        ...result.agents.map((a) => ({
          label: a.assistant,
          detail: a.allowed === null ? "No se pudo leer" : a.allowed ? "Le dejas pasar" : "Le bloqueas",
          state: (a.allowed === null ? "unknown" : a.allowed ? "pass" : "fail") as CheckState
        })),
        ...checks
          .filter((c) => c.id !== "robots_agents")
          .map((c) => ({ label: SHORT[c.id] ?? c.label, detail: checkDetail(c, result), state: c.state }))
      ];
    } else if (lane.id === "interop") {
      items = result.interop.items.map((item) => ({
        label: item.label,
        detail: item.state === "found" ? "Publicado" : item.state === "absent" ? "Sin publicar" : "No se pudo medir",
        state: (item.state === "found" ? "pass" : item.state === "absent" ? "fail" : "unknown") as CheckState
      }));
    } else {
      items = componentItems(result, lane.id).map((c) => ({
        label: SHORT[c.id] ?? c.label,
        detail: checkDetail(c, result),
        state: c.state
      }));
      if (items.length === 0) {
        note = result.pageRead ? "Se mide en una ficha de producto" : "Tu web no nos dejó leer la página";
      }
    }
    return { ...lane, items, note };
  });
}

/** Spreads texts evenly between two times. */
function spread(texts: Array<[ScanTone, string]>, from: number, to: number): ScanLine[] {
  if (texts.length === 0) return [];
  const step = (to - from) / texts.length;
  return texts.map(([tone, text], i) => ({ at: Math.round((from + step * i) * 100) / 100, tone, text }));
}

function requestLines(target: ScanTarget): ScanLine[] {
  const origin = `https://${target.host}`;
  const paths = interopProbePaths(null);
  const tokens = ASSISTANTS.flatMap((a) => ASSISTANT_ROBOTS_TOKENS[a]);
  return [
    { at: 0.1, tone: "req", text: `GET  ${target.url}` },
    { at: 0.35, tone: "req", text: `GET  ${origin}/robots.txt` },
    { at: 0.6, tone: "info", text: `buscando ${tokens.slice(0, 4).join(" · ")}` },
    { at: 0.85, tone: "info", text: `buscando ${tokens.slice(4).join(" · ")}` },
    { at: 1.1, tone: "req", text: `GET  ${origin}/sitemap.xml` },
    { at: 1.3, tone: "req", text: `GET  ${origin}${paths.ucp}` },
    { at: 1.5, tone: "req", text: `GET  ${origin}${paths.mcpCard}` },
    { at: 1.7, tone: "req", text: `GET  ${origin}${paths.agentCard}` }
  ];
}

function checkLines(checks: AgenticCheck[]): Array<[ScanTone, string]> {
  return checks.map((c) => [c.state === "pass" ? "ok" : c.state === "unknown" ? "info" : "bad", `${GLYPH[c.state]} ${c.label}`]);
}

function resultLines(target: ScanTarget, result: AgenticCheckResult): ScanLine[] {
  const f = result.facts;
  const lines: ScanLine[] = [];
  const product = result.pageKind === "product";

  const opening: Array<[ScanTone, string]> = [];
  if (result.url && result.url !== target.url) opening.push(["info", `redirige a ${result.url}`]);
  if (result.pageRead) opening.push(["ok", `200 · ${f?.title ?? "página leída"}`]);
  else opening.push(["bad", `${target.host} pone un reto a las visitas automáticas`]);
  opening.push([
    "info",
    `robots.txt · ${result.agents
      .map((a) => `${a.assistant}: ${a.allowed === null ? "sin leer" : a.allowed ? "entra" : "bloqueado"}`)
      .join(" · ")}`
  ]);
  opening.push(...checkLines(componentItems(result, "discovery").filter((c) => c.id !== "robots_agents")));
  lines.push(...spread(opening, 1.85, 2.55), { at: 2.6, tone: "ok", text: "✓ Descubrimiento" });

  const understanding: Array<[ScanTone, string]> = [];
  if (product) {
    understanding.push(["info", "leyendo JSON-LD · microdatos · Open Graph"]);
    if (f?.productName) understanding.push(["info", `Product · ${f.productName}`]);
    if (f?.brand) understanding.push(["info", `marca · ${f.brand}`]);
    if (f?.price) understanding.push(["info", `precio · ${f.price}`]);
    if (f?.availability) understanding.push(["info", `stock · ${f.availability}`]);
    understanding.push(...checkLines(componentItems(result, "understanding")));
  } else if (result.pageRead) {
    understanding.push(["info", "leyendo JSON-LD · microdatos · Open Graph"], ["info", "esta página no es una ficha de producto"]);
  } else {
    understanding.push(["bad", "sin la página no se puede leer el producto"]);
  }
  lines.push(...spread(understanding, 2.9, 5.1), { at: 5.2, tone: "ok", text: "✓ Comprensión" });

  const trust: Array<[ScanTone, string]> = [];
  if (f?.rating) trust.push(["info", `valoración media · ${f.rating}`]);
  trust.push(...checkLines(componentItems(result, "trust")));
  if (trust.length === 0) trust.push(["bad", "sin la página no se puede leer la confianza"]);
  lines.push(...spread(trust, 5.4, 7.1), { at: 7.2, tone: "ok", text: "✓ Confianza" });

  const purchase: Array<[ScanTone, string]> = [];
  if (result.platform) purchase.push(["info", `plataforma · ${result.platform}`]);
  purchase.push(...checkLines(componentItems(result, "purchase")));
  if (purchase.length === 0) purchase.push(["info", "el camino al pago se mide en una ficha de producto"]);
  lines.push(...spread(purchase, 7.35, 8.7), { at: 8.8, tone: "ok", text: "✓ Compra" });

  const interop: Array<[ScanTone, string]> = [];
  const feed = interopProbePaths(result.platform).feed;
  if (feed) interop.push(["req", `GET  https://${target.host}${feed}`]);
  for (const item of result.interop.items) {
    const state: CheckState = item.state === "found" ? "pass" : item.state === "absent" ? "fail" : "unknown";
    interop.push([state === "pass" ? "ok" : state === "fail" ? "bad" : "info", `${GLYPH[state]} ${item.label}`]);
  }
  lines.push(...spread(interop, 8.95, 9.7), { at: 9.8, tone: "ok", text: "✓ Interoperabilidad" });
  lines.push({ at: 9.95, tone: "info", text: `calculando la Visibilidad agéntica de ${result.domain}` });
  return lines;
}

function phrases(target: ScanTarget, result: AgenticCheckResult | null): ScanPhrase[] {
  const out: ScanPhrase[] = [{ at: 0, text: `Leyendo ${target.host} como lo lee un agente` }];
  if (!result) return out;
  const f = result.facts;
  const product = result.pageKind === "product";
  out.push({ at: 1.9, text: "Comprobando si ChatGPT, Claude, Perplexity y Gemini pueden entrar" });
  out.push({
    at: 3,
    text:
      product && f?.productName
        ? `Entendiendo «${f.productName}»${f.price ? ` a ${f.price}` : ""}`
        : "Entendiendo qué vende esta página"
  });
  out.push({ at: 5, text: `Revisando envío, devoluciones y reseñas de ${result.domain}` });
  out.push({ at: 6.6, text: `Probando el camino hasta el pago${result.platform ? ` en ${result.platform}` : ""}` });
  out.push({ at: 8.2, text: `Buscando canales directos para agentes en ${result.domain}` });
  return out;
}

export function buildScanScript(target: ScanTarget, result: AgenticCheckResult | null): ScanScript {
  return {
    lines: [...requestLines(target), ...(result ? resultLines(target, result) : [])],
    lanes: result ? resultLanes(result) : placeholderLanes(),
    phrases: phrases(target, result)
  };
}

/**
 * Scripted time for a real elapsed time. Before the response the clock holds
 * at `SCAN_HOLD_AT`; once it arrives, the rest plays in what is left of the
 * ten seconds, never squeezed below `SCAN_MIN_TAIL_S`.
 */
export function scriptedTime(elapsedS: number, arrivedAtS: number | null): number {
  if (arrivedAtS === null) return Math.min(elapsedS, SCAN_HOLD_AT);
  const startAt = Math.min(arrivedAtS, SCAN_HOLD_AT);
  const tail = Math.max(SCAN_MIN_TAIL_S, SCAN_DURATION_S - arrivedAtS);
  if (elapsedS <= arrivedAtS) return Math.min(elapsedS, startAt);
  return Math.min(SCAN_DURATION_S, startAt + ((elapsedS - arrivedAtS) * (SCAN_DURATION_S - startAt)) / tail);
}

/** How far a lane has gone at a scripted time, 0–1. */
export function laneProgress(lane: Pick<ScanLane, "t0" | "t1">, t: number): number {
  return Math.max(0, Math.min(1, (t - lane.t0) / (lane.t1 - lane.t0)));
}
