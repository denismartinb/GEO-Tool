import type { SupabaseClient } from "@supabase/supabase-js";

/** One object per user: `<user id>/avatar.jpg` in the private `avatars` bucket (migration 0046). */
export const AVATAR_BUCKET = "avatars";
export const AVATAR_MAX_BYTES = 512 * 1024;
export const AVATAR_MIME = "image/jpeg";

export function avatarObjectPath(userId: string): string {
  return `${userId}/avatar.jpg`;
}

/**
 * Signed URL of the caller's photo, or null. Reads `avatar_path` in its own
 * query, as the other columns that arrive with a hand-applied migration do: a
 * missing column must read as «no photo», never fail the page (and never take
 * the shared layout query down with it).
 */
export async function readAvatarUrl(supabase: SupabaseClient, userId: string): Promise<string | null> {
  const { data, error } = await supabase.from("profiles").select("avatar_path").eq("id", userId).maybeSingle();
  const path = error ? null : (data?.avatar_path as string | null | undefined);
  if (!path) return null;
  const signed = await supabase.storage.from(AVATAR_BUCKET).createSignedUrl(path, 3600);
  return signed.error ? null : signed.data.signedUrl;
}
