import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { safeNextPath } from "@/lib/safe-next-path";
import { redirectAfterSession } from "@/lib/auth-first-session";

const AUTH_CONFIRM_ERROR =
  "El enlace no es válido o ha caducado. Inicia sesión o pide uno nuevo.";

// SIGNUP-ALERT-PENDING-1 (log §359). The confirmation email links here with
// `token_hash` (template in docs/email-templates/confirm-signup.html), and
// `verifyOtp` needs nothing stored in the browser, so the link works from the
// phone's mail app as well as from the browser that signed up. The PKCE link
// to `/auth/callback` failed in any other browser ("code verifier not
// found"), and with it the welcome email, the operator alert and
// `signup_completed`.
const ALLOWED_TYPES: ReadonlySet<EmailOtpType> = new Set<EmailOtpType>(["signup", "email", "magiclink"]);

function safeLoginError(url: URL) {
  return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(AUTH_CONFIRM_ERROR)}`, url.origin));
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const next = safeNextPath(url.searchParams.get("next")) ?? "/dashboard";

  if (!tokenHash || !type || !ALLOWED_TYPES.has(type)) {
    console.error("[geo:auth-confirm] invalid_link", { hasToken: Boolean(tokenHash), type });
    return safeLoginError(url);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });

  if (error) {
    console.error("[geo:auth-confirm] verify_failed", { message: error.message });
    return safeLoginError(url);
  }

  return redirectAfterSession(supabase, data.user, request, url, next);
}
