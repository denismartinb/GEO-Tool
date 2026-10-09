/**
 * PAID-ADS-1: conversion events for Google Ads and LinkedIn.
 *
 * Contract: nothing reaches an ad platform unless the visitor accepted the
 * measurement purpose. LinkedIn additionally needs remarketing, because its
 * tag only loads under that purpose (`lib/ads/tags.ts`). A conversion that
 * happens while the banner is still unanswered is held in memory and sent if —
 * and only if — they accept measurement on this same page view; anything else
 * (or leaving) drops it. It is never persisted.
 *
 * Each kind fires at most once per browser tab session (`dedupeKey`), so a
 * reload of `/signup/confirm` or of the billing success URL does not count the
 * same sign-up or purchase twice.
 */
import { adsEnabled, readAdsConfig, type AdsConfig, type ConversionKind } from "@/lib/ads/config";
import { CONSENT_CHANGE_EVENT, readConsent, type AdsConsentState } from "@/lib/ads/consent";

type AdsWindow = Window & {
  dataLayer?: unknown[];
  gtag?: (...args: unknown[]) => void;
  lintrk?: ((action: string, data: Record<string, unknown>) => void) & { q?: unknown[] };
};

type PendingConversion = { kind: ConversionKind; value?: number };

const pending: PendingConversion[] = [];
let listening = false;

const DEDUPE_PREFIX = "gs_conv_";

export type TrackOptions = { value?: number; dedupeKey?: string };

/** Pure: what each platform should receive for one conversion. */
export function buildConversionCalls(
  config: AdsConfig,
  consent: AdsConsentState,
  kind: ConversionKind,
  value?: number
) {
  const calls: Array<{ platform: "google"; sendTo: string; params: Record<string, unknown> } | { platform: "linkedin"; conversionId: number }> = [];
  if (!consent.measurement) return calls;
  const label = config.googleLabels[kind];
  if (config.googleAdsId && label) {
    calls.push({
      platform: "google",
      sendTo: `${config.googleAdsId}/${label}`,
      params: typeof value === "number" ? { value, currency: "EUR" } : {}
    });
  }
  const liConversion = config.linkedinConversions[kind];
  if (consent.remarketing && config.linkedinPartnerId && liConversion && /^\d+$/.test(liConversion)) {
    calls.push({ platform: "linkedin", conversionId: Number(liConversion) });
  }
  return calls;
}

function send(config: AdsConfig, consent: AdsConsentState, conversion: PendingConversion): void {
  const w = window as AdsWindow;
  for (const call of buildConversionCalls(config, consent, conversion.kind, conversion.value)) {
    if (call.platform === "google") {
      // `gtag` is a dataLayer push stub (components/ads/ad-tags.tsx) — safe to
      // call before gtag.js has finished downloading.
      w.gtag?.("event", "conversion", { send_to: call.sendTo, ...call.params });
    } else {
      w.lintrk?.("track", { conversion_id: call.conversionId });
    }
  }
}

function claimDedupe(key: string | undefined): boolean {
  if (!key) return true;
  try {
    const storageKey = `${DEDUPE_PREFIX}${key}`;
    if (window.sessionStorage.getItem(storageKey)) return false;
    window.sessionStorage.setItem(storageKey, "1");
  } catch {
    // Storage blocked: better to risk a duplicate than to lose the event.
  }
  return true;
}

function ensureListener(config: AdsConfig): void {
  if (listening) return;
  listening = true;
  window.addEventListener(CONSENT_CHANGE_EVENT, (event) => {
    const consent = (event as CustomEvent<AdsConsentState>).detail;
    const queued = pending.splice(0, pending.length);
    if (!consent.measurement) return;
    for (const conversion of queued) send(config, consent, conversion);
  });
}

export function trackConversion(kind: ConversionKind, options: TrackOptions = {}): void {
  if (typeof window === "undefined") return;
  const config = readAdsConfig();
  if (!adsEnabled(config)) return;

  const consent = readConsent();
  if (consent && !consent.measurement) return;
  if (!claimDedupe(options.dedupeKey)) return;

  const conversion: PendingConversion = { kind, value: options.value };
  if (consent) {
    send(config, consent, conversion);
    return;
  }
  ensureListener(config);
  pending.push(conversion);
}

/** Test-only: reset module state between cases. */
export function __resetTrackingForTests(): void {
  pending.splice(0, pending.length);
  listening = false;
}
