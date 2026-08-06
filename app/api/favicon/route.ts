import { NextResponse } from "next/server";
import { fetchFavicon, isPlausibleDomain } from "@/lib/domains/favicon-source";
import { snapFaviconSize } from "@/lib/domains/favicon";

/**
 * FAVICON-QUALITY-3a. Sirve el icono de un dominio, o **404 cuando no hay
 * uno de verdad**, que es el punto entero de esta ruta: un 404 sí dispara el
 * `onError` del `<img>` y deja que el cliente pinte las iniciales. Google
 * responde 200 con un globo genérico, y desde el navegador eso es
 * indistinguible de una marca.
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
    return new NextResponse(null, { status: 404, headers: { "Cache-Control": CACHE_GENERIC } });
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

  // 404 en ambos casos: el cliente sólo necesita saber "pinta las iniciales".
  // La diferencia está en cuánto tiempo se cachea esa respuesta.
  return new NextResponse(null, {
    status: 404,
    headers: {
      "Cache-Control": result.kind === "generic" ? CACHE_GENERIC : CACHE_UNAVAILABLE
    }
  });
}
