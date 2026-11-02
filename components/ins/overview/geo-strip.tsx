"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Ic } from "@/components/ins/ic";
import type { GeoStrip } from "@/lib/ins/geo-strip";

/**
 * GEO-ALERTS-1 (log §440): the one strip of Visión general about the site
 * (`selectGeoStrip`). Orange for a block, blue for JavaScript-only content,
 * green for something resolved. Only the green one closes, remembered per
 * device and per audit (a convenience: if storage fails, it simply shows).
 */
export function GeoStripAlert({ strip }: { strip: GeoStrip }) {
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    if (!strip.dismissKey) return;
    try {
      if (window.localStorage.getItem(strip.dismissKey) === "1") setHidden(true);
    } catch {
      // storage blocked: the strip stays
    }
  }, [strip.dismissKey]);
  if (hidden) return null;

  const dot = (s: string) => (/[.!?…]$/.test(s) ? s : `${s}.`);
  const cls = strip.tone === "warm" ? "alert" : `alert ${strip.tone}`;
  const label = strip.tone === "warm" ? "Prioridad 1" : strip.tone === "info" ? "Importante" : "Resuelto";
  return (
    <div className={cls} role={strip.tone === "pos" ? "status" : "region"} aria-label={label}>
      <Ic n={strip.tone === "warm" ? "warn" : strip.tone === "info" ? "eye" : "checkc"} />
      <div className="tx">
        <b>{dot(strip.title)}</b>
        {strip.evidence ? <span className="ev">{strip.evidence}</span> : null}
        <span className="sub">
          {strip.detail}
          {strip.more ? ` ${strip.more}` : ""}
        </span>
        {strip.urls.length > 0 ? (
          <ul className="alert-urls">
            {strip.urls.slice(0, 3).map((url) => (
              <li key={url}>{url}</li>
            ))}
            {strip.urls.length > 3 ? <li>y {strip.urls.length - 3} más</li> : null}
          </ul>
        ) : null}
      </div>
      {strip.cta ? (
        <Link className={strip.tone === "warm" ? "btn warm sm" : "btn sm"} href={strip.cta.href}>
          {strip.cta.label}
          <Ic n="arrowr" sm />
        </Link>
      ) : null}
      {strip.dismissKey ? (
        <button
          type="button"
          className="x"
          aria-label="Cerrar"
          onClick={() => {
            setHidden(true);
            try {
              window.localStorage.setItem(strip.dismissKey!, "1");
            } catch {
              // storage blocked: closed for this visit only
            }
          }}
        >
          <Ic n="x" sm />
        </button>
      ) : null}
    </div>
  );
}
