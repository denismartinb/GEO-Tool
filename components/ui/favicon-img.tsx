"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
import { faviconImgProps } from "@/lib/domains/favicon";

/**
 * A domain's brand icon, falling back to whatever you pass when there is none.
 *
 * It exists for one specific reason (FAVICON-QUALITY-1, §36): the fallback used
 * to trigger only when the **domain was missing**, so a domain whose icon the
 * service does not know showed a generic globe forever. `/api/favicon` now
 * answers 204 with no body in that case, the `<img>` has nothing to decode,
 * `onError` fires, and `fallback` is drawn.
 *
 * `fallback` is a ReactNode rather than style props on purpose: every screen
 * already had its own letter avatar, with its own class and its own
 * deterministic colour. Unifying them would have been a redesign smuggled into
 * an infrastructure change. This component contributes the behaviour, not the
 * appearance — which is why server components can keep using it, passing the
 * fallback already rendered.
 */
export function FaviconImg({
  domain,
  cssSize,
  className,
  style,
  fallback
}: {
  domain: string | null | undefined;
  /** Size it is painted at, in CSS pixels. Decides which resolutions are requested. */
  cssSize: number;
  className?: string;
  style?: CSSProperties;
  fallback: ReactNode;
}) {
  const [failed, setFailed] = useState(false);
  const img = faviconImgProps(domain, cssSize);

  if (!img || failed) return <>{fallback}</>;

  return (
    // eslint-disable-next-line @next/next/no-img-element -- icon service via our own route, not a static asset
    <img
      {...img}
      alt=""
      className={className}
      style={style}
      width={cssSize}
      height={cssSize}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}
