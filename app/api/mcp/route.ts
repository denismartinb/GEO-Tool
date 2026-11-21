import { handleMcpPost, mcpMethodNotAllowed, mcpPreflight } from "@/lib/mcp/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** MCP-SERVER-1 (log §418): the Claude endpoint. The handler lives in `lib/mcp/http.ts`. */
export function POST(request: Request) {
  return handleMcpPost(request, "claude");
}
export const GET = mcpMethodNotAllowed;
export const DELETE = mcpMethodNotAllowed;
export const OPTIONS = mcpPreflight;
