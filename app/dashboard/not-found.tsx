import Link from "next/link";
import { ErrRing } from "@/components/ins/errors/err-ring";
import { Ic } from "@/components/ins/ic";

/**
 * NOT-FOUND-ROCKET-1 (log §86) created this screen; CONSOLE-INSTRUMENTO-1 F8
 * redraws it as the empty instrument of the approved prototype. It exists
 * because `app/not-found.tsx` is the root one and would otherwise show the
 * marketing header to someone signed in. No rocket on purpose
 * (`.claude/rules/mission-rocket.md`).
 *
 * «Ver mis dominios» points at `/dashboard/domains`, the console's door since
 * DOMAINS-REDESIGN-1, not at the legacy archive screen.
 */
export default function DashboardNotFound() {
  return (
    <div className="ins">
      <div className="page sc-err">
        <ErrRing label="404" />
        <div className="eyebrow bare">Error 404</div>
        <h1>Esta pantalla no existe</h1>
        <p className="lead">El enlace apunta a un dominio, un escaneo o una sección que ya no está disponible.</p>
        <div className="pills" style={{ justifyContent: "center" }}>
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
  );
}
