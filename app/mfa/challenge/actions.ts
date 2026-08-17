"use server";

import { redirect } from "next/navigation";
import { requireOperatorCandidate } from "@/lib/admin/operator";
import { safeAdminNext } from "@/lib/admin/safe-next";

const CODE_ERROR = "Código incorrecto o caducado. Inténtalo de nuevo.";

export async function verifyChallenge(formData: FormData) {
  const { supabase } = await requireOperatorCandidate();
  const factorId = String(formData.get("factorId") ?? "");
  const code = String(formData.get("code") ?? "").trim();
  const next = safeAdminNext(String(formData.get("next") ?? ""));

  if (!factorId || !code) {
    redirect(`/mfa/challenge?next=${encodeURIComponent(next)}&error=${encodeURIComponent(CODE_ERROR)}`);
  }

  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
  if (error) {
    console.error("[geo:admin:mfa] challenge verification failed", { message: error.message });
    redirect(`/mfa/challenge?next=${encodeURIComponent(next)}&error=${encodeURIComponent(CODE_ERROR)}`);
  }

  redirect(next);
}
