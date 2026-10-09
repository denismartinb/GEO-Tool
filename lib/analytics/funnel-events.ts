import "server-only";

import { createHash } from "node:crypto";

/**
 * FUNNEL-EVENTS-1 — the four steps between a visitor and a paying customer,
 * captured server-side in PostHog.
 *
 * Server-side on purpose. The browser SDK runs cookieless
 * (`persistence: "memory"`, `components/posthog-provider.tsx`), so every page
 * load is a new anonymous id and a funnel built from browser events could
 * never join "signed up" to "paid". Here the `distinct_id` is the Supabase
 * user id, which is the same at every step and is not personal data on its
 * own. No email, name or domain is ever sent.
 *
 * Analytics is the most optional thing in any of these code paths, so this
 * never throws, has a short hard timeout and makes one attempt: a lost event
 * is acceptable, a signup or a payment webhook slowed or failed by analytics
 * is not. Off when `NEXT_PUBLIC_POSTHOG_KEY` is unset (local dev, tests).
 */

export type FunnelEvent =
  | "signup_submitted"
  | "signup_completed"
  | "scan_completed"
  | "checkout_started"
  | "payment_completed";

const CAPTURE_TIMEOUT_MS = 2_000;

export async function captureFunnelEvent(
  event: FunnelEvent,
  distinctId: string,
  properties: Record<string, string | number | boolean | null> = {},
  dedupeKey?: string
): Promise<void> {
  const apiKey = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!apiKey || !distinctId) return;

  const host = (process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://eu.i.posthog.com").trim().replace(/\/+$/, "");

  try {
    const response = await fetch(`${host}/capture/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: apiKey,
        event,
        distinct_id: distinctId,
        // `$geoip_disable`: the request comes from Vercel, so PostHog would
        // otherwise stamp the server's region (Dublin) on the person as their
        // location and skew every per-country breakdown.
        properties: { ...properties, source: "server", $geoip_disable: true },
        timestamp: new Date().toISOString(),
        // PostHog drops a second event with the same uuid, so a retried
        // webhook does not count one payment twice.
        ...(dedupeKey ? { uuid: uuidFromKey(`${event}:${dedupeKey}`) } : {})
      }),
      signal: AbortSignal.timeout(CAPTURE_TIMEOUT_MS)
    });
    if (!response.ok) {
      console.error("[geo:analytics] funnel event rejected", { event, status: response.status });
    }
  } catch (error) {
    console.error("[geo:analytics] funnel event not delivered", {
      event,
      message: error instanceof Error ? error.name : "unknown"
    });
  }
}

/** Deterministic RFC 4122-shaped id (version 5 bits) from an arbitrary key. */
export function uuidFromKey(key: string): string {
  const hex = createHash("sha1").update(key).digest("hex").slice(0, 32).split("");
  hex[12] = "5";
  hex[16] = ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  const h = hex.join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20, 32)}`;
}
