import { AFFILIATE_COOKIE_DAYS } from "@/lib/affiliates/terms";

/**
 * AFFILIATES-1 — referral codes and the `gs_ref` cookie.
 *
 * A link like `genscore.es/?ref=campamentoweb` stores the code in a
 * first-party cookie for 90 days (last click wins, `middleware.ts`). Sign-up
 * copies it into the account's `user_metadata.referral_code`, and checkout
 * copies it into the Stripe subscription's metadata, where the monthly report
 * reads it. No table and no migration: the valid codes live in the env var
 * `AFFILIATE_CODES` (comma-separated), which the founder edits in Vercel when
 * an application is approved.
 *
 * An unknown code is ignored everywhere it is read: a typo or a guessed code
 * never sets a cookie, and a code removed from the env stops travelling to
 * new subscriptions (the report still pays the ones already attributed).
 *
 * Pure and Edge-safe on purpose: the middleware imports it.
 */

export const AFFILIATE_REF_COOKIE = "gs_ref";
export const AFFILIATE_REF_PARAM = "ref";
export const AFFILIATE_REF_COOKIE_MAX_AGE_S = AFFILIATE_COOKIE_DAYS * 24 * 60 * 60;

const CODE_PATTERN = /^[a-z0-9-]{2,40}$/;

/** The code's own shape: lowercase letters, digits and hyphens, 2–40 chars. */
export function normalizeAffiliateCode(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  const code = raw.trim().toLowerCase();
  return CODE_PATTERN.test(code) ? code : null;
}

/** The approved codes from `AFFILIATE_CODES`. Malformed entries are dropped. */
export function parseAffiliateCodes(envValue: string | null | undefined): Set<string> {
  const codes = new Set<string>();
  for (const part of (envValue ?? "").split(",")) {
    const code = normalizeAffiliateCode(part);
    if (code) codes.add(code);
  }
  return codes;
}

/** The env value the product reads. One accessor so every caller reads the same variable. */
export function affiliateCodesEnv(): string | undefined {
  return process.env.AFFILIATE_CODES;
}

/** `raw` if it is a well-formed code that is currently approved, else null. */
export function resolveAffiliateCode(
  raw: string | null | undefined,
  envValue: string | null | undefined = affiliateCodesEnv()
): string | null {
  const code = normalizeAffiliateCode(raw);
  if (!code) return null;
  return parseAffiliateCodes(envValue).has(code) ? code : null;
}

/** Reads `gs_ref` from a raw `Cookie` header. Shape-checked, not approval-checked. */
export function readRefCookie(cookieHeader: string | null | undefined): string | null {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const index = part.indexOf("=");
    if (index === -1) continue;
    if (part.slice(0, index).trim() !== AFFILIATE_REF_COOKIE) continue;
    try {
      return normalizeAffiliateCode(decodeURIComponent(part.slice(index + 1).trim()));
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * The referral code to store on a NEW account: the cookie's code, only if it
 * is still approved, and only if the account does not carry one already —
 * an attribution is never overwritten.
 */
export function referralCodeForNewAccount(input: {
  cookieCode: string | null | undefined;
  existing: unknown;
  envValue?: string | null;
}): string | null {
  if (typeof input.existing === "string" && input.existing.trim() !== "") return null;
  return resolveAffiliateCode(input.cookieCode, input.envValue === undefined ? affiliateCodesEnv() : input.envValue);
}
