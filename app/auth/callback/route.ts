import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

const AUTH_CALLBACK_ERROR = "No se pudo completar el inicio de sesión. Inténtalo de nuevo.";

function safeLoginError(url: URL) {
  return NextResponse.redirect(
    new URL(`/login?error=${encodeURIComponent(AUTH_CALLBACK_ERROR)}`, url.origin)
  );
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
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    console.error("[geo:auth-callback] exchange_failed", { message: error.message });
    return safeLoginError(url);
  }

  return NextResponse.redirect(new URL(next, url.origin));
}
