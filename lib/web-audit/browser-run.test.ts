import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { browserRunConfigured, renderWithBrowserRun } from "./browser-run";

const env = { CLOUDFLARE_ACCOUNT_ID: "acc", CLOUDFLARE_BROWSER_TOKEN: "tok" } as unknown as NodeJS.ProcessEnv;
const res = (status: number, body: unknown) => new Response(typeof body === "string" ? body : JSON.stringify(body), { status });

describe("renderWithBrowserRun (AI-READ-2, log §451)", () => {
  it("needs both variables", () => {
    expect(browserRunConfigured({} as NodeJS.ProcessEnv)).toBe(false);
    expect(browserRunConfigured(env)).toBe(true);
  });

  it("returns the rendered HTML and sends only the page URL", async () => {
    const fetchImpl = vi.fn(async () => res(200, { success: true, result: "<html>ok</html>" }));
    const out = await renderWithBrowserRun("https://acme.com/", { timeoutMs: 20_000, fetchImpl: fetchImpl as never, env });
    expect(out).toEqual({ kind: "ok", html: "<html>ok</html>" });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.cloudflare.com/client/v4/accounts/acc/browser-run/content");
    expect(JSON.parse(String(init.body))).toMatchObject({ url: "https://acme.com/" });
  });

  it("falls back to the old path, and classifies quota, config and page failures", async () => {
    const seq = [res(404, ""), res(200, { success: true, result: "<p>x</p>" })];
    const fetchImpl = vi.fn(async () => seq.shift()!);
    expect((await renderWithBrowserRun("https://a.com/", { timeoutMs: 5000, fetchImpl: fetchImpl as never, env })).kind).toBe("ok");
    expect(String((fetchImpl.mock.calls[1] as unknown[])[0])).toContain("/browser-rendering/content");
    const one = (r: Response) => vi.fn(async () => r) as never;
    expect((await renderWithBrowserRun("https://a.com/", { timeoutMs: 5000, fetchImpl: one(res(429, "")), env })).kind).toBe("quota");
    expect((await renderWithBrowserRun("https://a.com/", { timeoutMs: 5000, fetchImpl: one(res(403, "")), env })).kind).toBe("config");
    expect((await renderWithBrowserRun("https://a.com/", { timeoutMs: 5000, fetchImpl: one(res(500, "")), env })).kind).toBe("page_failed");
    expect((await renderWithBrowserRun("https://a.com/", { timeoutMs: 5000, fetchImpl: one(res(200, { success: false })), env })).kind).toBe("page_failed");
    const boom = vi.fn(async () => {
      throw new Error("network");
    });
    expect((await renderWithBrowserRun("https://a.com/", { timeoutMs: 5000, fetchImpl: boom as never, env })).kind).toBe("page_failed");
  });
});
