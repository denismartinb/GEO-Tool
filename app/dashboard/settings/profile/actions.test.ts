import { beforeEach, describe, expect, it, vi } from "vitest";

// `redirect()` never returns in a real Next.js request — it throws a special
// NEXT_REDIRECT error to unwind the render. The mock reproduces that (throw,
// don't return) so a test can assert both "redirect was reached" and "nothing
// ran after it" the same way production behaves (see app/login/actions.test.ts).
const redirectMock = vi.fn((url: string) => {
  throw new Error(`REDIRECT:${url}`);
});
vi.mock("next/navigation", () => ({
  redirect: (url: string) => redirectMock(url)
}));

const requireUser = vi.fn();
vi.mock("@/lib/auth", () => ({ requireUser: (...args: unknown[]) => requireUser(...args) }));

const createServiceClient = vi.fn();
vi.mock("@/lib/supabase/service", () => ({ createServiceClient: (...args: unknown[]) => createServiceClient(...args) }));

const getStripeClient = vi.fn();
vi.mock("@/lib/stripe", () => ({ getStripeClient: (...args: unknown[]) => getStripeClient(...args) }));

const sendAccountDeletedEmail = vi.fn();
vi.mock("@/lib/email/transactional", () => ({
  sendAccountDeletedEmail: (...args: unknown[]) => sendAccountDeletedEmail(...args)
}));

const USER_ID = "user-1";
const USER_EMAIL = "founder@example.com";

type Row = Record<string, unknown>;

/** Minimal fake covering exactly the query shapes deleteAccount issues against `profiles`/`projects`. */
function fakeSupabase({
  profile,
  deleteProjectsError,
  deleteProjectsCount = 0,
  signOut = vi.fn().mockResolvedValue({ error: null })
}: {
  profile: Row | null;
  deleteProjectsError?: string;
  deleteProjectsCount?: number;
  signOut?: ReturnType<typeof vi.fn>;
}) {
  return {
    auth: { signOut },
    from(table: string) {
      if (table === "profiles") {
        return {
          select() {
            return { eq: () => ({ maybeSingle: () => Promise.resolve({ data: profile, error: null }) }) };
          }
        };
      }
      if (table === "projects") {
        return {
          delete() {
            return {
              eq: () =>
                Promise.resolve({
                  error: deleteProjectsError ? { message: deleteProjectsError } : null,
                  count: deleteProjectsCount
                })
            };
          }
        };
      }
      throw new Error(`unexpected table ${table}`);
    }
  };
}

function fakeServiceClient({ deleteUserError }: { deleteUserError?: string } = {}) {
  return {
    auth: {
      admin: {
        deleteUser: vi.fn().mockResolvedValue({
          data: {},
          error: deleteUserError ? { message: deleteUserError } : null
        })
      }
    }
  };
}

beforeEach(() => {
  redirectMock.mockClear();
  requireUser.mockReset();
  createServiceClient.mockReset();
  getStripeClient.mockReset();
  sendAccountDeletedEmail.mockReset();
});

