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

const sendNewSignupOpsAlert = vi.fn();
vi.mock("@/lib/admin/signup-alert", () => ({
  sendNewSignupOpsAlert: (...args: unknown[]) => sendNewSignupOpsAlert(...args)
}));

// AFFILIATES-1: the `gs_ref` cookie, mutable per test. `null` = no cookie
// store at all (throws, as outside a request), which must never block sign-up.
let refCookie: string | null | undefined;
vi.mock("next/headers", () => ({
  cookies: async () => {
    if (refCookie === undefined) throw new Error("cookies() outside a request");
    return { get: (name: string) => (name === "gs_ref" && refCookie ? { name, value: refCookie } : undefined) };
  }
}));

beforeEach(() => {
  refCookie = undefined;
  delete process.env.AFFILIATE_CODES;
  redirectMock.mockClear();
  signUp.mockReset();
  sendWelcomeEmail.mockReset();
  sendNewSignupOpsAlert.mockReset();
  delete process.env.NEXT_PUBLIC_SITE_URL;
  delete process.env.VERCEL_URL;
});

function formData(fields: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

describe("signup", () => {
  it("sends a welcome email and an ops alert, then redirects to the dashboard when email confirmation is off (session returned immediately)", async () => {
    signUp.mockResolvedValue({
      data: {
        session: { access_token: "tok" },
        user: { id: "user-1", email: "new@example.com", created_at: "2026-08-11T09:00:00.000Z" }
      },
      error: null
    });
    const { signup } = await import("./actions");

    await expect(
      signup(formData({ email: "new@example.com", password: "supersecret", confirmPassword: "supersecret" }))
    ).rejects.toThrow("REDIRECT:/dashboard");

    expect(sendWelcomeEmail).toHaveBeenCalledWith("new@example.com");
    expect(sendNewSignupOpsAlert).toHaveBeenCalledWith(
      expect.anything(),
      { id: "user-1", email: "new@example.com", created_at: "2026-08-11T09:00:00.000Z" },
      "password"
    );
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
      signup(formData({ email: "new@example.com", password: "supersecret", confirmPassword: "supersecret" }))
    ).rejects.toThrow("REDIRECT:/signup/confirm?email=new%40example.com");

    expect(sendWelcomeEmail).not.toHaveBeenCalled();
  });

  it("builds emailRedirectTo from NEXT_PUBLIC_SITE_URL when set", async () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://app.example.com";
    signUp.mockResolvedValue({ data: { session: null }, error: null });
    const { signup } = await import("./actions");

    await expect(
      signup(formData({ email: "new@example.com", password: "supersecret", confirmPassword: "supersecret" }))
    ).rejects.toThrow();

    expect(signUp).toHaveBeenCalledWith(
      expect.objectContaining({ options: { emailRedirectTo: "https://app.example.com/auth/callback" } })
    );
  });

  it("does not send a welcome email when signup fails", async () => {
    signUp.mockResolvedValue({ data: { session: null }, error: { message: "already registered" } });
    const { signup } = await import("./actions");

    await expect(
      signup(formData({ email: "new@example.com", password: "supersecret", confirmPassword: "supersecret" }))
    ).rejects.toThrow(/^REDIRECT:\/signup\?error=/);

    expect(sendWelcomeEmail).not.toHaveBeenCalled();
  });

  it("maps the over_email_send_rate_limit error code to a safe Spanish message", async () => {
    signUp.mockResolvedValue({
      data: { session: null },
      error: { code: "over_email_send_rate_limit", message: "email rate limit exceeded" }
    });
    const { signup } = await import("./actions");

    let redirectUrl = "";
    try {
      await signup(formData({ email: "new@example.com", password: "supersecret", confirmPassword: "supersecret" }));
    } catch (e) {
      redirectUrl = (e as Error).message.replace("REDIRECT:", "");
    }

    expect(redirectUrl.startsWith("/signup?error=")).toBe(true);
    expect(redirectUrl).not.toContain("email+rate+limit+exceeded");
    expect(decodeURIComponent(redirectUrl)).toContain("Espera unos minutos");
  });

  it("maps the user_already_exists error code to a safe Spanish message", async () => {
    signUp.mockResolvedValue({
      data: { session: null },
      error: { code: "user_already_exists", message: "already registered" }
    });
    const { signup } = await import("./actions");

    let redirectUrl = "";
    try {
      await signup(formData({ email: "new@example.com", password: "supersecret", confirmPassword: "supersecret" }));
    } catch (e) {
      redirectUrl = (e as Error).message.replace("REDIRECT:", "");
    }

    expect(decodeURIComponent(redirectUrl)).not.toContain("already registered");
    expect(decodeURIComponent(redirectUrl)).toContain("Ya existe una cuenta");
  });

  it("never surfaces a raw/unmapped Supabase error message, falling back to a generic Spanish message", async () => {
    signUp.mockResolvedValue({
      data: { session: null },
      error: { code: "some_unmapped_code", message: "Some raw provider detail" }
    });
    const { signup } = await import("./actions");

    let redirectUrl = "";
    try {
      await signup(formData({ email: "new@example.com", password: "supersecret", confirmPassword: "supersecret" }));
    } catch (e) {
      redirectUrl = (e as Error).message.replace("REDIRECT:", "");
    }

    expect(decodeURIComponent(redirectUrl)).not.toContain("Some raw provider detail");
    expect(decodeURIComponent(redirectUrl)).toContain("No se pudo crear la cuenta");
  });

  it("rejects mismatched passwords without calling Supabase", async () => {
    const { signup } = await import("./actions");

    let redirectUrl = "";
    try {
      await signup(formData({ email: "new@example.com", password: "supersecret", confirmPassword: "different" }));
    } catch (e) {
      redirectUrl = (e as Error).message.replace("REDIRECT:", "");
    }

    expect(decodeURIComponent(redirectUrl)).toBe("/signup?error=Las contraseñas no coinciden.");
    expect(signUp).not.toHaveBeenCalled();
  });

  it("rejects an invalid email without calling Supabase", async () => {
    const { signup } = await import("./actions");

    await expect(
      signup(formData({ email: "not-an-email", password: "supersecret", confirmPassword: "supersecret" }))
    ).rejects.toThrow(/^REDIRECT:\/signup\?error=/);

    expect(signUp).not.toHaveBeenCalled();
  });
});

