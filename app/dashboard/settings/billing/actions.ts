"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { PLANS } from "@/app/pricing/plans-data";

const planIdSchema = z.enum(PLANS.map((plan) => plan.id) as [string, ...string[]]);
const archiveIdsSchema = z.array(z.string().uuid()).max(50);

export type ChangePlanResult = { success: true } | { success: false; error: string };

/**
 * Changes the account's plan. If `archiveProjectIds` is given (downgrade
 * flow, when the account has more active domains than the target plan
 * allows), those domains are archived — never hard-deleted, reversible via
 * restoreProject — before the plan itself changes, so an account is never
 * left over its new plan's domain cap. If archiving succeeds but the plan
 * update then fails, the domains stay archived (reversible) and the plan
 * stays as it was; the user can just retry.
 */
export async function changePlan(planId: string, archiveProjectIds: string[] = []): Promise<ChangePlanResult> {
  const parsedPlan = planIdSchema.safeParse(planId);
  if (!parsedPlan.success) {
    return { success: false, error: "Plan no válido." };
  }

  const parsedArchiveIds = archiveIdsSchema.safeParse(archiveProjectIds);
  if (!parsedArchiveIds.success) {
    return { success: false, error: "No se pudo guardar el cambio de plan. Inténtalo de nuevo." };
  }

  const { supabase, user } = await requireUser();
  const targetPlan = PLANS.find((p) => p.id === parsedPlan.data)!;

  if (parsedArchiveIds.data.length > 0) {
    const { error: archiveError, count: archivedCount } = await supabase
      .from("projects")
      .update({ is_archived: true }, { count: "exact" })
      .in("id", parsedArchiveIds.data)
      .eq("owner_user_id", user.id)
      .eq("is_archived", false);

    if (archiveError || archivedCount !== parsedArchiveIds.data.length) {
      return { success: false, error: "No se pudieron archivar los dominios seleccionados. Inténtalo de nuevo." };
    }

    revalidatePath("/dashboard", "layout");
    revalidatePath("/dashboard/projects");
  }

  // Defense in depth: re-check server-side that the account is actually
  // within the target plan's domain cap now, regardless of what the client
  // sent — never trust the UI's own count.
  const { count: activeProjectCount, error: countError } = await supabase
    .from("projects")
    .select("id", { count: "exact", head: true })
    .eq("owner_user_id", user.id)
    .eq("is_archived", false);

  if (countError || (activeProjectCount ?? 0) > targetPlan.caps.projects) {
    return {
      success: false,
      error: `Todavía tienes más dominios activos de los que permite ${targetPlan.name}. Archiva alguno más para continuar.`
    };
  }

  const { error } = await supabase.from("profiles").update({ current_plan: parsedPlan.data }).eq("id", user.id);

  if (error) {
    return { success: false, error: "No se pudo guardar el cambio de plan. Inténtalo de nuevo." };
  }

  revalidatePath("/dashboard/settings/billing");
  revalidatePath("/dashboard/billing");
  return { success: true };
}
