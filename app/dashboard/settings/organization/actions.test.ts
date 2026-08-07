import { beforeEach, describe, expect, it, vi } from "vitest";

const requireUser = vi.fn();
vi.mock("@/lib/auth", () => ({ requireUser: (...args: unknown[]) => requireUser(...args) }));

import { saveAccount } from "./actions";

function fakeSupabase(updateUser = vi.fn().mockResolvedValue({ error: null })) {
  return { auth: { updateUser } };
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
    requireUser.mockResolvedValue({ supabase: fakeSupabase(updateUser) });

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
    requireUser.mockResolvedValue({ supabase: fakeSupabase(updateUser) });

    await saveAccount(VALID);

    // It stays as the fallback source for Razón social until the owner saves,
    // and deleting it would throw away the only copy.
    expect(Object.keys(updateUser.mock.calls[0][0].data)).not.toContain("org_tax_info");
  });

  it("trims every field before persisting it", async () => {
    const updateUser = vi.fn().mockResolvedValue({ error: null });
    requireUser.mockResolvedValue({ supabase: fakeSupabase(updateUser) });

    await saveAccount({ ...VALID, firstName: "  Denis  ", legalName: "  Xataka Media S.L.  " });

    expect(updateUser.mock.calls[0][0].data.first_name).toBe("Denis");
    expect(updateUser.mock.calls[0][0].data.org_legal_name).toBe("Xataka Media S.L.");
  });

  it("accepts an account that has filled in nothing optional", async () => {
    const updateUser = vi.fn().mockResolvedValue({ error: null });
    requireUser.mockResolvedValue({ supabase: fakeSupabase(updateUser) });

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
    requireUser.mockResolvedValue({ supabase: fakeSupabase() });

    const result = await saveAccount({ ...VALID, firstName: "   " });

    expect(result).toEqual({ success: false, error: "Introduce un nombre válido." });
  });

  it("names the offending field when one is too long", async () => {
    requireUser.mockResolvedValue({ supabase: fakeSupabase() });

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
    requireUser.mockResolvedValue({ supabase: fakeSupabase(updateUser) });

    await saveAccount({ ...VALID, taxId: "x".repeat(161) });

    expect(updateUser).not.toHaveBeenCalled();
  });

  it("reports a save failure without leaking the provider's message", async () => {
    const updateUser = vi.fn().mockResolvedValue({ error: { message: "PGRST-whatever from upstream" } });
    requireUser.mockResolvedValue({ supabase: fakeSupabase(updateUser) });

    const result = await saveAccount(VALID);

    expect(result).toEqual({
      success: false,
      error: "No se pudieron guardar los cambios. Inténtalo de nuevo."
    });
  });
});
