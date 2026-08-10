import type { Metadata } from "next";

/**
 * Constructor único de metadata para páginas públicas (SEO-POS-1, T5).
 *
 * Existe por dos razones, y la segunda es un fallo real que costó descubrir:
 *
 * 1. Hasta 2026-08-09 ninguna página de contenido declaraba Open Graph propio,
 *    así que los 10 artículos, las comparativas, los docs y las 16 páginas de
 *    glosario se compartían todos con el mismo título «Genscore» y la misma
 *    imagen genérica. Las portadas reales ya existían en `public/blog/**` sin
 *    usarse para esto.
 * 2. **En Next.js el `openGraph` de una página REEMPLAZA el del layout raíz; no
 *    se fusiona campo a campo.** Declarar `openGraph: { title, description }`
 *    en una página le quita `og:image`, `og:site_name` y `og:locale` — sin
 *    ningún error, y con el resultado de que la tarjeta al compartir queda peor
 *    que antes de "mejorarla". Pasó exactamente eso en la home y en `/pricing`
 *    (SEO-POS-1 T-a, corregido aquí). Por eso este helper siempre emite el
 *    objeto completo: nadie debería tener que acordarse de esa regla otra vez.
 */

export const SITE_URL = "https://www.genscore.es";
export const SITE_NAME = "Genscore";

/** Imagen de marca por defecto, la misma del layout raíz. Sus medidas se conocen. */
export const DEFAULT_OG_IMAGE = { url: "/brand/genscore-og.png", width: 1200, height: 630 };

/**
 * Formatos que las redes sociales renderizan de verdad en una tarjeta. El SVG
 * NO está: Facebook, LinkedIn y X lo ignoran, así que un `og:image` apuntando a
 * un `.svg` da una tarjeta en blanco. Tres portadas del blog son SVG
 * (`geo-para-ecommerce`, `geo-para-saas-b2b`, `geo-para-agencias`), y usarlas
 * aquí habría sido peor que no declarar imagen ninguna.
 */
const RASTER = /\.(png|jpe?g|webp|gif)$/i;

/** La portada si sirve como tarjeta social; si no, la imagen de marca. */
export function ogImageFor(cover: string | undefined): { url: string; width?: number; height?: number } {
  if (!cover || !RASTER.test(cover)) return DEFAULT_OG_IMAGE;
  // Sin `width`/`height`: las portadas reales son cuadradas de 1254×1254 y
  // declararlas como 1200×630 sería mentir sobre el activo. Omitirlas es
  // válido — el rastreador descarga la imagen y la mide.
  return { url: cover };
}

export type ContentMetadataInput = {
  /** `<title>` completo, tal cual debe salir en el SERP. */
  title: string;
  description: string;
  /** Ruta con barra inicial (`/blog/slug`); cadena vacía para la home. */
  path: string;
  /** Imagen relativa al sitio (`/blog/slug/cover.png`). Cae a la de marca. */
  image?: string;
  /** `article` en piezas del blog, `website` en el resto. */
  type?: "website" | "article";
  /** ISO date; solo se emite en `type: "article"`. */
  publishedTime?: string;
  /** ISO date de la última actualización real (SEO-POS-1, T9). Solo se emite en `type: "article"`. */
  modifiedTime?: string;
  /** Declara el RSS del blog como alternativa descubrible (T11). */
  rss?: boolean;
};

/** URL absoluta de una ruta interna, sin barra final. */
export function absoluteUrl(path: string): string {
  if (!path) return SITE_URL;
  return `${SITE_URL}${path.startsWith("/") ? path : `/${path}`}`;
}

export function contentMetadata(input: ContentMetadataInput): Metadata {
  const { title, description, path, image, type = "website", publishedTime, modifiedTime, rss } = input;
  const url = absoluteUrl(path);
  const ogImage = ogImageFor(image);

  return {
    title,
    description,
    alternates: {
      canonical: url,
      ...(rss
        ? { types: { "application/rss+xml": `${SITE_URL}/feed.xml` } }
        : {})
    },
    openGraph: {
      title,
      description,
      url,
      siteName: SITE_NAME,
      images: [ogImage],
      locale: "es_ES",
      type,
      ...(type === "article" && publishedTime ? { publishedTime } : {}),
      ...(type === "article" && modifiedTime ? { modifiedTime } : {})
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [ogImage.url]
    }
  };
}
