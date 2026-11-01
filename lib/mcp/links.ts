/**
 * MCP-ACQUISITION-1 (log §425): which client is talking to us, and the
 * public links each answer may carry.
 *
 * Two endpoints, two profiles:
 * - `claude` (`/api/mcp`): may explain plans and prices when asked
 *   (`que_es_genscore`) and mention the 7-day trial in a hook.
 * - `chatgpt` (`/api/mcp/chatgpt`): OpenAI's app rules forbid advertising
 *   prices, subscriptions, trials or promotions, so it never does; it may
 *   link to `/precios` as an informational page.
 *
 * Every public link carries `utm_source=<profile>&utm_medium=mcp` and the
 * tool as campaign, so signups from each connector are counted apart.
 * Console links (`/dashboard/...`) carry none: they are for people who are
 * already customers.
 */

export type McpProfile = "claude" | "chatgpt";

export const MCP_PROFILES: readonly McpProfile[] = ["claude", "chatgpt"];

/** The endpoint path of each profile. */
export const MCP_ENDPOINT: Record<McpProfile, string> = {
  claude: "/api/mcp",
  chatgpt: "/api/mcp/chatgpt"
};

/** A public genscore.es URL with this connector's UTM tags. */
export function publicUrl(
  base: string,
  path: string,
  profile: McpProfile,
  campaign: string,
  params: Record<string, string | null | undefined> = {}
): string {
  const url = new URL(path, base);
  for (const [k, v] of Object.entries(params)) if (v) url.searchParams.set(k, v);
  url.searchParams.set("utm_source", profile);
  url.searchParams.set("utm_medium", "mcp");
  url.searchParams.set("utm_campaign", campaign);
  return url.toString();
}

/** Signup, prefilled with the domain when we know it (`/signup?dominio=`, log §421). */
export const signupUrl = (base: string, profile: McpProfile, campaign: string, domain?: string | null) =>
  publicUrl(base, "/signup", profile, campaign, { dominio: domain ?? null });