describe("deleteAccount", () => {
  it("rejects when the confirmation email does not match the account email, and deletes nothing", async () => {
    const supabase = fakeSupabase({ profile: { stripe_subscription_id: null } });
    requireUser.mockResolvedValue({ supabase, user: { id: USER_ID, email: USER_EMAIL } });
    const { deleteAccount } = await import("./actions");

    const result = await deleteAccount("wrong@example.com");

    expect(result).toEqual({ success: false, error: "El email no coincide." });
    expect(createServiceClient).not.toHaveBeenCalled();
    expect(redirectMock).not.toHaveBeenCalled();
    expect(sendAccountDeletedEmail).not.toHaveBeenCalled();
  });

  it("accepts a case-insensitive match of the confirmation email", async () => {
    const supabase = fakeSupabase({ profile: { stripe_subscription_id: null } });
    requireUser.mockResolvedValue({ supabase, user: { id: USER_ID, email: USER_EMAIL } });
    createServiceClient.mockReturnValue(fakeServiceClient());
    const { deleteAccount } = await import("./actions");

    await expect(deleteAccount(USER_EMAIL.toUpperCase())).rejects.toThrow(/^REDIRECT:\/login\?deleted=1$/);
    expect(sendAccountDeletedEmail).toHaveBeenCalledWith(USER_EMAIL);
  });

  it("treats an already-cancelled Stripe subscription (resource_missing) as success and continues", async () => {
    const cancel = vi.fn().mockRejectedValue(Object.assign(new Error("No such subscription"), { code: "resource_missing" }));
    getStripeClient.mockReturnValue({ subscriptions: { cancel } });
    const supabase = fakeSupabase({ profile: { stripe_subscription_id: "sub_gone" } });
    requireUser.mockResolvedValue({ supabase, user: { id: USER_ID, email: USER_EMAIL } });
    createServiceClient.mockReturnValue(fakeServiceClient());
    const { deleteAccount } = await import("./actions");

    await expect(deleteAccount(USER_EMAIL)).rejects.toThrow(/^REDIRECT:\/login\?deleted=1$/);
    expect(cancel).toHaveBeenCalledWith("sub_gone");
  });

  it("aborts without deleting anything when Stripe fails for a real reason", async () => {
    const cancel = vi.fn().mockRejectedValue(new Error("stripe api down"));
    getStripeClient.mockReturnValue({ subscriptions: { cancel } });
    const supabase = fakeSupabase({ profile: { stripe_subscription_id: "sub_123" } });
    requireUser.mockResolvedValue({ supabase, user: { id: USER_ID, email: USER_EMAIL } });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { deleteAccount } = await import("./actions");

    const result = await deleteAccount(USER_EMAIL);

    expect(result).toEqual({ success: false, error: "No se pudo cancelar tu suscripción activa. Inténtalo de nuevo." });
    expect(createServiceClient).not.toHaveBeenCalled();
    expect(redirectMock).not.toHaveBeenCalled();
    expect(sendAccountDeletedEmail).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("treats zero projects deleted (no domains, or a retry) as success, not an error", async () => {
    const supabase = fakeSupabase({ profile: { stripe_subscription_id: null }, deleteProjectsCount: 0 });
    requireUser.mockResolvedValue({ supabase, user: { id: USER_ID, email: USER_EMAIL } });
    createServiceClient.mockReturnValue(fakeServiceClient());
    const { deleteAccount } = await import("./actions");

    await expect(deleteAccount(USER_EMAIL)).rejects.toThrow(/^REDIRECT:\/login\?deleted=1$/);
    expect(sendAccountDeletedEmail).toHaveBeenCalledWith(USER_EMAIL);
  });

  it("fails with a sanitized message when deleting the auth user fails, without crashing", async () => {
    const supabase = fakeSupabase({ profile: { stripe_subscription_id: null } });
    requireUser.mockResolvedValue({ supabase, user: { id: USER_ID, email: USER_EMAIL } });
    createServiceClient.mockReturnValue(fakeServiceClient({ deleteUserError: "some raw postgres/auth admin detail" }));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { deleteAccount } = await import("./actions");

    const result = await deleteAccount(USER_EMAIL);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).not.toContain("postgres");
      expect(result.error).toBe("No se pudo eliminar la cuenta. Inténtalo de nuevo.");
    }
    expect(redirectMock).not.toHaveBeenCalled();
    expect(sendAccountDeletedEmail).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("deletes projects, deletes the auth user, sends the confirmation email, signs out and redirects to /login?deleted=1 on success", async () => {
    const signOut = vi.fn().mockResolvedValue({ error: null });
    const supabase = fakeSupabase({ profile: { stripe_subscription_id: null }, deleteProjectsCount: 3, signOut });
    requireUser.mockResolvedValue({ supabase, user: { id: USER_ID, email: USER_EMAIL } });
    const serviceClient = fakeServiceClient();
    createServiceClient.mockReturnValue(serviceClient);
    const { deleteAccount } = await import("./actions");

    await expect(deleteAccount(USER_EMAIL)).rejects.toThrow(/^REDIRECT:\/login\?deleted=1$/);

    expect(serviceClient.auth.admin.deleteUser).toHaveBeenCalledWith(USER_ID);
    expect(sendAccountDeletedEmail).toHaveBeenCalledWith(USER_EMAIL);
    expect(signOut).toHaveBeenCalled();
  });

  it("fails gracefully instead of crashing when the service client is unavailable", async () => {
    const supabase = fakeSupabase({ profile: { stripe_subscription_id: null } });
    requireUser.mockResolvedValue({ supabase, user: { id: USER_ID, email: USER_EMAIL } });
    createServiceClient.mockImplementation(() => {
      throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
    });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { deleteAccount } = await import("./actions");

    const result = await deleteAccount(USER_EMAIL);

    expect(result).toEqual({ success: false, error: "No se pudo eliminar la cuenta. Inténtalo de nuevo." });
    expect(redirectMock).not.toHaveBeenCalled();
    expect(sendAccountDeletedEmail).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("rejects an empty confirmation input without touching requireUser", async () => {
    const { deleteAccount } = await import("./actions");

    const result = await deleteAccount("");

    expect(result).toEqual({ success: false, error: "Introduce tu email para confirmar." });
    expect(requireUser).not.toHaveBeenCalled();
  });
});
