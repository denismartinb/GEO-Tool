/**
 * MCP-SERVER-1 (log §418): OAuth discovery documents for the MCP endpoint.
 *
 * GenScore is only the protected resource. The authorization server is
 * Supabase Auth's OAuth 2.1 server, whose issuer is `<project>/auth/v1`;
 * clients find its own metadata at
 * `<project>/.well-known/oauth-authorization-server/auth/v1` (RFC 8414 path
 * insertion). Pure, so it is tested without a server.
 */

export function supabaseIssuer(supabaseUrl: string): string {
  return `${supabaseUrl.replace(/\/+$/, "")}/auth/v1`;
}

export function protectedResourceMetadata(origin: string, supabaseUrl: string) {
  return {
    resource: `${origin}/api/mcp`,
    authorization_servers: [supabaseIssuer(supabaseUrl)],
    bearer_methods_supported: ["header"],
    resource_name: "GenScore",
    resource_documentation: `${origin}/docs/mcp`,
    resource_policy_uri: `${origin}/privacidad`
  };
}

/** Where Supabase publishes its authorization server metadata. */
export function authorizationServerMetadataUrl(supabaseUrl: string): string {
  return `${supabaseUrl.replace(/\/+$/, "")}/.well-known/oauth-authorization-server/auth/v1`;
}
