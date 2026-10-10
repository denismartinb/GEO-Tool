"use client";

import { useEffect } from "react";
import type { ConversionKind } from "@/lib/ads/config";
import { trackConversion } from "@/lib/ads/track";

/**
 * PAID-ADS-1: fires one conversion when a server-rendered page that marks the
 * end of a funnel step mounts (`/signup/confirm`, the billing success URL).
 * Deduplicated per tab session so a reload does not count twice.
 */
export function ConversionOnMount({ kind, dedupeKey }: { kind: ConversionKind; dedupeKey: string }) {
  useEffect(() => {
    trackConversion(kind, { dedupeKey });
  }, [kind, dedupeKey]);
  return null;
}
