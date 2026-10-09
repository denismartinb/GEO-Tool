import { describe, expect, it } from "vitest";
import { safeNextPath } from "./safe-next-path";

describe("safeNextPath", () => {
  it("keeps a path on this site", () => {
    expect(safeNextPath("/informe/7b0c2c3e-1111-4222-8333-444455556666")).toBe(
      "/informe/7b0c2c3e-1111-4222-8333-444455556666"
    );
    expect(safeNextPath("/dashboard/settings?openPlan=pro#plan")).toBe("/dashboard/settings?openPlan=pro#plan");
  });

  it.each([
    ["another host, protocol-relative", "//evil.com"],
    ["another host, backslash", "/\\evil.com"],
    ["an absolute URL", "https://evil.com/informe/1"],
    ["a scheme", "javascript:alert(1)"],
    ["a relative path", "informe/1"],
    ["a control character", "/informe\n/1"],
    ["an empty value", ""],
    ["a non-string", 42],
    ["something absurdly long", `/${"a".repeat(600)}`]
  ])("refuses %s", (_label, raw) => {
    expect(safeNextPath(raw)).toBeNull();
  });
});
