import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isCompedAccountEmail } from "./comped-accounts";

describe("isCompedAccountEmail", () => {
  const ORIGINAL = process.env.COMPED_ACCOUNT_EMAILS;

  beforeEach(() => {
    process.env.COMPED_ACCOUNT_EMAILS = "founder@example.com, pilot@example.com";
  });

  afterEach(() => {
    process.env.COMPED_ACCOUNT_EMAILS = ORIGINAL;
  });

  it("matches an email in the allow-list", () => {
    expect(isCompedAccountEmail("pilot@example.com")).toBe(true);
  });

  it("is case-insensitive and trims whitespace", () => {
    expect(isCompedAccountEmail("  Pilot@Example.com  ")).toBe(true);
  });

  it("rejects an email not in the allow-list", () => {
    expect(isCompedAccountEmail("customer@example.com")).toBe(false);
  });

  it("rejects null/undefined/empty input", () => {
    expect(isCompedAccountEmail(null)).toBe(false);
    expect(isCompedAccountEmail(undefined)).toBe(false);
    expect(isCompedAccountEmail("")).toBe(false);
  });

  it("fails closed (nobody matches) when the env var is unset", () => {
    delete process.env.COMPED_ACCOUNT_EMAILS;
    expect(isCompedAccountEmail("founder@example.com")).toBe(false);
  });
});
