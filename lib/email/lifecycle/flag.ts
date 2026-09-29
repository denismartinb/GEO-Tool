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
