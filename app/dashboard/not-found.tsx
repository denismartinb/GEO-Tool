import Link from "next/link";
import { Icon } from "@/components/ui/icon";

/**
 * NOT-FOUND-ROCKET-1. El 404 de dentro de la consola.
 *
 * Existe porque `app/not-found.tsx` es el `not-found` **raíz** y, sin este
 * fichero, recogía también los `notFound()` de la consola: los lanza
 * `lib/project-workspace.ts` (que convierte las seis pantallas de un proyecto
 * inexistente en un 404), `app/dashboard/projects/[projectId]/page.tsx` y la
 * página de un run. Ya antes de esta fase eso enseñaba la cabecera de
 * marketing a alguien con sesión iniciada; con la escena del cohete a pantalla
 * completa y un botón «Prueba gratis» pasaba de raro a absurdo.
 *
 * Sobrio, no descuidado (fundador, 2026-08-13: «parece un botón mal
 * maquetado»). La primera versión reutilizaba `EmptyState` y su borde
 * discontinuo, que es el lenguaje de **contenido que todavía no está** —
 * "aún no has escaneado", "no hay competidores" — y aquí no falta contenido:
 * la ruta no existe. Con un botón suelto debajo y el resto de la pantalla en
 * blanco, leía como una maqueta a medias.
 *
 * «Ver mis dominios» apunta a `/dashboard/domains`, no a `/dashboard/projects`.
 * Esta última es la pantalla de gestión pre-DOMAINS-REDESIGN-1 (archivar /
 * restaurar) — sigue viva porque `/dashboard/projects` archiva de verdad, pero
 * ya no es la puerta de entrada de la consola. `/dashboard/domains` sí lo es
 * desde esa fase: es donde alguien perdido debe aterrizar (fundador,
 * 2026-08-13, probando el preview).
 *
 * Ahora es un bloque centrado en el área de contenido, con las piezas de la
 * propia consola (`.btn`, `Icon`, los tokens de tinta) y sin caja: en una
 * pantalla por lo demás vacía, una caja alrededor de un mensaje corto es
 * justamente lo que lo hacía parecer un widget roto.
 *
 * El cohete no entra aquí a propósito. Quien ve esta pantalla ya es cliente y
 * está trabajando; la escena es una primera impresión para quien llega de
 * fuera (`.claude/rules/mission-rocket.md`).
 */
export default function DashboardNotFound() {
  return (
    <div className="nfc">
      <div className="nfc-glyph" aria-hidden="true">
        <Icon name="target" size={22} />
      </div>

      <p className="nfc-kicker">Error 404</p>
      <h1 className="nfc-title">Esta pantalla no existe</h1>
      <p className="nfc-sub">
        El enlace que has seguido apunta a un dominio, un escaneo o una sección que ya no
        está disponible. Puede que se archivara, se borrara, o que la dirección esté mal
        escrita.
      </p>

      <div className="nfc-actions">
        <Link href="/dashboard/domains" className="btn btn-primary">
          Ver mis dominios
        </Link>
        <Link href="/dashboard" className="btn btn-ghost">
          Ir al último dominio
        </Link>
      </div>
    </div>
  );
}
