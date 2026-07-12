import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveBotAccess, buildBotAccessReport, TRACKED_BOT_AGENTS } from "./robots";

describe("resolveBotAccess", () => {
  it("blocks a bot with an exact-token Disallow: / group", () => {
    const content = `User-agent: GPTBot\nDisallow: /\n\nUser-agent: *\nDisallow:\n`;
    const result = resolveBotAccess(content);
    expect(result.get("GPTBot")).toBe(false);
    expect(result.get("Bingbot")).toBe(true); // falls back to * group, which allows
  });

  it("is case-insensitive when matching the user-agent token", () => {
    const content = `User-agent: gptbot\nDisallow: /\n`;
    expect(resolveBotAccess(content).get("GPTBot")).toBe(false);
  });

  it("does not block on a partial-path Disallow", () => {
    const content = `User-agent: PerplexityBot\nDisallow: /private\n`;
    expect(resolveBotAccess(content).get("PerplexityBot")).toBe(true);
  });

  it("prefers an exact-token group over the wildcard group", () => {
    const content = `User-agent: *\nDisallow: /\n\nUser-agent: ClaudeBot\nDisallow:\n`;
    const result = resolveBotAccess(content);
    expect(result.get("ClaudeBot")).toBe(true);
    expect(result.get("Bingbot")).toBe(false); // no exact group, falls back to blocked wildcard
  });

  it("treats a bot with no matching group and no wildcard as allowed", () => {
    const content = `User-agent: SomeOtherBot\nDisallow: /\n`;
    const result = resolveBotAccess(content);
    for (const agent of TRACKED_BOT_AGENTS) {
      expect(result.get(agent)).toBe(true);
    }
  });

  it("groups consecutive User-agent lines together", () => {
    const content = `User-agent: GPTBot\nUser-agent: ClaudeBot\nDisallow: /\n`;
    const result = resolveBotAccess(content);
    expect(result.get("GPTBot")).toBe(false);
    expect(result.get("ClaudeBot")).toBe(false);
  });

  it("ignores comments and blank lines", () => {
    const content = `# comment\nUser-agent: GPTBot\n\n# another comment\nDisallow: /\n`;
    expect(resolveBotAccess(content).get("GPTBot")).toBe(false);
  });
});

describe("buildBotAccessReport", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("treats a missing robots.txt as crawl-default (all allowed), flagged robotsFound: false", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 404 }))
    );

    const report = await buildBotAccessReport("example.com");
    expect(report.robotsFound).toBe(false);
    expect(report.bots.every((b) => b.allowed)).toBe(true);
    expect(report.llmsTxtFound).toBe(false);
    expect(report.llmsTxtBytes).toBeNull();
    expect(report.sitemapFound).toBe(false);
  });

  it("parses a real robots.txt and reports llms.txt/sitemap.xml presence + byte size", async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes("robots.txt")) {
        return Promise.resolve(
          new Response("User-agent: GPTBot\nDisallow: /\n", { status: 200 })
        );
      }
      if (url.includes("llms.txt")) {
        return Promise.resolve(new Response("hello world", { status: 200 }));
      }
      if (url.includes("sitemap.xml")) {
        return Promise.resolve(new Response("<urlset></urlset>", { status: 200 }));
      }
      return Promise.resolve(new Response(null, { status: 404 }));
    });
    vi.stubGlobal("fetch", fetchMock);

    const report = await buildBotAccessReport("example.com");
    expect(report.robotsFound).toBe(true);
    expect(report.bots.find((b) => b.agent === "GPTBot")?.allowed).toBe(false);
    expect(report.llmsTxtFound).toBe(true);
    expect(report.llmsTxtBytes).toBe(Buffer.byteLength("hello world", "utf-8"));
    expect(report.sitemapFound).toBe(true);
  });

  it("treats a fetch error as a missing file rather than throwing", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    await expect(buildBotAccessReport("example.com")).resolves.toMatchObject({
      robotsFound: false,
      llmsTxtFound: false,
      sitemapFound: false
    });
  });
});
