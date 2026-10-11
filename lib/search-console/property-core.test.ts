import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { conn, google } = vi.hoisted(() => ({
  conn: { readConnection: vi.fn(), readTokenCiphertext: vi.fn(), saveProperty: vi.fn(), deleteConnection: vi.fn() },
  google: { listSites: vi.fn(), refreshAccessToken: vi.fn(), revokeToken: vi.fn() }
}));
vi.mock("@/lib/search-console/connection", () => conn);
vi.mock("@/lib/search-console/crypto", () => ({
  decryptRefreshToken: (ct: string) => (ct === "good" ? { token: "rt", needsReencrypt: false } : null)
}));
vi.mock("@/lib/search-console/google", async () => {
  const { GscError } = await vi.importActual<typeof import("@/lib/search-console/google")>("@/lib/search-console/google");
  return { GscError, ...google };
});

import { disconnectCore, selectPropertyCore } from "./property-core";

const ids = { projectId: "p", ownerUserId: "u" };

describe("selectPropertyCore", () => {
  beforeEach(() => {
    conn.readConnection.mockReset().mockResolvedValue({ kind: "connected", connection: { status: "active" } });
    conn.readTokenCiphertext.mockReset().mockResolvedValue("good");
    conn.saveProperty.mockReset().mockResolvedValue(true);
    google.refreshAccessToken.mockReset().mockResolvedValue({ accessToken: "at" });
    google.listSites.mockReset().mockResolvedValue([{ siteUrl: "sc-domain:ikea.es", permissionLevel: "siteOwner" }]);
  });

  it("saves a property that is live in the account and covers the domain", async () => {
    expect(await selectPropertyCore(ids, "ikea.es", "sc-domain:ikea.es")).toEqual({ ok: true });
    expect(conn.saveProperty).toHaveBeenCalledWith(ids, "sc-domain:ikea.es");
  });

  it("refuses another site before calling Google", async () => {
    expect(await selectPropertyCore(ids, "ikea.es", "sc-domain:other.com")).toEqual({ ok: false, error: "domain_mismatch" });
    expect(google.refreshAccessToken).not.toHaveBeenCalled();
  });

  it("refuses a property the account does not list", async () => {
    expect(await selectPropertyCore(ids, "ikea.es", "https://www.ikea.es/")).toEqual({ ok: false, error: "not_listed" });
    expect(conn.saveProperty).not.toHaveBeenCalled();
  });
});

describe("disconnectCore", () => {
  beforeEach(() => {
    conn.readTokenCiphertext.mockReset().mockResolvedValue("good");
    conn.deleteConnection.mockReset().mockResolvedValue(true);
    google.revokeToken.mockReset().mockResolvedValue(false);
  });

  it("revokes and deletes, even when Google's revoke fails", async () => {
    expect(await disconnectCore(ids)).toEqual({ ok: true });
    expect(google.revokeToken).toHaveBeenCalledWith("rt");
    expect(conn.deleteConnection).toHaveBeenCalledWith(ids);
  });

  it("reports failure only when the delete did not persist", async () => {
    conn.deleteConnection.mockResolvedValue(false);
    expect(await disconnectCore(ids)).toEqual({ ok: false, error: "delete_failed" });
  });
});
