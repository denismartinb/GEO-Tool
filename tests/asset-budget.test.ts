import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Presupuesto de peso para `public/` (PRELAUNCH-HARDENING-1 Fase V, V0).
 *
 * Por qué existe: hasta el 2026-08-09, cuatro portadas de blog en PNG sumaban
 * **8,2 MB — el 95 % de todo `public/`** — y nadie se enteró, porque nada en
 * el repo miraba el peso de un asset. Re-codificadas a WebP con calidad 90
 * pesan 256 KB en total y son indistinguibles a ojo (PSNR 41-43 dB). El
 * arreglo puntual dura lo que tarde alguien en arrastrar el siguiente PNG de
 * 2 MB; el presupuesto es lo que lo convierte en un fallo de CI en vez de en
 * una regresión silenciosa de LCP en la superficie que trae el tráfico
 * orgánico (`/blog`, GROWTH-2).
 *
 * Es a propósito una comprobación **sin navegador**: corre en el `ci.yml` que
 * ya existe, en milisegundos, sin descargar Chromium. Lighthouse mide lo que
 * el usuario percibe y necesita un despliegue; esto mide lo que enviamos y
 * necesita un `stat`. Son complementarios, y este es el que puede ser una
 * puerta barata en cada PR.
 *
 * Los topes no son aspiracionales: son el estado real de hoy con holgura para
 * crecer. Si un cambio legítimo los supera, se sube el número **en el mismo
 * PR y con una razón escrita** — que es justo la conversación que hoy no
 * ocurría.
 */

/** Ningún fichero suelto por encima de esto. Hoy el mayor es genscore-og.png (239 KB). */
const MAX_FILE_BYTES = 320 * 1024;

/** Peso total de `public/`. Hoy son 615 KB en 25 ficheros. */
const MAX_TOTAL_BYTES = 1.5 * 1024 * 1024;

/**
 * Imágenes de contenido: WebP (raster) o SVG (vectorial).
 *
 * PNG sigue permitido donde **un consumidor externo impone el formato**, que
 * no es lo mismo que una preferencia nuestra. Cada excepción lleva su motivo
 * porque una lista de rutas sin explicación se convierte, a la primera duda,
 * en «añade la tuya y sigue»:
 *
 * - iconos de navegador/SO (`favicon-*`, `apple-touch-icon`, `icon-512`): el
 *   formato lo fija el sistema operativo o el manifiesto, no nosotros;
 * - imagen Open Graph (`genscore-og`): los rastreadores sociales y WhatsApp
 *   no aceptan WebP de forma fiable;
 * - assets de email (`*email*`): los clientes de correo tampoco — Outlook
 *   sigue sin soportar WebP.
 */
const RASTER_EXTENSIONS_UNDER_BUDGET = [".png", ".jpg", ".jpeg"];

const PNG_ALLOWED_BY_CONSUMER: { reason: string; matches: (path: string) => boolean }[] = [
  {
    reason: "icono de navegador/SO — el formato lo fija el sistema, no nosotros",
    matches: (p) => /(^|\/)(favicon-\d+|apple-touch-icon|icon-\d+)\.png$/.test(p)
  },
  {
    reason: "imagen Open Graph — los rastreadores sociales no aceptan WebP de forma fiable",
    matches: (p) => /(^|\/)genscore-og\.png$/.test(p)
  },
  {
    reason: "asset de email — los clientes de correo (Outlook) no soportan WebP",
    matches: (p) => /email/i.test(p)
  }
];

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.isFile()) out.push(full);
  }
  return out;
}

const publicDir = join(process.cwd(), "public");
const files = walk(publicDir).map((f) => ({
  path: relative(publicDir, f).split("\\").join("/"),
  bytes: statSync(f).size
}));

describe("presupuesto de assets en public/", () => {
  it("ningún fichero supera el tope por fichero", () => {
    const tooBig = files
      .filter((f) => f.bytes > MAX_FILE_BYTES)
      .map((f) => `${f.path} (${Math.round(f.bytes / 1024)} KB)`);

    expect(
      tooBig,
      `Estos ficheros superan ${Math.round(MAX_FILE_BYTES / 1024)} KB:\n  ${tooBig.join("\n  ")}\n\n` +
        "Una imagen de contenido casi nunca necesita tanto: re-codifícala a WebP " +
        "(calidad 90 mantiene la fidelidad) o redimensiónala al ancho al que se " +
        "muestra de verdad. Si el peso está justificado, sube MAX_FILE_BYTES en " +
        "este mismo PR y escribe por qué."
    ).toEqual([]);
  });

  it("el total de public/ se mantiene dentro del presupuesto", () => {
    const total = files.reduce((sum, f) => sum + f.bytes, 0);

    expect(
      total,
      `public/ pesa ${Math.round(total / 1024)} KB y el tope son ` +
        `${Math.round(MAX_TOTAL_BYTES / 1024)} KB. Todo esto se sirve desde el ` +
        "mismo origen que las páginas públicas."
    ).toBeLessThanOrEqual(MAX_TOTAL_BYTES);
  });

  it("las imágenes de contenido no vuelven a entrar como PNG/JPEG", () => {
    const offenders = files
      .filter((f) => RASTER_EXTENSIONS_UNDER_BUDGET.some((ext) => f.path.toLowerCase().endsWith(ext)))
      .filter((f) => !PNG_ALLOWED_BY_CONSUMER.some((rule) => rule.matches(f.path)))
      .map((f) => f.path);

    expect(
      offenders,
      `Estos rasters deberían ser WebP (o SVG si son vectoriales):\n  ${offenders.join("\n  ")}\n\n` +
        "Sólo se acepta PNG cuando el formato lo impone un consumidor externo:\n  " +
        PNG_ALLOWED_BY_CONSUMER.map((r) => r.reason).join("\n  ")
    ).toEqual([]);
  });
});
