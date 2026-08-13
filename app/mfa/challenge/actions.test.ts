import { beforeEach, describe, expect, it, vi } from "vitest";

const redirectMock = vi.fn((url: string) => {
  throw new Error(`REDIRECT:${url}`);
});
vi.mock("next/navigation", () => ({ redirect: (url: string) => redirectMock(url) }));

const challengeAndVerify = vi.fn();
const requireOperatorCandidateMock = vi.fn();
vi.mock("@/lib/admin/operator", () => ({
  requireOperatorCandidate: () => requireOperatorCandidateMock()
}));

beforeEach(() => {
  redirectMock.mockClear();
  challengeAndVerify.mockReset();
  requireOperatorCandidateMock.mockReset();
  requireOperatorCandidateMock.mockResolvedValue({
    supabase: { auth: { mfa: { challengeAndVerify } } },
    user: { id: "op-1" }
  });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

function formData(fields: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

describe("verifyChallenge", () => {
  it("redirects to the validated next target on a correct code", async () => {
    challengeAndVerify.mockResolvedValue({ error: null });
    const { verifyChallenge } = await import("./actions");

    await expect(
      verifyChallenge(formData({ factorId: "f1", code: "123456", next: "/admin/users" }))
    ).rejects.toThrow("REDIRECT:/admin/users");
  });

  it("falls back to /admin when next is an off-site URL", async () => {
    challengeAndVerify.mockResolvedValue({ error: null });
    const { verifyChallenge } = await import("./actions");

    await expect(
      verifyChallenge(formData({ factorId: "f1", code: "123456", next: "https://evil.example" }))
    ).rejects.toThrow("REDIRECT:/admin");
  });

  it("redirects back to the challenge screen with an error on a wrong code", async () => {
    challengeAndVerify.mockResolvedValue({ error: { message: "invalid code" } });
    const { verifyChallenge } = await import("./actions");

    await expect(
      verifyChallenge(formData({ factorId: "f1", code: "000000", next: "/admin" }))
    ).rejects.toThrow(/^REDIRECT:\/mfa\/challenge\?next=%2Fadmin&error=/);
  });
});
