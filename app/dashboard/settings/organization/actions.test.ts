import { beforeEach, describe, expect, it, vi } from "vitest";

const requireUser = vi.fn();
vi.mock("@/lib/auth", () => ({ requireUser: (...args: unknown[]) => requireUser(...args) }));

import { updateBillingDetails, updateOrganization } from "./actions";

function fakeSupabase(updateUser = vi.fn().mockResolvedValue({ error: null })) {
  return { auth: { updateUser } };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("updateBillingDetails", () => {
  it("writes both new keys and never touches the legacy one", async () => {
    const updateUser = vi.fn().mockResolvedValue({ error: null });
    requireUser.mockResolvedValue({ supabase: fakeSupabase(updateUser) });

    const result = await updateBillingDetails("  Xataka Media S.L. ", "B-84920011");

    expect(result).toEqual({ success: true });
    expect(updateUser).toHaveBeenCalledWith({
      data: { org_legal_name: "Xataka Media S.L.", org_tax_id: "B-84920011" }
    });
    // Deleting it would throw away the only copy for an account that saves an
    // empty form by accident.
    expect(Object.keys(updateUser.mock.calls[0][0].data)).not.toContain("org_tax_info");
  });

  it("rejects an over-long value with a self-authored message", async () => {
    requireUser.mockResolvedValue({ supabase: fakeSupabase() });

    const result = await updateBillingDetails("x".repeat(161), "");

    expect(result).toEqual({ success: false, error: "La razón social es demasiado larga." });
  });

  it("reports a save failure without leaking the provider's message", async () => {
    const updateUser = vi.fn().mockResolvedValue({ error: { message: "PGRST-whatever from upstream" } });
    requireUser.mockResolvedValue({ supabase: fakeSupabase(updateUser) });

    const result = await updateBillingDetails("Xataka Media S.L.", "B-84920011");

    expect(result.success).toBe(false);
    expect(result).toEqual({
      success: false,
      error: "No se pudieron guardar los datos de facturación. Inténtalo de nuevo."
    });
  });
});

describe("updateOrganization", () => {
  it("saves the three declarative fields and no longer writes org_tax_info", async () => {
    const updateUser = vi.fn().mockResolvedValue({ error: null });
    requireUser.mockResolvedValue({ supabase: fakeSupabase(updateUser) });

    const result = await updateOrganization("Xataka", "xataka.com", "Medios");

    expect(result).toEqual({ success: true });
    expect(updateUser).toHaveBeenCalledWith({
      data: { org_name: "Xataka", org_website: "xataka.com", org_sector: "Medios" }
    });
  });

  it("requires a name", async () => {
    requireUser.mockResolvedValue({ supabase: fakeSupabase() });

    const result = await updateOrganization("   ", "", "");

    expect(result).toEqual({ success: false, error: "Introduce un nombre de empresa válido." });
  });
});
