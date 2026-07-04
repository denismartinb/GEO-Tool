import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

const CALLBACK_ERROR_MESSAGE = "No se pudo completar el inicio de sesión. Inténtalo de nuevo.";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? "/dashboard";
  // OAuth providers (e.g. Apple) redirect back with an `error` param when the
  // user cancels or the provider rejects the request. Handle it gracefully
  // instead of silently sending an unauthenticated user to /dashboard.
  const providerError = url.searchParams.get("error");

  if (providerError) {
    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(CALLBACK_ERROR_MESSAGE)}`, url.origin)
    );
  }

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      return NextResponse.redirect(
        new URL(`/login?error=${encodeURIComponent(CALLBACK_ERROR_MESSAGE)}`, url.origin)
      );
    }
  }

  return NextResponse.redirect(new URL(next, url.origin));
}
