"use client";

import { openConsentPreferences } from "@/lib/ads/consent";

/** PAID-ADS-1: reopens the banner so a visitor can change their answer. */
export function ConsentPreferencesButton() {
  return (
    <button type="button" className="ads-consent-btn" onClick={openConsentPreferences}>
      Cambiar mis preferencias de cookies
    </button>
  );
}
