import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { safeNextPath } from "@/lib/safe-next-path";
import { redirectAfterSession } from "@/lib/auth-first-session";

const AUTH_CALLBACK_ERROR = "No se pudo completar el inicio de sesión. Inténtalo de nuevo.";

// signup() (app/signup/actions.ts) sends the welcome email itself right after
// a password signup, but only when Supabase returns a session immediately
// (email confirmation off). Two other cases land here instead: an OAuth
// signup (Google) never goes through that action at all, and a password
// signup with "Confirm email" ON gets no session until the user clicks the
// confirmation link. That link only works here in the browser that signed up
// (PKCE keeps its verifier in a cookie); `/auth/confirm` is the route that
// works from any device (log §359). What a first session sets off lives in
// `lib/auth-first-session.ts`, shared by both.

function safeLoginError(url: URL) {
  return NextResponse.redirect(
    new URL(`/login?error=${encodeURIComponent(AUTH_CALLBACK_ERROR)}`, url.origin)
  );
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const providerError = url.searchParams.get("error_description") ?? url.searchParams.get("error");
  // Only a path on this site: `new URL("//evil.com", origin)` would leave it.
  const next = safeNextPath(url.searchParams.get("next")) ?? "/dashboard";

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

  return redirectAfterSession(supabase, data.user, request, url, next);
}
