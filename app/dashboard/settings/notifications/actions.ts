"use server";

import { requireUser } from "@/lib/auth";
import { OPTIONAL_EMAIL_CATEGORIES, PREFERENCE_COLUMN, type EmailPreferenceColumn } from "@/lib/email/categories";

export type NotificationPreferenceKey = EmailPreferenceColumn;

export type UpdateNotificationPreferenceResult = { success: true } | { success: false; error: string };

const KNOWN_COLUMNS = new Set<string>(Object.values(PREFERENCE_COLUMN));

/**
 * Persists one email preference from /dashboard/settings#avisos, through the
 * user's own session (RLS `profiles_update_own`).
 *
 * EMAIL-UNSUB-1 (log §232): four toggles now — the two original alerts plus
 * "primer escaneo listo" and "consejos, novedades y ofertas" — and every
 * change also leaves a row in `email_preference_events`, the same audit trail
 * the email links write. A failed audit row is logged, never surfaced: the
 * preference itself is what the person asked for, and it was saved.
 */
export async function updateNotificationPreference(
  key: NotificationPreferenceKey,
  value: boolean
): Promise<UpdateNotificationPreferenceResult> {
  if (!KNOWN_COLUMNS.has(key) || typeof value !== "boolean") {
    return { success: false, error: "No se pudo guardar la preferencia. Inténtalo de nuevo." };
  }

  const { supabase, user } = await requireUser();

  const { error } = await supabase
    .from("profiles")
    .update({ [key]: value })
    .eq("id", user.id);

  if (error) {
    return { success: false, error: "No se pudo guardar la preferencia. Inténtalo de nuevo." };
  }

  const category = OPTIONAL_EMAIL_CATEGORIES.find((candidate) => PREFERENCE_COLUMN[candidate] === key);
  const { error: eventError } = await supabase.from("email_preference_events").insert({
    owner_user_id: user.id,
    category,
    enabled: value,
    source: "settings"
  });
  if (eventError) {
    console.error("[geo:settings] email preference audit row failed", { category, message: eventError.message });
  }

  return { success: true };
}
