/**
 * Lado servidor de FAVICON-QUALITY-3: de dónde sale el icono de un dominio.
 *
 * Dos fuentes, en este orden:
 *
 * 1. **El propio sitio** (3b) — `https://<dominio>/apple-touch-icon.png`, que
 *    suele ser de 180 px reales. Es lo único que arregla un dominio cuyo icono
 *    en Google es un `.ico` de 16 px estirado (el caso mahou.es).
 * 2. **Google S2** (3a) como respaldo, con detección del comodín: S2 responde
 *    **200 con un globo** cuando no conoce el dominio, no un 404, así que desde
 *    el navegador es indistinguible de un icono real —`onError` no dispara
 *    nunca— y la consola llevaba meses enseñando globos como si fueran marcas
 *    (alberdiderma.es y el nuestro, 2 de 10 en la cuenta del fundador). Aquí sí
 *    podemos mirar los bytes.
 *
 * La 3b pide a un dominio que escribe el usuario, así que **toda petición pasa
 * por la guardia de `./public-host`**. No se parsea HTML en ningún momento:
 * pedir una ruta fija conocida no es rastrear.
 *
 * Ver docs/brand/design-decisions-log.md §36.
 */

import { createHash } from "node:crypto";
import { MAX_REDIRECTS, isPublicHttpsUrl, rasterImageType } from "./public-host";

const S2 = "https://www.google.com/s2/favicons";

/**
 * FAVICON-QUALITY-3b. Rutas convencionales donde un sitio publica su icono
 * grande. **No se parsea el HTML para descubrirlas**: eso ya sería rastrear, y
 * está en la lista de prohibidos de CLAUDE.md. Pedir una ruta fija conocida no
 * sigue enlaces ni descubre URLs.
 *
 * Se prueban en orden y gana la primera que responda una imagen.
 */
const SITE_ICON_PATHS = ["/apple-touch-icon.png", "/apple-touch-icon-precomposed.png"];

/** Un apple-touch-icon son ~10-40 KB. Más generoso que el de S2 porque estas
 *  imágenes son de 180 px, pero sigue siendo un tope, no un ajuste fino. */
const SITE_MAX_BYTES = 500_000;

/**
 * Presupuesto **total** de la fase 3b, no por llamada.
 *
 * Con un timeout por llamada, dos rutas por hasta cuatro saltos cada una salen
 * a 40 s antes siquiera de empezar a preguntarle a Google. La ruta que pinta
 * los iconos no puede tardar eso, y el sitio de un tercero no tiene por qué
 * responder rápido. Se mide un instante absoluto al entrar y se reparte: lo que
 * no quepa, no se intenta, y S2 sigue detrás. Mismo criterio que
 * `.claude/rules/scan.md` («presupuesta contra la invocación, no contra sí
 * mismo»).
 */
const SITE_TOTAL_BUDGET_MS = 3_000;

/**
 * Dominio que no puede existir: `.invalid` está reservado por el RFC 2606 y
 * nunca resolverá, así que S2 sólo puede devolver su comodín. Es la calibración
 * — preferible a incrustar un hash del globo, que quedaría obsoleto en silencio
 * el día que Google lo redibuje.
 */
const SENTINEL = "no-such-site.invalid";

const FETCH_TIMEOUT_MS = 5_000;
/** Un favicon son unos pocos KB. El tope es defensivo, no un ajuste fino. */
const MAX_BYTES = 200_000;

export type FaviconFetch =
  | { kind: "icon"; body: ArrayBuffer; contentType: string }
  /** Google no tiene icono para este dominio: el cliente debe pintar iniciales. */
  | { kind: "generic" }
  /** No hemos podido averiguarlo. También pinta iniciales, pero se cachea poco. */
  | { kind: "unavailable" };

function hash(buf: ArrayBuffer): string {
  return createHash("sha256").update(Buffer.from(buf)).digest("hex");
}

async function fetchIcon(domain: string, size: number): Promise<ArrayBuffer | null> {
  try {
    const res = await fetch(`${S2}?domain=${encodeURIComponent(domain)}&sz=${size}`, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      // Nuestra propia caché de edge es la que manda; ver route.ts.
      cache: "no-store"
    });
    if (!res.ok) return null;

    const length = Number(res.headers.get("content-length") ?? 0);
    if (length > MAX_BYTES) return null;

    const body = await res.arrayBuffer();
    if (body.byteLength === 0 || body.byteLength > MAX_BYTES) return null;
    return body;
  } catch {
    // Timeout, DNS, red. Sin mensaje del proveedor: lo categoriza quien llama.
    return null;
  }
}

/**
 * Hash del comodín para un tamaño dado. Memoizado por tamaño **y por promesa**,
 * no por valor: varias peticiones concurrentes en un arranque en frío
 * comparten la misma llamada en vez de disparar una calibración cada una.
 *
 * El globo cambia con el tamaño, de ahí la clave por tamaño.
 */
const sentinelBySize = new Map<number, Promise<string | null>>();

export function resetSentinelCache(): void {
  sentinelBySize.clear();
}

