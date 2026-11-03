import { z } from "zod";

/**
 * MCP-SERVER-1 (log §418): the Model Context Protocol over stateless
 * Streamable HTTP, JSON responses only. Pure: no Supabase, no Next. The route
 * hands it one JSON-RPC message and a context; it answers with the message
 * to send back, or tells the route that the call needs a signed-in account
 * (the route then answers 401 with `WWW-Authenticate`, which is what makes
 * Claude and ChatGPT open the OAuth flow).
 *
 * Every tool is read-only. Adding one that writes needs its own Task Intake
 * (`.claude/rules/mcp.md`).
 */

export const SUPPORTED_PROTOCOL_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"] as const;
export const SERVER_INFO = { name: "genscore", title: "GenScore", version: "1.0.0" } as const;

export const SERVER_INSTRUCTIONS =
  "GenScore mide cómo aparece una marca en las respuestas de ChatGPT, Gemini, Claude y Perplexity, y cómo está su web para Google y para los agentes de compra. " +
  "Con la cuenta conectada, usa listar_dominios para saber qué dominios tiene la persona y después ver_dominio, ver_recomendaciones, ver_competidores, ver_prompts, ver_auditorias o ver_posicion_google. " +
  "Cuando la persona pregunte cómo está un dominio (en la IA, sus recomendaciones, competidores, prompts o auditorías), usa las herramientas de cuenta; revisar_pagina es para revisar una URL concreta, y funciona sin cuenta con cualquier página pública. " +
  "Una petición como «dame las recomendaciones de <dominio>» se resuelve con ver_recomendaciones aunque no nombre a GenScore, salvo que pida claramente productos para comprar; no abras el navegador ni la web del dominio para eso. " +
  "En GenScore, «recomendaciones» son siempre las acciones para que un dominio salga más en las respuestas de la IA y en Google (ver_recomendaciones), lo diga o no la persona; nunca recomendaciones de productos ni de compra. Si la petición es claramente de compras y no va de la visibilidad de una web, no uses GenScore. " +
  "Si una herramienta responde que el dominio no está en la cuenta, dilo y da el enlace para añadirlo; puedes ofrecer revisar su página con revisar_pagina, pero no la ejecutes ni completes la respuesta con otros datos salvo que la persona lo pida. " +
  "Para dudas sobre cómo aparecer en la IA o en Google (GEO, fuentes que cita la IA, llms.txt, bots, comercio agéntico), buscar_guias trae lo que dicen las guías de GenScore, con su enlace. " +
  "Si la persona pregunta qué es GenScore o cómo empezar, usa que_es_genscore. " +
  "Todas las herramientas son de solo lectura. Responde en el idioma de la persona y conserva los enlaces a GenScore.";

export type ToolAnswer = { text: string; structured?: Record<string, unknown>; isError?: boolean };

export type ToolDef<C> = {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  args: z.ZodType<Record<string, unknown>>;
  /** "account": only with a signed-in account. "public": anyone; richer with an account. */
  access: "account" | "public";
  /** true when the tool reads a third party's site (any URL), not only GenScore's data. */
  openWorld: boolean;
  run: (args: Record<string, unknown>, ctx: C) => Promise<ToolAnswer>;
};

type JsonRpcId = string | number;
const RequestSchema = z.object({
  jsonrpc: z.literal("2.0"),
  id: z.union([z.string(), z.number()]).optional(),
  method: z.string(),
  params: z.record(z.unknown()).optional()
});

export type RpcOutcome =
  | { kind: "reply"; body: Record<string, unknown> }
  | { kind: "accepted" }
  | { kind: "needs_auth" };

const error = (id: JsonRpcId | null, code: number, message: string): RpcOutcome => ({
  kind: "reply",
  body: { jsonrpc: "2.0", id, error: { code, message } }
});
const result = (id: JsonRpcId, value: Record<string, unknown>): RpcOutcome => ({
  kind: "reply",
  body: { jsonrpc: "2.0", id, result: value }
});

export function negotiateVersion(requested: unknown): string {
  return typeof requested === "string" && (SUPPORTED_PROTOCOL_VERSIONS as readonly string[]).includes(requested)
    ? requested
    : SUPPORTED_PROTOCOL_VERSIONS[0];
}

