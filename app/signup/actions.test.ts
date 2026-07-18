import { beforeEach, describe, expect, it, vi } from "vitest";

const redirectMock = vi.fn((url: string) => {
  throw new Error(`REDIRECT:${url}`);
});
vi.mock("next/navigation", () => ({ redirect: (url: string) => redirectMock(url) }));

const signUp = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { signUp: (...args: unknown[]) => signUp(...args) } })
}));

const sendWelcomeEmail = vi.fn();
vi.mock("@/lib/email/transactional", () => ({
  sendWelcomeEmail: (...args: unknown[]) => sendWelcomeEmail(...args)
}));

beforeEach(() => {
  redirectMock.mockClear();
  signUp.mockReset();
  sendWelcomeEmail.mockReset();
  delete process.env.NEXT_PUBLIC_SITE_URL;
  delete process.env.VERCEL_URL;
});

function formData(fields: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

describe("signup", () => {
  it("sends a welcome email and redirects to the dashboard when email confirmation is off (session returned immediately)", async () => {
    signUp.mockResolvedValue({ data: { session: { access_token: "tok" } }, error: null });
    const { signup } = await import("./actions");

    await expect(
      signup(formData({ email: "new@example.com", password: "supersecret" }))
    ).rejects.toThrow("REDIRECT:/dashboard");

    expect(sendWelcomeEmail).toHaveBeenCalledWith("new@example.com");
    expect(signUp).toHaveBeenCalledWith({
      email: "new@example.com",
      password: "supersecret",
      options: { emailRedirectTo: "http://localhost:3000/auth/callback" }
    });
  });

  it("does not send a welcome email and redirects to the check-email screen when confirmation is required (no session)", async () => {
    signUp.mockResolvedValue({ data: { session: null }, error: null });
    const { signup } = await import("./actions");

    await expect(
      signup(formData({ email: "new@example.com", password: "supersecret" }))
    ).rejects.toThrow("REDIRECT:/signup/confirm?email=new%40example.com");

    expect(sendWelcomeEmail).not.toHaveBeenCalled();
  });

  it("builds emailRedirectTo from NEXT_PUBLIC_SITE_URL when set", async () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://app.example.com";
    signUp.mockResolvedValue({ data: { session: null }, error: null });
    const { signup } = await import("./actions");

    await expect(
      signup(formData({ email: "new@example.com", password: "supersecret" }))
    ).rejects.toThrow();

    expect(signUp).toHaveBeenCalledWith(
      expect.objectContaining({ options: { emailRedirectTo: "https://app.example.com/auth/callback" } })
    );
  });

  it("does not send a welcome email when signup fails", async () => {
    signUp.mockResolvedValue({ data: { session: null }, error: { message: "already registered" } });
    const { signup } = await import("./actions");

    await expect(
      signup(formData({ email: "new@example.com", password: "supersecret" }))
    ).rejects.toThrow(/^REDIRECT:\/signup\?error=/);

    expect(sendWelcomeEmail).not.toHaveBeenCalled();
  });
});
