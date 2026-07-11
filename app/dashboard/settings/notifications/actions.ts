"use server";

import { requireUser } from "@/lib/auth";

export type NotificationPreferenceKey = "notify_score_drop_alert" | "notify_weekly_digest";

export type UpdateNotificationPreferenceResult = { success: true } | { success: false; error: string };

/**
 * Persists one of the two real (server-backed) notification toggles on
 * /dashboard/settings/notifications. The other toggles on that page
 * (competitor movement, new recommendations, scan completed, product news)
 * are deliberately still client-only placeholders (ALERTS-1 Fase 6a scope).
 */
export async function updateNotificationPreference(
  key: NotificationPreferenceKey,
  value: boolean
): Promise<UpdateNotificationPreferenceResult> {
  const { supabase, user } = await requireUser();

  const { error } = await supabase
    .from("profiles")
    .update({ [key]: value })
    .eq("id", user.id);

  if (error) {
    return { success: false, error: "No se pudo guardar la preferencia. Inténtalo de nuevo." };
  }

  return { success: true };
}
