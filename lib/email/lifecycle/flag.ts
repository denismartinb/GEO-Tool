import "server-only";

import { isUnsubscribeConfigured } from "@/lib/email/unsubscribe";

/**
 * LIFECYCLE-TRIAL-1 (log §233). The one switch for every email this phase
 * adds, and for the welcome email's promise of a warning before the trial
 * ends. Off by default: the founder turns it on in Vercel once the legal
 * text is validated (log §232) — and it stays off, whatever the variable
 * says, while there is no unsubscribe secret, because a commercial email
 * without a working way out is never sent.
 */
export function isLifecycleEmailEnabled(): boolean {
  return process.env.LIFECYCLE_EMAILS_ENABLED === "true" && isUnsubscribeConfigured();
}

/**
 * FEATURE-EMAILS-1 (log §417). The three feature emails have their own
 * switch on top of the lifecycle one: they ship off and the founder turns
 * them on, after applying migration 0047, by setting
 * `FEATURE_EMAILS_ENABLED=true` in Vercel.
 */
export function isFeatureEmailEnabled(): boolean {
  return isLifecycleEmailEnabled() && process.env.FEATURE_EMAILS_ENABLED === "true";
}
