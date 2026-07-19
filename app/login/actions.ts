"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const EMAIL_NOT_CONFIRMED_ERROR =
  "Tu email todavía no está confirmado. Revisa tu bandeja de entrada y haz clic en el enlace que te enviamos.";

export async function login(formData: FormData) {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    const message = error.code === "email_not_confirmed" ? EMAIL_NOT_CONFIRMED_ERROR : error.message;
    redirect(`/login?error=${encodeURIComponent(message)}`);
  }

  redirect("/dashboard");
}

const GOOGLE_OAUTH_ERROR = "No se pudo iniciar sesión con Google. Inténtalo de nuevo.";

// supabase-js builds this URL client-side without checking whether the
// provider is actually enabled — that check only happens when something
// visits it. Following it with a real request (redirect: "manual" so we see
// the 3xx instead of Supabase's Google page) lets us catch a disabled/
// misconfigured provider here and show our own safe message, instead of
// sending the user's browser straight to Supabase's raw JSON error.
async function isOAuthRedirectReady(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, { redirect: "manual" });
    return response.status >= 300 && response.status < 400;
  } catch {
    return false;
  }
}

export async function signInWithGoogle(formData: FormData) {
  const from = formData.get("from") === "signup" ? "/signup" : "/login";
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL
    ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${siteUrl}/auth/callback` }
  });

  if (error || !data.url || !(await isOAuthRedirectReady(data.url))) {
    redirect(`${from}?error=${encodeURIComponent(GOOGLE_OAUTH_ERROR)}`);
  }

  redirect(data.url);
}
