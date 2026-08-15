import type { Metadata } from "next";
import { NotFoundMission } from "@/components/not-found-mission";

/**
 * NOT-FOUND-ROCKET-1. La 404 pública pasa a ser «Fuera de trayectoria»
 * (`components/not-found-mission.tsx`, diseño en
 * `docs/design-reference/not-found-rocket-1/`).
 *
 * Antes, SEO-POS-1 (T7): hasta entonces el repo no tenía `not-found.tsx`, así
 * que cualquier URL inexistente —y `/blog/<cluster>` y `/glosario/<termino>`
 * llaman a `notFound()` de verdad— caía en la página por defecto de Next: sin
 * marca, sin navegación y sin un solo enlace de vuelta al sitio. Eso quedó
 * resuelto; lo que esta fase arregla es que la pantalla no parecía de
 * GenScore.
 *
 * `noindex` a propósito, sin cambios: un 404 ya devuelve el estado correcto,
 * pero la etiqueta evita que una variante enlazada desde fuera se quede
 * rondando en el índice.
 *
 * Este fichero es el `not-found` **raíz**, así que también recogía los
 * `notFound()` de la consola (`lib/project-workspace.ts`, las páginas de
 * proyecto y de run). Enseñarle el cohete y un «Prueba gratis» a alguien que
 * ya ha iniciado sesión no tiene sentido, así que la consola tiene el suyo en
 * `app/dashboard/not-found.tsx`.
 */
export const metadata: Metadata = {
  title: "Página no encontrada — GenScore",
  robots: { index: false, follow: true }
};

export default function NotFound() {
  return <NotFoundMission />;
}
