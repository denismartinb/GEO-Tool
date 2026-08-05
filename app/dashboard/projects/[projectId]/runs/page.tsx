import { redirect } from "next/navigation";

/**
 * DOMAINS-REDESIGN-1 — Escaneos ya no existe como pantalla.
 *
 * Su mitad de cliente (la rejilla de dominios) es ahora `/dashboard/domains`, y
 * su mitad de operación (historial, interruptores, errores) vive en `/debug`.
 * Esta ruta sobrevive sólo como redirección porque era un destino real y
 * enlazado: el bloque de proyecto de la barra lateral apuntaba aquí desde el
 * 2026-07-18, `createProject` redirigía aquí tras el onboarding, y hay enlaces
 * guardados y correos con esta URL.
 *
 * Apunta a `/debug` y no a `/dashboard/domains` a propósito: quien llegue por
 * un enlace viejo a "Escaneos" busca el historial de escaneos de ESTE dominio,
 * que es lo que /debug conserva íntegro. La pantalla de dominios no contesta
 * esa pregunta.
 *
 * `/runs/[runId]` (el detalle de un escaneo) se queda donde está — sigue siendo
 * una URL válida y la tabla de /debug enlaza a ella.
 */
export default async function RunsPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  redirect(`/dashboard/projects/${projectId}/debug`);
}
