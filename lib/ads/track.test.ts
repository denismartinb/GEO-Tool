import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readAdsConfig } from "@/lib/ads/config";
import { CONSENT_CHANGE_EVENT } from "@/lib/ads/consent";

const ENV = {
  NEXT_PUBLIC_GOOGLE_ADS_ID: "AW-111",
  NEXT_PUBLIC_GOOGLE_ADS_LABEL_SIGN_UP: "signupLabel",
  NEXT_PUBLIC_GOOGLE_ADS_LABEL_FREE_CHECK: "checkLabel",
  NEXT_PUBLIC_LINKEDIN_PARTNER_ID: "222",
  NEXT_PUBLIC_LINKEDIN_CONV_SIGN_UP: "333"
};

describe("buildConversionCalls", () => {
  it("sends to every platform that has an id AND a label for that kind", async () => {
    const { buildConversionCalls } = await import("@/lib/ads/track");
    const config = readAdsConfig(ENV);
    expect(buildConversionCalls(config, "sign_up")).toEqual([
      { platform: "google", sendTo: "AW-111/signupLabel", params: {} },
      { platform: "linkedin", conversionId: 333 }
    ]);
    expect(buildConversionCalls(config, "free_check")).toEqual([
      { platform: "google", sendTo: "AW-111/checkLabel", params: {} }
    ]);
    expect(buildConversionCalls(config, "purchase")).toEqual([]);
  });

  it("attaches a value in EUR only when one is given", async () => {
    const { buildConversionCalls } = await import("@/lib/ads/track");
    const config = readAdsConfig({ ...ENV, NEXT_PUBLIC_GOOGLE_ADS_LABEL_PURCHASE: "buy" });
    expect(buildConversionCalls(config, "purchase", 59)[0]).toEqual({
      platform: "google",
      sendTo: "AW-111/buy",
      params: { value: 59, currency: "EUR" }
    });
  });
});

describe("trackConversion and consent", () => {
  let cookie = "";
  let gtag: ReturnType<typeof vi.fn>;
  let lintrk: ReturnType<typeof vi.fn>;
  const target = new EventTarget();
  const session = new Map<string, string>();

  beforeEach(() => {
    vi.resetModules();
    for (const [k, v] of Object.entries(ENV)) vi.stubEnv(k, v);
    cookie = "";
    session.clear();
    gtag = vi.fn();
    lintrk = vi.fn();
    vi.stubGlobal("document", {
      get cookie() {
        return cookie;
      }
    });
    vi.stubGlobal("window", {
      gtag,
      lintrk,
      addEventListener: target.addEventListener.bind(target),
      dispatchEvent: target.dispatchEvent.bind(target),
      sessionStorage: {
        getItem: (k: string) => session.get(k) ?? null,
        setItem: (k: string, v: string) => void session.set(k, v)
      }
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("sends nothing at all when the visitor rejected", async () => {
    cookie = "gs_ads_consent=v1%3Adenied";
    const { trackConversion } = await import("@/lib/ads/track");
    trackConversion("sign_up");
    expect(gtag).not.toHaveBeenCalled();
    expect(lintrk).not.toHaveBeenCalled();
  });

  it("sends immediately when the visitor already accepted", async () => {
    cookie = "gs_ads_consent=v1%3Agranted";
    const { trackConversion } = await import("@/lib/ads/track");
    trackConversion("sign_up");
    expect(gtag).toHaveBeenCalledWith("event", "conversion", { send_to: "AW-111/signupLabel" });
    expect(lintrk).toHaveBeenCalledWith("track", { conversion_id: 333 });
  });

  it("holds a conversion while unanswered and sends it only on accept", async () => {
    const { trackConversion } = await import("@/lib/ads/track");
    trackConversion("free_check");
    expect(gtag).not.toHaveBeenCalled();
    target.dispatchEvent(new CustomEvent(CONSENT_CHANGE_EVENT, { detail: "granted" }));
    expect(gtag).toHaveBeenCalledTimes(1);
  });

  it("drops a held conversion on reject", async () => {
    const { trackConversion } = await import("@/lib/ads/track");
    trackConversion("free_check");
    target.dispatchEvent(new CustomEvent(CONSENT_CHANGE_EVENT, { detail: "denied" }));
    target.dispatchEvent(new CustomEvent(CONSENT_CHANGE_EVENT, { detail: "granted" }));
    expect(gtag).not.toHaveBeenCalled();
  });

  it("counts a deduplicated conversion once per tab session", async () => {
    cookie = "gs_ads_consent=v1%3Agranted";
    const { trackConversion } = await import("@/lib/ads/track");
    trackConversion("sign_up", { dedupeKey: "sign_up" });
    trackConversion("sign_up", { dedupeKey: "sign_up" });
    expect(gtag).toHaveBeenCalledTimes(1);
  });

  it("is a no-op when no ad platform is configured", async () => {
    vi.unstubAllEnvs();
    cookie = "gs_ads_consent=v1%3Agranted";
    const { trackConversion } = await import("@/lib/ads/track");
    trackConversion("sign_up");
    expect(gtag).not.toHaveBeenCalled();
  });
});
