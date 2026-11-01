"use server";

import { updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { requireOperator } from "@/lib/admin/operator";
import { PANEL_CACHE_TAG } from "@/lib/admin/kpi/posthog";
import { parsePanelPeriod } from "@/lib/admin/kpi/period";

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
