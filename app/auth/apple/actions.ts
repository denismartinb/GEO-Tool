"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// Only these auth pages may be used as the error-return target. Whitelisting
// prevents the hidden `from` field from being abused as an open redirect.
const ALLOWED_FROM = new Set(["/login", "/signup"]);

const APPLE_ERROR_MESSAGE = "No se pudo iniciar sesión con Apple. Inténtalo de nuevo.";

function getSiteUrl(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000")
  );
}

/**
 * Starts the Apple OAuth flow via Supabase Auth. Supabase builds the provider
 * authorization URL; we redirect the browser to it. Apple sends the user back
 * to `/auth/callback`, which exchanges the code for a session.
 *
 * IMPORTANT: this only works once the Apple provider is configured in the
 * Supabase dashboard (Services ID + signed JWT client secret). See
 * docs/environment-contract.md. Without that config, Supabase returns an
 * error and the user is sent back with a sanitized message.
 */
export async function signInWithApple(formData: FormData) {
  const rawFrom = String(formData.get("from") ?? "/login");
  const from = ALLOWED_FROM.has(rawFrom) ? rawFrom : "/login";

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "apple",
    options: {
      redirectTo: `${getSiteUrl()}/auth/callback`
    }
  });

  if (error || !data?.url) {
    // Never surface the raw provider/Supabase error to the UI.
    redirect(`${from}?error=${encodeURIComponent(APPLE_ERROR_MESSAGE)}`);
  }

  redirect(data.url);
}
