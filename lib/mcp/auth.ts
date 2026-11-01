import "server-only";
import { createClient } from "@supabase/supabase-js";
import { readExtAccountWith, type ExtAccount } from "@/lib/ext/account";

/**
 * MCP-SERVER-1 (log §418): who is calling the MCP endpoint.
 *
 * The token is an access token issued by Supabase Auth's OAuth 2.1 server
 * (the client got it through `/oauth/consentir`). It is validated by
 * Supabase (`auth.getUser(token)`), never decoded and trusted locally, and
 * the client built from it is the user's own: every query runs under the
 * same RLS as the console. No service role, no token stored by us.
 */

export type BearerResult =
  | { kind: "none" }
  | { kind: "invalid" }
  | { kind: "ok"; account: ExtAccount };

export function bearerToken(header: string | null): string | null {
  const m = /^Bearer\s+([A-Za-z0-9._~+/=-]{20,4096})$/.exec((header ?? "").trim());
  return m ? m[1] : null;
}

export async function accountFromBearer(header: string | null): Promise<BearerResult> {
  if (!header) return { kind: "none" };
  const token = bearerToken(header);
  if (!token) return { kind: "invalid" };
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return { kind: "invalid" };
  const supabase = createClient(url, anon, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  });
  try {
    const account = await readExtAccountWith(supabase as unknown as ExtAccount["supabase"], token);
    return account ? { kind: "ok", account } : { kind: "invalid" };
  } catch {
    return { kind: "invalid" };
  }
}
