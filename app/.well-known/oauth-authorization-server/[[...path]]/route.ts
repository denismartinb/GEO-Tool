import { NextResponse } from "next/server";
import { authorizationServerMetadataUrl } from "@/lib/mcp/metadata";

export const dynamic = "force-dynamic";

/**
 * MCP-SERVER-1 (log §418): some MCP clients (older spec revisions) look for
 * the authorization server metadata on the resource's own origin. GenScore is
 * not an authorization server, so this relays Supabase Auth's document as is:
 * every endpoint in it is Supabase's, never ours.
 */
export async function GET() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) return NextResponse.json({ error: "not_configured" }, { status: 503 });
  try {
    const res = await fetch(authorizationServerMetadataUrl(supabaseUrl), { signal: AbortSignal.timeout(5000), next: { revalidate: 3600 } });
    if (!res.ok) return NextResponse.json({ error: "unavailable" }, { status: 503 });
    return NextResponse.json(await res.json(), {
      headers: { "Access-Control-Allow-Origin": "*", "Cache-Control": "public, max-age=3600" }
    });
  } catch {
    return NextResponse.json({ error: "unavailable" }, { status: 503 });
  }
}
