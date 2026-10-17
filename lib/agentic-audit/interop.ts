import type { InteropItem } from "@/lib/agentic-audit/api-contract";

/**
 * AGENTIC-COMMERCE-1: Interoperabilidad: does the store publish a direct
 * channel for agents? Four items, each read from a fixed, well-known URL on
 * the store's own domain. No link is followed and nothing is discovered:
 * the list of URLs is constant (`interopProbePaths`).
 *
 * - UCP: the business profile at `/.well-known/ucp`.
 * - MCP: an MCP transport declared in that profile, or an MCP server card
 *   at `/.well-known/mcp.json`.
 * - A2A: the agent card at `/.well-known/agent-card.json` (older servers:
 *   `/.well-known/agent.json`).
 * - Feed: a public product catalogue an agent can read as data. Only two
 *   are visible from outside, Shopify's `/products.json` and the
 *   WooCommerce Store API. Feeds sent privately to Google or OpenAI cannot
 *   be seen, so for any other platform the state is `unknown`, never
 *   `absent`.
 *
 * The total is shown as «N de 4» and stays out of the score
 * (`docs/adr/0043`).
 */

export type Probe = { state: "found" | "absent" | "unknown"; body: string | null };

export const INTEROP_TOTAL = 4;

export function parseJsonObject(body: string | null): Record<string, unknown> | null {
  if (!body) return null;
  try {
    const value: unknown = JSON.parse(body);
    return typeof value === "object" && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function parseJson(body: string | null): unknown {
  if (!body) return undefined;
  try {
    return JSON.parse(body);
  } catch {
    return undefined;
  }
}

/** Whether any key or string value in the profile names an MCP transport or endpoint. */
export function profileDeclaresMcp(profile: Record<string, unknown>): boolean {
  let found = false;
  const visit = (value: unknown, depth: number) => {
    if (found || depth > 10 || value === null || value === undefined) return;
    if (typeof value === "string") {
      if (/^mcp$|\/mcp\b|\bmcp:/i.test(value.trim())) found = true;
      return;
    }
    if (Array.isArray(value)) {
      for (const v of value) visit(v, depth + 1);
      return;
    }
    if (typeof value === "object") {
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        if (k.toLowerCase() === "mcp") {
          found = true;
          return;
        }
        visit(v, depth + 1);
      }
    }
  };
  visit(profile, 0);
  return found;
}

export type InteropProbes = {
  ucp: Probe;
  mcpCard: Probe;
  agentCard: Probe;
  agentCardLegacy: Probe;
  /** `null` when the platform has no public catalogue we know how to read. */
  feed: Probe | null;
  feedPlatform: string | null;
};

function stateOf(probe: Probe, valid: boolean): InteropItem["state"] {
  if (probe.state === "found") return valid ? "found" : "absent";
  return probe.state;
}

export function buildInterop(probes: InteropProbes): { found: number; total: number; items: InteropItem[] } {
  const ucpProfile = probes.ucp.state === "found" ? parseJsonObject(probes.ucp.body) : null;
  const ucpState = stateOf(probes.ucp, ucpProfile !== null);

  const mcpCard = probes.mcpCard.state === "found" ? parseJsonObject(probes.mcpCard.body) : null;
  const mcpFromProfile = ucpProfile !== null && profileDeclaresMcp(ucpProfile);
  const mcpState: InteropItem["state"] =
    mcpFromProfile || mcpCard !== null
      ? "found"
      : probes.mcpCard.state === "unknown" || probes.ucp.state === "unknown"
        ? "unknown"
        : "absent";

  const cardOf = (probe: Probe) => {
    const card = probe.state === "found" ? parseJsonObject(probe.body) : null;
    return card !== null && typeof card.name === "string" ? card : null;
  };
  const agentCard = cardOf(probes.agentCard) ?? cardOf(probes.agentCardLegacy);
  const a2aState: InteropItem["state"] =
    agentCard !== null
      ? "found"
      : probes.agentCard.state === "unknown" && probes.agentCardLegacy.state === "unknown"
        ? "unknown"
        : "absent";

  let feedState: InteropItem["state"] = "unknown";
  let feedDetail = "Un feed enviado a Google u OpenAI no se ve desde fuera.";
  if (probes.feed) {
    const parsed = parseJson(probes.feed.body);
    const valid =
      (Array.isArray(parsed) && probes.feedPlatform === "WooCommerce") ||
      (typeof parsed === "object" && parsed !== null && Array.isArray((parsed as { products?: unknown }).products));
    feedState = stateOf(probes.feed, valid);
    feedDetail =
      feedState === "found"
        ? `Tu catálogo de ${probes.feedPlatform} se puede leer como datos.`
        : feedState === "absent"
          ? `El catálogo público de ${probes.feedPlatform} está cerrado.`
          : `No pudimos leer el catálogo público de ${probes.feedPlatform}.`;
  }

  const items: InteropItem[] = [
    {
      id: "ucp",
      label: "Perfil UCP",
      state: ucpState,
      detail:
        ucpState === "found"
          ? "Publicas tu perfil de comercio para agentes."
          : ucpState === "absent"
            ? "No publicas el perfil UCP en /.well-known/ucp."
            : "No pudimos leer /.well-known/ucp."
    },
    {
      id: "mcp",
      label: "Catálogo por MCP",
      state: mcpState,
      detail:
        mcpState === "found"
          ? "Declaras un servidor MCP para que los agentes consulten tu tienda."
          : mcpState === "absent"
            ? "No declaras ningún servidor MCP."
            : "No pudimos comprobar si declaras un servidor MCP."
    },
    {
      id: "a2a",
      label: "Tarjeta de agente A2A",
      state: a2aState,
      detail:
        a2aState === "found"
          ? "Publicas una tarjeta de agente A2A."
          : a2aState === "absent"
            ? "No publicas tarjeta de agente en /.well-known/agent-card.json."
            : "No pudimos leer tu tarjeta de agente."
    },
    { id: "feed", label: "Feed de producto", state: feedState, detail: feedDetail }
  ];

  return { found: items.filter((i) => i.state === "found").length, total: INTEROP_TOTAL, items };
}

/** The fixed URLs this module reads. Nothing else is ever requested for interoperability. */
export function interopProbePaths(platform: string | null): {
  ucp: string;
  mcpCard: string;
  agentCard: string;
  agentCardLegacy: string;
  feed: string | null;
} {
  return {
    ucp: "/.well-known/ucp",
    mcpCard: "/.well-known/mcp.json",
    agentCard: "/.well-known/agent-card.json",
    agentCardLegacy: "/.well-known/agent.json",
    feed:
      platform === "Shopify"
        ? "/products.json?limit=1"
        : platform === "WooCommerce"
          ? "/wp-json/wc/store/v1/products?per_page=1"
          : null
  };
}
