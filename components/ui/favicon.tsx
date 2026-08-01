"use client";

import { useEffect, useState, type ReactNode } from "react";
import { faviconUrl } from "@/lib/domains/favicon";

/**
 * Google's s2/favicons endpoint (lib/domains/favicon.ts) answers with
 * HTTP 200 and a generic, low-res globe placeholder — not a 404 — when it
 * has no favicon for a domain, so a plain `<img>` can't tell "found" from
 * "not found" via onError; both just load successfully. Founder feedback
 * 2026-08-01: that placeholder reads as broken/cutre UI, worse than the
 * existing letter-avatar fallback (already used when a project has no
 * domain at all).
 *
 * The placeholder is served byte-identical for every domain that lacks a
 * favicon, so this self-calibrates once per page load instead of hardcoding
 * a byte count that could drift if Google ever changes the asset: fetch a
 * domain guaranteed to never have one (a .invalid TLD, RFC 2606) and
 * remember its size, then treat any later favicon of that same size as the
 * same placeholder.
 */
let fallbackSizePromise: Promise<number | null> | null = null;
function getFallbackSignatureSize(): Promise<number | null> {
  if (!fallbackSizePromise) {
    fallbackSizePromise = fetch(faviconUrl("favicon-probe.invalid")!)
      .then((res) => (res.ok ? res.blob() : null))
      .then((blob) => blob?.size ?? null)
      .catch(() => null);
  }
  return fallbackSizePromise;
}

// Per-favicon-URL cache: the same domain often appears more than once on a
// page (sidebar switcher + Overview panorama), so only check it once.
const realFaviconCache = new Map<string, boolean>();

/**
 * Renders a domain's real favicon, or `fallback` when Google's service has
 * no icon for it (see module doc above), the check hasn't resolved yet, or
 * no domain was given at all.
 */
export function Favicon({
  domain,
  size = 26,
  className,
  fallback
}: {
  domain: string | null | undefined;
  size?: number;
  className?: string;
  fallback: ReactNode;
}) {
  const url = faviconUrl(domain);
  const [isReal, setIsReal] = useState<boolean | null>(() => (url ? (realFaviconCache.get(url) ?? null) : false));

  useEffect(() => {
    if (!url || realFaviconCache.has(url)) return;
    let cancelled = false;

    Promise.all([fetch(url), getFallbackSignatureSize()])
      .then(async ([res, fallbackSize]) => {
        if (!res.ok) return false;
        const blob = await res.blob();
        return fallbackSize === null ? true : blob.size !== fallbackSize;
      })
      .catch(() => false)
      .then((real) => {
        realFaviconCache.set(url, real);
        if (!cancelled) setIsReal(real);
      });

    return () => {
      cancelled = true;
    };
  }, [url]);

  // isReal === null covers both "no domain" and "still checking" — show the
  // fallback letter rather than flash the pixelated globe while unresolved.
  if (!url || !isReal) return <>{fallback}</>;

  // eslint-disable-next-line @next/next/no-img-element -- external favicon service, not a static asset
  return <img src={url} alt="" width={size} height={size} className={className} loading="lazy" />;
}
