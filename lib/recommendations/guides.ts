/**
 * RECS-GUIDES-1 (log §416). «Cómo hacerlo»: each recommendation type points to
 * the one blog article that explains how to do that kind of task. Only an
 * article that already exists and covers exactly that task; a type without
 * one gets no link (Google cards included). Pure and client-safe: it does not
 * import the blog index (56 KB), so `guides.test.ts` checks every slug exists.
 */
const GUIDE_BY_TYPE: Record<string, { slug: string; label: string }> = {
  increase_brand_visibility: { slug: "como-conseguir-que-chatgpt-te-cite", label: "Cómo conseguir que la IA cite tu web" },
  add_citation_block: { slug: "como-conseguir-que-chatgpt-te-cite", label: "Cómo conseguir que la IA cite tu web" },
  create_faq_section: { slug: "como-conseguir-que-chatgpt-te-cite", label: "Cómo conseguir que la IA cite tu web" },
  pursue_citation_sources: { slug: "que-fuentes-cita-la-ia", label: "Qué fuentes cita la IA y cómo entrar en ellas" },
  pursue_media_sources: { slug: "que-fuentes-cita-la-ia", label: "Qué fuentes cita la IA y cómo entrar en ellas" },
  pursue_community_sources: { slug: "que-fuentes-cita-la-ia", label: "Qué fuentes cita la IA y cómo entrar en ellas" },
  pursue_comparator_sources: { slug: "que-fuentes-cita-la-ia", label: "Qué fuentes cita la IA y cómo entrar en ellas" },
  update_stale_content: { slug: "la-ia-prefiere-contenido-reciente", label: "Cómo actualizar contenido sin trampas" },
  address_negative_narrative: { slug: "chatgpt-informacion-incorrecta-de-tu-empresa", label: "Cómo corregir lo que la IA dice mal de ti" },
  strengthen_brand_entity_clarity: { slug: "chatgpt-informacion-incorrecta-de-tu-empresa", label: "Cómo corregir lo que la IA dice mal de ti" },
  track_emerging_competitor: { slug: "como-elegir-competidores-analisis-geo", label: "Cómo elegir bien a tus competidores" }
};

/** Tags the click so PostHog can tell guide visits from the app. */
export const GUIDE_SOURCE_PARAM = "desde=recomendaciones";

export type RecommendationGuide = { href: string; label: string };

export function guideForType(type: string): RecommendationGuide | null {
  const entry = GUIDE_BY_TYPE[type];
  if (!entry) return null;
  return { href: `/blog/${entry.slug}?${GUIDE_SOURCE_PARAM}`, label: entry.label };
}

export const GUIDED_TYPES: readonly string[] = Object.keys(GUIDE_BY_TYPE);
