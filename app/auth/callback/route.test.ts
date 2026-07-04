import { describe, it, expect, vi, beforeEach } from "vitest";

const exchangeCodeForSessionMock = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { exchangeCodeForSession: exchangeCodeForSessionMock }
  }))
}));

import { GET } from "./route";

beforeEach(() => {
  exchangeCodeForSessionMock.mockReset();
});

describe("auth callback GET", () => {
  it("redirects to /dashboard after a successful code exchange", async () => {
    exchangeCodeForSessionMock.mockResolvedValue({ error: null });

    const res = await GET(new Request("https://app.example.com/auth/callback?code=abc"));

    expect(res.headers.get("location")).toBe("https://app.example.com/dashboard");
    expect(exchangeCodeForSessionMock).toHaveBeenCalledWith("abc");
  });

  it("honors the next param on success", async () => {
    exchangeCodeForSessionMock.mockResolvedValue({ error: null });

    const res = await GET(new Request("https://app.example.com/auth/callback?code=abc&next=/settings"));

    expect(res.headers.get("location")).toBe("https://app.example.com/settings");
  });

  it("redirects to /login with a sanitized error when the provider returns an error param", async () => {
    const res = await GET(
      new Request("https://app.example.com/auth/callback?error=access_denied&error_description=SECRET")
    );

    const loc = res.headers.get("location") ?? "";
    expect(loc.startsWith("https://app.example.com/login?error=")).toBe(true);
    expect(loc).not.toContain("SECRET");
    expect(loc).not.toContain("access_denied");
    expect(exchangeCodeForSessionMock).not.toHaveBeenCalled();
  });

  it("redirects to /login with a sanitized error when the code exchange fails", async () => {
    exchangeCodeForSessionMock.mockResolvedValue({ error: { message: "SECRET exchange failure" } });

    const res = await GET(new Request("https://app.example.com/auth/callback?code=bad"));

    const loc = res.headers.get("location") ?? "";
    expect(loc.startsWith("https://app.example.com/login?error=")).toBe(true);
    expect(loc).not.toContain("SECRET");
  });
});
