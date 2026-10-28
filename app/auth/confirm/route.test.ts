import { beforeEach, describe, expect, it, vi } from "vitest";

const verifyOtp = vi.fn();
const updateUser = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { verifyOtp, updateUser } })
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
  return new Request(`https://app.example.com/auth/confirm${search}`);
}

describe("GET /auth/confirm (log §359)", () => {
  beforeEach(() => {
    verifyOtp.mockReset();
    sendWelcomeEmail.mockReset();
    sendNewSignupOpsAlert.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("verifies the token hash and runs the first-session alerts for a fresh confirmation", async () => {
    verifyOtp.mockResolvedValue({
      data: {
        user: {
          id: "user-1",
          email: "new@example.com",
          created_at: "2026-10-28T10:00:00.000Z",
          email_confirmed_at: "2026-10-28T10:05:00.000Z",
          last_sign_in_at: "2026-10-28T10:05:00.300Z"
        }
      },
      error: null
    });

    const response = await GET(requestFor("?token_hash=abc&type=email"));

    expect(verifyOtp).toHaveBeenCalledWith({ type: "email", token_hash: "abc" });
    expect(sendWelcomeEmail).toHaveBeenCalledWith("new@example.com");
    expect(sendNewSignupOpsAlert).toHaveBeenCalledWith(
      expect.anything(),
      { id: "user-1", email: "new@example.com", created_at: "2026-10-28T10:00:00.000Z" },
      "password"
    );
    expect(response.headers.get("location")).toBe("https://app.example.com/dashboard");
  });

  it("does not alert again for an account confirmed long ago", async () => {
    verifyOtp.mockResolvedValue({
      data: {
        user: {
          id: "user-1",
          email: "old@example.com",
          email_confirmed_at: "2026-09-01T10:00:00.000Z",
          last_sign_in_at: "2026-10-28T10:05:00.000Z"
        }
      },
      error: null
    });

    await GET(requestFor("?token_hash=abc&type=magiclink"));

    expect(sendWelcomeEmail).not.toHaveBeenCalled();
    expect(sendNewSignupOpsAlert).not.toHaveBeenCalled();
  });

  it("sends an expired or used link to /login with a safe message", async () => {
    verifyOtp.mockResolvedValue({ data: { user: null }, error: { message: "Token has expired or is invalid" } });

    const response = await GET(requestFor("?token_hash=abc&type=email"));

    expect(response.headers.get("location")).toMatch(/^https:\/\/app\.example\.com\/login\?error=/);
    expect(response.headers.get("location")).not.toContain("expired");
  });

  it("rejects a missing token or a type it does not handle without calling Supabase", async () => {
    await GET(requestFor("?type=email"));
    await GET(requestFor("?token_hash=abc&type=recovery"));

    expect(verifyOtp).not.toHaveBeenCalled();
  });

  it("never follows next off this site", async () => {
    verifyOtp.mockResolvedValue({ data: { user: null }, error: null });

    const response = await GET(requestFor("?token_hash=abc&type=email&next=//evil.com"));

    expect(response.headers.get("location")).toBe("https://app.example.com/dashboard");
  });
});
