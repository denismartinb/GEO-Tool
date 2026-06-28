"use server";

import { z } from "zod";
import { requireUser } from "@/lib/auth";

const nameSchema = z.string().trim().min(1).max(80);
const optionalNameSchema = z.string().trim().max(80);
const newPasswordSchema = z.string().min(8, "La nueva contraseña debe tener al menos 8 caracteres.");

export type UpdateProfileNameResult = { success: true } | { success: false; error: string };

export async function updateProfileName(firstName: string, lastName: string): Promise<UpdateProfileNameResult> {
  const parsedFirst = nameSchema.safeParse(firstName);
  const parsedLast = optionalNameSchema.safeParse(lastName);

  if (!parsedFirst.success) {
    return { success: false, error: "Introduce un nombre válido." };
  }
  if (!parsedLast.success) {
    return { success: false, error: "Los apellidos son demasiado largos." };
  }

  const { supabase } = await requireUser();

  const { error } = await supabase.auth.updateUser({
    data: { first_name: parsedFirst.data, last_name: parsedLast.data }
  });

  if (error) {
    return { success: false, error: "No se pudo guardar el nombre. Inténtalo de nuevo." };
  }

  return { success: true };
}

export type ChangePasswordResult = { success: true } | { success: false; error: string };

export async function changePassword(currentPassword: string, newPassword: string): Promise<ChangePasswordResult> {
  const parsedCurrent = z.string().min(1).safeParse(currentPassword);
  if (!parsedCurrent.success) {
    return { success: false, error: "Introduce tu contraseña actual." };
  }

  const parsedNew = newPasswordSchema.safeParse(newPassword);
  if (!parsedNew.success) {
    return { success: false, error: parsedNew.error.issues[0]?.message ?? "Contraseña no válida." };
  }

  const { supabase, user } = await requireUser();
  const email = user.email;
  if (!email) {
    return { success: false, error: "No se pudo verificar tu cuenta." };
  }

  const { error: verifyError } = await supabase.auth.signInWithPassword({
    email,
    password: parsedCurrent.data
  });

  if (verifyError) {
    return { success: false, error: "La contraseña actual no es correcta." };
  }

  const { error: updateError } = await supabase.auth.updateUser({ password: parsedNew.data });

  if (updateError) {
    return { success: false, error: "No se pudo actualizar la contraseña. Inténtalo de nuevo." };
  }

  return { success: true };
}
