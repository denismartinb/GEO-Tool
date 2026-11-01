import { describe, expect, it } from "vitest";
import { EMAIL_KINDS, emailKindTags, isEmailKind, isOperatorEmailKind } from "./kinds";

describe("email kinds (MAIL-METRICS-1, log §419)", () => {
  it("only uses characters Resend accepts in a tag value, and none twice", () => {
    for (const kind of EMAIL_KINDS) expect(kind).toMatch(/^[a-z0-9_-]{1,64}$/);
    expect(new Set(EMAIL_KINDS).size).toBe(EMAIL_KINDS.length);
  });

  it("knows its own kinds and nothing else", () => {
    expect(isEmailKind("weekly_digest")).toBe(true);
    expect(isEmailKind("ops_watchdog")).toBe(true);
    expect(isEmailKind("Weekly_Digest")).toBe(false);
    expect(isEmailKind(undefined)).toBe(false);
    expect(isEmailKind("anything")).toBe(false);
  });

  it("marks operator emails by prefix", () => {
    expect(isOperatorEmailKind("ops_new_signup")).toBe(true);
    expect(isOperatorEmailKind("welcome")).toBe(false);
  });

  it("builds the tag Resend receives", () => {
    expect(emailKindTags("feature_gsc")).toEqual([{ name: "kind", value: "feature_gsc" }]);
  });
});
