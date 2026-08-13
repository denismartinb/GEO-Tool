import { beforeEach, describe, expect, it, vi } from "vitest";

const redirectMock = vi.fn((url: string) => {
  throw new Error(`REDIRECT:${url}`);
});
vi.mock("next/navigation", () => ({ redirect: (url: string) => redirectMock(url) }));

const challengeAndVerify = vi.fn();
const unenroll = vi.fn();
const requireOperatorCandidateMock = vi.fn();
vi.mock("@/lib/admin/operator", () => ({
  requireOperatorCandidate: () => requireOperatorCandidateMock()
}));

beforeEach(() => {
  redirectMock.mockClear();
  challengeAndVerify.mockReset();
  unenroll.mockReset();
  requireOperatorCandidateMock.mockReset();
  requireOperatorCandidateMock.mockResolvedValue({
    supabase: { auth: { mfa: { challengeAndVerify, unenroll } } },
    user: { id: "op-1" }
  });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

function formData(fields: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

describe("verifyEnrollment", () => {
  it("elevates to aal2 and redirects to /admin on a correct code", async () => {
    challengeAndVerify.mockResolvedValue({ error: null });
    const { verifyEnrollment } = await import("./actions");

    await expect(verifyEnrollment(formData({ factorId: "f1", code: "123456" }))).rejects.toThrow(
      "REDIRECT:/admin"
    );

    expect(challengeAndVerify).toHaveBeenCalledWith({ factorId: "f1", code: "123456" });
  });

  it("redirects back with an error on a wrong code, without discarding the factor", async () => {
    challengeAndVerify.mockResolvedValue({ error: { message: "invalid code" } });
    const { verifyEnrollment } = await import("./actions");

    await expect(verifyEnrollment(formData({ factorId: "f1", code: "000000" }))).rejects.toThrow(
      /^REDIRECT:\/mfa\/enroll\?error=/
    );

    expect(unenroll).not.toHaveBeenCalled();
  });

  it("redirects back with an error when the code is missing", async () => {
    const { verifyEnrollment } = await import("./actions");

    await expect(verifyEnrollment(formData({ factorId: "f1" }))).rejects.toThrow(
      /^REDIRECT:\/mfa\/enroll\?error=/
    );
    expect(challengeAndVerify).not.toHaveBeenCalled();
  });
});

describe("regenerateEnrollment", () => {
  it("unenrolls the pending factor and redirects back to a clean /mfa/enroll", async () => {
    unenroll.mockResolvedValue({ error: null });
    const { regenerateEnrollment } = await import("./actions");

    await expect(regenerateEnrollment(formData({ factorId: "f1" }))).rejects.toThrow("REDIRECT:/mfa/enroll");

    expect(unenroll).toHaveBeenCalledWith({ factorId: "f1" });
  });

  it("still redirects to /mfa/enroll even if unenroll fails", async () => {
    unenroll.mockResolvedValue({ error: { message: "boom" } });
    const { regenerateEnrollment } = await import("./actions");

    await expect(regenerateEnrollment(formData({ factorId: "f1" }))).rejects.toThrow("REDIRECT:/mfa/enroll");
  });
});
