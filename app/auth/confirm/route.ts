import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { completeConfirmation, safeLoginError } from "../first-confirmation";

// CONFIRM-CROSS-DEVICE-1. The "Confirm signup" email links here with
// `token_hash` and `type` (Supabase template:
// {{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/dashboard).
// Unlike the PKCE `code` that /auth/callback exchanges, a token hash needs no
// verifier stored in the signing-up browser, so the link works when it is
// opened on another device or in a mail app's own browser — the common case
// of signing up on a laptop and confirming from a phone, which until now
// confirmed the email but skipped the welcome email, the operator alert and
// the `signup_completed` event.

const ALLOWED_TYPES = new Set<EmailOtpType>(["email", "signup"]);

export async function GET(request: Request) {
  const url = new URL(request.url);
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const next = url.searchParams.get("next") ?? "/dashboard";

  if (!tokenHash || !type || !ALLOWED_TYPES.has(type)) {
    console.error("[geo:auth-confirm] missing_or_unsupported_params", { type });
    return safeLoginError(url);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });

  if (error) {
    console.error("[geo:auth-confirm] verify_failed", { message: error.message });
    return safeLoginError(url);
  }

  return completeConfirmation(supabase, data.user, request, url, next);
}
