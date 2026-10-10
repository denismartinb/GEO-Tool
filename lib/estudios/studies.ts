import { BLOG_POSTS, type BlogPost } from "@/lib/blog/posts";

/**
 * GEO-SELF-1 Fase 4 (log §260): the studies hub at `/estudios`.
 *
 * One list of the studies GenScore publishes, so engines and journalists
 * have a single URL to cite. Each study IS a blog post: title, date,
 * description and headline figure are read from `BLOG_POSTS` (and its
 * `heroStat`, which already carries a mandatory source), never rewritten
 * here — a second copy of a figure is a figure that drifts.
 *
 * `kind` is the only thing this file adds, because it is a claim the post
 * metadata does not make: whether the data is ours (measured with GenScore)
 * or a compilation of third-party sources.
 */
export type StudyKind = "propio" | "recopilacion";

export const STUDY_KIND_LABEL: Record<StudyKind, string> = {
  propio: "Dato propio",
  recopilacion: "Recopilación de fuentes"
};

const STUDY_ENTRIES: ReadonlyArray<{ slug: string; kind: StudyKind }> = [
  // SECTOR-STUDY-1 (log §246): real answers measured with /admin/estudio.
  { slug: "que-software-de-facturacion-recomienda-la-ia", kind: "propio" },
  // SECTOR-STUDY-2 (log §266): dental clinics, Madrid and Valencia.
  { slug: "que-clinicas-dentales-recomienda-la-ia", kind: "propio" },
  // STUDY-HOME-1 (log §251): third-party figures with source and sample.
  { slug: "de-buscar-a-preguntar", kind: "recopilacion" }
];

export type Study = { post: BlogPost; kind: StudyKind; href: string };

export function getStudies(posts: readonly BlogPost[] = BLOG_POSTS): Study[] {
  return STUDY_ENTRIES.map(({ slug, kind }) => {
    const post = posts.find((p) => p.slug === slug);
    if (!post) throw new Error(`Study "${slug}" has no blog post`);
    return { post, kind, href: `/blog/${slug}` };
  }).sort((a, b) => b.post.datePublished.localeCompare(a.post.datePublished));
}

/** Most recent publish/update date across the studies, for the sitemap. */
export function studiesLastModified(posts: readonly BlogPost[] = BLOG_POSTS): string {
  return getStudies(posts)
    .map((s) => s.post.dateUpdated ?? s.post.datePublished)
    .sort()
    .at(-1)!;
}

export const STUDIES_TITLE = "Estudios de GenScore sobre búsqueda e IA en España";

export const STUDIES_LEAD =
  "Datos sobre cómo la IA está cambiando la forma de buscar y elegir en España: estudios con dato propio, medidos con preguntas reales a ChatGPT, Gemini y Claude, y recopilaciones de fuentes de terceros con su muestra y su fecha.";

/** How we measure, in the terms the founder allows (log §246): no counts, no model versions. */
export const STUDIES_METHOD: readonly string[] = [
  "Los estudios con dato propio se realizan mediante un sistema algorítmico que genera las preguntas de búsqueda más relevantes de un sector o empresa y realiza un análisis determinista en ChatGPT, Gemini y Claude, múltiples veces en cada motor y en distintos momentos del tiempo.",
  "Una marca cuenta como recomendada sólo si su nombre aparece en la respuesta. Publicamos porcentajes, nunca recuentos sueltos, porque una sola respuesta no es un dato.",
  "Las recopilaciones citan cada cifra con su fuente, su muestra y su fecha. Una cifra sin fuente no entra."
];
