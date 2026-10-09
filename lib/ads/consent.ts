/**
 * PAID-ADS-1: the visitor's advertising-cookie choice.
 *
 * One category only — "publicidad": measuring which Google/LinkedIn ads bring
 * sign-ups and showing GenScore ads to people who already visited. There is no
 * analytics category because PostHog runs cookieless (`components/
 * posthog-provider.tsx`) and needs no consent.
 *
 * The choice itself lives in a first-party cookie: remembering a consent
 * decision is a strictly-necessary use (AEPD, Guía sobre el uso de cookies,
 * 2023), so it is stored whichever way the visitor answers. 180 days, then we
 * ask again — well inside the AEPD's 24-month ceiling.
 */
export const CONSENT_COOKIE = "gs_ads_consent";
export const CONSENT_VERSION = "v1";
export const CONSENT_MAX_AGE_SECONDS = 180 * 24 * 60 * 60;
export const CONSENT_CHANGE_EVENT = "gs:ads-consent-change";
export const CONSENT_OPEN_EVENT = "gs:ads-consent-open";

export type ConsentChoice = "granted" | "denied";

export function parseConsentCookie(cookieHeader: string): ConsentChoice | null {
  for (const part of cookieHeader.split(";")) {
    const [rawName, ...rest] = part.trim().split("=");
    if (rawName !== CONSENT_COOKIE) continue;
    const value = decodeURIComponent(rest.join("="));
    // A cookie from an older banner version is no consent at all: the text
    // the visitor agreed to is not the one we would now be relying on.
    if (value === `${CONSENT_VERSION}:granted`) return "granted";
    if (value === `${CONSENT_VERSION}:denied`) return "denied";
    return null;
  }
  return null;
}

export function serializeConsentCookie(choice: ConsentChoice, secure: boolean): string {
  return [
    `${CONSENT_COOKIE}=${encodeURIComponent(`${CONSENT_VERSION}:${choice}`)}`,
    "Path=/",
    `Max-Age=${CONSENT_MAX_AGE_SECONDS}`,
    "SameSite=Lax",
    ...(secure ? ["Secure"] : [])
  ].join("; ");
}

/**
 * Names of the first-party cookies the Google Ads and LinkedIn tags set on our
 * own domain. Withdrawing consent deletes them; the third-party ones on
 * google.com / linkedin.com are out of our reach and the cookie policy says so.
 */
export function isAdCookieName(name: string): boolean {
  return /^(_gcl_|_gac_|li_fat_id$|li_sugr$|_uetsid$|_uetvid$)/.test(name);
}

export function readConsent(): ConsentChoice | null {
  if (typeof document === "undefined") return null;
  try {
    return parseConsentCookie(document.cookie);
  } catch {
    return null;
  }
}

export function writeConsent(choice: ConsentChoice): void {
  if (typeof document === "undefined") return;
  document.cookie = serializeConsentCookie(choice, window.location.protocol === "https:");
  if (choice === "denied") clearAdCookies();
  window.dispatchEvent(new CustomEvent<ConsentChoice>(CONSENT_CHANGE_EVENT, { detail: choice }));
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
