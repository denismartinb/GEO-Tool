"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { PLANS } from "@/app/pricing/plans-data";

const planIdSchema = z.enum(PLANS.map((plan) => plan.id) as [string, ...string[]]);

export type ChangePlanResult = { success: true } | { success: false; error: string };

export async function changePlan(planId: string): Promise<ChangePlanResult> {
  const parsed = planIdSchema.safeParse(planId);
  if (!parsed.success) {
    return { success: false, error: "Plan no válido." };
  }

  const { supabase, user } = await requireUser();

  const { error } = await supabase.from("profiles").update({ current_plan: parsed.data }).eq("id", user.id);

  if (error) {
    return { success: false, error: "No se pudo guardar el cambio de plan. Inténtalo de nuevo." };
  }

  revalidatePath("/dashboard/settings/billing");
  revalidatePath("/dashboard/billing");
  return { success: true };
}
