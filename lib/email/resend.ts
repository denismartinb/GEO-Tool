import "server-only";

import { Resend } from "resend";

let cachedClient: Resend | null = null;

/**
 * Returns null (not a thrown error) when RESEND_API_KEY is unset, so callers
 * can silently no-op instead of crashing — same inert-until-configured
 * pattern as Stripe/Sentry/PostHog (docs/environment-contract.md). The
 * founder hasn't created a Resend account yet as of this PR.
 */
export function getResendClient(): Resend | null {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return null;

  if (!cachedClient) {
    cachedClient = new Resend(apiKey);
  }
  return cachedClient;
}

/** Verified sending address — must match a domain verified in the Resend dashboard once the founder sets one up. */
export function getEmailFromAddress(): string {
  return process.env.RESEND_FROM_EMAIL ?? "GenScore <onboarding@resend.dev>";
}
