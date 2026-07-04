import { describe, it, expect, vi, beforeEach } from "vitest";

const redirectMock = vi.fn((url: string) => {
  // Mirror Next's real redirect(), which throws to halt execution.
  throw new Error(`REDIRECT:${url}`);
});

vi.mock("next/navigation", () => ({
  redirect: (url: string) => redirectMock(url)
}));

const signInWithOAuthMock = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { signInWithOAuth: signInWithOAuthMock }
  }))
}));

import { signInWithApple } from "./actions";

const ERROR_MESSAGE = "No se pudo iniciar sesión con Apple. Inténtalo de nuevo.";

function formData(entries: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(entries)) fd.append(key, value);
  return fd;
}

beforeEach(() => {
  redirectMock.mockClear();
  signInWithOAuthMock.mockReset();
  delete process.env.NEXT_PUBLIC_SITE_URL;
  delete process.env.VERCEL_URL;
});

describe("signInWithApple", () => {
  it("redirects the browser to the Apple authorization URL on success", async () => {
    signInWithOAuthMock.mockResolvedValue({
      data: { url: "https://appleid.apple.com/auth/authorize?x=1" },
      error: null
    });

    await expect(signInWithApple(formData({ from: "/login" }))).rejects.toThrow(
      "REDIRECT:https://appleid.apple.com/auth/authorize?x=1"
    );
    expect(signInWithOAuthMock).toHaveBeenCalledWith({
      provider: "apple",
      options: { redirectTo: "http://localhost:3000/auth/callback" }
    });
  });

  it("uses NEXT_PUBLIC_SITE_URL for the callback redirect when set", async () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://app.example.com";
    signInWithOAuthMock.mockResolvedValue({
      data: { url: "https://appleid.apple.com/x" },
      error: null
    });

    await expect(signInWithApple(formData({}))).rejects.toThrow();
    expect(signInWithOAuthMock).toHaveBeenCalledWith({
      provider: "apple",
      options: { redirectTo: "https://app.example.com/auth/callback" }
    });
  });

  it("redirects back to the originating page with a sanitized error when Supabase errors", async () => {
    signInWithOAuthMock.mockResolvedValue({ data: null, error: { message: "provider not enabled" } });

    await expect(signInWithApple(formData({ from: "/signup" }))).rejects.toThrow(
      `REDIRECT:/signup?error=${encodeURIComponent(ERROR_MESSAGE)}`
    );
  });

  it("never leaks the raw provider error message into the redirect", async () => {
    signInWithOAuthMock.mockResolvedValue({ data: null, error: { message: "SECRET provider detail" } });

    await expect(signInWithApple(formData({ from: "/login" }))).rejects.toThrow();
    const target = redirectMock.mock.calls[0]?.[0] as string;
    expect(target).not.toContain("SECRET");
  });

  it("falls back to /login when `from` is not a whitelisted auth page (no open redirect)", async () => {
    signInWithOAuthMock.mockResolvedValue({ data: null, error: { message: "err" } });

    await expect(signInWithApple(formData({ from: "https://evil.com" }))).rejects.toThrow(
      `REDIRECT:/login?error=${encodeURIComponent(ERROR_MESSAGE)}`
    );
  });

  it("treats a missing url in the OAuth response as an error", async () => {
    signInWithOAuthMock.mockResolvedValue({ data: {}, error: null });

    await expect(signInWithApple(formData({ from: "/login" }))).rejects.toThrow("REDIRECT:/login?error=");
  });
});
