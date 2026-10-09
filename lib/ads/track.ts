/**
 * PAID-ADS-1: conversion events for Google Ads and LinkedIn.
 *
 * Contract: nothing reaches an ad platform unless the visitor accepted
 * advertising cookies. A conversion that happens while the banner is still
 * unanswered is held in memory and sent if — and only if — they accept on this
 * same page view; a "Rechazar" (or leaving) drops it. It is never persisted.
 *
 * Each kind fires at most once per browser tab session (`dedupeKey`), so a
 * reload of `/signup/confirm` or of the billing success URL does not count the
 * same sign-up or purchase twice.
 */
import { adsEnabled, readAdsConfig, type AdsConfig, type ConversionKind } from "@/lib/ads/config";
import { CONSENT_CHANGE_EVENT, readConsent, type ConsentChoice } from "@/lib/ads/consent";

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
export function buildConversionCalls(config: AdsConfig, kind: ConversionKind, value?: number) {
  const calls: Array<{ platform: "google"; sendTo: string; params: Record<string, unknown> } | { platform: "linkedin"; conversionId: number }> = [];
  const label = config.googleLabels[kind];
  if (config.googleAdsId && label) {
    calls.push({
      platform: "google",
      sendTo: `${config.googleAdsId}/${label}`,
      params: typeof value === "number" ? { value, currency: "EUR" } : {}
    });
  }
  const liConversion = config.linkedinConversions[kind];
  if (config.linkedinPartnerId && liConversion && /^\d+$/.test(liConversion)) {
    calls.push({ platform: "linkedin", conversionId: Number(liConversion) });
  }
  return calls;
}

function send(config: AdsConfig, conversion: PendingConversion): void {
  const w = window as AdsWindow;
  for (const call of buildConversionCalls(config, conversion.kind, conversion.value)) {
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
    const choice = (event as CustomEvent<ConsentChoice>).detail;
    const queued = pending.splice(0, pending.length);
    if (choice !== "granted") return;
    for (const conversion of queued) send(config, conversion);
  });
}

export function trackConversion(kind: ConversionKind, options: TrackOptions = {}): void {
  if (typeof window === "undefined") return;
  const config = readAdsConfig();
  if (!adsEnabled(config)) return;

  const consent = readConsent();
  if (consent === "denied") return;
  if (!claimDedupe(options.dedupeKey)) return;

  const conversion: PendingConversion = { kind, value: options.value };
  if (consent === "granted") {
    send(config, conversion);
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
