import { beforeEach, describe, expect, it, vi } from "vitest";

// `redirect()` never returns in a real Next.js request — it throws a special
// NEXT_REDIRECT error to unwind the render. The mock reproduces that (throw,
// don't return) so a test can assert both "redirect was reached" and "nothing
// ran after it" the same way production behaves.
const redirectMock = vi.fn((url: string) => {
  throw new Error(`REDIRECT:${url}`);
});
vi.mock("next/navigation", () => ({
  redirect: (url: string) => redirectMock(url)
}));

const signInWithOAuth = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { signInWithOAuth }
  })
}));

// signInWithGoogle probes the OAuth URL itself (redirect: "manual") to catch
// a disabled/misconfigured provider before sending the user's browser to it —
// Supabase's JS client builds that URL without checking the provider is
// actually enabled. Default to a healthy 302 (real Google redirect); tests
// that care about the disabled-provider case override this per-test.
const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

import { signInWithGoogle } from "./actions";

function calledRedirectUrl(): string {
  return redirectMock.mock.calls[0]?.[0] as string;
}

describe("signInWithGoogle", () => {
  beforeEach(() => {
    redirectMock.mockClear();
    signInWithOAuth.mockClear();
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({ status: 302 } as Response);
    delete process.env.NEXT_PUBLIC_SITE_URL;
    delete process.env.VERCEL_URL;
  });

  it("builds redirectTo from NEXT_PUBLIC_SITE_URL and redirects to the returned OAuth url", async () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://app.example.com";
    signInWithOAuth.mockResolvedValue({
      data: { url: "https://accounts.google.com/o/oauth2/auth?foo=bar" },
      error: null
    });

    await expect(signInWithGoogle(new FormData())).rejects.toThrow(
      "REDIRECT:https://accounts.google.com/o/oauth2/auth?foo=bar"
    );

    expect(signInWithOAuth).toHaveBeenCalledWith({
      provider: "google",
      options: { redirectTo: "https://app.example.com/auth/callback" }
    });
  });

  it("falls back to VERCEL_URL, then localhost, when NEXT_PUBLIC_SITE_URL is unset", async () => {
    process.env.VERCEL_URL = "my-preview.vercel.app";
    signInWithOAuth.mockResolvedValue({ data: { url: "https://accounts.google.com/x" }, error: null });

    await expect(signInWithGoogle(new FormData())).rejects.toThrow();

    expect(signInWithOAuth).toHaveBeenCalledWith({
      provider: "google",
      options: { redirectTo: "https://my-preview.vercel.app/auth/callback" }
    });
  });

  it("never surfaces the raw provider error, and redirects to /login by default", async () => {
    signInWithOAuth.mockResolvedValue({
      data: { url: null },
      error: { message: "invalid_client: leaked secret detail" }
    });

    await expect(signInWithGoogle(new FormData())).rejects.toThrow(/^REDIRECT:/);

    const url = calledRedirectUrl();
    expect(url).not.toContain("invalid_client");
    expect(url).not.toContain("leaked secret");
    expect(url.startsWith("/login?error=")).toBe(true);
  });

  it("redirects a failure back to /signup when the form came from the signup page", async () => {
    signInWithOAuth.mockResolvedValue({ data: { url: null }, error: { message: "boom" } });
    const formData = new FormData();
    formData.set("from", "signup");

    await expect(signInWithGoogle(formData)).rejects.toThrow();

    expect(calledRedirectUrl().startsWith("/signup?error=")).toBe(true);
  });

  it("shows the safe error instead of forwarding the browser when the provider is disabled", async () => {
    // supabase-js returns no error and a well-formed url even when the
    // provider isn't enabled in Supabase — the 400 only shows up once
    // something actually requests that url. This reproduces that: no error,
    // a url, but the probe request comes back 400 instead of a redirect.
    const oauthUrl = "https://project.supabase.co/auth/v1/authorize?provider=google";
    signInWithOAuth.mockResolvedValue({ data: { url: oauthUrl }, error: null });
    fetchMock.mockResolvedValue({ status: 400 } as Response);

    await expect(signInWithGoogle(new FormData())).rejects.toThrow(/^REDIRECT:/);

    expect(fetchMock).toHaveBeenCalledWith(oauthUrl, { redirect: "manual" });
    const url = calledRedirectUrl();
    expect(url).not.toBe(oauthUrl);
    expect(url).not.toContain("supabase.co");
    expect(url.startsWith("/login?error=")).toBe(true);
  });

  it("fails closed (safe error) if the probe request itself throws", async () => {
    signInWithOAuth.mockResolvedValue({
      data: { url: "https://project.supabase.co/auth/v1/authorize?provider=google" },
      error: null
    });
    fetchMock.mockRejectedValue(new Error("network down"));

    await expect(signInWithGoogle(new FormData())).rejects.toThrow(/^REDIRECT:/);

    expect(calledRedirectUrl().startsWith("/login?error=")).toBe(true);
  });
});
