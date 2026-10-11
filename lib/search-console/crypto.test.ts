import { randomBytes } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  decryptRefreshToken,
  encryptRefreshToken,
  isSearchConsoleCryptoConfigured,
  pkceChallenge,
  signOAuthState,
  verifyOAuthState
} from "./crypto";

const P = "11111111-1111-4111-8111-111111111111";
const U = "22222222-2222-4222-8222-222222222222";
const OTHER = "33333333-3333-4333-8333-333333333333";

describe("search console crypto", () => {
  const original = { ...process.env };
  beforeEach(() => {
    process.env.GSC_TOKEN_ENCRYPTION_KEY = randomBytes(32).toString("base64");
    delete process.env.GSC_TOKEN_ENCRYPTION_KEY_PREVIOUS;
  });
  afterEach(() => {
    process.env = { ...original };
  });

  it("fails closed without a 32-byte key", () => {
    process.env.GSC_TOKEN_ENCRYPTION_KEY = Buffer.from("short").toString("base64");
    expect(isSearchConsoleCryptoConfigured()).toBe(false);
    expect(signOAuthState({ p: P, u: U, n: "x".repeat(20), exp: 1 })).toBeNull();
  });

  it("round-trips a refresh token bound to its project and owner", () => {
    const ct = encryptRefreshToken("1//refresh", P, U);
    expect(ct).toMatch(/^v1:[0-9a-f]{8}:/);
    expect(ct).not.toContain("refresh");
    expect(decryptRefreshToken(ct, P, U)).toEqual({ token: "1//refresh", needsReencrypt: false });
    expect(decryptRefreshToken(ct, OTHER, U)).toBeNull();
    expect(decryptRefreshToken(ct, P, OTHER)).toBeNull();
  });

  it("rejects tampered or truncated ciphertext", () => {
    const ct = encryptRefreshToken("1//refresh", P, U);
    const [v, id, body] = ct.split(":");
    const raw = Buffer.from(body, "base64url");
    raw[raw.length - 1] ^= 1;
    expect(decryptRefreshToken(`${v}:${id}:${raw.toString("base64url")}`, P, U)).toBeNull();
    expect(decryptRefreshToken(`${v}:${id}:${raw.subarray(0, 20).toString("base64url")}`, P, U)).toBeNull();
    expect(decryptRefreshToken("garbage", P, U)).toBeNull();
  });

  it("decrypts with the previous key after a rotation and asks to re-encrypt", () => {
    const ct = encryptRefreshToken("tok", P, U);
    process.env.GSC_TOKEN_ENCRYPTION_KEY_PREVIOUS = process.env.GSC_TOKEN_ENCRYPTION_KEY;
    process.env.GSC_TOKEN_ENCRYPTION_KEY = randomBytes(32).toString("base64");
    expect(decryptRefreshToken(ct, P, U)).toEqual({ token: "tok", needsReencrypt: true });
  });

  it("signs and verifies the OAuth state, rejecting tampering and expiry", () => {
    const state = { p: P, u: U, n: "n".repeat(43), exp: 2_000 };
    const signed = signOAuthState(state)!;
    expect(verifyOAuthState(signed, 1_000)).toEqual(state);
    expect(verifyOAuthState(signed, 3_000)).toBeNull();
    const [payload, sig] = signed.split(".");
    const forged = Buffer.from(JSON.stringify({ ...state, u: OTHER })).toString("base64url");
    expect(verifyOAuthState(`${forged}.${sig}`, 1_000)).toBeNull();
    expect(verifyOAuthState(`${payload}.${sig}.x`, 1_000)).toBeNull();
    expect(verifyOAuthState(42, 1_000)).toBeNull();
  });

  it("computes the RFC 7636 S256 challenge", () => {
    expect(pkceChallenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")).toBe(
      "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"
    );
  });
});
