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
vi.mock("@/lib/observability/report-error", () => ({ reportError: vi.fn() }));
const getFounderOffer = vi.fn();
vi.mock("@/lib/stripe", () => ({ getFounderOffer: () => getFounderOffer() }));
vi.mock("next/server", async (orig) => ({ ...(await orig<typeof import("next/server")>()), after: vi.fn() }));

import { after } from "next/server";
import { captureFunnelEvent } from "@/lib/analytics/funnel-events";
import { loadExtProjectData, pickProject } from "@/lib/ext/project-data";
import { reportError } from "@/lib/observability/report-error";
import { CALL_TEXT } from "@/lib/mcp/protocol";
import { reviewPage } from "@/lib/page-review/review";
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

  it("asks ChatGPT to sign in from the tool itself, with scopes and output schemas (log §430)", async () => {
    const res = await post(call("listar_dominios"), undefined, POST_CHATGPT, "/api/mcp/chatgpt");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.result.isError).toBe(true);
    expect(body.result._meta["mcp/www_authenticate"][0]).toBe(
      'Bearer resource_metadata="https://www.genscore.es/.well-known/oauth-protected-resource/api/mcp/chatgpt", error="invalid_token", error_description="Conecta tu cuenta de GenScore para continuar"'
    );
    expect(listExtProjects).not.toHaveBeenCalled();
    const list = await (await post({ jsonrpc: "2.0", id: 1, method: "tools/list" }, undefined, POST_CHATGPT, "/api/mcp/chatgpt")).json();
    for (const t of list.result.tools) {
      expect(t.outputSchema).toBeTruthy();
      expect(t.securitySchemes.at(-1)).toEqual({ type: "oauth2", scopes: ["openid", "email"] });
    }
  });

  it("answers Claude's invalid or expired token with 401 invalid_token, before reading anything", async () => {
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
    expect((await res.json()).result._meta["mcp/www_authenticate"][0]).toContain("/.well-known/oauth-protected-resource/api/mcp/chatgpt");
  });

  it("steers ambiguous asks to the right tool on both endpoints (log §452)", async () => {
    for (const [handler, path] of [
      [POST, "/api/mcp"],
      [POST_CHATGPT, "/api/mcp/chatgpt"]
    ] as const) {
      const init = await (await post({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } }, undefined, handler, path)).json();
      const instructions = init.result.instructions as string;
      // H1: «cómo está un dominio» goes to the account tools, not to revisar_pagina.
      expect(instructions).toMatch(/cómo está un dominio[^.]*herramientas de cuenta/);
      // H3: «recomendaciones» means GEO actions, never shopping.
      expect(instructions).toMatch(/«recomendaciones» son siempre[^.]*ver_recomendaciones[^.]*nunca recomendaciones de productos/);
      // H2: after «not in the account», offer the public review, never run it unasked.
      expect(instructions).toMatch(/no está en la cuenta[^.]*ofrecer revisar su página con revisar_pagina, pero no la ejecutes/);
      expect(instructions).not.toContain("—");

      const tools = (await (await post({ jsonrpc: "2.0", id: 2, method: "tools/list" }, undefined, handler, path)).json()).result.tools as Array<{
        name: string;
        description: string;
      }>;
      const d = (n: string) => tools.find((t) => t.name === n)!.description;
      expect(d("ver_dominio")).toContain("ya sigue en su cuenta");
      expect(d("ver_recomendaciones")).toMatch(/recomendaciones GEO[\s\S]*nunca recomendaciones de productos/);
      expect(d("revisar_pagina")).toMatch(/^Úsala sólo cuando la persona pida revisar o auditar una página/);
      expect(d("ver_recomendaciones")).toContain("«dame las recomendaciones de <dominio>»");
      expect(d("listar_dominios")).toMatch(/sin revisarla hasta que la persona lo pida/);
      expect(instructions).toMatch(/«dame las recomendaciones de <dominio>» se resuelve con ver_recomendaciones aunque no nombre a GenScore/);
      expect(d("revisar_pagina")).toMatch(/URL pública concreta[\s\S]*ver_dominio[\s\S]*espera a que la persona la pida/);
      for (const t of tools) expect(t.description).not.toContain("—");
    }
  });

  it("N2: a domain outside the account is said, linked and only offered a review, on both endpoints (log §463)", async () => {
    accountFromBearer.mockResolvedValue({ kind: "ok", account: { ...ACCOUNT, domainCap: 3 } });
    listExtProjects.mockResolvedValue([{ id: "p1", name: "Marca", brand: "Marca", domain: "marca.es" }]);
    vi.mocked(loadExtProjectData).mockResolvedValue({ kind: "not_found" } as never);
    for (const [handler, path] of [
      [POST, "/api/mcp"],
      [POST_CHATGPT, "/api/mcp/chatgpt"]
    ] as const) {
      const auth = "Bearer tokentokentokentokentoken";
      const list = (await (await post(call("listar_dominios", { dominio: "amazon.es" }), auth, handler, path)).json()).result;
      expect(list.content[0].text).toContain("amazon.es no está en la cuenta.");
      expect(list.content[0].text).toContain("/dashboard/projects/new?dominio=amazon.es");
      expect(list.content[0].text).toContain("solo se hace si lo pides");
      expect(list.structuredContent?.asked ?? { state: "not_found" }).toMatchObject({ state: "not_found" });

      const recs = (await (await post(call("ver_recomendaciones", { dominio: "amazon.es" }), auth, handler, path)).json()).result;
      expect(recs.isError).toBeFalsy();
      expect(recs.content[0].text).toContain("no tiene datos guardados de amazon.es");
      expect(recs.content[0].text).toContain("solo se hace si lo pides");
    }
    // The public review is offered, never run by the server on its own.
    expect(reviewPage).not.toHaveBeenCalled();
  });

  it("a domain in the account is confirmed, without any review offer (log §463)", async () => {
    accountFromBearer.mockResolvedValue({ kind: "ok", account: { ...ACCOUNT, domainCap: 3 } });
    const row = { id: "p1", name: "Marca", brand: "Marca", domain: "marca.es" };
    listExtProjects.mockResolvedValue([row]);
    vi.mocked(pickProject).mockReturnValue(row as never);
    const text = await textOf(await post(call("listar_dominios", { dominio: "marca.es" }), "Bearer tokentokentokentokentoken"));
    expect(text).toContain("marca.es está en la cuenta");
    expect(text).not.toContain("revisar_pagina");
  });

  it("the general list still tells the model to offer, not run, a review (log §463)", async () => {
    accountFromBearer.mockResolvedValue({ kind: "ok", account: { ...ACCOUNT, domainCap: 3 } });
    listExtProjects.mockResolvedValue([{ id: "p1", name: "Marca", brand: "Marca", domain: "marca.es" }]);
    const text = await textOf(await post(call("listar_dominios"), "Bearer tokentokentokentokentoken"));
    expect(text).toMatch(/no está en esta lista[^.]*sin revisarla hasta que lo pida/);
  });

  it("describes que_es_genscore without prices on ChatGPT", async () => {
    const res = await post({ jsonrpc: "2.0", id: 1, method: "tools/list" }, undefined, POST_CHATGPT, "/api/mcp/chatgpt");
    const tool = (await res.json()).result.tools.find((t: { name: string }) => t.name === "que_es_genscore");
    expect(tool.description).not.toMatch(/precio|plan/i);
  });
});

