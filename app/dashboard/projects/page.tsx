import { redirect } from "next/navigation";

/**
 * DOMAINS-ARCHIVE-RETIRE-1 (log §104) — esta pantalla ya no existe.
 *
 * Tenía dos mitades. La de arriba, «Dominios activos», hacía exactamente lo
 * mismo que `/dashboard/domains` desde DOMAINS-REDESIGN-1: dos pantallas con
 * el mismo `<h1>` y, desde ROOT-METADATA-1, la misma pestaña — que es cómo se
 * descubrió que seguía aquí. La de abajo, «Dominios archivados», era el único
 * sitio del producto donde se veían y se restauraban los archivados.
 *
 * **Se retiran las dos, por decisión del fundador (2026-08-15).** El coste
 * quedó declarado antes de tomarla: bajar de plan archiva dominios, así que un
 * cliente que baje ya no los ve en ninguna parte. La salida no es esta
 * pantalla sino volver a añadir el dominio, que ahora lo **reactiva** en vez de
 * rechazar el alta (`lib/projects/create-project.ts`). Sin ese cambio esto
 * sería un callejón sin salida: sin pantalla de archivados, y con el alta
 * bloqueada por la fila archivada.
 *
 * Sigue siendo una redirección y no un 404 por el mismo motivo que las cinco de
 * `/dashboard/settings/*`: era un destino real y enlazado, y hay marcadores y
 * enlaces vivos apuntando aquí.
 */
export default function ProjectsPage() {
  redirect("/dashboard/domains");
}
