import "server-only";

import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import type { createClient } from "@/lib/supabase/server";
import { sendWelcomeEmail } from "@/lib/email/transactional";
import { sendNewSignupOpsAlert } from "@/lib/admin/signup-alert";
import { captureFunnelEvent } from "@/lib/analytics/funnel-events";
import { parseConsentCookie } from "@/lib/ads/consent";
import { PENDING_CONVERSION_COOKIE } from "@/lib/ads/pending-conversion";
import { readRefCookie, referralCodeForNewAccount } from "@/lib/affiliates/codes";

/**
 * What a new account's first real session sets off: welcome email, operator
 * alert, `signup_completed`, the affiliate code of a Google signup and the
 * pending ad conversion. Shared by the two routes that can create that first
 * session: `/auth/callback` (Google, and confirmation links in the PKCE
 * shape) and `/auth/confirm` (confirmation links with `token_hash`,
 * SIGNUP-ALERT-PENDING-1, log §359). Moved here from the callback unchanged.
 */

// Supabase gives no explicit "this was just created" flag on the session
// result. The account's created_at is NOT a usable proxy for "just now" —
// email_confirmed_at only updates once, at the moment the account's email is
// confirmed for the first time (signUp() itself never sets it when
// confirmation is required), and that's exactly the same instant this
// exchange sets last_sign_in_at for the first time. The two landing within
// this window of each other means "this request IS the first confirmation",
// regardless of how long the user took between signing up and clicking the
// link. A returning user's email_confirmed_at is frozen from their original
// confirmation while last_sign_in_at jumps to now on every login, so the two
// drift apart and this never re-fires for them.
const NEW_USER_WINDOW_MS = 5000;

export function isFreshSignup(user: {
  last_sign_in_at?: string | null;
  email_confirmed_at?: string | null;
}): boolean {
  if (!user.last_sign_in_at || !user.email_confirmed_at) return false;
  const lastSignInAt = new Date(user.last_sign_in_at).getTime();
  const emailConfirmedAt = new Date(user.email_confirmed_at).getTime();
  if (!Number.isFinite(lastSignInAt) || !Number.isFinite(emailConfirmedAt)) return false;
  return Math.abs(lastSignInAt - emailConfirmedAt) < NEW_USER_WINDOW_MS;
}

/**
 * AFFILIATES-1 — a Google sign-up never goes through `signup()`, so this is
 * where its affiliate code (`gs_ref`) reaches the account. Only on the
 * account's first session, only if it carries no code yet (a password
 * sign-up already stored one at creation), and never at the cost of the
 * login: any failure is logged and the redirect goes ahead.
 */
async function storeReferralCode(
  supabase: Awaited<ReturnType<typeof createClient>>,
  user: { id: string; user_metadata?: Record<string, unknown> | null },
  cookieHeader: string
): Promise<void> {
  try {
    const code = referralCodeForNewAccount({
      cookieCode: readRefCookie(cookieHeader),
      existing: user.user_metadata?.referral_code
    });
    if (!code) return;
    const { error } = await supabase.auth.updateUser({ data: { referral_code: code } });
    if (error) console.error("[geo:auth-callback] referral_code_not_stored", { userId: user.id, message: error.message });
  } catch (updateError) {
    console.error("[geo:auth-callback] referral_code_not_stored", {
      userId: user.id,
      message: updateError instanceof Error ? updateError.message : String(updateError)
    });
  }
}

/**
 * Runs the first-session side effects when `user` was just created or
 * confirmed, and returns the redirect to `next`.
 */
export async function redirectAfterSession(
  supabase: Awaited<ReturnType<typeof createClient>>,
  user: User | null | undefined,
  request: Request,
  url: URL,
  next: string
): Promise<NextResponse> {
  const cookieHeader = request.headers.get("cookie") ?? "";
  let countGoogleSignup = false;
  if (user && isFreshSignup(user)) {
    await storeReferralCode(supabase, user, cookieHeader);
  }
  if (user?.email && isFreshSignup(user)) {
    await sendWelcomeEmail(user.email);
    const method = user.app_metadata?.provider === "google" ? "google" : "password";
    await sendNewSignupOpsAlert(supabase, { id: user.id, email: user.email, created_at: user.created_at }, method);
    await captureFunnelEvent("signup_completed", user.id, { method });
    // PAID-ADS-1: a password sign-up is counted on /signup/confirm; a Google
    // one never sees that page, so it is flagged here for the next page to
    // count — and only when the visitor already accepted ad cookies, which
    // this request can read because the consent cookie is first-party.
    countGoogleSignup = method === "google" && parseConsentCookie(cookieHeader)?.measurement === true;
  }

  const response = NextResponse.redirect(new URL(next, url.origin));
  if (countGoogleSignup) {
    response.cookies.set(PENDING_CONVERSION_COOKIE, "sign_up", {
      path: "/",
      maxAge: 600,
      sameSite: "lax",
      secure: url.protocol === "https:"
    });
  }
  return response;
}
