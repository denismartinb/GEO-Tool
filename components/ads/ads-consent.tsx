"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { ADS_EXCLUDED_PATH, adsEnabled, readAdsConfig } from "@/lib/ads/config";
import {
  CONSENT_ALL,
  CONSENT_CHANGE_EVENT,
  CONSENT_NONE,
  CONSENT_OPEN_EVENT,
  isWithdrawal,
  readConsent,
  writeConsent,
  type AdsConsentState
} from "@/lib/ads/consent";
import { loadAdTags, revokeAdTags } from "@/lib/ads/tags";
import { consumePendingConversion } from "@/lib/ads/pending-conversion";
import { trackConversion } from "@/lib/ads/track";

/**
 * PAID-ADS-1: the advertising-cookie banner and the tags it gates.
 *
 * Renders nothing — and loads nothing — until an ad-platform id is configured
 * (`lib/ads/config.ts`). The first layer offers "Rechazar", "Configurar" and
 * "Aceptar todo" with the same weight, as the AEPD requires; closing is not
 * consent, so there is no ✕. "Configurar" opens one switch per purpose
 * (`lib/ads/consent.ts`), both off by default. The banner can be reopened from
 * `/cookies` to change the answer, and then opens straight on the switches,
 * showing the current answer.
 */
export function AdsConsent() {
  const pathname = usePathname() ?? "/";
  const [open, setOpen] = useState(false);
  const [configuring, setConfiguring] = useState(false);
  const [draft, setDraft] = useState<AdsConsentState>(CONSENT_NONE);
  const config = readAdsConfig();
  const enabled = adsEnabled(config);
  const excluded = ADS_EXCLUDED_PATH.test(pathname);

  useEffect(() => {
    if (!enabled || excluded) return;
    const current = readConsent();
    if (current) loadAdTags(config, current);
    else setOpen(true);
    const pendingKind = consumePendingConversion();
    if (pendingKind) trackConversion(pendingKind, { dedupeKey: pendingKind });

    const onChange = (event: Event) => {
      loadAdTags(config, (event as CustomEvent<AdsConsentState>).detail);
    };
    const onOpen = () => {
      setDraft(readConsent() ?? CONSENT_NONE);
      setConfiguring(true);
      setOpen(true);
    };
    window.addEventListener(CONSENT_CHANGE_EVENT, onChange);
    window.addEventListener(CONSENT_OPEN_EVENT, onOpen);
    return () => {
      window.removeEventListener(CONSENT_CHANGE_EVENT, onChange);
      window.removeEventListener(CONSENT_OPEN_EVENT, onOpen);
    };
    // `config` is derived from build-time constants; it never changes.
  }, [enabled, excluded]);

  if (!enabled || excluded || !open) return null;

  function choose(next: AdsConsentState) {
    const previous = readConsent();
    writeConsent(next);
    setOpen(false);
    setConfiguring(false);
    if (isWithdrawal(previous, next)) {
      // Scripts already running can't be unloaded; a reload is the only way
      // to make the withdrawal real on this page view too.
      revokeAdTags();
      window.location.reload();
    }
  }

  return (
    <div className="ads-consent" role="dialog" aria-modal="false" aria-labelledby="ads-consent-title">
      <p id="ads-consent-title" className="ads-consent-title">
        {configuring ? "Elige qué cookies publicitarias aceptas" : "¿Nos dejas usar cookies?"}
      </p>
      {configuring ? (
        <div className="ads-consent-options">
          <label className="ads-consent-option">
            <input
              type="checkbox"
              role="switch"
              checked={draft.measurement}
              onChange={(event) => setDraft({ ...draft, measurement: event.target.checked })}
            />
            <span>
              <strong>Medir de qué anuncio vienes</strong>
              <span className="ads-consent-option-text">
                Google Ads cuenta si llegaste por un anuncio y te registraste o contrataste.
              </span>
            </span>
          </label>
          <label className="ads-consent-option">
            <input
              type="checkbox"
              role="switch"
              checked={draft.remarketing}
              onChange={(event) => setDraft({ ...draft, remarketing: event.target.checked })}
            />
            <span>
              <strong>Mostrarte anuncios de GenScore después</strong>
              <span className="ads-consent-option-text">
                Google y LinkedIn recuerdan tu visita para enseñarte anuncios nuestros más adelante.
              </span>
            </span>
          </label>
          <p className="ads-consent-text">
            <Link href="/cookies">Más información en la política de cookies</Link>
          </p>
        </div>
      ) : (
        <p className="ads-consent-text">
          Con tu permiso, usamos las cookies solo para medir qué anuncios nos traen visitas y para
          mostrarte, si es de tu interés, información sobre GenScore más adelante. Sin tu permiso no
          se carga ninguna. <Link href="/cookies">Más información</Link>
        </p>
      )}
      <div className="ads-consent-actions">
        <button type="button" className="ads-consent-btn" onClick={() => choose(CONSENT_NONE)}>
          Rechazar todo
        </button>
        {configuring ? (
          <button type="button" className="ads-consent-btn" onClick={() => choose(draft)}>
            Guardar mi elección
          </button>
        ) : (
          <button
            type="button"
            className="ads-consent-btn"
            onClick={() => {
              setDraft(CONSENT_NONE);
              setConfiguring(true);
            }}
          >
            Configurar
          </button>
        )}
        <button type="button" className="ads-consent-btn" onClick={() => choose(CONSENT_ALL)}>
          Aceptar todo
        </button>
      </div>
    </div>
  );
}
