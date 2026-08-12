import Link from "next/link";
import { EmptyState } from "@/components/empty-state";

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
 * Deliberadamente sobrio: se renderiza dentro de `app/dashboard/layout.tsx`,
 * así que el menú lateral, la barra superior y la campana siguen ahí — que es
 * justo lo que alguien necesita para salir de aquí. La salida apunta a
 * `/dashboard`, que redirige al proyecto más reciente.
 */
export default function DashboardNotFound() {
  return (
    <div className="max-w-[560px]">
      <EmptyState
        title="Esta pantalla no existe"
        description="El enlace que has seguido apunta a un dominio, un escaneo o una sección que ya no está disponible — puede que se archivara o se borrara."
      />
      <div className="mt-4">
        <Link href="/dashboard" className="btn btn-primary btn-sm">
          Volver a mis dominios
        </Link>
      </div>
    </div>
  );
}
