import "server-only";

import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Autenticación de las rutas internas del sistema — las que no tiene delante
 * un usuario: los crons de Vercel (`CRON_SECRET`) y las auto-llamadas de
 * continuación (`SCAN_CONTINUE_SECRET`).
 *
 * **Por qué existe** (PRELAUNCH-HARDENING-1 Fase R, R1): la misma comprobación
 * estaba escrita a mano en cinco ficheros
 * (`cron/weekly-scans`, `cron/weekly-digest`, `cron/sweep-continue`,
 * `cron/run-audit`, `scan/continue`), todas con `authHeader !== \`Bearer …\``.
 * Cinco copias de una comprobación de autorización son cinco sitios donde
 * arreglar un fallo, y garantizado que alguno se queda atrás.
 *
 * **Comparación en tiempo constante.** `!==` sobre cadenas corta en el primer
 * byte distinto, así que el tiempo de respuesta filtra cuántos caracteres del
 * secreto son correctos. Con un endpoint público y sin límite de intentos, eso
 * es un oráculo. Se compara sobre el SHA-256 de cada lado, no sobre las
 * cadenas: `timingSafeEqual` exige búferes del mismo tamaño y comparar las
 * longitudes primero filtraría la longitud del secreto; hashear las iguala
 * siempre a 32 bytes.
 *
 * Estas rutas corren en el runtime de Node (ninguna declara `runtime = "edge"`,
 * comprobado), así que `node:crypto` está disponible.
 */
function secureEquals(a: string, b: string): boolean {
  const digestA = createHash("sha256").update(a, "utf8").digest();
  const digestB = createHash("sha256").update(b, "utf8").digest();
  return timingSafeEqual(digestA, digestB);
}

/**
 * `true` sólo si la petición trae `Authorization: Bearer <secret>` y `secret`
 * está configurado.
 *
 * Fail-closed a propósito: sin variable de entorno **nadie** entra. Es lo
 * contrario de lo que suele hacerse por comodidad en desarrollo, y es
 * deliberado — una ruta que se abre sola cuando falta su secreto es una ruta
 * abierta el día que alguien despliega sin esa variable.
 */
export function isAuthorizedInternalRequest(request: Request, secret: string | undefined): boolean {
  if (!secret) return false;

  const authHeader = request.headers.get("authorization");
  if (!authHeader) return false;

  return secureEquals(authHeader, `Bearer ${secret}`);
}
