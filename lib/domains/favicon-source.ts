/**
 * Lado servidor de FAVICON-QUALITY-3a: decide si Google nos ha dado el icono
 * de una marca o su comodín genérico.
 *
 * Por qué hace falta servidor para algo tan tonto: S2 responde **200 con un
 * globo** cuando no conoce el dominio, no un 404. Desde el navegador eso es
 * indistinguible de un icono real — `onError` no dispara nunca — así que la
 * consola llevaba meses enseñando globos como si fueran marcas
 * (alberdiderma.es y el nuestro, 2 de 10 en la cuenta del fundador). Aquí sí
 * podemos mirar los bytes.
 *
 * Ver docs/brand/design-decisions-log.md §36.
 */

import { createHash } from "node:crypto";

const S2 = "https://www.google.com/s2/favicons";

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

  sentinelBySize.set(size, pending);
  return pending;
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
  const [icon, sentinel] = await Promise.all([fetchIcon(domain, size), sentinelHash(size)]);

  if (!icon) return { kind: "unavailable" };
  if (sentinel && hash(icon) === sentinel) return { kind: "generic" };

  return { kind: "icon", body: icon, contentType: "image/png" };
}

/**
 * Un dominio plausible: sin esquema, sin ruta, sin espacios. No hay superficie
 * SSRF que proteger —el host de destino está fijo aquí arriba y el dominio sólo
 * viaja como parámetro— pero un valor con forma de dominio es lo único que
 * puede producir una respuesta útil, así que el resto se rechaza antes de
 * gastar una llamada.
 */
export function isPlausibleDomain(value: string): boolean {
  if (!value || value.length > 253) return false;
  return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(value);
}
