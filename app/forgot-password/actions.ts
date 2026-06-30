"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const emailSchema = z.string().email();
const codeSchema = z.string().length(6).regex(/^\d{6}$/);
const passwordSchema = z.string().min(8);

export async function sendOtpAction(email: string): Promise<{ error?: string }> {
  const parsed = emailSchema.safeParse(email);
  if (!parsed.success) return { error: "Introduce un email válido." };

  const supabase = await createClient();
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL
    ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
  await supabase.auth.signInWithOtp({
    email: parsed.data,
    options: {
      shouldCreateUser: false,
      emailRedirectTo: `${siteUrl}/auth/callback`,
    },
  });

  // Always return success to avoid email enumeration
  return {};
}

export async function verifyOtpAction(
  email: string,
  code: string
): Promise<{ error?: string }> {
  const emailParsed = emailSchema.safeParse(email);
  const codeParsed = codeSchema.safeParse(code);
  if (!emailParsed.success || !codeParsed.success) return { error: "Datos inválidos." };

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({
    email: emailParsed.data,
    token: codeParsed.data,
    type: "email",
  });

  if (error) return { error: "Código inválido o expirado. Inténtalo de nuevo." };
  return {};
}

export async function updatePasswordAction(
  password: string
): Promise<{ error?: string }> {
  const parsed = passwordSchema.safeParse(password);
  if (!parsed.success) return { error: "La contraseña debe tener al menos 8 caracteres." };

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data });

  if (error) return { error: "No se pudo actualizar la contraseña. Inténtalo de nuevo." };

  await supabase.auth.signOut();
  return {};
}
