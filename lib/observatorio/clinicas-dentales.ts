import { BLOG_POSTS } from "@/lib/blog/posts";

/**
 * OBSERVATORIO-DENTAL-1: datos de la primera edición del observatorio de
 * visibilidad en IA de clínicas dentales.
 *
 * Fuente única: el estudio ya publicado en
 * `/blog/que-clinicas-dentales-recomienda-la-ia` (medición del 10-10-2026).
 * Las cifras se copian de ese artículo y ninguna página del observatorio
 * calcula nada nuevo: una segunda copia de una cifra es una cifra que se
 * desincroniza, así que el texto apunta siempre al estudio.
 *
 * Regla pública (Denis, 28-10-2026): solo se nombran negocios que la IA
 * SÍ recomienda. Ninguna página pública lista clínicas que no aparecen;
 * eso solo lo ve cada clínica en su diagnóstico privado. El test de este
 * módulo lo fuerza: toda clínica presente aquí tiene presencia > 0.
 */

export const EDITION = {
  id: "2026-10",
  /** Fecha de la medición, la del estudio publicado. */
  measuredAt: "2026-10-10",
  label: "octubre de 2026",
  studySlug: "que-clinicas-dentales-recomienda-la-ia"
} as const;

export const STUDY_HREF = `/blog/${EDITION.studySlug}`;

export type EngineKey = "gemini" | "chatgpt" | "claude";

export const ENGINES: Record<EngineKey, string> = {
  gemini: "Gemini",
  chatgpt: "ChatGPT",
  claude: "Claude"
};

export type ClinicEntry = {
  slug: string;
  name: string;
  /** Cadena de clínicas; el estudio las marca aparte. */
  chain: boolean;
  /** Porcentaje de respuestas que la nombran al menos una vez (0-100). */
  presence: number;
  /** Presencia desglosada por motor (0-100). */
  byEngine: Record<EngineKey, number>;
};

export type CityId = "madrid" | "valencia";

export const CITIES: Record<CityId, { name: string; clinics: ClinicEntry[] }> = {
  madrid: {
    name: "Madrid",
    clinics: [
      { slug: "sanitas-dental", name: "Sanitas Dental", chain: true, presence: 19, byEngine: { gemini: 0, chatgpt: 0, claude: 58 } },
      { slug: "ferrus-bratos", name: "Ferrus & Bratos", chain: false, presence: 17, byEngine: { gemini: 42, chatgpt: 8, claude: 0 } },
      { slug: "vitaldent", name: "Vitaldent", chain: true, presence: 14, byEngine: { gemini: 0, chatgpt: 8, claude: 33 } },
      { slug: "clinica-palma-medicodental", name: "Clínica Palma Medicodental", chain: false, presence: 11, byEngine: { gemini: 17, chatgpt: 17, claude: 0 } },
      { slug: "clinica-ciro", name: "Clínica CIRO", chain: false, presence: 11, byEngine: { gemini: 8, chatgpt: 25, claude: 0 } },
      { slug: "citadental", name: "Citadental", chain: false, presence: 11, byEngine: { gemini: 33, chatgpt: 0, claude: 0 } }
    ]
  },
  valencia: {
    name: "Valencia",
    clinics: [
      { slug: "clinica-llobell", name: "Clínica Llobell", chain: false, presence: 22, byEngine: { gemini: 50, chatgpt: 17, claude: 0 } },
      { slug: "asensio-odontologia-avanzada", name: "Asensio Odontología Avanzada", chain: false, presence: 22, byEngine: { gemini: 50, chatgpt: 17, claude: 0 } },
      { slug: "vitaldent", name: "Vitaldent", chain: true, presence: 17, byEngine: { gemini: 0, chatgpt: 0, claude: 50 } },
      { slug: "instituto-cimev", name: "Instituto CIMEV", chain: false, presence: 14, byEngine: { gemini: 33, chatgpt: 8, claude: 0 } },
      { slug: "clara-martinez-valero", name: "Clara Martínez Valero", chain: false, presence: 14, byEngine: { gemini: 33, chatgpt: 8, claude: 0 } },
      { slug: "clinica-peydro", name: "Clínica Peydró", chain: false, presence: 11, byEngine: { gemini: 33, chatgpt: 0, claude: 0 } },
      { slug: "clinica-badal", name: "Clínica Badal", chain: false, presence: 11, byEngine: { gemini: 0, chatgpt: 33, claude: 0 } },
      { slug: "centro-odontologico-dr-puchol", name: "Centro Odontológico Dr. Puchol", chain: false, presence: 11, byEngine: { gemini: 33, chatgpt: 0, claude: 0 } }
    ]
  }
};

export const CITY_IDS = Object.keys(CITIES) as CityId[];

export function getCity(id: string): { id: CityId; name: string; clinics: ClinicEntry[] } | undefined {
  if (id === "madrid" || id === "valencia") return { id, ...CITIES[id] };
  return undefined;
}

export type ClinicSighting = { clinic: ClinicEntry; city: CityId; cityName: string };

/** Apariciones de una clínica por slug; una cadena puede salir en dos ciudades. */
export function getClinicSightings(slug: string): ClinicSighting[] {
  return CITY_IDS.flatMap((city) =>
    CITIES[city].clinics
      .filter((clinic) => clinic.slug === slug)
      .map((clinic) => ({ clinic, city, cityName: CITIES[city].name }))
  );
}

/** Slugs únicos de todas las clínicas nombradas en alguna ciudad. */
export function allClinicSlugs(): string[] {
  return [...new Set(CITY_IDS.flatMap((city) => CITIES[city].clinics.map((c) => c.slug)))];
}

/** Nombre de una clínica por slug (igual en todas las ciudades). */
export function clinicName(slug: string): string | undefined {
  return getClinicSightings(slug)[0]?.clinic.name;
}

/** El estudio del que salen los datos existe de verdad en el blog. */
export function studyExists(posts: typeof BLOG_POSTS = BLOG_POSTS): boolean {
  return posts.some((p) => p.slug === EDITION.studySlug);
}
