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

/**
 * MCP-RELIABILITY-1 (log §464): how a tools/call ended, for analytics. A
 * category, never the arguments or the answer.
 */
export type CallOutcome = "ok" | "tool_error" | "invalid_args" | "exception" | "sign_in_required" | "unknown_tool";

export type RpcOutcome =
  | { kind: "reply"; body: Record<string, unknown>; call?: { tool: string; outcome: CallOutcome } }
  | { kind: "accepted" }
  | { kind: "needs_auth"; call: { tool: string; outcome: "sign_in_required" } };

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
  /**
   * MCP-RELIABILITY-1 (log §464): the token came but was invalid or expired,
   * and this endpoint answers that per tool (ChatGPT) instead of with an
   * HTTP 401. The account tools then say the session expired.
   */
  tokenRejected?: boolean;
  /** Called when a tool throws, so the route can report it (Sentry). Never gets the arguments. */
  onToolException?: (tool: string, error: unknown) => void;
};

/** The texts a client shows when a call cannot be answered. Each one says what to do next. */
export const CALL_TEXT = {
  signIn: "Para ver estos datos, conecta tu cuenta de GenScore.",
  sessionExpired: "Tu sesión de GenScore ha caducado. Vuelve a conectar tu cuenta para ver estos datos.",
  invalidArgs: (fields: string[]) =>
    fields.length
      ? `Faltan datos o no son válidos para esta herramienta (${fields.join(", ")}). Vuelve a llamarla con esos datos.`
      : "Faltan datos o no son válidos para esta herramienta. Vuelve a llamarla con los datos que pide.",
  exception:
    "GenScore no ha podido responder ahora por un fallo puntual. Vuelve a intentarlo en un minuto; si se repite, prueba más tarde."
} as const;

/**
 * MCP-RELIABILITY-1 (log §464): some clients send `null` for an optional
 * field they did not fill. Null counts as absent: an optional field then
 * passes and a required one fails with its name.
 */
function withoutNulls(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return Object.fromEntries(Object.entries(raw as Record<string, unknown>).filter(([, v]) => v !== null));
}

/** The schema's own field names, never a value the client sent. */
function invalidFields(issues: ReadonlyArray<{ path: ReadonlyArray<string | number> }>, schema: Record<string, unknown>): string[] {
  const known = Object.keys((schema.properties as Record<string, unknown> | undefined) ?? {});
  const names = issues.map((i) => String(i.path[0] ?? "")).filter((n) => known.includes(n));
  return [...new Set(names)];
}

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
      if (!tool) {
        return {
          kind: "reply",
          body: { jsonrpc: "2.0", id, error: { code: -32602, message: `Unknown tool: ${name.slice(0, 64)}` } },
          call: { tool: "unknown", outcome: "unknown_tool" }
        };
      }
      const call = (outcome: CallOutcome) => ({ tool: tool.name, outcome });
      const reply = (value: Record<string, unknown>, outcome: CallOutcome): RpcOutcome => ({
        kind: "reply",
        body: { jsonrpc: "2.0", id, result: value },
        call: call(outcome)
      });
      if (tool.access === "account" && !ctx.signedIn) {
        if (!opts.authChallenge) return { kind: "needs_auth", call: { tool: tool.name, outcome: "sign_in_required" } };
        return reply(
          {
            content: [{ type: "text", text: opts.tokenRejected ? CALL_TEXT.sessionExpired : CALL_TEXT.signIn }],
            ...(opts.outputSchema ? { structuredContent: { state: opts.tokenRejected ? "session_expired" : "sign_in_required" } } : {}),
            isError: true,
            _meta: { "mcp/www_authenticate": [opts.authChallenge] }
          },
          "sign_in_required"
        );
      }
      const args = tool.args.safeParse(withoutNulls(params?.arguments));
      const empty = opts.outputSchema ? { structuredContent: {} } : {};
      if (!args.success) {
        const fields = invalidFields(args.error.issues, tool.inputSchema);
        return reply(
          {
            content: [{ type: "text", text: CALL_TEXT.invalidArgs(fields) }],
            ...(opts.outputSchema ? { structuredContent: { state: "invalid_args", fields } } : {}),
            isError: true
          },
          "invalid_args"
        );
      }
      try {
        const answer = await tool.run(args.data, ctx);
        return reply(
          {
            content: [{ type: "text", text: answer.text }],
            ...(answer.structured ? { structuredContent: answer.structured } : empty),
            ...(answer.isError ? { isError: true } : {})
          },
          answer.isError ? "tool_error" : "ok"
        );
      } catch (err) {
        opts.onToolException?.(tool.name, err);
        return reply(
          {
            content: [{ type: "text", text: CALL_TEXT.exception }],
            ...(opts.outputSchema ? { structuredContent: { state: "temporary_error" } } : {}),
            isError: true
          },
          "exception"
        );
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
