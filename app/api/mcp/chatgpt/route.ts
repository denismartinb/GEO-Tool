import { handleMcpPost, mcpMethodNotAllowed, mcpPreflight } from "@/lib/mcp/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * MCP-ACQUISITION-1 (log §425): the ChatGPT endpoint. Same tools as
 * `/api/mcp`, but no answer names a price, a plan, a trial or a discount
 * (OpenAI's app rules); `/precios` is only linked as information.
 */
export function POST(request: Request) {
  return handleMcpPost(request, "chatgpt");
}
export const GET = mcpMethodNotAllowed;
export const DELETE = mcpMethodNotAllowed;
export const OPTIONS = mcpPreflight;
