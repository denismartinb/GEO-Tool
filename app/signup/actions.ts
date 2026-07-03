"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PLANS } from "@/app/pricing/plans-data";

const SELF_SERVE_PLAN_IDS = PLANS.filter((p) => p.id !== "agency").map((p) => p.id);

export async function signup(formData: FormData) {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  const requestedPlan = String(formData.get("plan") ?? "");
  // Server-trusted validation, not just trusting the hidden field — the
  // profiles.current_plan check constraint would reject anything else
  // anyway (0011_signup_plan_from_metadata.sql), but failing here keeps the
  // error on the signup form instead of a generic auth error.
  const plan = SELF_SERVE_PLAN_IDS.includes(requestedPlan as (typeof SELF_SERVE_PLAN_IDS)[number])
    ? requestedPlan
    : undefined;

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: plan ? { data: { plan } } : undefined
  });

  if (error) {
    redirect(`/signup?error=${encodeURIComponent(error.message)}`);
  }

  // Profiles are created by the database trigger in 0003_v0_profile_trigger.sql.

  redirect("/dashboard");
}
