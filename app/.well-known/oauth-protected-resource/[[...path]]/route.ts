import { NextResponse } from "next/server";
import { protectedResourceMetadata, resourcePathFor } from "@/lib/mcp/metadata";

export const dynamic = "force-dynamic";

/**
 * MCP-SERVER-1 (log §418): RFC 9728 metadata of the MCP endpoint. Answers on
 * `/.well-known/oauth-protected-resource` and on the path-specific
 * `/.well-known/oauth-protected-resource/api/mcp` the 401 points to, and on
 * `/.well-known/oauth-protected-resource/api/mcp/chatgpt` for the ChatGPT
 * endpoint (MCP-ACQUISITION-1, log §425).
 */
export function GET(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  const url = new URL(request.url);
  const suffix = url.pathname.replace(/^\/\.well-known\/oauth-protected-resource/, "");
  return NextResponse.json(protectedResourceMetadata(url.origin, supabaseUrl, resourcePathFor(suffix)), {
    headers: { "Access-Control-Allow-Origin": "*", "Cache-Control": "public, max-age=3600" }
  });
}
