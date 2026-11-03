import type { AgenticCheckResult, AgenticComponentId } from "@/lib/agentic-audit/api-contract";
import { isAgenticBrowserRead, type AgenticBrowserRead } from "@/lib/agentic-audit/browser-obstacles";
import { componentLine, componentStatus, firstSteps, type Tone } from "@/lib/agentic-audit/console-model";

/**
 * AGENTS-BROWSER-1 (log §453): «Hasta dónde llega cada agente» and «Lo que se
 * encuentra un agente que navega» on «Visibilidad en agentes». Two kinds of
 * agent stumble on different things:
 *
 * - Agents that read without a browser (the searches of ChatGPT, Claude and
 *   Perplexity) only get what the HTML carries: their lane is the stored
 *   review, as today.
 * - Agents that browse like a person (Grok Bot, Instinct, the ChatGPT agent)
 *   run JavaScript, so their lane comes from the page as our browser painted
 *   it (`result.browser`): what stands in front of the product.
 *
 * Gemini is in neither list: it answers from Google's index, and Google runs
 * JavaScript when it indexes. Pure: every word the screen prints is here, and
 * nothing here changes the score.
 */

export type LaneStation = { id: AgenticComponentId; title: string; tone: Tone; line: string };
export type LaneReach = { tone: Tone; label: string };
export type Lane = { stations: LaneStation[]; reach: LaneReach };
export type Brake = { title: string; line: string };

export type NavState = "measured" | "measuring" | "blocked" | "unmeasured";

export type ObstacleId = "cookies" | "price" | "options" | "buy" | "challenge";
export type Obstacle = { id: ObstacleId; tone: Exclude<Tone, "na">; word: string; title: string; line: string };

export type NavStep = { key: string; title: string };

export type AgentLanes = {
  read: Lane;
  nav: Lane;
  navState: NavState;
  readBrake: Brake | null;
  navBrake: Brake | null;
  obstacles: Obstacle[];
  navSteps: NavStep[];
  /** What the mock browser window shows, all of it read from the page. */
  window: {
    url: string;
    name: string | null;
    price: string | null;
    options: boolean;
    buy: string | null;
    cookies: boolean;
  } | null;
};

const TITLES: Record<AgenticComponentId, string> = {
  discovery: "Entra",
  understanding: "Entiende",
  trust: "Se fía",
  purchase: "Compra"
};
const ORDER: AgenticComponentId[] = ["discovery", "understanding", "trust", "purchase"];
const WORD: Record<Obstacle["tone"], string> = { ok: "Bien", warn: "Cuesta", bad: "Frena" };

export const READ_AGENTS = "Búsquedas de ChatGPT, Claude y Perplexity";
export const NAV_AGENTS = "Grok Bot, Instinct, el agente de ChatGPT";

function reachOf(stations: LaneStation[]): LaneReach {
  if (stations.every((s) => s.tone === "na")) return { tone: "na", label: "Sin medir" };
  const stop = stations.findIndex((s) => s.tone === "bad");
  if (stop === -1) return { tone: stations.some((s) => s.tone === "warn") ? "warn" : "ok", label: "Llegan a Compra" };
  if (stop === 0) return { tone: "bad", label: "No pasan de la puerta" };
  return { tone: "bad", label: `Se quedan en ${stations[stop - 1].title}` };
}

function readLane(result: AgenticCheckResult): Lane {
  const stations = ORDER.map((id) => {
    const component = result.components.find((c) => c.id === id);
    if (!component) return { id, title: TITLES[id], tone: "na" as const, line: "Sin medir" };
    return { id, title: TITLES[id], tone: componentStatus(component, result).tone, line: componentLine(result, component) };
  });
  return { stations, reach: reachOf(stations) };
}

