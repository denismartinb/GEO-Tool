import { describe, expect, it } from "vitest";
import { isChallengeResponse } from "./challenge";

describe("isChallengeResponse", () => {
  it("a normal page is not a challenge", () => {
    expect(isChallengeResponse({ status: 200, headers: {}, body: "<html><body>Tienda</body></html>" })).toBe(false);
  });

  it("Cloudflare's cf-mitigated header is a challenge", () => {
    expect(isChallengeResponse({ status: 403, headers: { "cf-mitigated": "challenge" }, body: "" })).toBe(true);
  });

  it("a 403 or 503 to our bot is a block", () => {
    expect(isChallengeResponse({ status: 403, headers: {}, body: "Forbidden" })).toBe(true);
    expect(isChallengeResponse({ status: 503, headers: {}, body: "" })).toBe(true);
  });

  it("a 200 interstitial is a challenge", () => {
    expect(
      isChallengeResponse({ status: 200, headers: {}, body: "<title>Just a moment...</title><div id=cf-chl-widget>" })
    ).toBe(true);
  });

  it("an empty 200 to our bot is a block, not a page (violettea.es, log §464)", () => {
    expect(isChallengeResponse({ status: 200, headers: { vary: "User-Agent" }, body: "" })).toBe(true);
    expect(isChallengeResponse({ status: 200, headers: {}, body: "  \n " })).toBe(true);
    expect(isChallengeResponse({ status: 404, headers: {}, body: "" })).toBe(false);
  });

  it("a 404 is not a challenge", () => {
    expect(isChallengeResponse({ status: 404, headers: {}, body: "Not found" })).toBe(false);
  });
});
