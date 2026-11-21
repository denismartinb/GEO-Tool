"use server";

import { updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { requireOperator } from "@/lib/admin/operator";
import { PANEL_CACHE_TAG } from "@/lib/admin/kpi/posthog";
import { parsePanelPeriod } from "@/lib/admin/kpi/period";
import { ANNOUNCEMENT_LABEL, sendAnnouncementBatch, sendAnnouncementTest } from "@/lib/admin/announcement";
import { sendAnnouncementOpsAlertEmail } from "@/lib/email/transactional";

/**
 * ADMIN-EMAIL-1 — «Actualizar» on /admin/crm. Same as the panel's: it only
 * drops the cached Resend read (shared `admin-panel` tag). Writes nothing.
 */
export async function refreshAdminCrm(formData: FormData): Promise<void> {
  await requireOperator("/admin/crm");
  updateTag(PANEL_CACHE_TAG);
  const period = parsePanelPeriod(formData.get("periodo"));
  redirect(`/admin/crm?periodo=${period}`);
}

/**
 * EXT-REACH-1 (log §436): the Chrome extension announcement. Two writes, both
 * approved by Denis on 2026-11-02 («diséñame un correo… informando a toda la
 * base de datos»): a copy to the operator's own inbox, and a batch to the
 * accounts `selectAnnouncementRecipients` allows. Each batch needs the
 * confirmation box and leaves its record by email to OPS_ALERT_EMAIL
 * (`.claude/rules/admin.md`).
 */
export async function sendExtensionAnnouncementTest(): Promise<void> {
  const { user } = await requireOperator("/admin/crm");
  const outcome = user.email ? await sendAnnouncementTest(user.email, user.id) : "not_sent";
  redirect(`/admin/crm?anuncio=${outcome === "sent" ? "prueba-ok" : "prueba-error"}#anuncio`);
}

export async function sendExtensionAnnouncementBatch(formData: FormData): Promise<void> {
  const { user, service } = await requireOperator("/admin/crm");
  if (formData.get("confirmo") !== "si") redirect("/admin/crm?anuncio=sin-confirmar#anuncio");
  const now = new Date();
  const result = await sendAnnouncementBatch(service, now);
  if (result.status !== "ok") redirect(`/admin/crm?anuncio=${result.status === "monday" ? "lunes" : "error"}#anuncio`);
  await sendAnnouncementOpsAlertEmail({
    operatorEmail: user.email ?? user.id,
    announcement: ANNOUNCEMENT_LABEL,
    sent: result.sent,
    failed: result.failed,
    remaining: result.remaining,
    at: now
  });
  redirect(`/admin/crm?anuncio=lote&enviados=${result.sent}&fallidos=${result.failed}#anuncio`);
}
