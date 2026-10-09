import { createClient } from "@/lib/supabase/server";
import { completeConfirmation, safeLoginError } from "../first-confirmation";

// signup() (app/signup/actions.ts) sends the welcome email itself right after
// a password signup, but only when Supabase returns a session immediately
// (email confirmation off). Two other cases land here instead: an OAuth
// signup (Google) never goes through that action at all, and a password
// signup whose confirmation email still carries the old PKCE link. That link
// only works in the browser that signed up (the code verifier lives in its
// cookies), which is why the email template now points at /auth/confirm
// instead (CONFIRM-CROSS-DEVICE-1). This route stays for OAuth and for
// links sent before the template changed.

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

  return completeConfirmation(supabase, data.user, request, url, next);
}
