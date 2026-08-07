/**
 * Guardia SSRF para FAVICON-QUALITY-3b.
 *
 * La 3a sólo hablaba con un host fijo escrito en el código, así que no había
 * nada que proteger. La 3b sí pide `https://<dominio>/apple-touch-icon.png`, y
 * ese dominio **lo escribe el usuario** al dar de alta un proyecto o un
 * competidor. Sin esta guardia, `/api/favicon?domain=169.254.169.254.nip.io`
 * convierte nuestro servidor en un ariete contra la red interna, y como la
 * respuesta se devuelve al navegador, en un canal de exfiltración.
 *
 * Lo que NO cubre, dicho antes de que alguien lo asuma: **DNS rebinding**. Se
 * valida la IP antes de cada petición, pero entre esa comprobación y el socket
 * real hay una ventana en la que el DNS puede cambiar de respuesta. Cerrarla
 * exige fijar la IP en el socket, que `fetch` no permite. El daño residual
 * está acotado por lo demás: sólo https, sólo respuestas con firma de imagen
 * ráster, y un tope de tamaño.
 */

import { lookup } from "node:dns/promises";

/** Máximo de saltos. Los redirects existen de verdad aquí — casi todo dominio
 *  raíz redirige a `www` — así que prohibirlos dejaría la 3b sin efecto justo
 *  en los casos para los que se construyó. Se siguen a mano para poder
 *  revalidar el host en **cada** salto; seguirlos con `redirect: "follow"`
 *  significaría validar el primero y confiar en el resto. */
export const MAX_REDIRECTS = 3;

function ipv4IsPublic(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false;
  const [a, b] = parts;

  if (a === 0) return false; // "este" host
  if (a === 10) return false; // privada
  if (a === 127) return false; // loopback
  if (a === 169 && b === 254) return false; // link-local — metadatos de la nube
  if (a === 172 && b >= 16 && b <= 31) return false; // privada
  if (a === 192 && b === 168) return false; // privada
  if (a === 100 && b >= 64 && b <= 127) return false; // CGNAT
  if (a === 192 && b === 0) return false; // IETF protocol assignments
  if (a === 198 && (b === 18 || b === 19)) return false; // benchmarking
  if (a === 198 && b === 51) return false; // TEST-NET-2
  if (a === 203 && b === 0) return false; // TEST-NET-3
  if (a >= 224) return false; // multicast y reservado, incluye 255.255.255.255

  return true;
}

function ipv6IsPublic(ip: string): boolean {
  const addr = ip.toLowerCase().split("%")[0]; // quita el scope de link-local

  if (addr === "::" || addr === "::1") return false;

  // IPv4 mapeada (::ffff:10.0.0.1) — se juzga por la IPv4 que lleva dentro, o
  // el filtro de arriba se saltaría entero.
  const mapped = addr.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return ipv4IsPublic(mapped[1]);

  const head = addr.split(":")[0];
  const prefix = parseInt(head || "0", 16);

  if ((prefix & 0xfe00) === 0xfc00) return false; // fc00::/7 — únicas locales
  if ((prefix & 0xffc0) === 0xfe80) return false; // fe80::/10 — link-local
  if (addr.startsWith("2001:db8:")) return false; // documentación
  if (addr.startsWith("64:ff9b:")) return false; // NAT64
  if ((prefix & 0xff00) === 0xff00) return false; // multicast

  return true;
}

export function isPublicIp(ip: string): boolean {
  return ip.includes(":") ? ipv6IsPublic(ip) : ipv4IsPublic(ip);
}

/**
 * `true` sólo si la URL es https, su host es un nombre (no una IP literal) y
 * **todas** las direcciones a las que resuelve son públicas.
 *
 * Se comprueban todas y no la primera: un host con un registro público y otro
 * privado pasaría el filtro y luego el sistema podría conectar al segundo.
 */
export async function isPublicHttpsUrl(raw: string): Promise<boolean> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }

  if (url.protocol !== "https:") return false;

  const host = url.hostname.replace(/^\[|\]$/g, "");
  // Una IP literal nunca es entrada legítima aquí: lo que tenemos son dominios.
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host) || host.includes(":")) return false;

  try {
    const addresses = await lookup(host, { all: true, verbatim: true });
    if (addresses.length === 0) return false;
    return addresses.every((a) => isPublicIp(a.address));
  } catch {
    // No resuelve: no hay a dónde ir.
    return false;
  }
}

/**
 * Tipo de imagen **según los bytes**, no según lo que diga el servidor remoto.
 * Devuelve null si no es una imagen ráster reconocible.
 *
 * Se deriva de la firma porque la cabecera `Content-Type` y la extensión de la
 * ruta las controla el otro extremo: reenviar cualquiera de las dos sería
 * repetir la palabra de alguien a quien no conocemos.
 *
 * **SVG queda fuera a propósito**, aunque sea el formato más nítido: un SVG
 * puede llevar script dentro y esta ruta lo devolvería desde nuestro propio
 * origen. Nitidez no vale un XSS.
 */
export function rasterImageType(bytes: Uint8Array): string | null {
  if (bytes.length < 12) return null;

  const startsWith = (sig: number[]) => sig.every((b, i) => bytes[i] === b);

  if (startsWith([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (startsWith([0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith([0x47, 0x49, 0x46, 0x38])) return "image/gif";
  if (startsWith([0x00, 0x00, 0x01, 0x00])) return "image/x-icon";
  if (
    startsWith([0x52, 0x49, 0x46, 0x46]) &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }

  return null;
}
