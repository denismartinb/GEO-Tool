"use server";

import { redirect } from "next/navigation";
import { requireOperatorCandidate } from "@/lib/admin/operator";

const CODE_ERROR = "Código incorrecto o caducado. Inténtalo de nuevo.";

/**
 * Confirms possession of the TOTP secret. Supabase's `challengeAndVerify`
 * both validates the code AND elevates the session to `aal2` in the same
 * call — there is no separate "activate" step after this succeeds.
 */
export async function verifyEnrollment(formData: FormData) {
  const { supabase } = await requireOperatorCandidate();
  const factorId = String(formData.get("factorId") ?? "");
  const code = String(formData.get("code") ?? "").trim();

  if (!factorId || !code) {
    redirect(`/mfa/enroll?error=${encodeURIComponent(CODE_ERROR)}`);
  }

  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
  if (error) {
    console.error("[geo:admin:mfa] enrollment verification failed", { message: error.message });
    redirect(`/mfa/enroll?error=${encodeURIComponent(CODE_ERROR)}`);
  }

  redirect("/admin");
}

/**
 * "Perdí el código" escape hatch. `enroll()` only ever returns the QR/secret
 * once, at creation — a wrong code cannot be corrected by re-showing the same
 * one, so the only way forward is discarding the pending (unverified) factor
 * and letting the page's own "no pending factor" branch create a fresh one.
 */
export async function regenerateEnrollment(formData: FormData) {
  const { supabase } = await requireOperatorCandidate();
  const factorId = String(formData.get("factorId") ?? "");

  if (factorId) {
    const { error } = await supabase.auth.mfa.unenroll({ factorId });
    if (error) {
      console.error("[geo:admin:mfa] failed to discard a pending TOTP factor", { message: error.message });
    }
  }

  redirect("/mfa/enroll");
}
