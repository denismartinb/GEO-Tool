"use server";

import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/service";
import { isOptionalEmailCategory } from "@/lib/email/categories";
import { setEmailPreferenceAsService, verifyUnsubscribeToken } from "@/lib/email/unsubscribe";

/**
 * EMAIL-UNSUB-1 (log §232). The two buttons of `/baja`: confirm the opt-out
 * and undo it. No session exists here — the person arrived from an email —
 * so identity is the signed `(u, c, t)` from that email's link, re-verified
 * on every call (never trusted from the page that rendered the form).
 */
const inputSchema = z.object({
  userId: z.string().uuid(),
  category: z.string(),
  token: z.string().min(1).max(128)
});

export type EmailPreferenceLinkResult = { success: true } | { success: false; error: string };

const INVALID_LINK = "Este enlace no es válido. Puedes gestionar tus emails desde Ajustes → Notificaciones.";
const WRITE_FAILED = "No hemos podido guardar el cambio. Inténtalo de nuevo en un momento.";

export async function setEmailPreferenceFromLink(
  raw: { userId: string; category: string; token: string },
  enabled: boolean
): Promise<EmailPreferenceLinkResult> {
  const parsed = inputSchema.safeParse(raw);
  if (!parsed.success || !isOptionalEmailCategory(parsed.data.category)) {
    return { success: false, error: INVALID_LINK };
  }

  const { userId, category, token } = parsed.data;
  if (!verifyUnsubscribeToken({ userId, category, token })) {
    return { success: false, error: INVALID_LINK };
  }

  const result = await setEmailPreferenceAsService(createServiceClient(), {
    userId,
    category,
    enabled,
    source: "email_link"
  });

  return result.ok ? { success: true } : { success: false, error: WRITE_FAILED };
}
