"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSessionUser } from "@/lib/use-session-user";
import {
  FREE_REPORT_ENTRY,
  freeReportHref,
  isPromoEligible,
  PROMO_DISMISSED_AT_KEY,
  PROMO_REQUESTED_KEY,
  PROMO_SHOWN_THIS_VISIT_KEY,
  scrollFractionOf,
  shouldTriggerPromo
} from "@/lib/free-report/promo";

/**
 * FREE-REPORT-2 — the corner card on content pages offering the free report.
 * The rules (where, when, how often) live in `lib/free-report/promo.ts`; this
 * component only reads storage, watches time and scroll, and renders.
 *
 * Not a modal: it never takes focus, never dims the page, and closes with its
 * own X. Storage access is wrapped because private browsing can throw; with
 * no storage the card still behaves as "first visit", which is the safe side.
 */

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

export function FreeReportPromoCard() {
  const pathname = usePathname();
  const user = useSessionUser();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const eligible = isPromoEligible({
      pathname,
      loggedIn: user !== null,
      now: Date.now(),
      dismissedAt: readStorage("local", PROMO_DISMISSED_AT_KEY),
      requested: readStorage("local", PROMO_REQUESTED_KEY),
      shownThisVisit: readStorage("session", PROMO_SHOWN_THIS_VISIT_KEY)
    });
    if (!eligible) {
      setVisible(false);
      return;
    }

    const startedAt = Date.now();
    let done = false;
    const check = () => {
      if (done) return;
      const scrollFraction = scrollFractionOf(
        window.scrollY,
        window.innerHeight,
        document.documentElement.scrollHeight
      );
      if (shouldTriggerPromo({ elapsedMs: Date.now() - startedAt, scrollFraction })) {
        done = true;
        writeStorage("session", PROMO_SHOWN_THIS_VISIT_KEY, "1");
        setVisible(true);
        cleanup();
      }
    };
    const timer = window.setInterval(check, 1000);
    window.addEventListener("scroll", check, { passive: true });
    const cleanup = () => {
      window.clearInterval(timer);
      window.removeEventListener("scroll", check);
    };
    return cleanup;
  }, [pathname, user]);

  if (!visible) return null;

  const close = () => {
    writeStorage("local", PROMO_DISMISSED_AT_KEY, String(Date.now()));
    setVisible(false);
  };

  return (
    <aside className="fr-promo" aria-label="Informe GEO gratuito">
      <button type="button" className="fr-promo-close" onClick={close} aria-label="Cerrar">
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
          <path d="M3.5 3.5 L12.5 12.5 M12.5 3.5 L3.5 12.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      </button>
      <span className="fr-promo-badge">Informe gratuito</span>
      <p className="fr-promo-title">
        ¿La IA te nombra a ti <span className="fr-grad">o a tu competencia?</span>
      </p>
      <p className="fr-promo-body">
        Te enviamos un informe de tu marca en ChatGPT, Gemini y Claude. Gratis, en tu correo en 48 h laborables.
      </p>
      <Link className="fr-promo-cta" href={freeReportHref(FREE_REPORT_ENTRY.blogCard)}>
        Pedir mi informe gratis
      </Link>
    </aside>
  );
}
