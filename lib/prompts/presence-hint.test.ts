import { describe, expect, it } from "vitest";
import { brandMentionHint } from "./presence-hint";

describe("brandMentionHint", () => {
  it("never explains why the AI names you when it does not", () => {
    for (const hasOwnCitation of [false, true]) {
      const hint = brandMentionHint({ brandMentioned: false, hasOwnCitation });
      expect(hint).not.toMatch(/te nombra por|ya sabe/i);
      expect(hint).toMatch(/sin nombrar tu marca/i);
    }
  });

  it("mentioned without an own source: says so, without claiming where the AI learned it", () => {
    const hint = brandMentionHint({ brandMentioned: true, hasOwnCitation: false });
    expect(hint).toMatch(/sin apoyarse en una web tuya/i);
    expect(hint).not.toMatch(/ya sabe/i);
  });

  it("mentioned with an own source", () => {
    expect(brandMentionHint({ brandMentioned: true, hasOwnCitation: true })).toMatch(/web tuya/i);
  });
});
