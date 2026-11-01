import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { describeTool, handleRpc, negotiateVersion, type ToolDef } from "./protocol";

type Ctx = { who: string };
const run = vi.fn(async () => ({ text: "hola", structured: { a: 1 } }));
const TOOLS: ToolDef<Ctx>[] = [
  { name: "cuenta", title: "Cuenta", description: "d", inputSchema: { type: "object" }, args: z.object({}).passthrough(), access: "account", openWorld: false, run },
  {
    name: "publica",
    title: "Pública",
    description: "d",
    inputSchema: { type: "object" },
    args: z.object({ url: z.string() }),
    access: "public",
    openWorld: true,
    run
  }
];
const anon = { who: "x", signedIn: false };
const signed = { who: "x", signedIn: true };
const call = (name: string, args: unknown = {}) => ({ jsonrpc: "2.0", id: 7, method: "tools/call", params: { name, arguments: args } });

describe("MCP protocol (MCP-SERVER-1, log §418)", () => {
  it("initializes with a version both sides speak", async () => {
    const out = await handleRpc({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } }, anon, TOOLS);
    expect(out).toMatchObject({ kind: "reply", body: { id: 1, result: { protocolVersion: "2025-06-18", serverInfo: { name: "genscore" } } } });
    expect(negotiateVersion("1999-01-01")).toBe("2025-11-25");
  });

  it("acknowledges notifications without a body", async () => {
    expect(await handleRpc({ jsonrpc: "2.0", method: "notifications/initialized" }, anon, TOOLS)).toEqual({ kind: "accepted" });
  });

  it("lists every tool as read-only, with title and explicit hints (both directories require them)", async () => {
    const out = await handleRpc({ jsonrpc: "2.0", id: 2, method: "tools/list" }, anon, TOOLS);
    const tools = (out as unknown as { body: { result: { tools: Array<Record<string, any>> } } }).body.result.tools;
    for (const t of tools) {
      expect(t.title).toBeTruthy();
      expect(t.annotations).toMatchObject({ readOnlyHint: true, destructiveHint: false });
      expect(typeof t.annotations.openWorldHint).toBe("boolean");
    }
    expect(describeTool(TOOLS[0]).securitySchemes).toEqual([{ type: "oauth2" }]);
    expect(describeTool(TOOLS[1]).securitySchemes).toEqual([{ type: "noauth" }, { type: "oauth2" }]);
  });

  it("asks for sign-in before running an account tool, and never runs it", async () => {
    run.mockClear();
    expect(await handleRpc(call("cuenta"), anon, TOOLS)).toEqual({ kind: "needs_auth" });
    expect(run).not.toHaveBeenCalled();
  });

  it("runs a public tool without an account and an account tool with one", async () => {
    const pub = await handleRpc(call("publica", { url: "https://a.es" }), anon, TOOLS);
    expect(pub).toMatchObject({ body: { result: { content: [{ type: "text", text: "hola" }], structuredContent: { a: 1 } } } });
    expect(await handleRpc(call("cuenta"), signed, TOOLS)).toMatchObject({ kind: "reply" });
  });

  it("answers bad arguments and failures as a tool error, never with internals", async () => {
    const bad = await handleRpc(call("publica", { url: 3 }), anon, TOOLS);
    expect(bad).toMatchObject({ body: { result: { isError: true } } });
    run.mockRejectedValueOnce(new Error("postgres: secret detail"));
    const boom = await handleRpc(call("publica", { url: "x" }), anon, TOOLS);
    expect(JSON.stringify(boom)).not.toContain("secret");
    expect(boom).toMatchObject({ body: { result: { isError: true } } });
  });

  it("rejects unknown tools and methods", async () => {
    expect(await handleRpc(call("borrar_todo"), signed, TOOLS)).toMatchObject({ body: { error: { code: -32602 } } });
    expect(await handleRpc({ jsonrpc: "2.0", id: 3, method: "sampling/createMessage" }, signed, TOOLS)).toMatchObject({ body: { error: { code: -32601 } } });
    expect(await handleRpc({ nope: true }, signed, TOOLS)).toMatchObject({ body: { error: { code: -32600 } } });
  });

  it("speaks ChatGPT's dialect when asked (MCP-CHATGPT-SUBMIT-1, log §429)", async () => {
    const opts = { oauthScopes: ["openid", "email"], outputSchema: true, authChallenge: 'Bearer resource_metadata="m", error="invalid_token", error_description="x"' };
    const d = describeTool(TOOLS[1], opts);
    expect(d.outputSchema).toEqual({ type: "object", additionalProperties: true });
    expect(d.securitySchemes).toEqual([{ type: "noauth" }, { type: "oauth2", scopes: ["openid", "email"] }]);
    run.mockClear();
    const gated = await handleRpc(call("cuenta"), anon, TOOLS, opts);
    expect(gated).toMatchObject({ kind: "reply", body: { result: { isError: true, _meta: { "mcp/www_authenticate": [opts.authChallenge] } } } });
    expect(run).not.toHaveBeenCalled();
    run.mockResolvedValueOnce({ text: "sin objeto" } as never);
    const bare = await handleRpc(call("publica", { url: "x" }), anon, TOOLS, opts);
    expect(bare).toMatchObject({ body: { result: { structuredContent: {} } } });
    expect(describeTool(TOOLS[1]).outputSchema).toBeUndefined();
  });
});
