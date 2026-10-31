import Link from "next/link";
import { LostRocket } from "@/components/ins/errors/lost-rocket";
import { Ic } from "@/components/ins/ic";

/**
 * NOT-FOUND-ROCKET-1 (log §86) created this screen; CONSOLE-INSTRUMENTO-1 F8
 * redrew it as an empty instrument (log §366), and CONSOLE-404-ROCKET-1 (log
 * §388) brings back the public 404's rocket inside a night window, at Denis's
 * request (option A of three). It exists because `app/not-found.tsx` is the
 * root one and would otherwise show the marketing header to someone signed in.
 *
 * Wide: the copy sits on the scene, left. Below 1100px it moves under the
 * scene and reads on the console surface. Texts and destinations are the ones
 * from before.
 *
 * «Ver mis dominios» points at `/dashboard/domains`, the console's door since
 * DOMAINS-REDESIGN-1, not at the legacy archive screen.
 */
export default function DashboardNotFound() {
  return (
    <div className="ins">
      <div className="page sc-404">
        <div className="nf4">
          <LostRocket />
          <div className="nf4-copy">
            <div className="eyebrow bare">
              <i aria-hidden="true" />
              Error 404 · Fuera de trayectoria
            </div>
            <h1>Esta pantalla no existe</h1>
            <p className="lead">El enlace apunta a un dominio, un escaneo o una sección que ya no está disponible.</p>
            <div className="pills">
              <Link href="/dashboard/domains" className="btn line">
                Ver mis dominios
              </Link>
              <Link href="/dashboard" className="btn ink">
                Ir al último dominio
                <Ic n="arrowr" sm />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
