import { beforeEach, describe, expect, it, vi } from "vitest";

const exchangeCodeForSession = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { exchangeCodeForSession }
  })
}));

const sendWelcomeEmail = vi.fn();
vi.mock("@/lib/email/transactional", () => ({
  sendWelcomeEmail: (...args: unknown[]) => sendWelcomeEmail(...args)
}));

const sendNewSignupOpsAlert = vi.fn();
vi.mock("@/lib/admin/signup-alert", () => ({
  sendNewSignupOpsAlert: (...args: unknown[]) => sendNewSignupOpsAlert(...args)
}));

import { GET } from "./route";

function requestFor(search: string): Request {
  return new Request(`https://app.example.com/auth/callback${search}`);
}

function userAt(
  email: string,
  createdAt: string,
  lastSignInAt: string,
  provider?: string,
  emailConfirmedAt: string = lastSignInAt
) {
  return {
    id: "user-1",
    email,
    created_at: createdAt,
    last_sign_in_at: lastSignInAt,
    email_confirmed_at: emailConfirmedAt,
    app_metadata: provider ? { provider } : undefined
  };
}

describe("GET /auth/callback", () => {
  beforeEach(() => {
    exchangeCodeForSession.mockReset();
    sendWelcomeEmail.mockReset();
    sendNewSignupOpsAlert.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("exchanges a valid code and redirects to next (default /dashboard)", async () => {
    exchangeCodeForSession.mockResolvedValue({ data: { user: null }, error: null });

    const response = await GET(requestFor("?code=abc123"));

    expect(exchangeCodeForSession).toHaveBeenCalledWith("abc123");
    expect(response.headers.get("location")).toBe("https://app.example.com/dashboard");
  });

  it("honors an explicit next param on success", async () => {
    exchangeCodeForSession.mockResolvedValue({ data: { user: null }, error: null });

    const response = await GET(requestFor("?code=abc123&next=/dashboard/billing"));

    expect(response.headers.get("location")).toBe("https://app.example.com/dashboard/billing");
  });

  it("sends the welcome email and a 'google' ops alert for a brand-new OAuth signup (last_sign_in_at ≈ email_confirmed_at)", async () => {
    exchangeCodeForSession.mockResolvedValue({
      data: { user: userAt("new@example.com", "2026-07-11T18:00:00.000Z", "2026-07-11T18:00:00.400Z", "google") },
      error: null
    });

    await GET(requestFor("?code=abc123"));

    expect(sendWelcomeEmail).toHaveBeenCalledWith("new@example.com");
    expect(sendNewSignupOpsAlert).toHaveBeenCalledWith(
      expect.anything(),
      { id: "user-1", email: "new@example.com", created_at: "2026-07-11T18:00:00.000Z" },
      "google"
    );
  });

  it("sends a 'password' ops alert for a fresh signup confirmed via the email link (no provider)", async () => {
    exchangeCodeForSession.mockResolvedValue({
      data: { user: userAt("new@example.com", "2026-07-11T18:00:00.000Z", "2026-07-11T18:00:00.400Z") },
      error: null
    });

    await GET(requestFor("?code=abc123"));

    expect(sendNewSignupOpsAlert).toHaveBeenCalledWith(expect.anything(), expect.anything(), "password");
  });

  it("still sends the welcome email and ops alert when the user takes several minutes to click the confirmation link", async () => {
    exchangeCodeForSession.mockResolvedValue({
      data: {
        user: userAt(
          "slow-clicker@example.com",
          "2026-07-11T18:00:00.000Z",
          "2026-07-11T18:11:32.000Z",
          undefined,
          "2026-07-11T18:11:32.000Z"
        )
      },
      error: null
    });

    await GET(requestFor("?code=abc123"));

    expect(sendWelcomeEmail).toHaveBeenCalledWith("slow-clicker@example.com");
    expect(sendNewSignupOpsAlert).toHaveBeenCalledWith(expect.anything(), expect.anything(), "password");
  });

  it("does not send a welcome email or ops alert for a returning user signing back in", async () => {
    exchangeCodeForSession.mockResolvedValue({
      data: {
        user: userAt(
          "returning@example.com",
          "2026-01-01T00:00:00.000Z",
          "2026-07-11T18:00:00.000Z",
          undefined,
          "2026-01-01T00:00:05.000Z"
        )
      },
      error: null
    });

    await GET(requestFor("?code=abc123"));

    expect(sendWelcomeEmail).not.toHaveBeenCalled();
    expect(sendNewSignupOpsAlert).not.toHaveBeenCalled();
  });

  it("never lands the user on a stale/unauthenticated /dashboard when the exchange fails", async () => {
    exchangeCodeForSession.mockResolvedValue({ error: { message: "invalid PKCE code verifier" } });

    const response = await GET(requestFor("?code=abc123"));

    const location = response.headers.get("location") ?? "";
    expect(location.startsWith("https://app.example.com/login?error=")).toBe(true);
    expect(location).not.toContain("invalid+PKCE");
    expect(location).not.toContain("PKCE");
  });

  it("redirects to a safe login error when the provider itself reports an error", async () => {
    const response = await GET(requestFor("?error=access_denied&error_description=User+cancelled"));

    expect(exchangeCodeForSession).not.toHaveBeenCalled();
    const location = response.headers.get("location") ?? "";
    expect(location.startsWith("https://app.example.com/login?error=")).toBe(true);
  });

  it("redirects to a safe login error instead of a bare next when neither code nor error is present", async () => {
    const response = await GET(requestFor(""));

    expect(exchangeCodeForSession).not.toHaveBeenCalled();
    const location = response.headers.get("location") ?? "";
    expect(location.startsWith("https://app.example.com/login?error=")).toBe(true);
  });
});
