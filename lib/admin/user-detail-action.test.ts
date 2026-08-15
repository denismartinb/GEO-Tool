import { describe, expect, it, vi } from "vitest";

const requireOperatorMock = vi.fn();
vi.mock("@/lib/admin/operator", () => ({
  requireOperator: (...args: unknown[]) => requireOperatorMock(...args)
}));

const getOperatorUserDetailMock = vi.fn();
vi.mock("@/lib/admin/users", () => ({
  getOperatorUserDetail: (...args: unknown[]) => getOperatorUserDetailMock(...args)
}));

describe("fetchOperatorUserDetail", () => {
  it("gates through requireOperator before reading, same as every other /admin action", async () => {
    const service = { marker: "fake-service" };
    requireOperatorMock.mockResolvedValue({ user: { id: "op" }, service });
    getOperatorUserDetailMock.mockResolvedValue({ id: "u1", email: "user@example.com" });
    const { fetchOperatorUserDetail } = await import("./user-detail-action");

    const detail = await fetchOperatorUserDetail("u1");

    expect(requireOperatorMock).toHaveBeenCalledWith("/admin/users");
    expect(getOperatorUserDetailMock).toHaveBeenCalledWith(service, "u1");
    expect(detail).toEqual({ id: "u1", email: "user@example.com" });
  });

  it("propagates the null case (account no longer exists) without inventing a result", async () => {
    requireOperatorMock.mockResolvedValue({ user: { id: "op" }, service: {} });
    getOperatorUserDetailMock.mockResolvedValue(null);
    const { fetchOperatorUserDetail } = await import("./user-detail-action");

    await expect(fetchOperatorUserDetail("gone")).resolves.toBeNull();
  });
});
