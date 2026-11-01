import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  AI_BOT_SWITCHES,
  AI_BOT_TOKENS,
  PLUGIN_PENDING_SWITCHES,
  buildAiBotsRobotsBlock,
  engineReadStates,
  starGroupRules,
  switchStates
} from "@/lib/web-audit/ai-bots";
import { resolveAgentTokenAccess } from "@/lib/web-audit/robots";

const ROBOTS = `User-agent: *
Disallow: /carrito/
Allow: /carrito/publico
Disallow: /mi-cuenta/ # privado

User-agent: GPTBot
User-agent: PerplexityBot
Disallow: /

Sitemap: https://acme.es/sitemap.xml`;

function factsFrom(content: string) {
  return {
    robotsFound: true,
    bots: [],
    aiBots: {
      tokens: Object.fromEntries(AI_BOT_TOKENS.map((t) => [t, resolveAgentTokenAccess(content, t)])),
      starRules: starGroupRules(content)
    }
  };
}

describe("AI-BOTS-CONSOLE-1 (log §426)", () => {
  it("has the plugin's switches, with the same ids and tokens", () => {
    const php = readFileSync("docs/wordpress-plugin/genscore/includes/robots.php", "utf8");
    for (const sw of AI_BOT_SWITCHES) {
      // Meta reaches the plugin in its next version (log §427); until then it lives only here.
      if (PLUGIN_PENDING_SWITCHES.has(sw.id)) {
        expect(php).not.toContain(`'${sw.id}'`);
        continue;
      }
      const tokens = sw.tokens.map((t) => `'${t}'`).join(", ");
      expect(php).toContain(`'${sw.id}'`);
      expect(php).toContain(`array( ${tokens} )`);
    }
  });

  it("keeps only the * group's path rules", () => {
    expect(starGroupRules(ROBOTS)).toEqual(["Disallow: /carrito/", "Allow: /carrito/publico", "Disallow: /mi-cuenta/"]);
    expect(starGroupRules("User-agent: *\nDisallow: /\n")).toEqual([]);
  });

  it("reads engines from their search bots only", () => {
    const states = engineReadStates(factsFrom(ROBOTS));
    expect(states).toEqual({ chatgpt: true, gemini: true, claude: true, perplexity: false });
    // Meta is a switch, never an engine tile (log §427).
    expect(Object.keys(states)).not.toContain("meta");
    expect(switchStates(factsFrom(ROBOTS))).toMatchObject({ "chatgpt-training": false, "perplexity-search": false, "chatgpt-search": true });
  });

  it("says nothing when robots.txt could not be read", () => {
    const states = engineReadStates({ ...factsFrom(ROBOTS), probes: { robots: "unknown" } });
    expect(Object.values(states)).toEqual([null, null, null, null]);
  });

  it("generates a block that does what the switches say and keeps the * rules", () => {
    const want = Object.fromEntries(AI_BOT_SWITCHES.map((s) => [s.id, s.kind === "search"]));
    const block = buildAiBotsRobotsBlock(want, starGroupRules(ROBOTS));
    // The customer replaces their AI bot groups with this block; the rest stays.
    const rest = ROBOTS.replace(/User-agent: GPTBot\nUser-agent: PerplexityBot\nDisallow: \/\n/, "");
    const pasted = `${rest}\n\n${block}`;
    for (const sw of AI_BOT_SWITCHES) {
      for (const token of sw.tokens) expect(resolveAgentTokenAccess(pasted, token)).toBe(want[sw.id]);
    }
    expect(engineReadStates(factsFrom(pasted))).toEqual({ chatgpt: true, gemini: true, claude: true, perplexity: true });
    expect(block).toContain("User-agent: PerplexityBot\nUser-agent: Perplexity-User\nAllow: /\nDisallow: /carrito/");
    expect(block).not.toMatch(/User-agent: (\*|Googlebot|Bingbot)/);
    expect(block).toContain("User-agent: meta-webindexer\nAllow: /\nDisallow: /carrito/");
    expect(block).toContain("User-agent: meta-externalagent\nDisallow: /");
    // Meta's user-triggered fetcher may bypass robots.txt, so it is never a switch.
    expect(block).not.toContain("meta-externalfetcher");
  });

  it("reads Meta's tokens whatever their case", () => {
    const facts = factsFrom("User-agent: Meta-ExternalAgent\nDisallow: /\n");
    expect(switchStates(facts)).toMatchObject({ "meta-search": true, "meta-training": false });
  });
});
