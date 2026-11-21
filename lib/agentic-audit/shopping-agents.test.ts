import { describe, expect, it } from "vitest";

import { ASSISTANT_ROBOTS_TOKENS } from "@/lib/agentic-audit/agents";
import type { AgenticCheckResult, AgentAccess } from "@/lib/agentic-audit/api-contract";
import { robotsFix } from "@/lib/agentic-audit/score";
import {
  discoveryLightLine,
  enterLine,
  findCount,
  shoppingAgentAdvice,
  shoppingAgentRows
} from "@/lib/agentic-audit/shopping-agents";

function review(agents: AgentAccess[], challenge: boolean | null, platform: string | null = null): AgenticCheckResult {
  return { agents, challenge, platform } as unknown as AgenticCheckResult;
}

const FIVE: AgentAccess[] = [
  { assistant: "ChatGPT", allowed: true },
  { assistant: "Claude", allowed: true },
  { assistant: "Perplexity", allowed: true },
  { assistant: "Gemini", allowed: true },
  { assistant: "Meta", allowed: false }
];

describe("AGENTIC-SHOPPERS-1 (log §427)", () => {
  it("finds through each agent's documented index, and never paints green an agent that does not identify itself", () => {
    const rows = shoppingAgentRows(review(FIVE, true, "Shopify"));
    const by = Object.fromEntries(rows.map((r) => [r.id, r]));
    expect(by.muse.finds).toBe("blocked");
    expect(by.muse.hint).toBe("Tu robots.txt cierra meta-webindexer");
    expect(by.dots.finds).toBe("yes");
    expect(by.instinct.finds).toBe("hidden");
    expect(by.instinct.hint).toBe("Vendes con Shopify: busca tiendas en su red");
    expect(by.grok.finds).toBe("hidden");
    expect(findCount(rows)).toEqual({ found: 3, measured: 4 });
  });

  it("leaves Muse unchecked on a review stored before Meta was measured", () => {
    const rows = shoppingAgentRows(review(FIVE.slice(0, 4), false));
    const muse = rows.find((r) => r.id === "muse")!;
    expect(muse.finds).toBe("unknown");
    expect(muse.hint).toBe("Se comprueba en la próxima revisión");
  });

  it("says what our own robot met at the door, never what a verified agent gets", () => {
    expect(enterLine({ challenge: true }).line).toContain("nuestra visita automática");
    expect(enterLine({ challenge: false }).state).toBe("open");
    expect(enterLine({ challenge: null }).word).toBe("Sin medir");
  });

  it("splits the discovery light in two", () => {
    expect(discoveryLightLine(review(FIVE, true))).toBe("Te encuentran 3 de 4 · con reto anti-bots al entrar");
    expect(discoveryLightLine(review(FIVE.map((a) => ({ ...a, allowed: null })), null))).toBe(
      "No pudimos leer tu robots.txt · entrada sin medir"
    );
  });

  it("gives advice only from measured facts", () => {
    expect(shoppingAgentAdvice(review(FIVE, false, null))).toEqual([]);
    expect(shoppingAgentAdvice(review(FIVE, true, "Shopify")).map((a) => a.id)).toEqual(["challenge", "shopify"]);
  });

  it("carries no long dashes", () => {
    const text = JSON.stringify([
      shoppingAgentRows(review(FIVE, true, "Shopify")),
      enterLine({ challenge: true }),
      shoppingAgentAdvice(review(FIVE, true, "Shopify"))
    ]);
    expect(text).not.toMatch(/—/);
  });
});

describe("robots_agents fix names what to open (log §427)", () => {
  it("says «Deja que Muse te encuentre» only when Meta is the one blocked", () => {
    expect(robotsFix(["Meta"])).toBe("Deja que Muse te encuentre: abre meta-webindexer en tu robots.txt.");
    expect(robotsFix(["Perplexity", "Meta"])).toBe(
      "Deja pasar en robots.txt a Perplexity-User, PerplexityBot y meta-webindexer, si quieres que esos asistentes puedan recomendarte y comprar."
    );
  });

  it("counts Meta by its index only, never by the fetcher that may bypass robots.txt", () => {
    expect(ASSISTANT_ROBOTS_TOKENS.Meta).toEqual(["meta-webindexer"]);
  });
});