/**
 * MCP-RELIABILITY-1 (log §464): the states Instinct's 2026-11-03 battery
 * could not tell apart from «error interno». Each one has a fixture, on both
 * endpoints where they differ, and every refusal says what to do next.
 */
describe("connector reliability fixtures (MCP-RELIABILITY-1, log §464)", () => {
  const AUTH = "Bearer tokentokentokentokentoken";
  const ENDPOINTS = [
    [POST, "/api/mcp"],
    [POST_CHATGPT, "/api/mcp/chatgpt"]
  ] as const;
  const runAfter = () => vi.mocked(after).mockImplementation(((cb: () => unknown) => void cb()) as never);
  const events = () =>
    vi.mocked(captureFunnelEvent).mock.calls.map(([event, , props]) => ({ event, ...props }) as Record<string, unknown>);

  it("an expired token on a ChatGPT tool call gets the per-tool sign-in, not a bare 401", async () => {
    accountFromBearer.mockResolvedValue({ kind: "invalid" });
    const res = await post(call("listar_dominios"), AUTH, POST_CHATGPT, "/api/mcp/chatgpt");
    expect(res.status).toBe(200);
    const body = (await res.json()).result;
    expect(body.isError).toBe(true);
    expect(body.content[0].text).toBe(CALL_TEXT.sessionExpired);
    expect(body.structuredContent).toEqual({ state: "session_expired" });
    expect(body._meta["mcp/www_authenticate"][0]).toContain('error="invalid_token"');
    expect(listExtProjects).not.toHaveBeenCalled();
  });

  it("an expired token on ChatGPT's handshake still gets the 401 that makes it refresh", async () => {
    accountFromBearer.mockResolvedValue({ kind: "invalid" });
    for (const method of ["initialize", "tools/list"]) {
      const res = await post({ jsonrpc: "2.0", id: 1, method }, AUTH, POST_CHATGPT, "/api/mcp/chatgpt");
      expect(res.status).toBe(401);
      expect(res.headers.get("www-authenticate")).toContain('error="invalid_token"');
    }
  });

  it("an expired token does not block a public tool on ChatGPT, which runs without the account", async () => {
    accountFromBearer.mockResolvedValue({ kind: "invalid" });
    const text = await textOf(await post(call("buscar_guias", { consulta: "qué fuentes cita la IA" }), AUTH, POST_CHATGPT, "/api/mcp/chatgpt"));
    expect(text).toContain("/blog/que-fuentes-cita-la-ia");
  });

  it("logs a rejected token and a missing one by reason, never the token", async () => {
    runAfter();
    accountFromBearer.mockResolvedValue({ kind: "invalid" });
    await post(call("listar_dominios"), AUTH, POST_CHATGPT, "/api/mcp/chatgpt");
    await post({ jsonrpc: "2.0", id: 1, method: "tools/list" }, AUTH);
    accountFromBearer.mockResolvedValue({ kind: "none" });
    await post(call("listar_dominios"));
    await post(call("listar_dominios"), undefined, POST_CHATGPT, "/api/mcp/chatgpt");
    const rejected = events().filter((e) => e.event === "mcp_auth_rejected");
    expect(rejected).toEqual([
      { event: "mcp_auth_rejected", connector: "chatgpt", reason: "invalid_token" },
      { event: "mcp_auth_rejected", connector: "claude", reason: "invalid_token" },
      { event: "mcp_auth_rejected", connector: "claude", reason: "no_token" },
      { event: "mcp_auth_rejected", connector: "chatgpt", reason: "no_token" }
    ]);
    expect(JSON.stringify(vi.mocked(captureFunnelEvent).mock.calls)).not.toContain("tokentoken");
  });

  it("an empty account is told how to add its first domain, on both endpoints", async () => {
    accountFromBearer.mockResolvedValue({ kind: "ok", account: { ...ACCOUNT, domainCap: 3 } });
    listExtProjects.mockResolvedValue([]);
    for (const [handler, path] of ENDPOINTS) {
      const body = (await (await post(call("listar_dominios"), AUTH, handler, path)).json()).result;
      expect(body.isError).toBeFalsy();
      expect(body.content[0].text).toContain("Todavía no hay ningún dominio");
      expect(body.content[0].text).toContain("/dashboard/projects/new");
    }
  });

  it("an internal failure says to retry, is reported to Sentry and logged as exception", async () => {
    runAfter();
    accountFromBearer.mockResolvedValue({ kind: "ok", account: { ...ACCOUNT, domainCap: 3 } });
    listExtProjects.mockRejectedValue(new Error("db down"));
    for (const [handler, path] of ENDPOINTS) {
      const body = (await (await post(call("listar_dominios", { dominio: "marca.es" }), AUTH, handler, path)).json()).result;
      expect(body.isError).toBe(true);
      expect(body.content[0].text).toBe(CALL_TEXT.exception);
      if (path.endsWith("chatgpt")) expect(body.structuredContent).toEqual({ state: "temporary_error" });
    }
    expect(reportError).toHaveBeenCalledTimes(2);
    expect(vi.mocked(reportError).mock.calls[0][1]).toBe("mcp.listar_dominios");
    const calls = events().filter((e) => e.event === "mcp_tool_called");
    expect(calls.map((c) => [c.connector, c.outcome])).toEqual([
      ["claude", "exception"],
      ["chatgpt", "exception"]
    ]);
    // Analytics carries categories, never the arguments.
    expect(JSON.stringify(vi.mocked(captureFunnelEvent).mock.calls)).not.toContain("marca.es");
  });

  it("Search Console disconnected answers with the connect link, not an error", async () => {
    accountFromBearer.mockResolvedValue({ kind: "ok", account: { ...ACCOUNT, domainCap: 3 } });
    vi.mocked(loadExtProjectData).mockResolvedValue({
      kind: "ok",
      project: { id: "p1" },
      payload: { domain: "marca.es", brand: "Marca", searchConsole: { state: "disconnected" } }
    } as never);
    for (const [handler, path] of ENDPOINTS) {
      const body = (await (await post(call("ver_posicion_google", { dominio: "marca.es" }), AUTH, handler, path)).json()).result;
      expect(body.isError).toBeFalsy();
      expect(body.content[0].text).toContain("no tiene Search Console conectado");
      expect(body.content[0].text).toContain("/api/search-console/connect");
      expect(body.structuredContent).toMatchObject({ state: "disconnected" });
    }
  });

  it("null in an optional field counts as absent; in a required one it names the field", async () => {
    runAfter();
    accountFromBearer.mockResolvedValue({ kind: "ok", account: { ...ACCOUNT, domainCap: 3 } });
    listExtProjects.mockResolvedValue([{ id: "p1", name: "Marca", brand: "Marca", domain: "marca.es" }]);
    for (const [handler, path] of ENDPOINTS) {
      const list = (await (await post(call("listar_dominios", { dominio: null }), AUTH, handler, path)).json()).result;
      expect(list.isError).toBeFalsy();
      expect(list.content[0].text).toContain("- marca.es (Marca)");

      const bad = (await (await post(call("ver_dominio", { dominio: null }), AUTH, handler, path)).json()).result;
      expect(bad.isError).toBe(true);
      expect(bad.content[0].text).toBe(CALL_TEXT.invalidArgs(["dominio"]));
      if (path.endsWith("chatgpt")) expect(bad.structuredContent).toEqual({ state: "invalid_args", fields: ["dominio"] });
    }
    expect(events().filter((e) => e.event === "mcp_tool_called").map((c) => c.outcome)).toEqual(["ok", "invalid_args", "ok", "invalid_args"]);
  });

  it("a null arguments object is read as no arguments", async () => {
    const res = await post({ jsonrpc: "2.0", id: 9, method: "tools/call", params: { name: "que_es_genscore", arguments: null } });
    expect((await res.json()).result.isError).toBeFalsy();
  });

  it("every refusal text says what to do next and has no long dash", () => {
    for (const t of [CALL_TEXT.signIn, CALL_TEXT.sessionExpired, CALL_TEXT.exception, CALL_TEXT.invalidArgs([]), CALL_TEXT.invalidArgs(["url"])]) {
      expect(t).toMatch(/conecta|Vuelve|Inténtalo|intentarlo/i);
      expect(t).not.toContain("—");
    }
  });
});

describe("GET /api/mcp", () => {
  it("offers no server-sent stream", async () => {
    expect((await GET()).status).toBe(405);
  });
});
