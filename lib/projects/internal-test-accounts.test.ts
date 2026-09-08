import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isInternalTestAccountEmail } from "./internal-test-accounts";

describe("isInternalTestAccountEmail", () => {
  const ORIGINAL = process.env.INTERNAL_TEST_ACCOUNT_EMAILS;

  beforeEach(() => {
    process.env.INTERNAL_TEST_ACCOUNT_EMAILS = "founder@example.com, second@example.com";
  });

  afterEach(() => {
    process.env.INTERNAL_TEST_ACCOUNT_EMAILS = ORIGINAL;
  });

  it("matches an email in the allow-list", () => {
    expect(isInternalTestAccountEmail("founder@example.com")).toBe(true);
  });

  it("is case-insensitive and trims whitespace", () => {
    expect(isInternalTestAccountEmail("  Founder@Example.com  ")).toBe(true);
  });

  it("rejects an email not in the allow-list", () => {
    expect(isInternalTestAccountEmail("customer@example.com")).toBe(false);
  });

  it("rejects null/undefined/empty input", () => {
    expect(isInternalTestAccountEmail(null)).toBe(false);
    expect(isInternalTestAccountEmail(undefined)).toBe(false);
    expect(isInternalTestAccountEmail("")).toBe(false);
  });

  it("fails closed (nobody matches) when the env var is unset", () => {
    delete process.env.INTERNAL_TEST_ACCOUNT_EMAILS;
    expect(isInternalTestAccountEmail("founder@example.com")).toBe(false);
  });
});
