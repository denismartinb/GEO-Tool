import { after, NextResponse } from "next/server";
import { captureFunnelEvent } from "@/lib/analytics/funnel-events";
import { clientIpFromHeaders } from "@/lib/free-checker/rate-limit";
import { accountFromBearer } from "@/lib/mcp/auth";
import { handleRpc, type RpcOutcome } from "@/lib/mcp/protocol";
import { MCP_TOOLS } from "@/lib/mcp/tools";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * MCP-SERVER-1 (log §418): GenScore's remote MCP server for Claude and
 * ChatGPT. Streamable HTTP, stateless, JSON responses (no SSE stream, no
 * session id). Read-only tools; `.claude/rules/mcp.md` has the invariants.
 *
 * Auth is OAuth 2.1 by Supabase Auth. Without a token, the public tool and
 * the handshake work; an account tool answers 401 with `WWW-Authenticate`
 * pointing at `/.well-known/oauth-protected-resource/api/mcp`, which is what
 * makes the client open the sign-in.
 */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, Accept, Mcp-Protocol-Version, Mcp-Session-Id",
  "Access-Control-Expose-Headers": "WWW-Authenticate"
} as const;
const NO_STORE = { "Cache-Control": "private, no-store" } as const;

function unauthorized(origin: string, invalid: boolean) {
  const metadata = `${origin}/.well-known/oauth-protected-resource/api/mcp`;
  const challenge = `Bearer realm="GenScore", resource_metadata="${metadata}"${invalid ? ', error="invalid_token"' : ""}`;
  return NextResponse.json(
    { jsonrpc: "2.0", id: null, error: { code: -32001, message: invalid ? "Invalid or expired token" : "Authentication required" } },
    { status: 401, headers: { ...CORS, ...NO_STORE, "WWW-Authenticate": challenge } }
  );
}

export async function POST(request: Request) {
  const origin = new URL(request.url).origin;
  const auth = await accountFromBearer(request.headers.get("authorization"));
  // An expired or revoked token: 401 so the client refreshes or signs in again.
  if (auth.kind === "invalid") return unauthorized(origin, true);
  const account = auth.kind === "ok" ? auth.account : null;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } },
      { status: 400, headers: { ...CORS, ...NO_STORE } }
    );
  }

  const ctx = { account, signedIn: !!account, origin, ip: clientIpFromHeaders(request.headers) };
  const messages = Array.isArray(body) ? body.slice(0, 20) : [body];
  const outcomes: RpcOutcome[] = [];
  for (const m of messages) outcomes.push(await handleRpc(m, ctx, MCP_TOOLS));
  if (outcomes.some((o) => o.kind === "needs_auth")) return unauthorized(origin, false);

  // One event per tool call, after the answer is sent: analytics never slows a tool.
  for (const m of messages) {
    const call = m as { method?: string; params?: { name?: unknown } };
    if (call?.method === "tools/call" && typeof call.params?.name === "string") {
      const tool = call.params.name.slice(0, 40);
      after(() => captureFunnelEvent("mcp_tool_called", account?.user.id ?? "mcp-anonymous", { tool, signed_in: !!account }));
    }
  }

  const replies = outcomes.flatMap((o) => (o.kind === "reply" ? [o.body] : []));
  if (!replies.length) return new NextResponse(null, { status: 202, headers: { ...CORS, ...NO_STORE } });
  return NextResponse.json(Array.isArray(body) ? replies : replies[0], { headers: { ...CORS, ...NO_STORE } });
}

/** No server-initiated stream: this server never sends anything unprompted. */
export async function GET() {
  return new NextResponse(null, { status: 405, headers: { ...CORS, Allow: "POST, OPTIONS" } });
}

export async function DELETE() {
  return new NextResponse(null, { status: 405, headers: { ...CORS, Allow: "POST, OPTIONS" } });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}
