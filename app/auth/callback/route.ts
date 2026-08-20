import { createClient } from "@/lib/supabase/server";
import { sendWelcomeEmail } from "@/lib/email/transactional";
import { sendNewSignupOpsAlert } from "@/lib/admin/signup-alert";
import { NextResponse } from "next/server";

const AUTH_CALLBACK_ERROR = "No se pudo completar el inicio de sesión. Inténtalo de nuevo.";

// signup() (app/signup/actions.ts) sends the welcome email itself right after
// a password signup, but only when Supabase returns a session immediately
// (email confirmation off). Two other cases land here instead, and this is
// the only place that can catch them: an OAuth signup (Google) never goes
// through that action at all, and a password signup with "Confirm email" ON
// gets no session until the user clicks the confirmation link — that click
// is this route's first real request for them.
//
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

function safeLoginError(url: URL) {
  return NextResponse.redirect(
    new URL(`/login?error=${encodeURIComponent(AUTH_CALLBACK_ERROR)}`, url.origin)
  );
}

function isFreshSignup(user: {
  last_sign_in_at?: string | null;
  email_confirmed_at?: string | null;
}): boolean {
  if (!user.last_sign_in_at || !user.email_confirmed_at) return false;
  const lastSignInAt = new Date(user.last_sign_in_at).getTime();
  const emailConfirmedAt = new Date(user.email_confirmed_at).getTime();
  if (!Number.isFinite(lastSignInAt) || !Number.isFinite(emailConfirmedAt)) return false;
  return Math.abs(lastSignInAt - emailConfirmedAt) < NEW_USER_WINDOW_MS;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const providerError = url.searchParams.get("error_description") ?? url.searchParams.get("error");
  const next = url.searchParams.get("next") ?? "/dashboard";

  if (providerError) {
    console.error("[geo:auth-callback] provider_error", { providerError });
    return safeLoginError(url);
  }

  if (!code) {
    console.error("[geo:auth-callback] missing_code");
    return safeLoginError(url);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    console.error("[geo:auth-callback] exchange_failed", { message: error.message });
    return safeLoginError(url);
  }

  if (data.user?.email && isFreshSignup(data.user)) {
    await sendWelcomeEmail(data.user.email);
    const method = data.user.app_metadata?.provider === "google" ? "google" : "password";
    await sendNewSignupOpsAlert(
      supabase,
      { id: data.user.id, email: data.user.email, created_at: data.user.created_at },
      method
    );
  }

  return NextResponse.redirect(new URL(next, url.origin));
}
