import { beforeEach, describe, expect, it, vi } from "vitest";

const requireUser = vi.fn();
vi.mock("@/lib/auth", () => ({ requireUser: (...args: unknown[]) => requireUser(...args) }));

const syncBillingDetailsToStripeCustomer = vi.fn();
vi.mock("@/lib/stripe", () => ({
  syncBillingDetailsToStripeCustomer: (...args: unknown[]) => syncBillingDetailsToStripeCustomer(...args)
}));

import { saveAccount } from "./actions";

const USER = { id: "user-1" };

function fakeSupabase({
  updateUser = vi.fn().mockResolvedValue({ error: null }),
  stripeCustomerId = null
}: {
  updateUser?: ReturnType<typeof vi.fn>;
  stripeCustomerId?: string | null;
} = {}) {
  const maybeSingle = vi.fn().mockResolvedValue({ data: { stripe_customer_id: stripeCustomerId } });
  const eq = vi.fn().mockReturnValue({ maybeSingle });
  const select = vi.fn().mockReturnValue({ eq });
  const from = vi.fn().mockReturnValue({ select });
  return { auth: { updateUser }, from };
}

const VALID = {
  firstName: "Denis",
  lastName: "Martín",
  companyName: "Xataka",
  companyWebsite: "xataka.com",
  companySector: "Medios",
  legalName: "Xataka Media S.L.",
  taxId: "B-84920011"
};

beforeEach(() => {
  vi.clearAllMocks();
  syncBillingDetailsToStripeCustomer.mockResolvedValue(undefined);
});

/**
 * CONSOLE-REDESIGN-1. One save for the whole account card.
 *
 * The three-buttons arrangement it replaces was a defect: the folds each had
 * their own «Guardar», so typing in «Datos de empresa» and pressing the card's
 * button silently discarded the edit. These tests exist so nobody splits it
 * back apart without noticing what that costs.
 */
describe("saveAccount", () => {
  it("persists name, company and billing in a single write", async () => {
    const updateUser = vi.fn().mockResolvedValue({ error: null });
    requireUser.mockResolvedValue({ supabase: fakeSupabase({ updateUser }), user: USER });

    const result = await saveAccount(VALID);

    expect(result).toEqual({ success: true });
    expect(updateUser).toHaveBeenCalledTimes(1);
    expect(updateUser).toHaveBeenCalledWith({
      data: {
        first_name: "Denis",
        last_name: "Martín",
        org_name: "Xataka",
        org_website: "xataka.com",
        org_sector: "Medios",
        org_legal_name: "Xataka Media S.L.",
        org_tax_id: "B-84920011"
      }
    });
  });

  it("never writes or deletes the legacy org_tax_info key", async () => {
    const updateUser = vi.fn().mockResolvedValue({ error: null });
    requireUser.mockResolvedValue({ supabase: fakeSupabase({ updateUser }), user: USER });

    await saveAccount(VALID);

    // It stays as the fallback source for Razón social until the owner saves,
    // and deleting it would throw away the only copy.
    expect(Object.keys(updateUser.mock.calls[0][0].data)).not.toContain("org_tax_info");
  });

  it("trims every field before persisting it", async () => {
    const updateUser = vi.fn().mockResolvedValue({ error: null });
    requireUser.mockResolvedValue({ supabase: fakeSupabase({ updateUser }), user: USER });

    await saveAccount({ ...VALID, firstName: "  Denis  ", legalName: "  Xataka Media S.L.  " });

    expect(updateUser.mock.calls[0][0].data.first_name).toBe("Denis");
    expect(updateUser.mock.calls[0][0].data.org_legal_name).toBe("Xataka Media S.L.");
  });

  it("accepts an account that has filled in nothing optional", async () => {
    const updateUser = vi.fn().mockResolvedValue({ error: null });
    requireUser.mockResolvedValue({ supabase: fakeSupabase({ updateUser }), user: USER });

    const result = await saveAccount({
      firstName: "Denis",
      lastName: "",
      companyName: "",
      companyWebsite: "",
      companySector: "",
      legalName: "",
      taxId: ""
    });

    expect(result).toEqual({ success: true });
  });

  it("requires a first name", async () => {
    requireUser.mockResolvedValue({ supabase: fakeSupabase(), user: USER });

    const result = await saveAccount({ ...VALID, firstName: "   " });

    expect(result).toEqual({ success: false, error: "Introduce un nombre válido." });
  });

  it("names the offending field when one is too long", async () => {
    requireUser.mockResolvedValue({ supabase: fakeSupabase(), user: USER });

    expect(await saveAccount({ ...VALID, legalName: "x".repeat(161) })).toEqual({
      success: false,
      error: "La razón social es demasiado larga."
    });
    expect(await saveAccount({ ...VALID, companyWebsite: "x".repeat(161) })).toEqual({
      success: false,
      error: "El sitio web es demasiado largo."
    });
  });

  it("rejects before touching the database when input is invalid", async () => {
    const updateUser = vi.fn().mockResolvedValue({ error: null });
    requireUser.mockResolvedValue({ supabase: fakeSupabase({ updateUser }), user: USER });

    await saveAccount({ ...VALID, taxId: "x".repeat(161) });

    expect(updateUser).not.toHaveBeenCalled();
  });

  it("reports a save failure without leaking the provider's message", async () => {
    const updateUser = vi.fn().mockResolvedValue({ error: { message: "PGRST-whatever from upstream" } });
    requireUser.mockResolvedValue({ supabase: fakeSupabase({ updateUser }), user: USER });

    const result = await saveAccount(VALID);

    expect(result).toEqual({
      success: false,
      error: "No se pudieron guardar los cambios. Inténtalo de nuevo."
    });
  });

  /**
   * BILLING-INVOICE-FIELDS-1: razón social/NIF also reach the account's
   * Stripe customer, but only the Supabase write decides what "saved" means.
   */
  describe("Stripe invoice fields sync", () => {
    it("pushes razón social and NIF to Stripe when the account has a customer", async () => {
      requireUser.mockResolvedValue({
        supabase: fakeSupabase({ stripeCustomerId: "cus_123" }),
        user: USER
      });

      await saveAccount(VALID);

      expect(syncBillingDetailsToStripeCustomer).toHaveBeenCalledWith("cus_123", {
        legalName: "Xataka Media S.L.",
        taxId: "B-84920011"
      });
    });

    it("does not attempt a Stripe sync for an account with no customer yet", async () => {
      requireUser.mockResolvedValue({
        supabase: fakeSupabase({ stripeCustomerId: null }),
        user: USER
      });

      const result = await saveAccount(VALID);

      expect(result).toEqual({ success: true });
      expect(syncBillingDetailsToStripeCustomer).not.toHaveBeenCalled();
    });

    it("still reports success even if the Stripe sync unexpectedly throws", async () => {
      syncBillingDetailsToStripeCustomer.mockRejectedValue(new Error("stripe unreachable"));
      requireUser.mockResolvedValue({
        supabase: fakeSupabase({ stripeCustomerId: "cus_123" }),
        user: USER
      });
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      const result = await saveAccount(VALID);

      expect(result).toEqual({ success: true });
      errorSpy.mockRestore();
    });
  });
});
