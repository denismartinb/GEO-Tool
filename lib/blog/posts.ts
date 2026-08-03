/**
 * Single source of truth for blog post metadata (GROWTH-1 Fase 7a/7b, SEO
 * fields added in GROWTH-2 Fase 2.1) — used by the index page, the sitemap,
 * the RSS feed, and each post's own <title>/description/JSON-LD (via
 * ArticleSchema), so the same title/description/date never has to be typed
 * out in more than one place. Adding a post = one entry here + one new
 * app/blog/<slug>/page.mdx file.
 */
/**
 * GROWTH-2 Fase 2.5: cluster taxonomy for the blog (docs/content-strategy.md
 * §2, capa B). "playbooks" and "sectores" have no posts yet — they exist
 * here so the index can render an honest "próximamente" state instead of
 * silently omitting a cluster the strategy already committed to.
 */
export type BlogCluster = {
  key: "fundamentos" | "medicion" | "playbooks" | "sectores";
  title: string;
  description: string;
};

export const BLOG_CLUSTERS: BlogCluster[] = [
  {
    key: "fundamentos",
    title: "Fundamentos GEO",
    description: "Qué es GEO, en qué se diferencia del SEO, y por qué existe Genscore."
  },
  {
    key: "medicion",
    title: "Metodología y medición",
    description: "Cómo se mide la visibilidad de una marca en IA: GEO Score, prompts, competidores."
  },
  {
    key: "playbooks",
    title: "Playbooks de ejecución",
    description: "Cómo conseguir que un motor generativo te cite: llms.txt, datos estructurados, checklist técnico."
  },
  {
    key: "sectores",
    title: "GEO por sector",
    description: "GEO aplicado a ecommerce, SaaS y agencias."
  }
];

export type BlogPost = {
  slug: string;
  title: string;
  description: string;
  datePublished: string; // ISO date, e.g. "2026-07-12"
  /** Icon name (components/ui/icon.tsx) shown on the post's abstract gradient cover (components/blog/blog-cover.tsx) when there's no coverImage. */
  coverIcon: string;
  /** Path under /public to a real cover image (public/blog/<slug>/cover.png). When set, BlogCover renders this instead of the icon+gradient fallback. */
  coverImage?: string;
  /** Optional <title> override for search engines when it should differ from the on-page `title` (e.g. shorter, keyword-first). Falls back to `title` via getSeoTitle(). */
  seoTitle?: string;
  /** Optional meta description override, kept under ~160 chars for SERP snippets. Falls back to `description` via getMetaDescription(). */
  metaDescription?: string;
  /** The single primary keyword this URL targets — used by the content calendar and the SEO/GEO research agent to avoid two posts competing for the same query. Not rendered on the page. */
  primaryKeyword?: string;
  /** Which BLOG_CLUSTERS entry this post belongs to — GROWTH-2 Fase 2.5. */
  cluster: BlogCluster["key"];
};

export const BLOG_POSTS: BlogPost[] = [
  {
    slug: "que-es-el-geo-score",
    title: "Qué es el GEO Score y cómo se calcula",
    description:
      "La metodología detrás del GEO Score de GenScore: qué mide, cómo se combina presencia, prominencia, posición competitiva y autoridad, y por qué importa para saber cómo aparece tu marca en respuestas de IA.",
    datePublished: "2026-07-12",
    coverIcon: "trendUp",
    primaryKeyword: "geo score",
    cluster: "medicion"
  },
  {
    slug: "que-es-geo-generative-engine-optimization",
    title: "Qué es GEO (Generative Engine Optimization) y por qué no es lo mismo que SEO",
    description:
      "Descubre qué es el GEO, cómo funciona y por qué las marcas necesitan optimizar su presencia en ChatGPT, Gemini y Claude.",
    datePublished: "2026-07-13",
    coverIcon: "compass",
    coverImage: "/blog/que-es-geo-generative-engine-optimization/cover.png",
    // Not "qué es geo" — /geo (app/geo/page.tsx) already owns that keyword as
    // the commercial landing page. This post's real differentiator, and the
    // bulk of its body, is the SEO-vs-GEO comparison (GROWTH-2 Fase 2.6a).
    primaryKeyword: "geo vs seo",
    cluster: "fundamentos"
  },
  {
    slug: "como-elegir-prompts-monitorizar-marca-ia",
    title: "Cómo elegir los prompts correctos para monitorizar tu marca en IA",
    description:
      "Aprende una metodología práctica para seleccionar los prompts que realmente reflejan cómo tus clientes preguntan a ChatGPT y Gemini.",
    datePublished: "2026-07-13",
    coverIcon: "target",
    coverImage: "/blog/como-elegir-prompts-monitorizar-marca-ia/cover.png",
    primaryKeyword: "prompts para monitorizar marca en ia",
    cluster: "medicion"
  },
  {
    slug: "como-elegir-competidores-analisis-geo",
    title: "Cómo seleccionar los competidores adecuados para un análisis GEO",
    description:
      "Elegir mal a tus competidores puede distorsionar todo tu análisis GEO. Aprende una metodología para compararte con las marcas correctas.",
    datePublished: "2026-07-13",
    coverIcon: "layers",
    coverImage: "/blog/como-elegir-competidores-analisis-geo/cover.png",
    primaryKeyword: "competidores análisis geo",
    cluster: "medicion"
  },
  {
    slug: "genscore-vs-herramientas-geo",
    title: "GenScore frente a las herramientas GEO tradicionales: la diferencia entre medir y mejorar",
    description:
      "Muchas herramientas GEO muestran qué ocurre. GenScore busca ayudarte a decidir qué hacer después. Descubre en qué se diferencian.",
    datePublished: "2026-07-13",
    coverIcon: "refresh",
    coverImage: "/blog/genscore-vs-herramientas-geo/cover.png",
    primaryKeyword: "herramientas geo",
    cluster: "fundamentos"
  },
  {
    slug: "llms-txt-guia-practica",
    title: "llms.txt: guía práctica para crearlo (y qué esperar de verdad)",
    description:
      "Qué es llms.txt, cómo crear el tuyo paso a paso, y una respuesta honesta a la pregunta que importa: ¿mejora realmente cuánto te citan los motores de IA?",
    datePublished: "2026-08-03",
    coverIcon: "fileText",
    primaryKeyword: "llms.txt guía práctica",
    cluster: "playbooks"
  },
  {
    slug: "como-conseguir-que-chatgpt-te-cite",
    title: "Cómo conseguir que ChatGPT (y otros motores de IA) citen tu web",
    description:
      "Checklist práctico de lo que de verdad influye en si un motor generativo cita tu contenido como fuente: estructura, datos estructurados, autoridad y grounding.",
    datePublished: "2026-08-03",
    coverIcon: "cite",
    primaryKeyword: "cómo conseguir que chatgpt te cite",
    cluster: "playbooks"
  }
];

export function getBlogPost(slug: string): BlogPost | undefined {
  return BLOG_POSTS.find((p) => p.slug === slug);
}

/** Posts belonging to a given cluster, in the same order as BLOG_POSTS. */
export function getPostsByCluster(cluster: BlogCluster["key"]): BlogPost[] {
  return BLOG_POSTS.filter((p) => p.cluster === cluster);
}

/** <title> for search engines: `seoTitle` when set, otherwise `title`. */
export function getSeoTitle(post: BlogPost): string {
  return post.seoTitle ?? post.title;
}

/** Meta description for search engines: `metaDescription` when set, otherwise `description`. */
export function getMetaDescription(post: BlogPost): string {
  return post.metaDescription ?? post.description;
}
