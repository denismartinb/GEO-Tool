import { deriveBrandFromDomain, cleanDomain } from "@/lib/projects/project-form";
import { isGenericAliasTerms, MAX_ALIASES } from "@/lib/projects/brand-aliases";
import { validateNewAlias } from "@/lib/brand-aliases/normalize-aliases";

/**
 * ONBOARDING-IDENTITY-1 — la identidad de marca que el asistente propone y el
 * usuario confirma ANTES del primer escaneo.
 *
 * Hasta aquí el asistente nunca enviaba `brand`: el servidor lo derivaba del
 * dominio (`deriveBrandFromDomain`) y nadie lo veía. Para elcorteingles.es eso
 * dio «Elcorteingles», y el escaneo midió cero aunque las respuestas decían
 * «El Corte Inglés» (log §237). El nombre comercial y el dominio son dos
 * cosas: el dominio identifica la web, el nombre es lo que la IA escribe.
 *
 * Todo es puro y sin red. La comparación del verificador de menciones NO se
 * toca aquí (`lib/scan/extraction.ts`): lo que cambia es el nombre que se le
 * entrega.
 */

export const MAX_BRAND_LENGTH = 120;

export type BrandProposal = {
  brand: string;
  /** De dónde sale la propuesta: el título de la portada o, si no hubo, el dominio. */
  source: "homepage_title" | "domain";
  /**
   * `true` cuando la propuesta sale sólo del dominio. Es una inferencia que
   * puede estar mal escrita (espacios, tildes, mayúsculas) y la pantalla lo
   * dice; no bloquea, porque la marca siempre se puede editar.
   */
  pending: boolean;
};

function alnumKey(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

/**
 * Propone un nombre comercial. Usa el título de la portada SOLO si uno de sus
 * tramos, sin espacios ni tildes, es exactamente la etiqueta del dominio
 * («El Corte Inglés | Moda…» ↔ `elcorteingles`). Esa igualdad aquí sirve para
 * escribir bien el nombre propuesto; no decide ninguna mención y no relaja la
 * comparación del escaneo.
 */
export function proposeBrand(domain: string, homepageTitle: string | null | undefined): BrandProposal {
  const clean = cleanDomain(domain);
  const label = alnumKey(clean.split(".")[0] ?? "");

  if (homepageTitle && label) {
    const segments = homepageTitle
      .split(/\s[|\-–—·:]\s|[|·]/)
      .map((segment) => segment.replace(/\s+/g, " ").trim())
      .filter(Boolean);
    for (const segment of segments) {
      if (segment.length <= MAX_BRAND_LENGTH && alnumKey(segment) === label) {
        return { brand: segment, source: "homepage_title", pending: false };
      }
    }
  }

  return { brand: deriveBrandFromDomain(clean), source: "domain", pending: true };
}

/** Nombre comercial editable: espacios colapsados, sin vacíos ni excesos. */
export function sanitizeBrandName(raw: string | null | undefined): string | null {
  const brand = (raw ?? "").replace(/\s+/g, " ").trim();
  if (!brand || brand.length > MAX_BRAND_LENGTH) return null;
  return brand;
}

/**
 * Aliases confirmados por el usuario. Pasan por las mismas reglas que el alta
 * manual en Dominios (`validateNewAlias`): longitud mínima, genéricos, y que no
 * repitan a la marca ni entre sí. Lo que no pasa se devuelve aparte, con el
 * motivo, para enseñárselo y no descartarlo en silencio.
 */
export function sanitizeConfirmedAliases(
  raw: readonly string[],
  brand: string
): { accepted: string[]; rejected: Array<{ alias: string; error: string }> } {
  const accepted: string[] = [];
  const rejected: Array<{ alias: string; error: string }> = [];
  for (const item of raw) {
    if (typeof item !== "string") continue;
    if (accepted.length >= MAX_ALIASES) {
      rejected.push({ alias: item, error: `Máximo de ${MAX_ALIASES} alias.` });
      continue;
    }
    if (isGenericAliasTerms(item)) {
      rejected.push({ alias: item, error: "Es una palabra genérica del sector, no un nombre de tu marca." });
      continue;
    }
    const result = validateNewAlias({ raw: item, brand, existingAliases: accepted });
    if (result.ok) accepted.push(result.alias);
    else rejected.push({ alias: item, error: result.error });
  }
  return { accepted, rejected };
}
