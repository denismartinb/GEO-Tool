import { beforeEach, describe, expect, it, vi } from "vitest";

const verifyOtp = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { verifyOtp }
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

const captureFunnelEvent = vi.fn();
vi.mock("@/lib/analytics/funnel-events", () => ({
  captureFunnelEvent: (...args: unknown[]) => captureFunnelEvent(...args)
}));

import { GET } from "./route";

function requestFor(search: string): Request {
  return new Request(`https://app.example.com/auth/confirm${search}`);
}

const freshUser = {
  id: "user-1",
  email: "new@example.com",
  created_at: "2026-10-09T19:44:00.000Z",
  email_confirmed_at: "2026-10-09T19:47:10.000Z",
  last_sign_in_at: "2026-10-09T19:47:10.300Z"
};

describe("GET /auth/confirm", () => {
  beforeEach(() => {
    verifyOtp.mockReset();
    sendWelcomeEmail.mockReset();
    sendNewSignupOpsAlert.mockReset();
    captureFunnelEvent.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("verifies the token hash — no PKCE verifier needed — and runs every first-confirmation side effect", async () => {
    verifyOtp.mockResolvedValue({ data: { user: freshUser }, error: null });

    const response = await GET(requestFor("?token_hash=th_123&type=email&next=/dashboard"));

    expect(verifyOtp).toHaveBeenCalledWith({ token_hash: "th_123", type: "email" });
    expect(sendWelcomeEmail).toHaveBeenCalledWith("new@example.com");
    expect(sendNewSignupOpsAlert).toHaveBeenCalledWith(expect.anything(), expect.anything(), "password");
    expect(captureFunnelEvent).toHaveBeenCalledWith("signup_completed", "user-1", { method: "password" });
    expect(response.headers.get("location")).toBe("https://app.example.com/dashboard");
  });

  it("accepts the legacy `signup` type too", async () => {
    verifyOtp.mockResolvedValue({ data: { user: freshUser }, error: null });

    await GET(requestFor("?token_hash=th_123&type=signup"));

    expect(verifyOtp).toHaveBeenCalledWith({ token_hash: "th_123", type: "signup" });
  });

  it("does not re-fire side effects for an already-confirmed account clicking an old link", async () => {
    verifyOtp.mockResolvedValue({
      data: { user: { ...freshUser, email_confirmed_at: "2026-01-01T00:00:00.000Z" } },
      error: null
    });

    await GET(requestFor("?token_hash=th_123&type=email"));

    expect(sendWelcomeEmail).not.toHaveBeenCalled();
    expect(captureFunnelEvent).not.toHaveBeenCalled();
  });

  it("sends an expired or reused link to the login error, never echoing the provider message", async () => {
    verifyOtp.mockResolvedValue({ data: { user: null }, error: { message: "Email link is invalid or has expired" } });

    const response = await GET(requestFor("?token_hash=th_123&type=email"));

    const location = response.headers.get("location") ?? "";
    expect(location.startsWith("https://app.example.com/login?error=")).toBe(true);
    expect(location).not.toContain("expired");
  });

  it.each([
    ["missing token_hash", "?type=email"],
    ["missing type", "?token_hash=th_123"],
    ["a type this route does not handle", "?token_hash=th_123&type=recovery"]
  ])("rejects %s without calling Supabase", async (_label, search) => {
    const response = await GET(requestFor(search));

    expect(verifyOtp).not.toHaveBeenCalled();
    expect(response.headers.get("location")?.startsWith("https://app.example.com/login?error=")).toBe(true);
  });

  it("never redirects off-site through `next`", async () => {
    verifyOtp.mockResolvedValue({ data: { user: null }, error: null });

    const response = await GET(requestFor("?token_hash=th_123&type=email&next=//evil.example"));

    expect(response.headers.get("location")).toBe("https://app.example.com/dashboard");
  });
});
