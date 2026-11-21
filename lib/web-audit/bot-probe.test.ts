import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { lookupMock } = vi.hoisted(() => ({ lookupMock: vi.fn() }));
vi.mock("node:dns/promises", () => ({ lookup: lookupMock }));

const { probeAiBotsOnServer } = await import("./bot-probe");

function ok(): Response {
  return new Response(null, { status: 200 });
}

describe("probeAiBotsOnServer (GEO-ALERTS-1, log §440)", () => {
  beforeEach(() => {
    lookupMock.mockResolvedValue([{ address: "8.8.8.8", family: 4 }]);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    lookupMock.mockReset();
  });

  it("asks the home page as ourselves, then as each search bot, and marks the refused one", async () => {
    const fetchMock = vi.fn(async (_url: string, init: { headers: Record<string, string> }) =>
      init.headers["user-agent"].includes("OAI-SearchBot") ? new Response(null, { status: 403 }) : ok()
    );
    vi.stubGlobal("fetch", fetchMock);
    const report = await probeAiBotsOnServer("acme.com");
    expect(report.baseline).toBe("ok");
    expect(report.engines.chatgpt?.state).toBe("blocked");
    expect(report.engines.claude?.state).toBe("allowed");
    expect(report.engines.perplexity?.state).toBe("allowed");
    expect(fetchMock).toHaveBeenCalledTimes(4);
    for (const call of fetchMock.mock.calls) {
      expect(call[0]).toBe("https://acme.com/");
      expect(call[1]).toMatchObject({ redirect: "manual" });
    }
  });

  it("reads a Cloudflare challenge as a block", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: { headers: Record<string, string> }) =>
        init.headers["user-agent"].includes("PerplexityBot")
          ? new Response(null, { status: 403, headers: { "cf-mitigated": "challenge" } })
          : ok()
      )
    );
    const report = await probeAiBotsOnServer("acme.com");
    expect(report.engines.perplexity?.state).toBe("blocked");
  });

  it("measures nothing when the home page refuses us too, or redirects off the domain", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 403 })));
    expect(await probeAiBotsOnServer("acme.com")).toMatchObject({ baseline: "unknown", engines: {} });

    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 301, headers: { location: "https://evil.com/" } })));
    expect(await probeAiBotsOnServer("acme.com")).toMatchObject({ baseline: "unknown" });
  });

  it("never requests a private address", async () => {
    lookupMock.mockResolvedValue([{ address: "10.0.0.1", family: 4 }]);
    const fetchMock = vi.fn(async () => ok());
    vi.stubGlobal("fetch", fetchMock);
    expect((await probeAiBotsOnServer("acme.com")).baseline).toBe("unknown");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
