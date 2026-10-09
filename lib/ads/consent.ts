/**
 * PAID-ADS-1: the visitor's advertising-cookie choice.
 *
 * Two purposes, consented separately (AEPD, Guía sobre el uso de cookies,
 * 2023: consent is given per purpose, and the first layer offers accept,
 * reject AND a way to choose):
 * - `measurement`: which Google ad brought a sign-up, a free check or a
 *   purchase (conversion tracking).
 * - `remarketing`: showing GenScore ads later to people who already visited,
 *   on Google and LinkedIn. The LinkedIn Insight tag does measurement and
 *   retargeting with the same cookie and cannot be split, so it only loads
 *   under this purpose.
 * There is no analytics purpose because PostHog runs cookieless
 * (`components/posthog-provider.tsx`) and needs no consent.
 *
 * The choice itself lives in a first-party cookie: remembering a consent
 * decision is a strictly-necessary use, so it is stored whichever way the
 * visitor answers. 180 days, then we ask again — well inside the AEPD's
 * 24-month ceiling.
 */
export const CONSENT_COOKIE = "gs_ads_consent";
export const CONSENT_VERSION = "v2";
export const CONSENT_MAX_AGE_SECONDS = 180 * 24 * 60 * 60;
export const CONSENT_CHANGE_EVENT = "gs:ads-consent-change";
export const CONSENT_OPEN_EVENT = "gs:ads-consent-open";

export type AdsConsentState = { measurement: boolean; remarketing: boolean };

export const CONSENT_ALL: AdsConsentState = { measurement: true, remarketing: true };
export const CONSENT_NONE: AdsConsentState = { measurement: false, remarketing: false };

export function parseConsentCookie(cookieHeader: string): AdsConsentState | null {
  for (const part of cookieHeader.split(";")) {
    const [rawName, ...rest] = part.trim().split("=");
    if (rawName !== CONSENT_COOKIE) continue;
    const value = decodeURIComponent(rest.join("="));
    // A cookie from an older banner version is no consent at all: the text
    // the visitor agreed to is not the one we would now be relying on.
    const match = new RegExp(`^${CONSENT_VERSION}:m([01])r([01])$`).exec(value);
    if (!match) return null;
    return { measurement: match[1] === "1", remarketing: match[2] === "1" };
  }
  return null;
}

export function serializeConsentCookie(state: AdsConsentState, secure: boolean): string {
  const value = `${CONSENT_VERSION}:m${state.measurement ? 1 : 0}r${state.remarketing ? 1 : 0}`;
  return [
    `${CONSENT_COOKIE}=${encodeURIComponent(value)}`,
    "Path=/",
    `Max-Age=${CONSENT_MAX_AGE_SECONDS}`,
    "SameSite=Lax",
    ...(secure ? ["Secure"] : [])
  ].join("; ");
}

/** True when `next` withdraws a purpose `previous` had granted. */
export function isWithdrawal(previous: AdsConsentState | null, next: AdsConsentState): boolean {
  if (!previous) return false;
  return (previous.measurement && !next.measurement) || (previous.remarketing && !next.remarketing);
}

/**
 * Names of the first-party cookies the Google Ads and LinkedIn tags set on our
 * own domain. Withdrawing consent deletes them; the third-party ones on
 * google.com / linkedin.com are out of our reach and the cookie policy says so.
 */
export function isAdCookieName(name: string): boolean {
  return /^(_gcl_|_gac_|li_fat_id$|li_sugr$|_uetsid$|_uetvid$)/.test(name);
}

export function readConsent(): AdsConsentState | null {
  if (typeof document === "undefined") return null;
  try {
    return parseConsentCookie(document.cookie);
  } catch {
    return null;
  }
}

export function writeConsent(state: AdsConsentState): void {
  if (typeof document === "undefined") return;
  const previous = readConsent();
  document.cookie = serializeConsentCookie(state, window.location.protocol === "https:");
  if (isWithdrawal(previous, state)) clearAdCookies();
  window.dispatchEvent(new CustomEvent<AdsConsentState>(CONSENT_CHANGE_EVENT, { detail: state }));
}

function clearAdCookies(): void {
  const host = window.location.hostname;
  // The tags write on the registrable domain (".genscore.es"), so expire both
  // the host-only and the dotted variants.
  const parts = host.split(".");
  const domains = ["", host, parts.length > 1 ? `.${parts.slice(-2).join(".")}` : host];
  for (const part of document.cookie.split(";")) {
    const name = part.trim().split("=")[0];
    if (!name || !isAdCookieName(name)) continue;
    for (const domain of domains) {
      document.cookie = `${name}=; Path=/; Max-Age=0${domain ? `; Domain=${domain}` : ""}`;
    }
  }
}

export function openConsentPreferences(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(CONSENT_OPEN_EVENT));
}
