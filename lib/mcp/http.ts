import "server-only";
import { after, NextResponse } from "next/server";
import { captureFunnelEvent } from "@/lib/analytics/funnel-events";
import { reportError } from "@/lib/observability/report-error";
import { clientIpFromHeaders } from "@/lib/free-checker/rate-limit";
import { accountFromBearer } from "./auth";
import { MCP_ENDPOINT, type McpProfile } from "./links";
import { MCP_OAUTH_SCOPES } from "./metadata";
import { handleRpc, type ProtocolOptions, type RpcOutcome } from "./protocol";
import { mcpToolsFor } from "./tools";

/**
 * MCP-SERVER-1 (log §418): GenScore's remote MCP server for Claude and
 * ChatGPT. Streamable HTTP, stateless, JSON responses (no SSE stream, no
 * session id). Read-only tools; `.claude/rules/mcp.md` has the invariants.
 *
 * MCP-ACQUISITION-1 (log §425): two endpoints share this handler, one per
 * client profile (`links.ts`): `/api/mcp` for Claude and `/api/mcp/chatgpt`
 * for ChatGPT, whose answers never name prices, plans or trials.
 *
 * Auth is OAuth 2.1 by Supabase Auth. Without a token, the public tools and
 * the handshake work; an account tool answers 401 with `WWW-Authenticate`
 * pointing at this endpoint's `/.well-known/oauth-protected-resource<path>`,
 * which is what makes the client open the sign-in.
 */

export const MCP_CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, Accept, Mcp-Protocol-Version, Mcp-Session-Id",
  "Access-Control-Expose-Headers": "WWW-Authenticate"
} as const;
const NO_STORE = { "Cache-Control": "private, no-store" } as const;

const metadataUrl = (origin: string, profile: McpProfile) => `${origin}/.well-known/oauth-protected-resource${MCP_ENDPOINT[profile]}`;

/**
 * MCP-CHATGPT-SUBMIT-1 (log §430): what each endpoint asks of the protocol.
 * ChatGPT gets OAuth scopes, output schemas and the per-tool sign-in
 * challenge; Claude keeps the HTTP 401 it was approved with.
 */
export function protocolOptionsFor(origin: string, profile: McpProfile): ProtocolOptions {
  if (profile !== "chatgpt") return {};
  return {
    oauthScopes: MCP_OAUTH_SCOPES,
    outputSchema: true,
    authChallenge: `Bearer resource_metadata="${metadataUrl(origin, profile)}", error="invalid_token", error_description="Conecta tu cuenta de GenScore para continuar"`
  };
}

function unauthorized(origin: string, profile: McpProfile, invalid: boolean) {
  const metadata = metadataUrl(origin, profile);
  const challenge = `Bearer realm="GenScore", resource_metadata="${metadata}"${invalid ? ', error="invalid_token"' : ""}`;
  return NextResponse.json(
    { jsonrpc: "2.0", id: null, error: { code: -32001, message: invalid ? "Invalid or expired token" : "Authentication required" } },
    { status: 401, headers: { ...MCP_CORS, ...NO_STORE, "WWW-Authenticate": challenge } }
  );
}

/**
 * MCP-RELIABILITY-1 (log §464): a batch the per-tool challenge can answer.
 * Only tools/call carries `_meta["mcp/www_authenticate"]`; the handshake and
 * tools/list with a bad token still get the HTTP 401 so the client refreshes.
 */
function onlyToolCalls(messages: unknown[]): boolean {
  return messages.length > 0 && messages.every((m) => (m as { method?: unknown } | null)?.method === "tools/call");
}

export async function handleMcpPost(request: Request, profile: McpProfile) {
  const origin = new URL(request.url).origin;
  const auth = await accountFromBearer(request.headers.get("authorization"));
  const rejected = (reason: "no_token" | "invalid_token") =>
    after(() => captureFunnelEvent("mcp_auth_rejected", "mcp-anonymous", { connector: profile, reason }));

  // An expired or revoked token: 401 so the client refreshes or signs in
  // again. ChatGPT is the exception for tool calls, handled below.
  if (auth.kind === "invalid" && profile !== "chatgpt") {
    rejected("invalid_token");
    return unauthorized(origin, profile, true);
  }
  const account = auth.kind === "ok" ? auth.account : null;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } },
      { status: 400, headers: { ...MCP_CORS, ...NO_STORE } }
    );
  }
  const messages = Array.isArray(body) ? body.slice(0, 20) : [body];

  // MCP-RELIABILITY-1 (log §464): ChatGPT showed «error interno» when a call
  // with an expired token got a bare HTTP 401. A tool call now answers the
  // per-tool sign-in challenge instead, saying the session expired; public
  // tools run without the account.
  const tokenRejected = auth.kind === "invalid";
  if (tokenRejected) {
    rejected("invalid_token");
    if (!onlyToolCalls(messages)) return unauthorized(origin, profile, true);
  }

  const ctx = { account, signedIn: !!account, origin, ip: clientIpFromHeaders(request.headers), profile };
  const tools = mcpToolsFor(profile);
  const options: ProtocolOptions = {
    ...protocolOptionsFor(origin, profile),
    ...(tokenRejected ? { tokenRejected: true } : {}),
    onToolException: (tool, error) => after(() => reportError(error, `mcp.${tool}`))
  };
  const outcomes: RpcOutcome[] = [];
  for (const m of messages) outcomes.push(await handleRpc(m, ctx, tools, options));

  // One event per tool call, after the answer is sent: analytics never slows
  // a tool. Tool name, connector, account linked and how it ended; never the
  // arguments or the answer.
  for (const o of outcomes) {
    const call = o.kind === "accepted" ? undefined : o.call;
    if (!call) continue;
    if (call.outcome === "sign_in_required" && !tokenRejected) rejected("no_token");
    after(() =>
      captureFunnelEvent("mcp_tool_called", account?.user.id ?? "mcp-anonymous", {
        tool: call.tool.slice(0, 40),
        signed_in: !!account,
        connector: profile,
        outcome: call.outcome
      })
    );
  }
  if (outcomes.some((o) => o.kind === "needs_auth")) return unauthorized(origin, profile, false);

  const replies = outcomes.flatMap((o) => (o.kind === "reply" ? [o.body] : []));
  if (!replies.length) return new NextResponse(null, { status: 202, headers: { ...MCP_CORS, ...NO_STORE } });
  return NextResponse.json(Array.isArray(body) ? replies : replies[0], { headers: { ...MCP_CORS, ...NO_STORE } });
}

/** No server-initiated stream: this server never sends anything unprompted. */
export function mcpMethodNotAllowed() {
  return new NextResponse(null, { status: 405, headers: { ...MCP_CORS, Allow: "POST, OPTIONS" } });
}

export function mcpPreflight() {
  return new NextResponse(null, { status: 204, headers: MCP_CORS });
}
