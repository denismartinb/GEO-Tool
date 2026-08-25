import "server-only";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * ONBOARDING-TOUR-PERSIST-1 — sólo consumidor: `onboarding-tour.spec.ts`
 * (el `ux-pilot`), que necesita poder forzar "no visto" en la cuenta piloto
 * antes de cada pasada, igual que antes borraba la marca de `localStorage`.
 *
 * Owner-scoped por la propia sesión — no hay `service-role`, no hay
 * `projectId` que comprobar. Cualquier cuenta puede resetear su propia marca;
 * no hay nada que proteger de más ahí (el peor caso es volver a ver un popup
 * de bienvenida), así que no lleva ninguna comprobación extra de "sólo el
 * piloto puede llamar esto".
 */
export async function POST() {
  const supabase = await createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  await supabase.from("profiles").update({ onboarding_tour_seen_at: null }).eq("id", user.id);

  return NextResponse.json({ ok: true });
}
