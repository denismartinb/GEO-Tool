"use client";

import { useEffect, useState } from "react";
import { checkerStoreHref, detectDesktopChrome } from "@/lib/chrome-extension/install-promo";

/**
 * EXT-REACH-1 (log §436): one line under the free checker's upsell offering
 * the Chrome extension. Only Google Chrome on a desktop can install it, so
 * anywhere else it renders nothing, including the server render (the line
 * appears after hydration, never as a flash on a phone).
 */
export function CheckerExtensionLine() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    setShow(detectDesktopChrome());
  }, []);
  if (!show) return null;
  return (
    <div className="fcr-ext">
      <span className="fcr-ext-ic" aria-hidden="true">
        <svg width="18" height="18" viewBox="0 0 48 48">
          <path d="M24 24 L4.95 13 A22 22 0 0 1 43.05 13 Z" fill="#DB4437" />
          <path d="M24 24 L43.05 13 A22 22 0 0 1 24 46 Z" fill="#F4B400" />
          <path d="M24 24 L24 46 A22 22 0 0 1 4.95 13 Z" fill="#0F9D58" />
          <circle cx="24" cy="24" r="11" fill="#fff" />
          <circle cx="24" cy="24" r="8.5" fill="#4285F4" />
        </svg>
      </span>
      <span className="fcr-ext-txt">¿Usas Chrome? Revisa cualquier web con la extensión gratuita.</span>
      <a className="fcr-ext-cta" href={checkerStoreHref()} target="_blank" rel="noopener noreferrer">
        Añadir a Chrome
      </a>
    </div>
  );
}
