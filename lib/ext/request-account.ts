import "server-only";
import { accountFromBearer } from "@/lib/mcp/auth";
import { readExtAccount, type ExtAccount } from "./account";

/**
 * WP-PLUGIN-2 (log §431): who is calling `/api/ext/*`.
 *
 * The Chrome extension sends the console's session cookie. The WordPress
 * plugin calls from its own server, so it has no cookie: it sends the OAuth
 * access token Supabase issued it through `/oauth/consentir`, the same door
 * the MCP connector uses (`lib/mcp/auth.ts`). A request that carries an
 * `Authorization` header is judged by that header alone: a bad token is a
 * 401, never a fallback to whatever cookie came along. Either way the client
 * is the user's own, under RLS; never service role.
 */
export async function readExtRequestAccount(request: Request): Promise<ExtAccount | null> {
  const header = request.headers.get("authorization");
  if (header) {
    const result = await accountFromBearer(header);
    return result.kind === "ok" ? result.account : null;
  }
  return readExtAccount();
}