function navLane(result: AgenticCheckResult, read: AgenticBrowserRead | undefined): Lane {
  const trust = result.components.find((c) => c.id === "trust");
  const trustStation: LaneStation = trust
    ? { id: "trust", title: TITLES.trust, tone: componentStatus(trust, result).tone, line: componentLine(result, trust) }
    : { id: "trust", title: TITLES.trust, tone: "na", line: "Sin medir" };
  if (!read || read.state !== "ok") {
    // The card says why once (`NAV_STATE_LINE`); the stations stay blank.
    const line = "";
    const na = (id: AgenticComponentId): LaneStation => ({ id, title: TITLES[id], tone: "na", line });
    return { stations: [na("discovery"), na("understanding"), { ...trustStation, tone: "na", line }, na("purchase")], reach: { tone: "na", label: "Sin medir" } };
  }
  const price: LaneStation =
    read.price.state === "exact"
      ? { id: "understanding", title: TITLES.understanding, tone: "ok", line: read.price.text ? `Ven el precio, ${read.price.text}` : "Ven el precio" }
      : read.price.state === "from"
        ? { id: "understanding", title: TITLES.understanding, tone: "warn", line: "Sólo ven un precio «desde»" }
        : { id: "understanding", title: TITLES.understanding, tone: "bad", line: "No ven ningún precio" };
  const buy: LaneStation =
    read.buy.state === "missing"
      ? { id: "purchase", title: TITLES.purchase, tone: "bad", line: "No ven un botón de compra" }
      : read.buy.state === "unnamed"
        ? { id: "purchase", title: TITLES.purchase, tone: "warn", line: "El botón no tiene nombre" }
        : read.cookies
          ? { id: "purchase", title: TITLES.purchase, tone: "warn", line: "Tras cerrar el aviso de cookies" }
          : read.options === "unlabeled"
            ? { id: "purchase", title: TITLES.purchase, tone: "warn", line: "Tras adivinar una opción" }
            : { id: "purchase", title: TITLES.purchase, tone: "ok", line: read.buy.text ? `«${read.buy.text}» a la vista` : "Botón a la vista" };
  const stations: LaneStation[] = [
    { id: "discovery", title: TITLES.discovery, tone: "ok", line: "Sin reto anti-bots" },
    price,
    trustStation,
    buy
  ];
  return { stations, reach: reachOf(stations) };
}

/** The page's own price, read without JavaScript, is missing while the browser shows one. */
function priceOnlyWithJs(result: AgenticCheckResult, read: AgenticBrowserRead | undefined): boolean {
  return read?.state === "ok" && read.price.state !== "missing" && !result.facts?.price;
}

function readBrakeOf(result: AgenticCheckResult, read: AgenticBrowserRead | undefined): Brake | null {
  if (priceOnlyWithJs(result, read)) return { title: "No les llega tu precio", line: "Está en la ficha, pero sólo con JavaScript." };
  const step = firstSteps(result, 1)[0];
  return step ? { title: step.title, line: step.seen } : null;
}

function obstaclesOf(read: Extract<AgenticBrowserRead, { state: "ok" }>): Obstacle[] {
  const out: Obstacle[] = [];
  const add = (id: ObstacleId, tone: Obstacle["tone"], title: string, line: string) => out.push({ id, tone, word: WORD[tone], title, line });
  add(
    "cookies",
    read.cookies ? "warn" : "ok",
    "Aviso de cookies",
    read.cookies ? "Sale al entrar y hay que cerrarlo antes de seguir." : "No vemos uno que se ponga delante al entrar."
  );
  if (read.price.state === "exact") add("price", "ok", "Precio", read.price.text ? `Se ve el precio: ${read.price.text}.` : "Se ve el precio.");
  else if (read.price.state === "from")
    add("price", "warn", "Precio exacto", `Sale «${read.price.text ?? "desde"}»; el precio final depende de lo que se elija.`);
  else add("price", "bad", "Precio", "No vemos ningún precio en la página.");
  if (read.options === "labeled") add("options", "ok", "Opciones del producto", "Cada opción dice qué elige.");
  if (read.options === "unlabeled") add("options", "warn", "Opciones del producto", "Hay un selector que no dice qué elige.");
  if (read.buy.state === "named") add("buy", "ok", "Botón de compra", read.buy.text ? `«${read.buy.text}», con nombre claro.` : "Con nombre claro.");
  else if (read.buy.state === "unnamed") add("buy", "warn", "Botón de compra", "Es un icono sin texto: un agente no sabe qué hace.");
  else add("buy", "bad", "Botón de compra", "No vemos un botón para comprar o contratar.");
  add("challenge", "ok", "Reto anti-bots", "Nuestro navegador entró sin que le pararan.");
  // What frena first, then what cuesta, then what is fine.
  const rank = { bad: 0, warn: 1, ok: 2 } as const;
  return out.map((o, i) => ({ o, i })).sort((a, b) => rank[a.o.tone] - rank[b.o.tone] || a.i - b.i).map(({ o }) => o);
}

