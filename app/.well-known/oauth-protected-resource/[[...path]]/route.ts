import { NextResponse } from "next/server";
import { protectedResourceMetadata } from "@/lib/mcp/metadata";

export const dynamic = "force-dynamic";

/**
 * MCP-SERVER-1 (log §418): RFC 9728 metadata of the MCP endpoint. Answers on
 * `/.well-known/oauth-protected-resource` and on the path-specific
 * `/.well-known/oauth-protected-resource/api/mcp` the 401 points to.
 */
export function GET(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  return NextResponse.json(protectedResourceMetadata(new URL(request.url).origin, supabaseUrl), {
    headers: { "Access-Control-Allow-Origin": "*", "Cache-Control": "public, max-age=3600" }
  });
}
