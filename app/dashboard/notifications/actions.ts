"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/service";

export type MarkAllNotificationsReadResult = { success: boolean };

/**
 * Marks every unread notification as read for the current user. Uses the
 * service-role client because `notifications` has no UPDATE policy for
 * `authenticated` (migration 0021, NOTIF-SERVER-1a) — every write goes
 * through trusted server code instead. `owner_user_id` is still re-verified
 * explicitly in the WHERE clause; this is not optional just because the
 * client bypasses RLS.
 */
export async function markAllNotificationsRead(): Promise<MarkAllNotificationsReadResult> {
  const { user } = await requireUser();
  const service = createServiceClient();

  const { error } = await service
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("owner_user_id", user.id)
    .is("read_at", null);

  if (error) {
    return { success: false };
  }

  revalidatePath("/dashboard", "layout");
  return { success: true };
}