const NAV_BRAKE: Partial<Record<ObstacleId, Brake>> = {
  cookies: { title: "El aviso de cookies se pone delante", line: "Tienen que cerrarlo antes de seguir." },
  options: { title: "Una opción no dice qué elige", line: "Les cuesta saber qué talla, color o plan marcan." }
};

function navBrakeOf(obstacles: Obstacle[]): Brake | null {
  const first = obstacles.find((o) => o.tone !== "ok");
  if (!first) return null;
  if (first.id === "price") return first.tone === "bad" ? { title: "No ven tu precio", line: "Tampoco con un navegador." } : { title: "No ven el precio exacto", line: first.line };
  if (first.id === "buy") return first.tone === "bad" ? { title: "No encuentran el botón de compra", line: first.line } : { title: "El botón de compra no tiene nombre", line: first.line };
  return NAV_BRAKE[first.id] ?? null;
}

const NAV_STEP: Record<string, string> = {
  cookies: "Que el aviso de cookies ocupe una franja y no tape el producto",
  "price-from": "Enseña el precio de la opción más vendida",
  "price-missing": "Pon el precio a la vista en la ficha",
  options: "Pon nombre a cada selector (talla, color, plan)",
  "buy-unnamed": "Pon texto al botón de compra",
  "buy-missing": "Pon un botón de compra a la vista"
};

function navStepsOf(read: Extract<AgenticBrowserRead, { state: "ok" }>): NavStep[] {
  const keys: string[] = [];
  if (read.buy.state !== "named") keys.push(`buy-${read.buy.state}`);
  if (read.price.state !== "exact") keys.push(`price-${read.price.state}`);
  if (read.cookies) keys.push("cookies");
  if (read.options === "unlabeled") keys.push("options");
  return keys.slice(0, 2).map((key) => ({ key, title: NAV_STEP[key] }));
}

export function agentLanes(result: AgenticCheckResult): AgentLanes {
  const read = isAgenticBrowserRead(result.browser) ? result.browser : undefined;
  const navState: NavState = !read ? "measuring" : read.state === "ok" ? "measured" : read.state;
  const ok = read?.state === "ok" ? read : null;
  const obstacles = ok ? obstaclesOf(ok) : [];
  return {
    read: readLane(result),
    nav: navLane(result, read),
    navState,
    readBrake: readBrakeOf(result, read),
    navBrake: ok ? navBrakeOf(obstacles) : null,
    obstacles,
    navSteps: ok ? navStepsOf(ok) : [],
    window: ok
      ? {
          url: result.url,
          name: result.facts?.productName ?? result.facts?.title ?? null,
          price: ok.price.state === "missing" ? null : ok.price.text,
          options: ok.options !== "none",
          buy: ok.buy.state === "named" ? ok.buy.text : null,
          cookies: ok.cookies
        }
      : null
  };
}

/** What the lanes card says when the browser could not give a reading. */
export const NAV_STATE_LINE: Record<Exclude<NavState, "measured">, string> = {
  measuring: "Estamos abriendo tu página con un navegador. Lo verás aquí en unas horas.",
  blocked: "Un reto anti-bots paró a nuestro navegador. No lo contamos en contra.",
  unmeasured: "No pudimos abrir tu página con un navegador. Lo volvemos a intentar mañana."
};
