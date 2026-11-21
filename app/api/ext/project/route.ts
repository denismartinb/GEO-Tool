import { extJson } from "@/lib/ext/account";
import { readExtRequestAccount } from "@/lib/ext/request-account";
import { loadExtProjectData, normalizeHost } from "@/lib/ext/project-data";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * CHROME-EXT-1 paso 02 (log §361): one of the account's projects, as the
 * panel shows it. `domain` picks the project that covers it (the open page's
 * host, or a domain from the selector); `url`, when it belongs to that
 * project, adds the prompts of the latest scan that cited it.
 *
 * Read-only, no LLM, no service role. The loader is shared with the MCP
 * endpoint (MCP-SERVER-1, log §418), so both show the same figures; every
 * figure comes from the same owner as the console (see `lib/ext/summary.ts`).
 * A domain that is not one of the account's projects is a 404, never another
 * account's data.
 *
 * WP-PLUGIN-2 (log §432): the WordPress plugin reads the same payload with
 * the OAuth bearer token it got through `/oauth/consentir`.
 */
export async function GET(request: Request) {
  const account = await readExtRequestAccount(request);
  if (!account) return extJson({ error: "unauthenticated" }, 401);

  const params = new URL(request.url).searchParams;
  const domain = normalizeHost(params.get("domain"));
  if (!domain) return extJson({ error: "missing_domain" }, 400);

  const data = await loadExtProjectData(account, { domain, url: params.get("url") });
  if (data.kind === "not_found") return extJson({ error: "not_found" }, 404);
  return extJson(data.payload);
}
