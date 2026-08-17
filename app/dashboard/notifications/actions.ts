"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { createServiceClient } from "@/lib/supabase/service";
import { NOTIFICATIONS_PAGE_LIMIT } from "@/lib/notifications/types";

export type MarkNotificationsReadResult = { success: boolean };

const idsSchema = z.array(z.string().uuid()).min(1).max(NOTIFICATIONS_PAGE_LIMIT);

/**
 * Marks the notifications the user has actually seen as read (NOTIF-AUTOREAD-1).
 *
 * Scoped to an explicit id list, never "everything unread": the bell renders at
 * most NOTIFICATIONS_BELL_LIMIT rows and the page NOTIFICATIONS_PAGE_LIMIT, so
 * a blanket update would silently clear notifications that were never on
 * screen. What the user saw is what gets marked.
 *
 * Uses the service-role client because `notifications` has no UPDATE policy for
 * `authenticated` (migration 0021, NOTIF-SERVER-1a) — every write goes through
 * trusted server code instead. `owner_user_id` is still re-verified explicitly
 * in the WHERE clause; this is not optional just because the client bypasses
 * RLS, and it is what stops a forged id list from touching another account.
 */
export async function markNotificationsRead(ids: string[]): Promise<MarkNotificationsReadResult> {
  const parsed = idsSchema.safeParse(ids);
  if (!parsed.success) {
    return { success: false };
  }

  const { user } = await requireUser();
  const service = createServiceClient();

  const { error } = await service
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("owner_user_id", user.id)
    .in("id", parsed.data)
    .is("read_at", null);

  if (error) {
    return { success: false };
  }

  revalidatePath("/dashboard", "layout");
  return { success: true };
}
