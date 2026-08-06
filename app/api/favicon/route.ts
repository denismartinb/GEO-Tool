import { NextResponse } from "next/server";
import { fetchFavicon, isPlausibleDomain } from "@/lib/domains/favicon-source";
import { snapFaviconSize } from "@/lib/domains/favicon";

/**
 * FAVICON-QUALITY-3a. Sirve el icono de un dominio, o **204 sin cuerpo cuando
 * no hay uno de verdad**, que es el punto entero de esta ruta: un `<img>` con
 * cuerpo vacío no puede decodificar nada y dispara `onError`, y ahí el cliente
 * pinta las iniciales. Google responde 200 con un globo genérico, y desde el
 * navegador eso es indistinguible de una marca.
 *
 * **204 y no 404**, corregido tras un `PILOT FAIL` (2026-08-06): el 404 hacía
 * exactamente lo que se le pedía, pero un 4xx para un estado normal y esperado
 * le miente a todo lo que mire el tráfico — el piloto lo marcó como petición
 * rota, y detrás de él vendrían la consola del navegador y Sentry. Que un
 * dominio no tenga favicon no es un fallo de nadie. 204 dice justo lo que pasa:
 * la petición se atendió bien y no hay nada que devolver.
 *
 * No es una ruta autenticada a propósito: sólo reenvía a un servicio público
 * lo que ya se le enviaba desde el navegador de cada usuario, y meter sesión
 * aquí impediría que la caché de edge sirviera a todo el mundo la misma
 * respuesta. Lo que sí gana el usuario es que su navegador deja de contarle a
 * Google qué cuenta está mirando.
 */

/** Una semana. Los iconos de marca no cambian, y cada acierto de caché es una
 *  invocación de función y una llamada a Google que no ocurren. */
const CACHE_ICON = "public, max-age=3600, s-maxage=604800, stale-while-revalidate=86400";
/** Un día: un dominio sin icono hoy puede tener uno mañana, y no queremos que
 *  el 404 se quede pegado una semana. */
const CACHE_GENERIC = "public, max-age=600, s-maxage=86400";
/** Un fallo transitorio no se cachea apenas: se reintenta pronto. */
const CACHE_UNAVAILABLE = "public, max-age=0, s-maxage=60";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const domain = (searchParams.get("domain") ?? "").trim().toLowerCase().replace(/^www\./, "");
  const size = snapFaviconSize(Number(searchParams.get("sz") ?? 64));

  if (!isPlausibleDomain(domain)) {
    return new NextResponse(null, { status: 204, headers: { "Cache-Control": CACHE_GENERIC } });
  }

  const result = await fetchFavicon(domain, size);

  if (result.kind === "icon") {
    return new NextResponse(result.body, {
      status: 200,
      headers: {
        "Content-Type": result.contentType,
        "Cache-Control": CACHE_ICON
      }
    });
  }

  // 204 en ambos casos: el cliente sólo necesita saber "pinta las iniciales".
  // La diferencia está en cuánto tiempo se cachea esa respuesta.
  //
  // Sí, eso significa que un fallo de Google (`unavailable`) se sirve con el
  // mismo código que un dominio sin icono, y no es un descuido: el usuario ve
  // lo mismo en los dos casos, y devolver 5xx llenaría el monitor de ruido cada
  // vez que Google tosa sin que nadie pueda hacer nada al respecto. Lo que
  // distingue los dos casos es la caché — 60 s frente a un día — para que un
  // fallo pasajero se reintente enseguida.
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Cache-Control": result.kind === "generic" ? CACHE_GENERIC : CACHE_UNAVAILABLE
    }
  });
}
