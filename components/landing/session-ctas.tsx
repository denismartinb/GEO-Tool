"use client";

import Link from "next/link";
import { Icon } from "@/components/ui/icon";
import { showsPromoStrip } from "@/lib/account-chip";
import { useSessionUser } from "@/lib/use-session-user";

/**
 * Three small client islands, one per session-aware fragment of the home
 * page — kept separate rather than one wrapper around the whole page,
 * because `LandingPage` itself is a Server Component
 * (PRELAUNCH-HARDENING-1 Fase V4) and should stay one. Each calls
 * `useSessionUser()` independently; the hook's own module-level cache
 * (`lib/use-session-user.ts`) means that's one shared `/api/me` request per
 * page load, not three, however many of these mount at once — same
 * mechanism `PublicHeader` already relies on.
 */

export function PromoStrip() {
  const user = useSessionUser();
  if (!showsPromoStrip(user?.planId)) return null;
  return <div className="lp-promo">7 días de Pro · Sin tarjeta</div>;
}

/** The "Recomendaciones" section's CTA — GENSCORE-HEADER-3: a logged-in visitor doesn't get offered a signup. */
export function RecommendationsCta() {
  const user = useSessionUser();
  if (user) {
    return (
      <Link href="/dashboard" className="btn btn-primary mt24">
        Ir al panel <Icon name="arrRight" size={15} />
      </Link>
    );
  }
  return (
    <Link href="/signup" className="btn btn-primary mt24">
      Empieza gratis <Icon name="arrRight" size={15} />
    </Link>
  );
}

/**
 * The footer CTA band. GENSCORE-HEADER-3: the cut here is logged-in/anonymous,
 * not paid/unpaid like the promo strip — "Iniciar sesión" serves no logged-in
 * visitor and "Prueba gratis" serves no one who already has an account,
 * including Free. Heading and subtitle change too, not just the buttons.
 */
export function HomeCtaBand() {
  const user = useSessionUser();
  if (user) {
    return (
      <div style={{ position: "relative", zIndex: 2 }}>
        <h2>Continúa donde lo dejaste</h2>
        <p>Vuelve a tu panel para ver cómo va la visibilidad de tus dominios.</p>
        <div className="row">
          <Link href="/dashboard" className="btn btn-white btn-lg">
            Ir al panel <Icon name="arrRight" size={16} />
          </Link>
        </div>
      </div>
    );
  }
  return (
    <div style={{ position: "relative", zIndex: 2 }}>
      <h2>Descubre tu visibilidad en IA hoy</h2>
      <p>Introduce tu dominio y obtén tu primer informe en minutos. Gratis.</p>
      <div className="row">
        <Link className="btn btn-white btn-lg" href="/signup">
          Prueba gratis <Icon name="arrRight" size={16} />
        </Link>
        <Link className="btn btn-onaccent btn-lg" href="/login">
          Iniciar sesión
        </Link>
      </div>
    </div>
  );
}
