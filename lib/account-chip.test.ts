import { describe, expect, it } from "vitest";
import { avatarInitials, showsPlanBadge, showsPromoStrip } from "./account-chip";

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

describe("showsPromoStrip", () => {
  // Founder, 2026-08-12: "la franja de 7 días tiene que salir a usuarios no
  // logados o plan free".
  it("shows the trial offer to anonymous visitors", () => {
    expect(showsPromoStrip(undefined)).toBe(true);
  });

  it("still shows it to a logged-in Free account — it is a real upsell for them", () => {
    expect(showsPromoStrip("free")).toBe(true);
  });

  it("hides it from every paying customer", () => {
    expect(showsPromoStrip("starter")).toBe(false);
    expect(showsPromoStrip("pro")).toBe(false);
    expect(showsPromoStrip("agency")).toBe(false);
  });

  it("is the exact inverse of the plan badge for any resolved plan", () => {
    // The two questions are the same one seen from both sides; if they ever
    // disagree, one surface is calling an account paying and the other free.
    for (const planId of ["free", "starter", "pro", "agency"]) {
      expect(showsPromoStrip(planId)).toBe(!showsPlanBadge(planId));
    }
  });
});