describe("signup · affiliate code (AFFILIATES-1)", () => {
  const fields = { email: "new@example.com", password: "supersecret", confirmPassword: "supersecret" };

  it("stores an approved gs_ref code in user_metadata at creation", async () => {
    process.env.AFFILIATE_CODES = "campamentoweb";
    refCookie = "campamentoweb";
    signUp.mockResolvedValue({ data: { session: null }, error: null });
    const { signup } = await import("./actions");

    await expect(signup(formData(fields))).rejects.toThrow(/REDIRECT:\/signup\/confirm/);

    expect(signUp).toHaveBeenCalledWith({
      email: "new@example.com",
      password: "supersecret",
      options: { emailRedirectTo: "http://localhost:3000/auth/callback", data: { referral_code: "campamentoweb" } }
    });
  });

  it("ignores a code that is not approved", async () => {
    process.env.AFFILIATE_CODES = "campamentoweb";
    refCookie = "otro";
    signUp.mockResolvedValue({ data: { session: null }, error: null });
    const { signup } = await import("./actions");

    await expect(signup(formData(fields))).rejects.toThrow(/REDIRECT:\/signup\/confirm/);

    expect(signUp.mock.calls[0][0].options).toEqual({ emailRedirectTo: "http://localhost:3000/auth/callback" });
  });

  it("signs up normally when the cookie store is unavailable", async () => {
    process.env.AFFILIATE_CODES = "campamentoweb";
    refCookie = undefined;
    signUp.mockResolvedValue({ data: { session: null }, error: null });
    const { signup } = await import("./actions");

    await expect(signup(formData(fields))).rejects.toThrow(/REDIRECT:\/signup\/confirm/);
    expect(signUp).toHaveBeenCalledTimes(1);
  });
});
