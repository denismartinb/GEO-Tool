import type { AgenticCheckResult, AssistantName } from "@/lib/agentic-audit/api-contract";

/**
 * «Agentes que compran» (AGENTIC-SHOPPERS-1, log §427): the personal agents
 * that buy for someone, and what we can honestly say about each from the
 * stored review. Pure, so every line the card prints is under Vitest.
 *
 * Two questions, never mixed:
 * - **Te encuentra**: the robots.txt rule of the index the agent picks shops
 *   from. Only when its maker documents one; an agent that does not identify
 *   itself is «no se ve desde fuera», never green.
 * - **Entrar**: no maker promises to read robots.txt when its agent acts for a
 *   person (Meta, OpenAI and Google say so in their own docs). What stops it is
 *   the anti-bot protection, which we measure with our own identified robot,
 *   so the card says exactly that and never claims what a verified agent gets
 *   (log §319).
 */

export type ShoppingAgentId = "muse" | "dots" | "gemini-agent" | "comet" | "instinct" | "grok";

type AgentDef = {
  id: ShoppingAgentId;
  name: string;
  maker: string;
  /** The assistant whose robots.txt tokens decide whether it finds the site. `null`: undocumented. */
  findsVia: AssistantName | null;
  /** Logo in the console sprite, when we have one. */
  logo: string | null;
};

export const SHOPPING_AGENTS: AgentDef[] = [
  { id: "muse", name: "Muse", maker: "Meta", findsVia: "Meta", logo: "meta" },
  { id: "dots", name: "Dots", maker: "OpenAI", findsVia: "ChatGPT", logo: "chatgpt" },
  { id: "gemini-agent", name: "Agente de Gemini", maker: "Google", findsVia: "Gemini", logo: "gemini" },
  { id: "comet", name: "Comet", maker: "Perplexity", findsVia: "Perplexity", logo: "perplexity" },
  { id: "instinct", name: "Instinct", maker: "Agente personal", findsVia: null, logo: null },
  { id: "grok", name: "Grok Bot", maker: "xAI", findsVia: null, logo: null }
];

export type FindState = "yes" | "blocked" | "unknown" | "hidden";

export type ShoppingAgentRow = {
  id: ShoppingAgentId;
  name: string;
  maker: string;
  logo: string | null;
  finds: FindState;
  findsWord: string;
  /** One short line under the agent, only when there is something specific to say. */
  hint: string | null;
};

const FIND_WORD: Record<FindState, string> = {
  yes: "Te encuentra",
  blocked: "Bloqueado",
  unknown: "Sin comprobar",
  hidden: "No se ve desde fuera"
};

function isShopify(platform: string | null): boolean {
  return /shopify/i.test(platform ?? "");
}

export function shoppingAgentRows(result: AgenticCheckResult): ShoppingAgentRow[] {
  const access = new Map(result.agents.map((a) => [a.assistant, a.allowed]));
  return SHOPPING_AGENTS.map((agent) => {
    let finds: FindState;
    if (agent.findsVia === null) finds = "hidden";
    else {
      const allowed = access.get(agent.findsVia);
      // A review stored before Meta was measured has no entry: unknown, never assumed.
      finds = allowed === true ? "yes" : allowed === false ? "blocked" : "unknown";
    }
    let hint: string | null = null;
    if (agent.id === "muse" && finds === "blocked") hint = "Tu robots.txt cierra meta-webindexer";
    else if (agent.id === "muse" && finds === "unknown" && !access.has("Meta")) hint = "Se comprueba en la próxima revisión";
    else if (agent.id === "instinct") hint = isShopify(result.platform) ? "Vendes con Shopify: busca tiendas en su red" : "Busca tiendas en la red de Shopify";
    else if (agent.id === "grok") hint = "No publica cómo se identifica";
    else if (finds === "blocked") hint = `Tu robots.txt cierra a ${agent.findsVia}`;
    return { id: agent.id, name: agent.name, maker: agent.maker, logo: agent.logo, finds, findsWord: FIND_WORD[finds], hint };
  });
}

export type EnterState = "open" | "challenge" | "unknown";

/** «Entrar», the same for every agent: what our identified robot met (log §319). */
export function enterLine(result: Pick<AgenticCheckResult, "challenge">): { state: EnterState; word: string; line: string } {
  if (result.challenge === false) {
    return { state: "open", word: "Sin reto", line: "Tu web no pone retos a las visitas automáticas." };
  }
  if (result.challenge === true) {
    return {
      state: "challenge",
      word: "Reto anti-bots",
      line: "Tu web puso un reto a nuestra visita automática. Según cómo esté configurada tu protección, puede frenar también a los agentes que compran."
    };
  }
  return { state: "unknown", word: "Sin medir", line: "No pudimos comprobar tu protección anti-bots." };
}

/** «Te encuentran 4 de 5»: only the agents whose finding rule is documented and measured. */
export function findCount(rows: ShoppingAgentRow[]): { found: number; measured: number } {
  const measured = rows.filter((r) => r.finds === "yes" || r.finds === "blocked");
  return { found: measured.filter((r) => r.finds === "yes").length, measured: measured.length };
}

/**
 * The discovery warning light on «Visibilidad en agentes», split in two
 * (log §427): who can find you, then whether an automatic visit gets in.
 */
export function discoveryLightLine(result: AgenticCheckResult): string {
  const { found, measured } = findCount(shoppingAgentRows(result));
  const enter = enterLine(result);
  const finds = measured === 0 ? "No pudimos leer tu robots.txt" : `Te encuentran ${found} de ${measured}`;
  const enters = enter.state === "open" ? "entran sin reto" : enter.state === "challenge" ? "con reto anti-bots al entrar" : "entrada sin medir";
  return `${finds} · ${enters}`;
}

export type AgentAdvice = { id: string; title: string; body: string };

/**
 * Advice that carries no points (log §427): the anti-bot challenge is not
 * scored (log §319), and the Shopify network is a channel, not a check. Each
 * one comes from a measured fact of the review.
 */
export function shoppingAgentAdvice(result: AgenticCheckResult): AgentAdvice[] {
  const advice: AgentAdvice[] = [];
  if (result.challenge === true) {
    advice.push({
      id: "challenge",
      title: "Revisa tu protección anti-bots",
      body: "En Cloudflare, mira «Bot Fight Mode» y el bloqueo de bots de IA: frenan también a agentes que compran. En otro servicio, deja pasar a los bots verificados en vez de bloquear todo lo automático."
    });
  }
  if (isShopify(result.platform)) {
    advice.push({
      id: "shopify",
      title: "Los agentes ya te buscan en Shopify",
      body: "Instinct busca tiendas en la red de Shopify. Ten el catálogo completo, con precio y stock, y Shop Pay activo."
    });
  }
  return advice;
}
