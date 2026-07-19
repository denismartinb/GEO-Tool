import { createClient } from "@/lib/supabase/server";
import { sendWelcomeEmail } from "@/lib/email/transactional";
import { NextResponse } from "next/server";

const AUTH_CALLBACK_ERROR = "No se pudo completar el inicio de sesión. Inténtalo de nuevo.";

// signup() (app/signup/actions.ts) sends the welcome email itself right after
// a password signup, but only when Supabase returns a session immediately
// (email confirmation off). Two other cases land here instead, and this is
// the only place that can catch them: an OAuth signup (Google) never goes
// through that action at all, and a password signup with "Confirm email" ON
// gets no session until the user clicks the confirmation link — that click
// is this route's first real request for them. Supabase gives no explicit
// "this was just created" flag on the exchange result, so a new account is
// inferred from last_sign_in_at landing within this window of created_at; an
// existing user signing back in (or re-confirming) has a created_at from the
// past, so this never re-fires for them.
const NEW_USER_WINDOW_MS = 5000;

function safeLoginError(url: URL) {
  return NextResponse.redirect(
    new URL(`/login?error=${encodeURIComponent(AUTH_CALLBACK_ERROR)}`, url.origin)
  );
}

function isFreshSignup(user: { created_at?: string; last_sign_in_at?: string | null }): boolean {
  if (!user.created_at || !user.last_sign_in_at) return false;
  const createdAt = new Date(user.created_at).getTime();
  const lastSignInAt = new Date(user.last_sign_in_at).getTime();
  if (!Number.isFinite(createdAt) || !Number.isFinite(lastSignInAt)) return false;
  return Math.abs(lastSignInAt - createdAt) < NEW_USER_WINDOW_MS;
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
  }

  return NextResponse.redirect(new URL(next, url.origin));
}
