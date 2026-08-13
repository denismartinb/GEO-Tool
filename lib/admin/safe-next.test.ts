import { describe, expect, it } from "vitest";
import { safeAdminNext } from "./safe-next";

/**
 * The assertion that matters is not "the function returned /admin" but "the
 * value it returned cannot leave this origin". Resolving the result the way a
 * browser would is what actually proves that, and it is what the original
 * prefix-based implementation passed while still being exploitable.
 */
function hostAfterRedirect(value: string): string {
  return new URL(safeAdminNext(value), "https://app.genscore.es/mfa/challenge").host;
}

describe("safeAdminNext", () => {
  it("passes through a same-origin absolute path", () => {
    expect(safeAdminNext("/admin/users")).toBe("/admin/users");
  });

  it("preserves query string and fragment on an allowed path", () => {
    expect(safeAdminNext("/admin/users?status=trial#top")).toBe("/admin/users?status=trial#top");
  });

  it("falls back to /admin when empty or missing", () => {
    expect(safeAdminNext(null)).toBe("/admin");
    expect(safeAdminNext(undefined)).toBe("/admin");
    expect(safeAdminNext("")).toBe("/admin");
  });

  it("rejects an absolute URL to another host", () => {
    expect(safeAdminNext("https://evil.example/phish")).toBe("/admin");
  });

  it("rejects a protocol-relative URL", () => {
    expect(safeAdminNext("//evil.example")).toBe("/admin");
  });

  it("rejects a path that doesn't start with /", () => {
    expect(safeAdminNext("admin/users")).toBe("/admin");
  });

  // Regression: PR #387, found by the `qa` agent before merge. A backslash is
  // a slash to the WHATWG URL parser every browser implements, so these all
  // reached an external host under the old startsWith("//") check while
  // looking like in-app paths.
  it("rejects a backslash bypass that a prefix check would let through", () => {
    expect(safeAdminNext("/\\evil.example/steal")).toBe("/admin");
    expect(safeAdminNext("/\\/evil.example")).toBe("/admin");
    expect(safeAdminNext("/\\\\evil.example")).toBe("/admin");
  });

  it("rejects control characters the URL parser strips before resolving", () => {
    expect(safeAdminNext("/\t/evil.example")).toBe("/admin");
    expect(safeAdminNext("/\n\\evil.example")).toBe("/admin");
  });

  it("never yields a value that resolves off-origin, whatever is thrown at it", () => {
    const payloads = [
      "/admin/users",
      "//evil.example",
      "/\\evil.example/steal",
      "/\\/evil.example",
      "/\t/evil.example",
      "/\n\\evil.example",
      "https://evil.example",
      "http:evil.example",
      "javascript:alert(1)",
      "admin/users",
      "",
      "/..//evil.example"
    ];

    for (const payload of payloads) {
      expect(hostAfterRedirect(payload)).toBe("app.genscore.es");
    }
  });
});
