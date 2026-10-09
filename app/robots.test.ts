import { describe, expect, it } from "vitest";
import robots from "./robots";
import { AI_CRAWLERS, DISALLOWED_PATHS } from "@/lib/seo/robots-rules";

type Rule = { userAgent?: string | string[]; allow?: string | string[]; disallow?: string | string[] };

function rulesOf(): Rule[] {
  const { rules } = robots();
  return Array.isArray(rules) ? rules : [rules];
}

describe("robots", () => {
  it("keeps the wildcard rule with the private surfaces disallowed", () => {
    const wildcard = rulesOf().find((r) => r.userAgent === "*");
    expect(wildcard).toBeDefined();
    expect(wildcard!.allow).toBe("/");
    expect(wildcard!.disallow).toEqual(DISALLOWED_PATHS);
  });

  it("names every AI crawler explicitly (GEO-SELF-1)", () => {
    const named = rulesOf().flatMap((r) => (Array.isArray(r.userAgent) ? r.userAgent : []));
    for (const bot of ["GPTBot", "OAI-SearchBot", "ChatGPT-User", "ClaudeBot", "PerplexityBot", "Google-Extended", "Bingbot"]) {
      expect(named, `falta ${bot}`).toContain(bot);
    }
    expect(new Set(named)).toEqual(new Set(AI_CRAWLERS));
  });

  it("every named group repeats the full disallow list — a named group replaces `*` for that crawler", () => {
    for (const rule of rulesOf()) {
      expect(rule.disallow, `${String(rule.userAgent)} abre zonas privadas`).toEqual(DISALLOWED_PATHS);
    }
  });

  it("declares the sitemap on the real domain", () => {
    expect(robots().sitemap).toBe("https://www.genscore.es/sitemap.xml");
  });
});
