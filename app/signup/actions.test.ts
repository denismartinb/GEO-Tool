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
});

function formData(fields: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

describe("signup", () => {
  it("sends a welcome email and redirects to the dashboard on success", async () => {
    signUp.mockResolvedValue({ error: null });
    const { signup } = await import("./actions");

    await expect(
      signup(formData({ email: "new@example.com", password: "supersecret" }))
    ).rejects.toThrow("REDIRECT:/dashboard");

    expect(sendWelcomeEmail).toHaveBeenCalledWith("new@example.com");
  });

  it("does not send a welcome email when signup fails", async () => {
    signUp.mockResolvedValue({ error: { message: "already registered" } });
    const { signup } = await import("./actions");

    await expect(
      signup(formData({ email: "new@example.com", password: "supersecret" }))
    ).rejects.toThrow(/^REDIRECT:\/signup\?error=/);

    expect(sendWelcomeEmail).not.toHaveBeenCalled();
  });
});