function sentinelHash(size: number): Promise<string | null> {
  const cached = sentinelBySize.get(size);
  if (cached) return cached;

  const pending = fetchIcon(SENTINEL, size)
    .then((buf) => (buf ? hash(buf) : null))
    .catch(() => null);

  // Sólo se cachea el acierto. Una calibración fallida se olvida, porque
  // cachearla dejaría esta instancia **en fallo-abierto permanente y en
  // silencio** para ese tamaño: un corte de red de un segundo y, mientras la
  // función siga caliente, todo globo genérico se serviría como si fuera una
  // marca. El fallo-abierto está pensado como estado momentáneo, no heredado.
  // La promesa se guarda igualmente antes de ceder el control, así que las
  // peticiones concurrentes siguen compartiendo una única llamada.
  void pending.then((result) => {
    if (result === null) sentinelBySize.delete(size);
  });

  sentinelBySize.set(size, pending);
  return pending;
}

/**
 * Pide una URL siguiendo las redirecciones **a mano**, revalidando el host en
 * cada salto.
 *
 * Seguirlas con `redirect: "follow"` validaría el primer host y confiaría en
 * todos los siguientes, que es exactamente el agujero que esta función existe
 * para tapar: un dominio público que redirige a `169.254.169.254` pasaría el
 * control de entrada. Y prohibirlas del todo dejaría la 3b inútil, porque casi
 * todo dominio raíz redirige a `www`.
 */
async function fetchThroughRedirects(url: string, deadline: number): Promise<Response | null> {
  let current = url;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) return null;

    if (!(await isPublicHttpsUrl(current))) return null;

    let res: Response;
    try {
      res = await fetch(current, {
        signal: AbortSignal.timeout(Math.min(FETCH_TIMEOUT_MS, Math.max(1, deadline - Date.now()))),
        redirect: "manual",
        cache: "no-store"
      });
    } catch {
      return null;
    }

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) return null;
      try {
        current = new URL(location, current).toString();
      } catch {
        return null;
      }
      continue;
    }

    return res.ok ? res : null;
  }

  // Más saltos que el tope: o hay un bucle o el sitio está mal configurado.
  return null;
}

/**
 * Icono del propio sitio (FAVICON-QUALITY-3b), que es la única forma de
 * arreglar un dominio cuyo icono en Google es de baja resolución — el caso
 * mahou.es. Devuelve null en cuanto algo no cuadra: aquí rendirse es barato
 * porque S2 sigue estando detrás como respaldo.
 */
async function fetchSiteIcon(domain: string): Promise<{ body: ArrayBuffer; contentType: string } | null> {
  const deadline = Date.now() + SITE_TOTAL_BUDGET_MS;

  for (const path of SITE_ICON_PATHS) {
    if (Date.now() >= deadline) return null;

    const res = await fetchThroughRedirects(`https://${domain}${path}`, deadline);
    if (!res) continue;

    const type = res.headers.get("content-type") ?? "";
    if (!type.startsWith("image/")) continue;

    const declared = Number(res.headers.get("content-length") ?? 0);
    if (declared > SITE_MAX_BYTES) continue;

    let body: ArrayBuffer;
    try {
      body = await res.arrayBuffer();
    } catch {
      continue;
    }

    if (body.byteLength === 0 || body.byteLength > SITE_MAX_BYTES) continue;
    // La cabecera y la extensión las controla el otro extremo; los bytes no.
    const contentType = rasterImageType(new Uint8Array(body.slice(0, 12)));
    if (!contentType) continue;

    return { body, contentType };
  }

  return null;
}

/**
 * Trae el icono y dice si es real o el comodín.
 *
 * **Falla abierto a propósito.** Si la calibración no está disponible
 * devolvemos el icono tal cual en vez de arriesgarnos a ocultar uno bueno:
 * enseñar un globo de más es feo, esconder la marca real de un competidor es
 * información perdida. Mismo criterio que `scripts/vercel-should-build.sh`.
 */
export async function fetchFavicon(domain: string, size: number): Promise<FaviconFetch> {
  // 3b primero: el icono del propio sitio es de 180 px de verdad, mientras que
  // el de Google puede ser un .ico de 16 px estirado. Si existe, no hay nada
  // que decidir — es suyo por definición, así que no pasa por el centinela.
  const own = await fetchSiteIcon(domain);
  if (own) return { kind: "icon", body: own.body, contentType: own.contentType };

  const [icon, sentinel] = await Promise.all([fetchIcon(domain, size), sentinelHash(size)]);

  if (!icon) return { kind: "unavailable" };
  if (sentinel && hash(icon) === sentinel) return { kind: "generic" };

  return { kind: "icon", body: icon, contentType: "image/png" };
}

/**
 * Un dominio plausible: sin esquema, sin ruta, sin espacios.
 *
 * **Esto ya no es sólo higiene.** Mientras el único destino era el host fijo de
 * S2 no había superficie SSRF que proteger; desde la 3b este valor acaba dentro
 * de una URL a la que pedimos de verdad, así que es la primera de dos barreras.
 * La segunda, la que de verdad cuenta, es `isPublicHttpsUrl` — ésta sólo evita
 * gastar una llamada en algo que no tiene forma de dominio.
 */
export function isPlausibleDomain(value: string): boolean {
  if (!value || value.length > 253) return false;
  return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(value);
}
