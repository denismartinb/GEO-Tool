"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { sendWelcomeEmail } from "@/lib/email/transactional";
import { sendNewSignupOpsAlert } from "@/lib/admin/signup-alert";

const EMAIL_RATE_LIMIT_ERROR =
  "Se han enviado demasiados emails de confirmación en poco tiempo. Espera unos minutos e inténtalo de nuevo.";
const PASSWORD_MISMATCH_ERROR = "Las contraseñas no coinciden.";

const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  confirmPassword: z.string().min(8)
});

export async function signup(formData: FormData) {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  const parsed = signupSchema.safeParse({ email, password, confirmPassword });
  if (!parsed.success) {
    redirect(`/signup?error=${encodeURIComponent("Revisa los datos introducidos.")}`);
  }
  if (parsed.data.password !== parsed.data.confirmPassword) {
    redirect(`/signup?error=${encodeURIComponent(PASSWORD_MISMATCH_ERROR)}`);
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL
    ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
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
    redirect(`/signup/confirm?email=${encodeURIComponent(parsed.data.email)}`);
  }

  await sendWelcomeEmail(parsed.data.email);
  if (data.user) {
    await sendNewSignupOpsAlert(supabase, { id: data.user.id, email: parsed.data.email, created_at: data.user.created_at }, "password");
  }

  redirect("/dashboard");
}
