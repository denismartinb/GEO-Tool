import { describe, expect, it, vi } from "vitest";

const getUser = vi.fn();
const createClient = vi.fn((..._a: unknown[]) => ({ auth: { getUser } }));
vi.mock("@supabase/supabase-js", () => ({ createClient: (...a: unknown[]) => createClient(...a) }));
const readExtAccountWith = vi.fn();
vi.mock("@/lib/ext/account", () => ({ readExtAccountWith: (...a: unknown[]) => readExtAccountWith(...a) }));

import { accountFromBearer, bearerToken } from "./auth";

describe("MCP bearer auth (MCP-SERVER-1, log §418)", () => {
  it("reads only a well-formed Bearer header", () => {
    expect(bearerToken("Bearer abcdefghijklmnopqrstuvwxyz.123")).toBe("abcdefghijklmnopqrstuvwxyz.123");
    expect(bearerToken("Basic abc")).toBeNull();
    expect(bearerToken("Bearer short")).toBeNull();
    expect(bearerToken(null)).toBeNull();
  });

  it("builds the user's own client with the anon key and lets Supabase validate the token", async () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://abc.supabase.co";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
    readExtAccountWith.mockResolvedValue({ user: { id: "u1" } });
    const token = "abcdefghijklmnopqrstuvwxyz.123";
    const out = await accountFromBearer(`Bearer ${token}`);
    expect(out.kind).toBe("ok");
    const [url, key, opts] = createClient.mock.calls[0] as [string, string, { global: { headers: Record<string, string> } }];
    expect([url, key]).toEqual(["https://abc.supabase.co", "anon-key"]);
    expect(opts.global.headers.Authorization).toBe(`Bearer ${token}`);
    expect(readExtAccountWith.mock.calls[0][1]).toBe(token);
  });

  it("treats a token Supabase rejects as invalid, and no header as none", async () => {
    readExtAccountWith.mockResolvedValue(null);
    expect(await accountFromBearer("Bearer abcdefghijklmnopqrstuvwxyz.123")).toEqual({ kind: "invalid" });
    expect(await accountFromBearer(null)).toEqual({ kind: "none" });
    expect(await accountFromBearer("Basic x")).toEqual({ kind: "invalid" });
  });
});
