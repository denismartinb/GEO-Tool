"use server";

import { updateTag } from "next/cache";
import { redirect } from "next/navigation";
import { requireOperator } from "@/lib/admin/operator";
import { PANEL_CACHE_TAG } from "@/lib/admin/kpi/posthog";
import { parsePanelPeriod } from "@/lib/admin/kpi/period";

/**
 * ADMIN-PANEL-1 — «Actualizar». Drops the panel's cached PostHog reads so the
 * next render asks PostHog again. Writes nothing to the database: it only
 * clears this panel's own cache entry. Gated like every /admin action.
 */
export async function refreshAdminPanel(formData: FormData): Promise<void> {
  await requireOperator("/admin/panel");
  updateTag(PANEL_CACHE_TAG);
  const period = parsePanelPeriod(formData.get("periodo"));
  redirect(`/admin/panel?periodo=${period}`);
}
