import { describe, expect, it } from "vitest";
import { safeAdminNext } from "./safe-next";

describe("safeAdminNext", () => {
  it("passes through a same-origin relative path", () => {
    expect(safeAdminNext("/admin/users")).toBe("/admin/users");
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
});
