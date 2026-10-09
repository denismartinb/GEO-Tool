/**
 * PAID-ADS-1: ad-platform configuration, read from public env vars.
 *
 * Every value is optional and the whole feature is dormant until at least one
 * platform id is set: no banner, no tag, no extra request — the site keeps the
 * promise `/cookies` makes today ("sin cookies de analítica ni publicitarias").
 * Setting `NEXT_PUBLIC_GOOGLE_ADS_ID` or `NEXT_PUBLIC_LINKEDIN_PARTNER_ID` in
 * Vercel is what switches the consent banner, the cookie-policy section and the
 * tags on, together, in one deploy (docs/environment-contract.md).
 *
 * Public env vars must be read with literal property names: Next
 * inlines them at build time and a dynamic lookup would come back undefined in
 * the browser.
 */
export type ConversionKind = "free_check" | "sign_up" | "purchase";

export type AdsConfig = {
  googleAdsId: string | null;
  googleLabels: Record<ConversionKind, string | null>;
  linkedinPartnerId: string | null;
  linkedinConversions: Record<ConversionKind, string | null>;
};

function clean(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function readAdsConfig(env: Record<string, string | undefined> = {
  NEXT_PUBLIC_GOOGLE_ADS_ID: process.env.NEXT_PUBLIC_GOOGLE_ADS_ID,
  NEXT_PUBLIC_GOOGLE_ADS_LABEL_FREE_CHECK: process.env.NEXT_PUBLIC_GOOGLE_ADS_LABEL_FREE_CHECK,
  NEXT_PUBLIC_GOOGLE_ADS_LABEL_SIGN_UP: process.env.NEXT_PUBLIC_GOOGLE_ADS_LABEL_SIGN_UP,
  NEXT_PUBLIC_GOOGLE_ADS_LABEL_PURCHASE: process.env.NEXT_PUBLIC_GOOGLE_ADS_LABEL_PURCHASE,
  NEXT_PUBLIC_LINKEDIN_PARTNER_ID: process.env.NEXT_PUBLIC_LINKEDIN_PARTNER_ID,
  NEXT_PUBLIC_LINKEDIN_CONV_FREE_CHECK: process.env.NEXT_PUBLIC_LINKEDIN_CONV_FREE_CHECK,
  NEXT_PUBLIC_LINKEDIN_CONV_SIGN_UP: process.env.NEXT_PUBLIC_LINKEDIN_CONV_SIGN_UP,
  NEXT_PUBLIC_LINKEDIN_CONV_PURCHASE: process.env.NEXT_PUBLIC_LINKEDIN_CONV_PURCHASE
}): AdsConfig {
  const googleAdsId = clean(env.NEXT_PUBLIC_GOOGLE_ADS_ID);
  // A malformed id would load gtag.js for nothing; `AW-` plus digits is the
  // only shape a Google Ads conversion id takes.
  const validGoogleId = googleAdsId && /^AW-\d+$/.test(googleAdsId) ? googleAdsId : null;
  const linkedinPartnerId = clean(env.NEXT_PUBLIC_LINKEDIN_PARTNER_ID);
  const validLinkedinId = linkedinPartnerId && /^\d+$/.test(linkedinPartnerId) ? linkedinPartnerId : null;

  return {
    googleAdsId: validGoogleId,
    googleLabels: {
      free_check: clean(env.NEXT_PUBLIC_GOOGLE_ADS_LABEL_FREE_CHECK),
      sign_up: clean(env.NEXT_PUBLIC_GOOGLE_ADS_LABEL_SIGN_UP),
      purchase: clean(env.NEXT_PUBLIC_GOOGLE_ADS_LABEL_PURCHASE)
    },
    linkedinPartnerId: validLinkedinId,
    linkedinConversions: {
      free_check: clean(env.NEXT_PUBLIC_LINKEDIN_CONV_FREE_CHECK),
      sign_up: clean(env.NEXT_PUBLIC_LINKEDIN_CONV_SIGN_UP),
      purchase: clean(env.NEXT_PUBLIC_LINKEDIN_CONV_PURCHASE)
    }
  };
}

export function adsEnabled(config: AdsConfig): boolean {
  return Boolean(config.googleAdsId || config.linkedinPartnerId);
}

/**
 * Screens where no ad tag ever loads and no banner is shown: operator and
 * security surfaces have nothing to measure and no business carrying a
 * third-party script.
 */
export const ADS_EXCLUDED_PATH = /^\/(admin|mfa|debug)(\/|$)/;
