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
  "Con la cuenta conectada, usa listar_dominios para saber qué dominios tiene la persona y después ver_dominio, ver_recomendaciones, ver_competidores, ver_auditorias o ver_posicion_google. " +
  "revisar_pagina funciona sin cuenta con cualquier URL pública. " +
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

/** What tools/list publishes for one tool, with the annotations both directories require. */
export function describeTool<C>(t: ToolDef<C>): Record<string, unknown> {
  // OpenAI Apps: which tools need a linked account (mixed auth).
  const securitySchemes = t.access === "account" ? [{ type: "oauth2" }] : [{ type: "noauth" }, { type: "oauth2" }];
  return {
    name: t.name,
    title: t.title,
    description: t.description,
    inputSchema: t.inputSchema,
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
  tools: ReadonlyArray<ToolDef<C>>
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
      return result(id, { tools: tools.map(describeTool) });
    case "tools/call": {
      const name = typeof params?.name === "string" ? params.name : "";
      const tool = tools.find((t) => t.name === name);
      if (!tool) return error(id, -32602, `Unknown tool: ${name.slice(0, 64)}`);
      if (tool.access === "account" && !ctx.signedIn) return { kind: "needs_auth" };
      const args = tool.args.safeParse(params?.arguments ?? {});
      if (!args.success) {
        return result(id, { content: [{ type: "text", text: "Faltan datos o no son válidos para esta herramienta." }], isError: true });
      }
      try {
        const answer = await tool.run(args.data, ctx);
        return result(id, {
          content: [{ type: "text", text: answer.text }],
          ...(answer.structured ? { structuredContent: answer.structured } : {}),
          ...(answer.isError ? { isError: true } : {})
        });
      } catch {
        return result(id, { content: [{ type: "text", text: "GenScore no ha podido responder ahora. Inténtalo de nuevo en un momento." }], isError: true });
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
