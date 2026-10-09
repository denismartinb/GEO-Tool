/**
 * PAID-ADS-1: a conversion the server observed (a Google sign-up in
 * `/auth/callback`) but cannot send itself, because conversions are sent from
 * the browser tags. Set only when ad consent was already granted; carries the
 * conversion kind and nothing else; read and deleted on the next page.
 */
import type { ConversionKind } from "@/lib/ads/config";

export const PENDING_CONVERSION_COOKIE = "gs_pending_conversion";

const KINDS: ConversionKind[] = ["free_check", "sign_up", "purchase"];

export function parsePendingConversion(cookieHeader: string): ConversionKind | null {
  for (const part of cookieHeader.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name !== PENDING_CONVERSION_COOKIE) continue;
    const value = rest.join("=") as ConversionKind;
    return KINDS.includes(value) ? value : null;
  }
  return null;
}

export function consumePendingConversion(): ConversionKind | null {
  if (typeof document === "undefined") return null;
  const kind = parsePendingConversion(document.cookie);
  if (document.cookie.includes(`${PENDING_CONVERSION_COOKIE}=`)) {
    document.cookie = `${PENDING_CONVERSION_COOKIE}=; Path=/; Max-Age=0`;
  }
  return kind;
}
