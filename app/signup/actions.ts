"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { sendWelcomeEmail } from "@/lib/email/transactional";

const EMAIL_RATE_LIMIT_ERROR =
  "Se han enviado demasiados emails de confirmación en poco tiempo. Espera unos minutos e inténtalo de nuevo.";

export async function signup(formData: FormData) {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL
    ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: `${siteUrl}/auth/callback` }
  });

  if (error) {
    // Supabase's built-in mailer (no custom SMTP configured) throttles auth
    // emails very aggressively — a handful of signups within the same short
    // window trips this, and the raw message ("email rate limit exceeded")
    // would otherwise leak straight to the UI (docs/environment-contract.md
    // has the custom-SMTP recommendation before enabling "Confirm email").
    const message = error.code === "over_email_send_rate_limit" ? EMAIL_RATE_LIMIT_ERROR : error.message;
    redirect(`/signup?error=${encodeURIComponent(message)}`);
  }

  // Every account starts on a 7-day Pro trial regardless of which /pricing
  // CTA was clicked (0017_reverse_trial.sql's handle_new_user) — there is no
  // per-plan signup choice anymore.
  //
  // With Supabase's "Confirm email" setting ON, signUp() returns no session
  // until the user clicks the confirmation link — sending the welcome email
  // or a /dashboard redirect here would be wrong (no account access yet).
  // app/auth/callback/route.ts sends the welcome email itself once the link
  // is clicked and a real first session exists.
  if (!data.session) {
    redirect(`/signup/confirm?email=${encodeURIComponent(email)}`);
  }

  await sendWelcomeEmail(email);

  redirect("/dashboard");
}
