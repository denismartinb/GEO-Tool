import { beforeEach, describe, expect, it, vi } from "vitest";

const redirectMock = vi.fn((url: string) => {
  throw new Error(`REDIRECT:${url}`);
});
const notFoundMock = vi.fn(() => {
  throw new Error("NOT_FOUND");
});
vi.mock("next/navigation", () => ({
  redirect: (url: string) => redirectMock(url),
  notFound: () => notFoundMock()
}));

const requireUserMock = vi.fn();
vi.mock("@/lib/auth", () => ({
  requireUser: () => requireUserMock()
}));

const createServiceClientMock = vi.fn(() => ({ __service: true }));
vi.mock("@/lib/supabase/service", () => ({
  createServiceClient: () => createServiceClientMock()
}));

import { isOperatorUserId, requireOperator, requireOperatorCandidate } from "./operator";

const OPERATOR_ID = "7f2a9c14-3e88-4d51-9a02-6c7f1d4ab8e1";
const OTHER_ID = "c1d0be47-1111-2222-3333-4444555566aa";

function supabaseWith(aalLevel: string | null, totpFactors: Array<{ status: string }> = []) {
  return {
    auth: {
      mfa: {
        getAuthenticatorAssuranceLevel: async () => ({ data: aalLevel ? { currentLevel: aalLevel } : null, error: null }),
        listFactors: async () => ({ data: { totp: totpFactors }, error: null })
      }
    }
  };
}

describe("isOperatorUserId", () => {
  beforeEach(() => {
    process.env.ADMIN_USER_IDS = `${OPERATOR_ID}, ${OPERATOR_ID.toUpperCase()}-unused`;
  });

  it("matches a UUID in the allow-list", () => {
    expect(isOperatorUserId(OPERATOR_ID)).toBe(true);
  });

  it("matches case-insensitively", () => {
    expect(isOperatorUserId(OPERATOR_ID.toUpperCase())).toBe(true);
  });

  it("rejects a UUID not on the allow-list", () => {
    expect(isOperatorUserId(OTHER_ID)).toBe(false);
  });

  it("rejects everything when the env var is unset", () => {
    delete process.env.ADMIN_USER_IDS;
    expect(isOperatorUserId(OPERATOR_ID)).toBe(false);
  });
});

describe("requireOperatorCandidate", () => {
  beforeEach(() => {
    process.env.ADMIN_USER_IDS = OPERATOR_ID;
    requireUserMock.mockReset();
    notFoundMock.mockClear();
  });

  it("returns the session for an allow-listed user", async () => {
    const supabase = supabaseWith("aal1");
    requireUserMock.mockResolvedValue({ supabase, user: { id: OPERATOR_ID } });

    const result = await requireOperatorCandidate();

    expect(result.user.id).toBe(OPERATOR_ID);
  });

  it("404s a signed-in user who is not on the allow-list — never a redirect that reveals the route", async () => {
    requireUserMock.mockResolvedValue({ supabase: supabaseWith("aal1"), user: { id: OTHER_ID } });

    await expect(requireOperatorCandidate()).rejects.toThrow("NOT_FOUND");
    expect(redirectMock).not.toHaveBeenCalled();
  });
});

describe("requireOperator", () => {
  beforeEach(() => {
    process.env.ADMIN_USER_IDS = OPERATOR_ID;
    requireUserMock.mockReset();
    redirectMock.mockClear();
    createServiceClientMock.mockClear();
  });

  it("returns a service client when the session is already aal2", async () => {
    requireUserMock.mockResolvedValue({ supabase: supabaseWith("aal2"), user: { id: OPERATOR_ID } });

    const operator = await requireOperator();

    expect(operator.user.id).toBe(OPERATOR_ID);
    expect(createServiceClientMock).toHaveBeenCalled();
  });

  it("sends an operator with no verified TOTP factor to enroll", async () => {
    requireUserMock.mockResolvedValue({ supabase: supabaseWith("aal1", []), user: { id: OPERATOR_ID } });

    await expect(requireOperator()).rejects.toThrow("REDIRECT:/mfa/enroll");
  });

  it("sends an operator with a verified factor but no aal2 session to the code challenge, preserving next", async () => {
    requireUserMock.mockResolvedValue({
      supabase: supabaseWith("aal1", [{ status: "verified" }]),
      user: { id: OPERATOR_ID }
    });

    await expect(requireOperator("/admin/users")).rejects.toThrow(
      "REDIRECT:/mfa/challenge?next=%2Fadmin%2Fusers"
    );
  });

  it("404s a non-operator before ever looking at their MFA state", async () => {
    requireUserMock.mockResolvedValue({ supabase: supabaseWith("aal2"), user: { id: OTHER_ID } });

    await expect(requireOperator()).rejects.toThrow("NOT_FOUND");
  });
});