/**
 * How one endpoint speaks to its client. Claude's endpoint uses the defaults;
 * ChatGPT's (MCP-CHATGPT-SUBMIT-1, log §430) asks for OpenAI's extras:
 * - `oauthScopes`: the scopes its OAuth scheme declares (`openid`, `email`, so
 *   ChatGPT's workspace domain restrictions can read a verified email).
 * - `outputSchema`: every tool declares one, and every answer then carries a
 *   `structuredContent` object, even an empty one, so it always validates.
 * - `authChallenge`: an account tool called without a token answers a tool
 *   error carrying `_meta["mcp/www_authenticate"]` instead of an HTTP 401.
 *   That is what opens ChatGPT's per-tool sign-in in a mixed-auth app.
 */
export type ProtocolOptions = {
  oauthScopes?: readonly string[];
  outputSchema?: boolean;
  authChallenge?: string;
};

/** Loose on purpose: each tool's object differs, and an exact schema that drifts would fail validation. */
export const OPEN_OUTPUT_SCHEMA = { type: "object", additionalProperties: true } as const;

/** What tools/list publishes for one tool, with the annotations both directories require. */
export function describeTool<C>(t: ToolDef<C>, opts: ProtocolOptions = {}): Record<string, unknown> {
  // OpenAI Apps: which tools need a linked account (mixed auth).
  const oauth = opts.oauthScopes?.length ? { type: "oauth2", scopes: [...opts.oauthScopes] } : { type: "oauth2" };
  const securitySchemes = t.access === "account" ? [oauth] : [{ type: "noauth" }, oauth];
  return {
    name: t.name,
    title: t.title,
    description: t.description,
    inputSchema: t.inputSchema,
    ...(opts.outputSchema ? { outputSchema: OPEN_OUTPUT_SCHEMA } : {}),
    annotations: {
      title: t.title,
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: t.openWorld
    },
    securitySchemes,
    _meta: { securitySchemes }
  };
}

export async function handleRpc<C>(
  raw: unknown,
  ctx: C & { signedIn: boolean },
  tools: ReadonlyArray<ToolDef<C>>,
  opts: ProtocolOptions = {}
): Promise<RpcOutcome> {
  const parsed = RequestSchema.safeParse(raw);
  if (!parsed.success) {
    // A response or a malformed message: nothing to answer if it has no id.
    const id = raw && typeof raw === "object" && "id" in raw ? ((raw as { id: JsonRpcId }).id ?? null) : null;
    if (raw && typeof raw === "object" && ("result" in raw || "error" in raw)) return { kind: "accepted" };
    return error(id, -32600, "Invalid Request");
  }
  const { id, method, params } = parsed.data;
  if (id === undefined) return { kind: "accepted" }; // notifications/initialized, cancelled…

  switch (method) {
    case "initialize":
      return result(id, {
        protocolVersion: negotiateVersion(params?.protocolVersion),
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
        instructions: SERVER_INSTRUCTIONS
      });
    case "ping":
      return result(id, {});
    case "tools/list":
      return result(id, { tools: tools.map((t) => describeTool(t, opts)) });
    case "tools/call": {
      const name = typeof params?.name === "string" ? params.name : "";
      const tool = tools.find((t) => t.name === name);
      if (!tool) return error(id, -32602, `Unknown tool: ${name.slice(0, 64)}`);
      if (tool.access === "account" && !ctx.signedIn) {
        if (!opts.authChallenge) return { kind: "needs_auth" };
        return result(id, {
          content: [{ type: "text", text: "Para ver estos datos, conecta tu cuenta de GenScore." }],
          ...(opts.outputSchema ? { structuredContent: { state: "sign_in_required" } } : {}),
          isError: true,
          _meta: { "mcp/www_authenticate": [opts.authChallenge] }
        });
      }
      const args = tool.args.safeParse(params?.arguments ?? {});
      const empty = opts.outputSchema ? { structuredContent: {} } : {};
      if (!args.success) {
        return result(id, { content: [{ type: "text", text: "Faltan datos o no son válidos para esta herramienta." }], ...empty, isError: true });
      }
      try {
        const answer = await tool.run(args.data, ctx);
        return result(id, {
          content: [{ type: "text", text: answer.text }],
          ...(answer.structured ? { structuredContent: answer.structured } : empty),
          ...(answer.isError ? { isError: true } : {})
        });
      } catch {
        return result(id, { content: [{ type: "text", text: "GenScore no ha podido responder ahora. Inténtalo de nuevo en un momento." }], ...empty, isError: true });
      }
    }
    case "resources/list":
      return result(id, { resources: [] });
    case "prompts/list":
      return result(id, { prompts: [] });
    default:
      return error(id, -32601, "Method not found");
  }
}
