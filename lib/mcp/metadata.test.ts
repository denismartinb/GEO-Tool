import { describe, expect, it } from "vitest";
import { authorizationServerMetadataUrl, protectedResourceMetadata } from "./metadata";

describe("OAuth discovery (MCP-SERVER-1, log §418)", () => {
  it("names the MCP endpoint as the resource and Supabase Auth as its only authorization server", () => {
    expect(protectedResourceMetadata("https://www.genscore.es", "https://abc.supabase.co/")).toEqual({
      resource: "https://www.genscore.es/api/mcp",
      authorization_servers: ["https://abc.supabase.co/auth/v1"],
      bearer_methods_supported: ["header"],
      resource_name: "GenScore",
      resource_documentation: "https://www.genscore.es/docs/mcp",
      resource_policy_uri: "https://www.genscore.es/privacidad"
    });
  });
  it("finds Supabase's metadata by RFC 8414 path insertion", () => {
    expect(authorizationServerMetadataUrl("https://abc.supabase.co")).toBe("https://abc.supabase.co/.well-known/oauth-authorization-server/auth/v1");
  });
});
