"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { sendWelcomeEmail } from "@/lib/email/transactional";

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
    redirect(`/signup?error=${encodeURIComponent(error.message)}`);
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
