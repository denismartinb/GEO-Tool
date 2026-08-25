"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

/**
 * ONBOARDING-TOUR-PERSIST-1 — marca el tour de bienvenida como visto para la
 * cuenta que llama. Owner-scoped por la propia sesión (`auth.uid()`, cubierto
 * por la RLS `profiles_update_own`); no hay `projectId` que comprobar.
 *
 * Sin `redirect()` ni resultado que interpretar: es una escritura de
 * disparar-y-olvidar desde `TourProvider`. Si falla, el popup simplemente
 * volverá a salir la próxima vez — el mismo coste ya asumido cuando la marca
 * vivía en `localStorage` (`.claude/rules/onboarding.md`), no motivo para
 * romper la navegación del usuario.
 */
export async function markTourSeen() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase
    .from("profiles")
    .update({ onboarding_tour_seen_at: new Date().toISOString() })
    .eq("id", user.id);
}
