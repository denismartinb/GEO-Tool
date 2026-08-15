"use server";

import { requireOperator } from "@/lib/admin/operator";
import { getOperatorUserDetail, type AdminUserDetail } from "@/lib/admin/users";

/**
 * Fetch de la ficha de una cuenta, llamado desde el cliente al abrir el
 * acordeón (ADMIN-CONSOLE-UX-1, corrección "no recargar la página al hacer
 * clic"). Antes, seleccionar una fila navegaba a `?u=...` y eso volvía a
 * ejecutar TODA la página en el servidor — incluida `listOperatorUsers()`,
 * que no depende de qué cuenta esté seleccionada — sólo para traer el
 * detalle de una. Misma puerta que el resto de `/admin`: `requireOperator()`
 * dentro de la propia acción, nunca delegada en quien la llama.
 */
export async function fetchOperatorUserDetail(userId: string): Promise<AdminUserDetail | null> {
  const { service } = await requireOperator("/admin/users");
  return getOperatorUserDetail(service, userId);
}
