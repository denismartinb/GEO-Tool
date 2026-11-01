"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const Schema = z.string().uuid();

/**
 * MCP-SERVER-1 (log §418): «Desconectar» an app (Claude, ChatGPT…) that the
 * user let read GenScore through OAuth. Supabase revokes the grant, deletes
 * its sessions and invalidates its refresh tokens; the revoke is scoped to
 * the signed-in user by Supabase itself (cookie client, never service role).
 */
export async function revokeConnectedApp(clientId: string): Promise<{ success: boolean }> {
  const parsed = Schema.safeParse(clientId);
  if (!parsed.success) return { success: false };
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return { success: false };
  const { error } = await supabase.auth.oauth.revokeGrant({ clientId: parsed.data }).catch(() => ({ error: true }));
  if (error) return { success: false };
  revalidatePath("/dashboard/settings");
  return { success: true };
}
