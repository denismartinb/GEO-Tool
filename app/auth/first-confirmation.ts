import type { SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { sendWelcomeEmail } from "@/lib/email/transactional";
import { sendNewSignupOpsAlert } from "@/lib/admin/signup-alert";
import { captureFunnelEvent } from "@/lib/analytics/funnel-events";
import { parseConsentCookie } from "@/lib/ads/consent";
import { PENDING_CONVERSION_COOKIE } from "@/lib/ads/pending-conversion";

// Shared by the two routes a confirmation can land on: /auth/callback (OAuth,
// and the old PKCE email link) and /auth/confirm (the token_hash email link,
// CONFIRM-CROSS-DEVICE-1). Whatever has to happen exactly once, on the
// request that first confirms an account, lives here so neither route can
// drift from the other — a confirmation that skipped this lost the welcome
// email, the operator's new-signup alert and the `signup_completed` event.

export const AUTH_CALLBACK_ERROR = "No se pudo completar el inicio de sesión. Inténtalo de nuevo.";

// Supabase gives no explicit "this was just created" flag on the exchange
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

type ConfirmedUser = {
  id: string;
  email?: string | null;
  created_at: string;
  last_sign_in_at?: string | null;
  email_confirmed_at?: string | null;
  app_metadata?: { provider?: string } | null;
};

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

/** Only same-origin paths: `//evil.com` or an absolute URL would leave the site. */
export function safeNextPath(next: string | null): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) {
    return "/dashboard";
  }
  return next;
}

export function safeLoginError(url: URL) {
  return NextResponse.redirect(
    new URL(`/login?error=${encodeURIComponent(AUTH_CALLBACK_ERROR)}`, url.origin)
  );
}

/**
 * Runs the first-confirmation side effects when `user` was confirmed by this
 * very request, then builds the redirect to `next`.
 */
export async function completeConfirmation(
  supabase: SupabaseClient,
  user: ConfirmedUser | null | undefined,
  request: Request,
  url: URL,
  next: string
): Promise<NextResponse> {
  let countGoogleSignup = false;
  if (user?.email && isFreshSignup(user)) {
    await sendWelcomeEmail(user.email);
    const method = user.app_metadata?.provider === "google" ? "google" : "password";
    await sendNewSignupOpsAlert(
      supabase,
      { id: user.id, email: user.email, created_at: user.created_at },
      method
    );
    await captureFunnelEvent("signup_completed", user.id, { method });
    // PAID-ADS-1: a password sign-up is counted on /signup/confirm; a Google
    // one never sees that page, so it is flagged here for the next page to
    // count — and only when the visitor already accepted ad cookies, which
    // this request can read because the consent cookie is first-party.
    countGoogleSignup =
      method === "google" && parseConsentCookie(request.headers.get("cookie") ?? "")?.measurement === true;
  }

  const response = NextResponse.redirect(new URL(safeNextPath(next), url.origin));
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
