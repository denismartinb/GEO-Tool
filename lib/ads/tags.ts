/**
 * PAID-ADS-1: injects the Google Ads (gtag.js) and LinkedIn Insight tags.
 * Called ONLY after the visitor accepted advertising cookies — this is
 * Consent Mode "basic": before consent, not a single request goes to Google or
 * LinkedIn, so there is nothing to model or leak.
 */
import type { AdsConfig } from "@/lib/ads/config";

type AdsWindow = Window & {
  dataLayer?: unknown[];
  gtag?: (...args: unknown[]) => void;
  lintrk?: ((action: string, data: Record<string, unknown>) => void) & { q?: unknown[] };
  _linkedin_data_partner_ids?: string[];
  __gsAdsTagsLoaded?: boolean;
};

function injectScript(src: string): void {
  const script = document.createElement("script");
  script.async = true;
  script.src = src;
  document.head.appendChild(script);
}

export function loadAdTags(config: AdsConfig): void {
  const w = window as AdsWindow;
  if (w.__gsAdsTagsLoaded) return;
  w.__gsAdsTagsLoaded = true;

  if (config.googleAdsId) {
    w.dataLayer = w.dataLayer || [];
    w.gtag = function gtag() {
      // gtag.js reads the `arguments` object itself, not an array — the
      // official snippet pushes `arguments` for exactly that reason.
      w.dataLayer!.push(arguments);
    };
    w.gtag("consent", "default", {
      ad_storage: "granted",
      ad_user_data: "granted",
      ad_personalization: "granted",
      analytics_storage: "denied"
    });
    w.gtag("js", new Date());
    w.gtag("config", config.googleAdsId);
    injectScript(`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(config.googleAdsId)}`);
  }

  if (config.linkedinPartnerId) {
    w._linkedin_data_partner_ids = w._linkedin_data_partner_ids || [];
    w._linkedin_data_partner_ids.push(config.linkedinPartnerId);
    if (!w.lintrk) {
      const queue: unknown[] = [];
      const stub = ((action: string, data: Record<string, unknown>) => {
        queue.push([action, data]);
      }) as NonNullable<AdsWindow["lintrk"]>;
      stub.q = queue;
      w.lintrk = stub;
    }
    injectScript("https://snap.licdn.com/li.lms-analytics/insight.min.js");
  }
}

/**
 * Consent withdrawn mid-session: tell gtag to stop, then the caller reloads
 * so no already-loaded script keeps running.
 */
export function revokeAdTags(): void {
  const w = window as AdsWindow;
  w.gtag?.("consent", "update", {
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied"
  });
}
