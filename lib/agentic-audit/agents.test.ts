import { describe, expect, it } from "vitest";
import { resolveAssistantAccess } from "./agents";

// Same rule as lib/web-audit/robots.ts: a group naming the token beats `*`,
// and only `Disallow: /` blocks.
function tokenAllowed(robots: string, token: string): boolean {
  const lines = robots.toLowerCase().split("\n");
  const own = lines.findIndex((l) => l.trim() === `user-agent: ${token.toLowerCase()}`);
  const star = lines.findIndex((l) => l.trim() === "user-agent: *");
  const start = own >= 0 ? own : star;
  if (start < 0) return true;
  return lines[start + 1]?.trim() !== "disallow: /";
}

describe("resolveAssistantAccess", () => {
  it("no robots.txt lets everyone in", () => {
    expect(resolveAssistantAccess(null, tokenAllowed).every((a) => a.allowed === true)).toBe(true);
  });

  it("an unreadable robots.txt is unknown, not allowed", () => {
    expect(resolveAssistantAccess(undefined, tokenAllowed).every((a) => a.allowed === null)).toBe(true);
  });

  it("blocking one of an assistant's tokens blocks the assistant", () => {
    const access = resolveAssistantAccess("User-agent: OAI-SearchBot\nDisallow: /", tokenAllowed);
    expect(access.find((a) => a.assistant === "ChatGPT")?.allowed).toBe(false);
    expect(access.find((a) => a.assistant === "Claude")?.allowed).toBe(true);
  });

  it("blocking a training-only crawler does not block the assistant", () => {
    const access = resolveAssistantAccess("User-agent: GPTBot\nDisallow: /", tokenAllowed);
    expect(access.find((a) => a.assistant === "ChatGPT")?.allowed).toBe(true);
  });
});
