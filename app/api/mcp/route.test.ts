import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * MCP-SERVER-1 (log §418): the HTTP side of the MCP endpoint. The 401 with
 * `WWW-Authenticate` is what makes Claude and ChatGPT open GenScore's
 * sign-in, so it is pinned here.
 */

const accountFromBearer = vi.fn();
vi.mock("@/lib/mcp/auth", () => ({ accountFromBearer: (h: string | null) => accountFromBearer(h) }));
const listExtProjects = vi.fn();
vi.mock("@/lib/ext/account", () => ({ listExtProjects: (a: unknown) => listExtProjects(a) }));
vi.mock("@/lib/ext/project-data", () => ({ loadExtProjectData: vi.fn(), normalizeHost: (h: string) => h, pickProject: vi.fn() }));
vi.mock("@/lib/page-review/review", () => ({ reviewPage: vi.fn() }));
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: vi.fn() }));
vi.mock("@/lib/analytics/funnel-events", () => ({ captureFunnelEvent: vi.fn() }));
const getFounderOffer = vi.fn();
vi.mock("@/lib/stripe", () => ({ getFounderOffer: () => getFounderOffer() }));
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), after: vi.fn() }));

import { POST as POST_CHATGPT } from "./chatgpt/route";
import { GET, POST } from "./route";

const post = (body: unknown, auth?: string, handler = POST, path = "/api/mcp") =>
  handler(
    new Request(`https://www.genscore.es${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(auth ? { authorization: auth } : {}) },
      body: JSON.stringify(body)
    })
  );
const ACCOUNT = { user: { id: "u1", email: "a@b.es" }, planId: "pro", planName: "Pro", trialEndsAt: null };

beforeEach(() => {
  vi.clearAllMocks();
  accountFromBearer.mockResolvedValue({ kind: "none" });
  getFounderOffer.mockResolvedValue({ planIds: ["starter", "pro"], remaining: 12, total: 38 });
});

const call = (name: string, args: Record<string, unknown> = {}) => ({ jsonrpc: "2.0", id: 9, method: "tools/call", params: { name, arguments: args } });
const textOf = async (res: Response) => (await res.json()).result.content[0].text as string;

describe("POST /api/mcp", () => {
  it("lets anyone shake hands and list tools", async () => {
    const res = await post({ jsonrpc: "2.0", id: 1, method: "tools/list" });
    expect(res.status).toBe(200);
    const names = (await res.json()).result.tools.map((t: { name: string }) => t.name);
    expect(names).toEqual([
      "listar_dominios",
      "ver_dominio",
      "ver_recomendaciones",
      "ver_competidores",
      "ver_prompts",
      "ver_auditorias",
      "ver_posicion_google",
      "revisar_pagina",
      "buscar_guias",
      "que_es_genscore"
    ]);
  });

  it("answers an account tool without a token with 401 and the resource metadata", async () => {
    const res = await post({ jsonrpc: "2.0", id: 2, method: "tools/call", params: { name: "listar_dominios", arguments: {} } });
    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toBe(
      'Bearer realm="GenScore", resource_metadata="https://www.genscore.es/.well-known/oauth-protected-resource/api/mcp"'
    );
    expect(listExtProjects).not.toHaveBeenCalled();
  });

  it("answers an invalid or expired token with 401 invalid_token, before reading anything", async () => {
    accountFromBearer.mockResolvedValue({ kind: "invalid" });
    const res = await post({ jsonrpc: "2.0", id: 3, method: "tools/list" }, "Bearer xxxxxxxxxxxxxxxxxxxxxxxx");
    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toContain('error="invalid_token"');
  });

  it("reads only the signed-in account's own domains", async () => {
    accountFromBearer.mockResolvedValue({ kind: "ok", account: ACCOUNT });
    listExtProjects.mockResolvedValue([{ id: "p1", name: "Marca", brand: "Marca", domain: "marca.es" }]);
    const res = await post({ jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "listar_dominios", arguments: {} } }, "Bearer tokentokentokentokentoken");
    expect(res.status).toBe(200);
    expect(listExtProjects).toHaveBeenCalledWith(ACCOUNT);
    expect((await res.json()).result.content[0].text).toContain("- marca.es (Marca)");
  });

  it("acknowledges notifications with 202 and no body", async () => {
    const res = await post({ jsonrpc: "2.0", method: "notifications/initialized" });
    expect(res.status).toBe(202);
  });

  it("never caches an answer", async () => {
    const res = await post({ jsonrpc: "2.0", id: 5, method: "ping" });
    expect(res.headers.get("cache-control")).toBe("private, no-store");
  });
});

describe("acquisition tools (MCP-ACQUISITION-1, log §425)", () => {
  it("answers a guide search without an account, with tagged links and the signup hook", async () => {
    const res = await post(call("buscar_guias", { consulta: "qué fuentes cita la IA" }));
    const text = await textOf(res);
    expect(text).toContain("/blog/que-fuentes-cita-la-ia?utm_source=claude&utm_medium=mcp&utm_campaign=buscar_guias");
    expect(text).toContain("/signup?utm_source=claude");
  });

  it("tells Claude the plans and the founder price Stripe confirms", async () => {
    const text = await textOf(await post(call("que_es_genscore")));
    expect(text).toContain("29 €");
    expect(text).toContain("20 € al mes para siempre");
    expect(getFounderOffer).toHaveBeenCalled();
  });

  it("never says a price, a plan or a trial to ChatGPT, and never asks Stripe", async () => {
    const text = await textOf(await post(call("que_es_genscore"), undefined, POST_CHATGPT, "/api/mcp/chatgpt"));
    const words = text.replace(/https?:\/\/\S+/g, "");
    expect(words).not.toMatch(/€|precio|gratis|prueba|tarjeta|fundador|descuento|Starter|Agencia|\bPro\b/i);
    expect(text).toContain("/precios?utm_source=chatgpt&utm_medium=mcp");
    expect(getFounderOffer).not.toHaveBeenCalled();
  });

  it("points ChatGPT's sign-in at its own resource metadata", async () => {
    const res = await post(call("listar_dominios"), undefined, POST_CHATGPT, "/api/mcp/chatgpt");
    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toContain("/.well-known/oauth-protected-resource/api/mcp/chatgpt");
  });

  it("describes que_es_genscore without prices on ChatGPT", async () => {
    const res = await post({ jsonrpc: "2.0", id: 1, method: "tools/list" }, undefined, POST_CHATGPT, "/api/mcp/chatgpt");
    const tool = (await res.json()).result.tools.find((t: { name: string }) => t.name === "que_es_genscore");
    expect(tool.description).not.toMatch(/precio|plan/i);
  });
});

describe("GET /api/mcp", () => {
  it("offers no server-sent stream", async () => {
    expect((await GET()).status).toBe(405);
  });
});
