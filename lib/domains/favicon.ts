/**
 * Real favicon via an external favicon service — pure frontend <img> src, no
 * crawler and no new schema (Task Intake, 2026-07-23: founder-approved
 * "recuperando favicons"). Sends the domain to Google on every page load;
 * disclosed in that Task Intake report.
 *
 * Extracted from app/dashboard/projects/[projectId]/page.tsx (Overview) so
 * the sidebar's project switcher can show the same real brand icon instead
 * of a letter placeholder, without duplicating the URL-building logic.
 *
 * FAVICON-QUALITY-1 Fase 1 (2026-08-06): the size is derived from the CSS
 * size times the device pixel ratio, never fixed. A hardcoded `sz=64` was
 * being upscaled by the browser on every retina display — worst on the
 * Domains hero, 56 CSS px = 112 device px from a 64 px source. See
 * docs/brand/design-decisions-log.md §33.
 */

/** Sizes Google's S2 service actually serves. Anything else is rounded up by
 * the service itself, so asking for 100 silently gets you 128 — we do the
 * rounding here instead, to keep the URL honest about what comes back. */
const S2_SIZES = [16, 32, 64, 128, 256] as const;

/** Smallest size the service serves that still covers `px`, capped at 256
 * (S2's maximum — above it the service clamps and we would be lying in the
 * srcset descriptor about what the candidate contains). */
export function snapFaviconSize(px: number): number {
  if (!Number.isFinite(px) || px <= 0) return S2_SIZES[0];
  return S2_SIZES.find((size) => size >= px) ?? S2_SIZES[S2_SIZES.length - 1];
}

/**
 * Nuestro propio dominio no pasa por Google. Teníamos el icono en el repo y
 * aun así genscore.es salía con el globo genérico dentro de nuestro propio
 * producto, porque el índice de S2 se puebla por rastreo y a genscore.es no
 * había llegado. Servirlo local lo arregla al instante, es vectorial (nítido a
 * cualquier densidad, sin `srcSet`) y de paso no le contamos a Google que
 * alguien está mirando su propia cuenta.
 *
 * No es una excepción cosmética: es el único dominio del que tenemos el icono
 * auténtico, así que es el único donde adivinar sobra.
 */
const OWN_DOMAIN = "genscore.es";
const OWN_ICON = "/brand/genscore-tile.svg";

function cleanDomain(domain: string | null | undefined): string | null {
  if (!domain) return null;
  const clean = domain.trim().toLowerCase().replace(/^www\./, "");
  return clean || null;
}

/**
 * FAVICON-QUALITY-3a: apunta a nuestra propia ruta, no a Google directamente.
 * Lo que se gana no es un rodeo — es que el servidor puede mirar los bytes y
 * devolver **404** cuando lo que Google manda es su globo genérico, y un 404 sí
 * dispara el `onError` del `<img>`. De paso, el navegador del usuario deja de
 * contarle a Google qué cuenta está mirando.
 */
export function faviconUrl(domain: string | null | undefined, size = 64): string | null {
  const clean = cleanDomain(domain);
  if (!clean) return null;
  return `/api/favicon?domain=${encodeURIComponent(clean)}&sz=${snapFaviconSize(size)}`;
}

/** Density descriptors for an icon rendered at `cssSize` CSS pixels. The
 * browser picks purely by devicePixelRatio, so the per-density pixel budget
 * has to be baked in here — 3x is included because phones ship it and the
 * Overview panorama renders favicons on mobile. */
export function faviconSrcSet(domain: string | null | undefined, cssSize: number): string | null {
  if (!cleanDomain(domain)) return null;

  const candidates = [1, 2, 3].map((dpr) => ({
    dpr,
    size: snapFaviconSize(cssSize * dpr)
  }));

  // Collapse duplicates: once cssSize * dpr saturates at 256 the 2x and 3x
  // candidates are the same URL, and a srcset offering the same file twice
  // makes the browser download-decide over a distinction that does not exist.
  const seen = new Set<number>();
  const unique = candidates.filter((c) => {
    if (seen.has(c.size)) return false;
    seen.add(c.size);
    return true;
  });

  return unique.map((c) => `${faviconUrl(domain, c.size)} ${c.dpr}x`).join(", ");
}

/**
 * Everything an <img> needs to render a crisp favicon at `cssSize`. Returns
 * null when there is no domain, so call sites keep their existing
 * letter-initial fallback branch.
 *
 * `src` is the 1x candidate: browsers that ignore srcset get a correctly
 * sized icon rather than the largest one.
 */
export function faviconImgProps(
  domain: string | null | undefined,
  cssSize: number
): { src: string; srcSet?: string } | null {
  // Un SVG no necesita candidatos por densidad: escala solo.
  if (cleanDomain(domain) === OWN_DOMAIN) return { src: OWN_ICON };

  const src = faviconUrl(domain, cssSize);
  const srcSet = faviconSrcSet(domain, cssSize);
  if (!src || !srcSet) return null;
  return { src, srcSet };
}
