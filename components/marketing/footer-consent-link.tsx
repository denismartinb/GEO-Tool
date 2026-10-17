"use client";

import { adsEnabled, readAdsConfig } from "@/lib/ads/config";
import { openConsentPreferences } from "@/lib/ads/consent";

/**
 * FOOTER-UNIFY-1: reopens the cookie banner from every public footer. Only
 * rendered while the banner exists (PAID-ADS-1 is dormant until an ad id is
 * set); without it the control would do nothing.
 */
export function FooterConsentLink() {
  if (!adsEnabled(readAdsConfig())) return null;
  return (
    <button type="button" className="pf-consent" onClick={openConsentPreferences}>
      Preferencias de cookies
    </button>
  );
}
