"use client";

import Link from "next/link";
import { Icon } from "@/components/ui/icon";
import { showsPromoStrip } from "@/lib/account-chip";
import { useSessionUser } from "@/lib/use-session-user";
import { HeroDomainField } from "@/components/landing/hero-domain-field";

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

/**
 * Rotación vertical entre dos mensajes ciertos a la vez — el ensayo gratis de
 * siempre y la rebaja de lanzamiento— en vez de acortar uno de los dos para
 * que quepan juntos en una línea. Un solo reloj CSS (`lp-promo-cycle`),
 * mismo mecanismo que la demo del hero: el mensaje B arranca ya medio ciclo
 * dentro con `animation-delay` negativo, así que nunca hay un primer
 * fotograma con los dos superpuestos. `prefers-reduced-motion` dejaba
 * históricamente animaciones así en su fotograma final; aquí no hay
 * "final" — los dos mensajes son ciertos siempre — así que se congela en el
 * primero y el segundo se oculta entero, en vez de mostrar los dos a la vez
 * y romper la línea única del diseño.
 *
 * La rebaja es real y va coordinada con Stripe en otra fase (fundador,
 * 2026-08-25) — no es una cifra decorativa; si el precio, la duración o la
 * fecha de corte cambian, este componente cambia con ellos.
 *
 * Dos plazos distintos, y el mensaje dice los dos: "hasta el 1 de
 * septiembre" es la ventana para darse de alta con la rebaja; "durante 6
 * meses" es cuánto dura el precio de 59€ una vez dado de alta (fundador,
 * 2026-08-25: "habría que decir en el CTA que la promo de pro a 59€ dura 6
 * meses"). Sin el segundo dato, "hasta el 1 de septiembre" se podía leer
 * como que el precio sube ese mismo día para quien ya se dio de alta antes.
 */
export function PromoStrip() {
  const user = useSessionUser();
  if (!showsPromoStrip(user?.planId)) return null;
  return (
    <div className="lp-promo">
      <span className="lp-promo-track">
        <span className="lp-promo-row a">7 días de Pro · Sin tarjeta</span>
        <span className="lp-promo-row b">
          <span className="lp-promo-pill">−67%</span> Pro a <b>59&nbsp;€/mes</b>, 6 meses · hasta 1 sept.
        </span>
      </span>
    </div>
  );
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
/**
 * El cierre de la portada (HOME-2026-08 Fase C).
 *
 * A quien NO ha entrado se le ofrece lo del diseño aprobado: el mismo campo de
 * dominio del hero, sin la fila de motores, al comprobador gratuito. La promesa
 * es literal y comprobable — «Después, primer escaneo completo gratis» es
 * exactamente lo que da el plan Free: **un** escaneo completo, porque
 * `createPendingScanRunCore` rechaza el segundo y `runRecurringScanSweep`
 * descarta los proyectos Free (`lib/scan/cron.ts`).
 *
 * A quien SÍ ha entrado se le manda a su panel, y eso se conserva de
 * GENSCORE-HEADER-3: ofrecerle darse de alta —o un comprobador anónimo— a
 * alguien que ya tiene cuenta es ruido. El corte es logado / anónimo, no de
 * pago / no de pago: «Iniciar sesión» no le sirve a ningún logado y «Prueba
 * gratis» tampoco a uno en Free, que ya la tiene.
 */
export function HomeCtaBand() {
  const user = useSessionUser();
  if (user) {
    return (
      <div className="lp-close-in">
        <h2 className="lp-h2">Continúa donde lo dejaste</h2>
        <p className="lp-sec-sub">Vuelve a tu panel para ver cómo va la visibilidad de tus dominios.</p>
        <div className="lp-close-row">
          <Link href="/dashboard" className="lp-cta lp-cta--lg">
            Ir al panel <Icon name="arrRight" size={16} />
          </Link>
        </div>
      </div>
    );
  }
  return (
    <div className="lp-close-in">
      {/* El espacio ANTES del `<br />` es obligatorio y no sobra: en móvil el
          salto se apaga con `display: none` y sin él las dos palabras se pegan
          («de tiahora mismo», visto en producción el 2026-08-23). En
          escritorio el espacio se colapsa al final de la línea y no se ve. */}
      <h2 className="lp-h2">Averigua qué dice la IA de ti <br />ahora mismo</h2>
      <p className="lp-sec-sub">
        Una comprobación real contra ChatGPT, en 20 segundos. Después, primer escaneo completo gratis.
      </p>
      <div className="lp-close-field">
        <HeroDomainField withEngines={false} />
        <div className="lp-hero-note">
          <span>Sin registro</span>
          <span className="dot" aria-hidden="true" />
          <span>Sin tarjeta</span>
          <span className="dot" aria-hidden="true" />
          <span>Sin llamada de ventas</span>
        </div>
      </div>
    </div>
  );
}
