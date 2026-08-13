import { describe, expect, it } from "vitest";
import { avatarInitials, showsPlanBadge } from "./account-chip";

describe("avatarInitials", () => {
  it("takes the first two characters, uppercased", () => {
    expect(avatarInitials("de5@gmail.com")).toBe("DE");
  });

  it("is already uppercase-safe", () => {
    expect(avatarInitials("DE5@gmail.com")).toBe("DE");
  });

  it("returns an empty string for an empty address instead of a stray character", () => {
    expect(avatarInitials("")).toBe("");
  });

  it("does not pad a one-character address", () => {
    expect(avatarInitials("a")).toBe("A");
  });
});

describe("showsPlanBadge", () => {
  // Founder decision 2026-07-31, in force in the console sidebar since then —
  // the public header inherits it here rather than deciding again.
  it("hides the badge on free", () => {
    expect(showsPlanBadge("free")).toBe(false);
  });

  it("shows the badge on every paid plan", () => {
    expect(showsPlanBadge("starter")).toBe(true);
    expect(showsPlanBadge("pro")).toBe(true);
    expect(showsPlanBadge("agency")).toBe(true);
  });
});
