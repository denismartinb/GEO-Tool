"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import {
  EXT_PROMO_DELAY_MS,
  EXT_PROMO_DISMISSED_AT_KEY,
  EXT_PROMO_INSTALLED_KEY,
  EXT_PROMO_SHOWN_THIS_VISIT_KEY,
  extPromoStoreHref,
  isDesktopChrome,
  isExtPromoEligible,
  placementFor,
  type ExtPromoPlacement
} from "@/lib/chrome-extension/install-promo";

/**
 * EXT-PROMO-1 (log §403) — the floating card offering the Chrome extension,
 * mounted once in the root layout so it covers the whole domain. The rules
 * live in `lib/chrome-extension/install-promo.ts`; this component only reads
 * the browser, storage and time, and renders. Not a modal: it never takes
 * focus or dims the page.
 */

type NavigatorWithHints = Navigator & {
  userAgentData?: { brands?: { brand: string }[]; mobile?: boolean };
};

function readStorage(kind: "local" | "session", key: string): string | null {
  try {
    return (kind === "local" ? window.localStorage : window.sessionStorage).getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(kind: "local" | "session", key: string, value: string): void {
  try {
    (kind === "local" ? window.localStorage : window.sessionStorage).setItem(key, value);
  } catch {
    // Unavailable storage only means the card may show again; nothing breaks.
  }
}

export function ChromeExtensionPromo() {
  const pathname = usePathname();
  const [placement, setPlacement] = useState<ExtPromoPlacement | null>(null);
  const shown = useRef(false);

  useEffect(() => {
    if (shown.current) return;
    const nav = navigator as NavigatorWithHints;
    const eligible = isExtPromoEligible({
      pathname,
      desktopChrome: isDesktopChrome({
        userAgent: nav.userAgent,
        brands: nav.userAgentData?.brands ?? null,
        mobile: nav.userAgentData?.mobile ?? null
      }),
      now: Date.now(),
      dismissedAt: readStorage("local", EXT_PROMO_DISMISSED_AT_KEY),
      installed: readStorage("local", EXT_PROMO_INSTALLED_KEY),
      shownThisVisit: readStorage("session", EXT_PROMO_SHOWN_THIS_VISIT_KEY)
    });
    if (!eligible || !pathname) return;
    const where = placementFor(pathname);
    const timer = window.setTimeout(() => {
      shown.current = true;
      writeStorage("session", EXT_PROMO_SHOWN_THIS_VISIT_KEY, "1");
      setPlacement(where);
    }, EXT_PROMO_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [pathname]);

  if (!placement) return null;

  const close = () => {
    writeStorage("local", EXT_PROMO_DISMISSED_AT_KEY, String(Date.now()));
    setPlacement(null);
  };
  const alreadyHave = () => {
    writeStorage("local", EXT_PROMO_INSTALLED_KEY, "1");
    setPlacement(null);
  };

  return (
    <aside className={`ext-promo ext-promo--${placement}`} aria-label="Extensión de Chrome de GenScore">
      <button type="button" className="ext-promo-close" onClick={close} aria-label="Cerrar">
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
          <path d="M3.5 3.5 L12.5 12.5 M12.5 3.5 L3.5 12.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      </button>
      <div className="ext-promo-head">
        <ChromeLogo />
        <div className="ext-promo-heading">
          <span className="ext-promo-badge">Extensión de Chrome · Gratis</span>
          <p className="ext-promo-title">Revisa cualquier web sin salir de Chrome</p>
        </div>
      </div>
      <p className="ext-promo-body">
        Auditoría GEO y SEO de la página en un clic. Conoce cómo te citan los motores de IA y si tu web está adaptada para la compra agéntica.
      </p>
      <div className="ext-promo-actions">
        <a
          className="ext-promo-cta"
          href={extPromoStoreHref(placement)}
          target="_blank"
          rel="noopener noreferrer"
          onClick={close}
        >
          Añadir a Chrome
        </a>
        <button type="button" className="ext-promo-have" onClick={alreadyHave}>
          Ya la tengo
        </button>
      </div>
    </aside>
  );
}

/** The Chrome mark, drawn inline so it needs no extra request. */
function ChromeLogo() {
  return (
    <svg className="ext-promo-logo" width="44" height="44" viewBox="0 0 48 48" aria-hidden="true">
      <path d="M24 24 L4.95 13 A22 22 0 0 1 43.05 13 Z" fill="#DB4437" />
      <path d="M24 24 L43.05 13 A22 22 0 0 1 24 46 Z" fill="#F4B400" />
      <path d="M24 24 L24 46 A22 22 0 0 1 4.95 13 Z" fill="#0F9D58" />
      <circle cx="24" cy="24" r="11" fill="#fff" />
      <circle cx="24" cy="24" r="8.5" fill="#4285F4" />
    </svg>
  );
}
