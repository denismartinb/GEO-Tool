"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ADS_EXCLUDED_PATH, adsEnabled, readAdsConfig } from "@/lib/ads/config";
import {
  CONSENT_CHANGE_EVENT,
  CONSENT_OPEN_EVENT,
  readConsent,
  writeConsent,
  type ConsentChoice
} from "@/lib/ads/consent";
import { loadAdTags, revokeAdTags } from "@/lib/ads/tags";
import { consumePendingConversion } from "@/lib/ads/pending-conversion";
import { trackConversion } from "@/lib/ads/track";

/**
 * PAID-ADS-1: the advertising-cookie banner and the tags it gates.
 *
 * Renders nothing — and loads nothing — until an ad-platform id is configured
 * (`lib/ads/config.ts`). "Aceptar" and "Rechazar" have the same weight and sit
 * on the first layer, as the AEPD requires; closing is not consent, so there is
 * no ✕. The banner can be reopened from `/cookies` to change the answer.
 */
export function AdsConsent() {
  const pathname = usePathname() ?? "/";
  const [open, setOpen] = useState(false);
  const config = readAdsConfig();
  const enabled = adsEnabled(config);
  const excluded = ADS_EXCLUDED_PATH.test(pathname);

  useEffect(() => {
    if (!enabled || excluded) return;
    const current = readConsent();
    if (current === "granted") loadAdTags(config);
    if (current === null) setOpen(true);
    const pendingKind = consumePendingConversion();
    if (pendingKind) trackConversion(pendingKind, { dedupeKey: pendingKind });

    const onChange = (event: Event) => {
      const choice = (event as CustomEvent<ConsentChoice>).detail;
      if (choice === "granted") loadAdTags(config);
    };
    const onOpen = () => setOpen(true);
    window.addEventListener(CONSENT_CHANGE_EVENT, onChange);
    window.addEventListener(CONSENT_OPEN_EVENT, onOpen);
    return () => {
      window.removeEventListener(CONSENT_CHANGE_EVENT, onChange);
      window.removeEventListener(CONSENT_OPEN_EVENT, onOpen);
    };
    // `config` is derived from build-time constants; it never changes.
  }, [enabled, excluded]);

  if (!enabled || excluded || !open) return null;

  function choose(choice: ConsentChoice) {
    const previous = readConsent();
    writeConsent(choice);
    setOpen(false);
    if (choice === "denied" && previous === "granted") {
      // Scripts already running can't be unloaded; a reload is the only way
      // to make the withdrawal real on this page view too.
      revokeAdTags();
      window.location.reload();
    }
  }

  return (
    <div className="ads-consent" role="dialog" aria-modal="false" aria-labelledby="ads-consent-title">
      <p id="ads-consent-title" className="ads-consent-title">
        ¿Nos dejas medir de qué anuncio vienes?
      </p>
      <p className="ads-consent-text">
        Con tu permiso usamos cookies de Google y LinkedIn para saber qué anuncios traen registros y
        para mostrar GenScore a quien ya nos visitó. Sin tu permiso no se carga ninguna. El resto del
        sitio funciona igual decidas lo que decidas.{" "}
        <Link href="/cookies">Más información</Link>
      </p>
      <div className="ads-consent-actions">
        <button type="button" className="ads-consent-btn" onClick={() => choose("denied")}>
          Rechazar
        </button>
        <button type="button" className="ads-consent-btn" onClick={() => choose("granted")}>
          Aceptar
        </button>
      </div>
    </div>
  );
}
