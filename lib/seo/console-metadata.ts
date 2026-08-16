import type { Metadata } from "next";
import { SITE_NAME } from "./metadata";

/**
 * Títulos de pestaña de las pantallas privadas — ROOT-METADATA-1.
 *
 * **El problema.** Las pantallas de consola no declaraban `metadata`, así que
 * heredaban el `title: "GenScore"` del layout raíz. Las dieciséis pantallas
 * reales del producto —más las de MFA— compartían literalmente la misma
 * pestaña, y quien trabaja con dos o tres dominios abiertos a la vez no podía
 * distinguir ninguna.
 *
 * **Lo que NO es este módulo.** No es una mejora de posicionamiento, y decirlo
 * evita que una sesión futura le atribuya un efecto que no tiene: todo lo que
 * pasa por aquí está detrás de autenticación y en el `disallow` de
 * `robots.ts`. Ningún motor lo lee nunca. Es UX de consola.
 *
 * **Por qué no se usa `title.template` del layout raíz**, que sería lo
 * elegante: hay 33 títulos públicos que ya escriben «— GenScore» a mano, y la
 * plantilla se lo añadiría otra vez a los 33 («Blog — GenScore — GenScore»).
 * Hacerlo bien exige quitar el sufijo de todos, y eso toca el `<title>` de
 * todas las páginas indexadas — otra clase de riesgo, y su propia fase si
 * alguna vez compensa.
 */

/** `"Ajustes"` → `"Ajustes — GenScore"`. El separador es el de las 33 públicas. */
export function consoleTitle(screen: string): string {
  return `${screen} — ${SITE_NAME}`;
}

/**
 * Título de una pantalla que pertenece a un dominio concreto.
 *
 * El dominio va **dentro** del título y no al final por una razón práctica:
 * una pestaña estrecha recorta por la derecha, así que lo que distingue tiene
 * que ir antes que lo que se repite. Con tres proyectos abiertos, «Visión
 * general · acme.com» y «Visión general · otra.com» se distinguen aunque la
 * pestaña sólo enseñe veinte caracteres; «Visión general — GenScore» tres
 * veces, no.
 */
export function projectScreenTitle(screen: string, domain: string | null): string {
  return consoleTitle(domain ? `${screen} · ${domain}` : screen);
}

/**
 * Metadata de una pantalla de consola sin proyecto.
 *
 * Deliberadamente sin `robots`: estas rutas están detrás de autenticación, así
 * que un rastreador no llega a verlas ni siguiendo un enlace. La regla de
 * `.claude/rules/growth-content.md` que pide `robots: { index: false }` en vez
 * de una línea en `robots.ts` habla de pantallas **públicas** sin valor de
 * búsqueda —`/login`, `/signup`, el 404—, que sí son alcanzables. Añadirlo
 * aquí sería ruido que aparenta una protección que ya da el `requireUser`.
 */
export function consoleMetadata(screen: string): Metadata {
  return { title: consoleTitle(screen) };
}

/**
 * Metadata de una pantalla de proyecto, resolviendo el dominio.
 *
 * `resolveDomain` es una función y no una cadena porque quien llama pasa
 * `requireActiveProject`, que está memoizada con `React.cache()` por petición
 * (`lib/project-workspace.ts`): Next ejecuta `generateMetadata` y la página en
 * el mismo render, así que el proyecto se lee **una sola vez** entre las dos.
 * Sin esa memoización esto sería una consulta extra por navegación y no
 * compensaría.
 *
 * **Tolerante a propósito.** Si la lectura falla —proyecto archivado, borrado,
 * o una columna que una migración todavía no ha aplicado, que es el fallo
 * concreto que ya convirtió seis pantallas en un 404 (`project-workspace.ts`)—
 * el título cae al nombre de la pantalla sin dominio. Un título es lo último
 * que debería decidir si una página existe: de eso se encarga la página, que
 * hará su propio `notFound()` un instante después si toca.
 */
export async function projectScreenMetadata(
  screen: string,
  resolveDomain: () => Promise<string | null>
): Promise<Metadata> {
  let domain: string | null = null;
  try {
    domain = await resolveDomain();
  } catch {
    domain = null;
  }
  return { title: projectScreenTitle(screen, domain) };
}
