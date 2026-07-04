import { describe, expect, it } from "vitest";
import { isProOrAbove } from "./billing";

describe("isProOrAbove", () => {
  it("allows pro and agency", () => {
    expect(isProOrAbove("pro")).toBe(true);
    expect(isProOrAbove("agency")).toBe(true);
  });

  it("denies free and starter", () => {
    expect(isProOrAbove("free")).toBe(false);
    expect(isProOrAbove("starter")).toBe(false);
  });

  it("fails closed on a missing/unrecognized value instead of defaulting to allowed", () => {
    expect(isProOrAbove(null)).toBe(false);
    expect(isProOrAbove(undefined)).toBe(false);
    expect(isProOrAbove("")).toBe(false);
    expect(isProOrAbove("not-a-real-plan")).toBe(false);
  });
});
