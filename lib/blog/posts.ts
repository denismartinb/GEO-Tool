import { contentMetadata, SITE_URL } from "@/lib/seo/metadata";

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
  /**
   * GROWTH-2 Fase 2.9 (B1b): longer synthesis paragraph(s) for the cluster's
   * own pillar page (/blog/<key>) — only set once a cluster has enough real
   * posts to synthesize honestly. Undefined for "sectores" on purpose: it
   * has zero posts today, so there is nothing real to synthesize yet.
   * Paragraphs joined by \n\n, same convention as GlossaryTerm.longDefinition.
   */
  pillarIntro?: string;
};

export const BLOG_CLUSTERS: BlogCluster[] = [
  {
    key: "fundamentos",
    title: "Fundamentos GEO",
    description: "Qué es GEO, en qué se diferencia del SEO, y por qué existe GenScore.",
    pillarIntro:
      "GEO (Generative Engine Optimization) parte de un cambio simple de constatar pero profundo en sus consecuencias: cada vez más gente pregunta directamente a ChatGPT, Gemini o Claude en vez de buscar en Google, y esos motores no devuelven una lista de enlaces — elaboran una respuesta y recomiendan marcas por su nombre. Puedes tener un SEO excelente y aun así ser invisible en esa respuesta, porque es una señal distinta: no se mide con un ranking, sino con si el modelo te menciona, en qué posición, y si respalda esa mención con una fuente real.\n\nEsta sección reúne los artículos que explican esos fundamentos desde cero: qué es el GEO exactamente y en qué se diferencia del SEO clásico, y cómo se compara GenScore con otras herramientas GEO que ya existen. Si es la primera vez que oyes hablar de esto, empieza aquí antes de pasar a la sección de Metodología y medición."
  },
  {
    key: "medicion",
    title: "Metodología y medición",
    description: "Cómo se mide la visibilidad de una marca en IA: GEO Score, prompts, competidores.",
    pillarIntro:
      "Medir GEO bien no es tan simple como lanzar una pregunta a ChatGPT y ver si sale tu marca. Una consulta aislada no representa la realidad: cada cliente pregunta con palabras distintas para el mismo problema, y las respuestas de un motor generativo cambian con el tiempo. Medirlo con rigor exige un conjunto de prompts que representen de verdad cómo pregunta tu cliente, un grupo de competidores elegido con criterio, y una métrica que resuma varias señales a la vez en vez de fiarlo todo a una.\n\nEsta sección reúne los artículos sobre esa metodología: qué es el GEO Score de GenScore y qué mide, cómo elegir los prompts correctos para monitorizar tu marca, y cómo seleccionar los competidores adecuados para que la comparación tenga sentido. Es la base técnica antes de pasar a los playbooks de ejecución."
  },
  {
    key: "playbooks",
    title: "Playbooks de ejecución",
    description: "Cómo conseguir que un motor generativo te cite: llms.txt, datos estructurados, checklist técnico.",
    pillarIntro:
      "Medir tu visibilidad en IA es el primer paso, no el último — el paso siguiente es actuar sobre lo que descubres. Esta sección reúne guías prácticas y honestas sobre qué de verdad influye en si un motor generativo cita tu contenido como fuente: desde el fichero llms.txt (con una respuesta clara a si de verdad ayuda, sin venderlo como una palanca mágica) hasta un checklist completo de lo que hace que un contenido sea citable — estructura, datos estructurados, autoridad de dominio.\n\nSon artículos pensados para ejecutar, no solo para entender la teoría — si ya sabes qué es el GEO y cómo se mide, esta es la sección donde se traduce en acciones concretas."
  },
  {
    key: "sectores",
    title: "GEO por sector",
    description: "GEO aplicado a ecommerce, SaaS y agencias.",
    pillarIntro:
      "Las reglas del GEO son las mismas para todos, pero la pregunta que hace un comprador no se parece en nada a la que hace un comité de compra de software. Un cliente de ecommerce pregunta por una decisión con presupuesto y restricción —\"un regalo para alguien que empieza a correr, menos de 60 euros\"— y recibe dos o tres nombres. Un comprador B2B hace una secuencia larga de preguntas antes de pedir una demo, y ninguna de ellas menciona todavía a un proveedor. Medir lo mismo en los dos casos da un número que no significa nada.\n\nEsta sección traduce la metodología a cada sector: qué preguntas representan de verdad a sus clientes, qué fuentes cita el modelo en ese mercado, y cuál es la palanca que rinde primero. Empieza por ecommerce, donde la lista corta de marcas es literalmente corta y el trabajo útil está casi todo fuera de tu propia web."
  }
];

export type BlogPost = {
  slug: string;
  title: string;
  description: string;
  datePublished: string; // ISO date, e.g. "2026-07-12"
  /** Icon name (components/ui/icon.tsx) shown on the post's abstract gradient cover (components/blog/blog-cover.tsx) when there's no coverImage. */
  coverIcon: string;
  /**
   * Path under /public to a real cover image (public/blog/<slug>/cover.webp
   * for raster illustrations, cover.svg for vector ones). When set, BlogCover
   * renders this instead of the icon+gradient fallback.
   *
   * Raster covers are WebP, never PNG: the four original PNGs weighed 8,2 MB
   * between them — 95 % of everything under public/ — and re-encoding them at
   * quality 90 gave 256 KB total (PSNR 41-43 dB, i.e. no visible loss).
   * tests/asset-budget.test.ts keeps that from creeping back.
   */
  coverImage?: string;
  /**
   * ISO date of the last real refresh (SEO-POS-1, T9). Unset means "never
   * refreshed" — `dateModified` in Article schema then falls back to
   * `datePublished`, exactly as before this field existed, and no "Actualizado
   * el…" line renders. Only ever set when a refresh actually changed a fact,
   * an example or a section (content-strategy.md §4.4: "nunca solo la
   * fecha") — never bump this on its own.
   */
  dateUpdated?: string;
  /** Optional <title> override for search engines when it should differ from the on-page `title` (e.g. shorter, keyword-first). Falls back to `title` via getSeoTitle(). */
  seoTitle?: string;
  /** Optional meta description override, kept under ~160 chars for SERP snippets. Falls back to `description` via getMetaDescription(). */
  metaDescription?: string;
  /** The single primary keyword this URL targets — used by the content calendar and the SEO/GEO research agent to avoid two posts competing for the same query. Not rendered on the page. */
  primaryKeyword?: string;
  /** Which BLOG_CLUSTERS entry this post belongs to — GROWTH-2 Fase 2.5. */
  cluster: BlogCluster["key"];
  /**
   * BLOG-REDESIGN-1: big figure on the article's dark hero. Only a figure the
   * post already publishes with a citable source (our own study or a third
   * party's), and `source` is mandatory — a post without one renders no
   * figure rather than one picked to fill the space (log §247).
   */
  heroStat?: { value: string; label: string; source: string };
  /**
   * CONTENT-LAUNCH-2 (log §296): for a launch post with no figure to show,
   * the logos of what the post is about, in the slot `heroStat` would use.
   * Groups are joined by a «+». Real brand files from `public/brand/engines/`,
   * never a made-up figure, and never GenScore's own mark next to Google's
   * «G»: side by side they read as the same logo (founder, 2026-10-11).
   * A post about third-party products we have no permission to show uses
   * its own monogram tiles instead (log §316).
   * Rendered above `heroStat` when the post has both.
   */
  heroLogos?: { name: string; src: string; badge?: string }[][];
};

export const BLOG_POSTS: BlogPost[] = [
  {
    slug: "que-es-el-geo-score",
    title: "Qué es el GEO Score y qué mide",
    metaDescription:
      "Qué mide el GEO Score de GenScore (presencia, prominencia, posición competitiva, autoridad y preparación técnica) y cómo leerlo sin engañarte.",
    description:
      "Qué mide el GEO Score de GenScore —presencia, prominencia, posición competitiva, autoridad y preparación técnica— y cómo leerlo sin engañarte para saber cómo aparece tu marca en respuestas de IA.",
    datePublished: "2026-07-12",
    // Refresco real (SEO-POS-1 S6, log §72): el artículo publicaba los cuatro
    // componentes y los pesos de GEO Score v2 (.40/.25/.20/.15) — superados
    // por GEO-SCORE-V4 (ADR 0033, 2026-08-05), que añadió el componente
    // técnico y reescaló el resto. `/docs/metodologia/geo-score` ya publicaba
    // los pesos nuevos, así que el sitio se contradecía a sí mismo.
    dateUpdated: "2026-08-13",
    coverIcon: "trendUp",
    coverImage: "/blog/que-es-el-geo-score/cover.webp",
    primaryKeyword: "geo score",
    cluster: "medicion"
  },
  {
    slug: "que-es-geo-generative-engine-optimization",
    title: "Qué es GEO (Generative Engine Optimization) y por qué no es lo mismo que SEO",
    seoTitle: "Qué es GEO: el posicionamiento en IA frente al SEO",
    description:
      "Descubre qué es el GEO, cómo funciona y por qué las marcas necesitan optimizar su presencia en ChatGPT, Gemini y Claude.",
    datePublished: "2026-07-13",
    coverIcon: "compass",
    coverImage: "/blog/que-es-geo-generative-engine-optimization/cover.webp",
    // Not "qué es geo" — /geo (app/geo/page.tsx) already owns that keyword as
    // the commercial landing page. This post's real differentiator, and the
    // bulk of its body, is the SEO-vs-GEO comparison (GROWTH-2 Fase 2.6a).
    primaryKeyword: "geo vs seo",
    cluster: "fundamentos"
  },
  {
    slug: "como-elegir-prompts-monitorizar-marca-ia",
    title: "Cómo elegir los prompts correctos para monitorizar tu marca en IA",
    seoTitle: "Cómo elegir los prompts para monitorizar tu marca en IA",
    description:
      "Aprende una metodología práctica para seleccionar los prompts que realmente reflejan cómo tus clientes preguntan a ChatGPT y Gemini.",
    datePublished: "2026-07-13",
    coverIcon: "target",
    coverImage: "/blog/como-elegir-prompts-monitorizar-marca-ia/cover.webp",
    primaryKeyword: "prompts para monitorizar marca en ia",
    cluster: "medicion"
  },
  {
    slug: "como-elegir-competidores-analisis-geo",
    title: "Cómo seleccionar los competidores adecuados para un análisis GEO",
    seoTitle: "Cómo elegir competidores para un análisis GEO",
    description:
      "Elegir mal a tus competidores puede distorsionar todo tu análisis GEO. Aprende una metodología para compararte con las marcas correctas.",
    datePublished: "2026-07-13",
    coverIcon: "layers",
    coverImage: "/blog/como-elegir-competidores-analisis-geo/cover.webp",
    primaryKeyword: "competidores análisis geo",
    cluster: "medicion"
  },
  {
    slug: "geo-vs-aeo-vs-seo",
    title: "GEO vs AEO vs SEO: qué significa cada sigla (y cuál usar)",
    metaDescription:
      "GEO, AEO, SEO y LLMO se usan como sinónimos. Qué significa cada sigla, quién usa cada término y cuál conviene según lo que quieras medir.",
    description:
      "GEO, AEO, SEO y LLMO se usan a menudo como sinónimos y el sector no se ha puesto de acuerdo en un nombre único. Qué significa cada sigla, quién usa cada término y cuál conviene según lo que quieras medir.",
    datePublished: "2026-08-23",
    coverIcon: "lang",
    coverImage: "/blog/geo-vs-aeo-vs-seo/cover.webp",
    primaryKeyword: "geo vs aeo vs seo",
    cluster: "fundamentos"
  },
  {
    slug: "genscore-vs-herramientas-geo",
    title: "GenScore frente a las herramientas GEO tradicionales: la diferencia entre medir y mejorar",
    seoTitle: "GenScore frente a otras herramientas GEO: medir y mejorar",
    description:
      "Muchas herramientas GEO muestran qué ocurre. GenScore busca ayudarte a decidir qué hacer después. Descubre en qué se diferencian.",
    datePublished: "2026-07-13",
    coverIcon: "refresh",
    coverImage: "/blog/genscore-vs-herramientas-geo/cover.webp",
    primaryKeyword: "herramientas geo",
    cluster: "fundamentos"
  },
  {
    slug: "llms-txt-guia-practica",
    title: "llms.txt: guía práctica para crearlo (y qué esperar de verdad)",
    seoTitle: "llms.txt: guía práctica para crearlo y qué esperar",
    description:
      "Qué es llms.txt, cómo crear el tuyo paso a paso, y una respuesta honesta a la pregunta que importa: ¿mejora realmente cuánto te citan los motores de IA?",
    datePublished: "2026-08-03",
    coverIcon: "fileText",
    coverImage: "/blog/llms-txt-guia-practica/cover.webp",
    primaryKeyword: "llms.txt guía práctica",
    cluster: "playbooks"
  },
  {
    slug: "como-conseguir-que-chatgpt-te-cite",
    title: "Cómo conseguir que ChatGPT (y otros motores de IA) citen tu web",
    seoTitle: "Cómo conseguir que ChatGPT y otros motores citen tu web",
    description:
      "Checklist práctico de lo que de verdad influye en si un motor generativo cita tu contenido como fuente: estructura, datos estructurados, autoridad y grounding.",
    datePublished: "2026-08-03",
    coverIcon: "cite",
    coverImage: "/blog/como-conseguir-que-chatgpt-te-cite/cover.webp",
    primaryKeyword: "cómo conseguir que chatgpt te cite",
    cluster: "playbooks"
  },
  {
    slug: "que-es-una-auditoria-geo",
    title: "Qué es una auditoría GEO (y el checklist para hacerla tú mismo)",
    seoTitle: "Qué es una auditoría GEO y checklist para hacerla tú",
    metaDescription:
      "Una auditoría SEO pregunta si puedes posicionar; una GEO, si te pueden citar. Las seis dimensiones, sus umbrales y un checklist de trece puntos.",
    description:
      "Una auditoría SEO pregunta si puedes posicionar; una GEO, si te pueden citar. Las seis dimensiones que se revisan, con sus umbrales exactos, y un checklist de trece puntos para pasarlo a mano.",
    datePublished: "2026-08-13",
    coverIcon: "check",
    coverImage: "/blog/que-es-una-auditoria-geo/cover.webp",
    primaryKeyword: "qué es una auditoría geo",
    cluster: "playbooks"
  },
  {
    slug: "metricas-geo-que-medir",
    title: "Métricas GEO: qué medir y qué no",
    description:
      "Cinco métricas dicen de verdad cómo aparece tu marca en las respuestas de IA, y tres de las más repetidas engañan. Con los umbrales reales: cuántas respuestas hacen falta antes de leer un número.",
    metaDescription:
      "Qué métricas GEO miden de verdad tu visibilidad en IA (mención, cuota de voz, posición, citación) y cuáles engañan.",
    datePublished: "2026-08-13",
    coverIcon: "trendUp",
    coverImage: "/blog/metricas-geo-que-medir/cover.webp",
    primaryKeyword: "métricas geo",
    cluster: "medicion"
  },
  {
    slug: "como-aparecer-en-perplexity",
    title: "Cómo aparecer en Perplexity (y en qué se diferencia de otros motores)",
    seoTitle: "Cómo aparecer en Perplexity y en qué se diferencia",
    description:
      "Perplexity ancla cada afirmación a una cita numerada, no solo te menciona. Qué hacer distinto: estructura citable, datos con procedencia, frescura, y cómo medirlo con GenScore en Pro y Agencia.",
    metaDescription:
      "Cómo aparecer en Perplexity: por qué es distinto de Google y de ChatGPT, y qué mueve de verdad que te cite.",
    datePublished: "2026-08-14",
    dateUpdated: "2026-10-11",
    coverIcon: "search",
    coverImage: "/blog/como-aparecer-en-perplexity/cover.webp",
    primaryKeyword: "cómo aparecer en perplexity",
    cluster: "playbooks"
  },
  {
    slug: "como-medir-trafico-chatgpt-ga4",
    title: "Cómo medir en GA4 el tráfico que llega desde ChatGPT",
    description:
      "GA4 ya trae un canal propio para asistentes de IA desde mayo de 2026. Qué ve, qué deja fuera, y por qué lo que enseña es un suelo con un multiplicador desconocido, no el total.",
    metaDescription:
      "Cómo ver en GA4 el tráfico que llega desde ChatGPT con el canal «Asistente de IA», qué se queda en Directo y cómo recuperarlo.",
    datePublished: "2026-08-14",
    coverIcon: "trendUp",
    coverImage: "/blog/como-medir-trafico-chatgpt-ga4/cover.webp",
    primaryKeyword: "medir tráfico chatgpt ga4",
    cluster: "medicion",
    heroStat: {
      value: "71%",
      label: "de las visitas que llegan desde ChatGPT acaban clasificadas como «Directo» en GA4.",
      source: "Attrifast, análisis de 41,2 M de sesiones (2026)"
    }
  },
  {
    slug: "como-hacer-que-chatgpt-recomiende-tu-negocio",
    title: "Cómo hacer que ChatGPT recomiende tu negocio (guía para pymes)",
    seoTitle: "Cómo hacer que ChatGPT recomiende tu negocio",
    description:
      "Un negocio local compite por dos o tres puestos, no por veinte. Qué mueve de verdad esa recomendación: datos consistentes, reseñas recientes, contenido específico — y qué atajos no funcionan.",
    metaDescription:
      "Cómo hacer que ChatGPT recomiende tu negocio local: datos consistentes, reseñas recientes y contenido específico, sin atajos.",
    datePublished: "2026-08-15",
    coverIcon: "target",
    coverImage: "/blog/como-hacer-que-chatgpt-recomiende-tu-negocio/cover.webp",
    primaryKeyword: "cómo hacer que chatgpt recomiende mi negocio",
    cluster: "playbooks"
  },
  {
    slug: "como-saber-si-tu-marca-aparece-en-chatgpt",
    title: "Cómo saber si tu marca aparece en ChatGPT, Gemini, Claude y Perplexity",
    seoTitle: "Cómo saber si tu marca aparece en ChatGPT y otras IA",
    metaDescription:
      "Tres formas de comprobarlo: qué preguntas probar tú mismo, qué mirar en tu analítica y cuándo hace falta una herramienta de monitorización.",
    description:
      "Tres formas reales de comprobarlo, de la manual y gratuita a la sistemática: qué prompts probar tú mismo, qué mirar en tu analítica, y cuándo hace falta una herramienta de monitorización.",
    datePublished: "2026-08-10",
    coverIcon: "search",
    coverImage: "/blog/como-saber-si-tu-marca-aparece-en-chatgpt/cover.webp",
    primaryKeyword: "cómo saber si mi marca aparece en chatgpt",
    cluster: "playbooks"
  },
  {
    slug: "chatgpt-informacion-incorrecta-de-tu-empresa",
    title: "Cuando ChatGPT dice algo falso o desactualizado de tu empresa: cómo corregirlo",
    seoTitle: "ChatGPT dice algo falso de tu empresa: cómo corregirlo",
    description:
      "Un precio viejo, un producto que ya no vendes, una dirección equivocada: sí apareces, pero con un dato mal. Qué hacer cuando la IA te menciona con información incorrecta.",
    metaDescription:
      "Qué hacer cuando ChatGPT da información incorrecta de tu empresa: cómo verlo, de dónde sale el dato y cómo corregir la fuente.",
    datePublished: "2026-09-19",
    coverIcon: "search",
    coverImage: "/blog/chatgpt-informacion-incorrecta-de-tu-empresa/cover.webp",
    primaryKeyword: "chatgpt da información incorrecta de mi empresa",
    cluster: "playbooks"
  },
  {
    slug: "ai-overviews-vs-chatgpt-diferencia",
    title: "AI Overviews de Google vs. ChatGPT, Gemini y Claude: qué mide GenScore y qué no",
    seoTitle: "AI Overviews frente a ChatGPT: qué mide GenScore y qué no",
    description:
      "AI Overviews es una función de los resultados de Google; ChatGPT, Gemini y Claude son productos conversacionales aparte. Qué mide GenScore hoy, y qué queda fuera.",
    metaDescription:
      "Diferencia entre AI Overviews de Google y ChatGPT: qué es cada uno y qué motores escanea GenScore hoy.",
    datePublished: "2026-09-19",
    coverIcon: "compass",
    coverImage: "/blog/ai-overviews-vs-chatgpt-diferencia/cover.webp",
    primaryKeyword: "ai overviews vs chatgpt diferencia",
    cluster: "fundamentos"
  },
  {
    slug: "geo-negocios-locales-servicios-profesionales",
    title: "GEO para negocios locales y servicios profesionales: cómo aparecer cuando te buscan por ciudad",
    seoTitle: "GEO local: cómo aparecer cuando la IA busca por ciudad",
    metaDescription:
      "Un motor generativo no usa la proximidad como un mapa: cita entidades verificables. Qué mover si eres una clínica, una asesoría o un servicio local.",
    description:
      "Un motor generativo no usa proximidad como un mapa: cita entidades verificables. Qué mover si eres una clínica, una asesoría o cualquier servicio que se busca por zona.",
    datePublished: "2026-09-19",
    coverImage: "/blog/geo-negocios-locales-servicios-profesionales/cover.webp",
    coverIcon: "target",
    primaryKeyword: "geo negocios locales españa",
    cluster: "sectores"
  },
  {
    slug: "la-ia-te-menciona-pero-recomienda-a-otro",
    title: "La IA te menciona pero recomienda a otro: qué hacer cuando sales y no eres la respuesta",
    seoTitle: "La IA te menciona pero recomienda a otro: qué hacer",
    metaDescription:
      "Aparecer en ChatGPT no es ser su recomendación. Un caso real, cómo leer una respuesta sin engañarte y qué palancas sí mueven algo.",
    description:
      "Aparecer en ChatGPT no es ser su recomendación. Un caso real de nuestras pruebas, cómo leer una respuesta sin engañarte y qué palancas sí mueven algo (y cuál no).",
    datePublished: "2026-10-09",
    coverImage: "/blog/la-ia-te-menciona-pero-recomienda-a-otro/cover.webp",
    coverIcon: "target",
    primaryKeyword: "la ia te menciona pero recomienda a otro",
    cluster: "playbooks"
  },
  {
    slug: "como-aparecer-en-gemini-y-vistas-creadas-con-ia",
    title: "Cómo aparecer en Gemini, las Vistas creadas con IA (AI Overviews) y el Modo IA de Google",
    seoTitle: "Cómo aparecer en Gemini, AI Overviews y el Modo IA",
    description:
      "Qué dice Google oficialmente sobre sus funciones de IA, qué comprobar para que pueda usarte como fuente, cómo cambia el Modo IA la forma de buscar y qué controla de verdad Google-Extended.",
    metaDescription:
      "Cómo aparecer en las Vistas creadas con IA, el Modo IA y Gemini: lo que Google dice oficialmente, qué revisar y qué no funciona.",
    datePublished: "2026-10-09",
    dateUpdated: "2026-10-18",
    coverImage: "/blog/como-aparecer-en-gemini-y-vistas-creadas-con-ia/cover.webp",
    coverIcon: "search",
    primaryKeyword: "cómo aparecer en ai overviews",
    cluster: "playbooks",
    heroStat: {
      value: "8%",
      label: "de las visitas con un resumen de IA en Google acaban en clic a un resultado tradicional, frente al 15% cuando no aparece.",
      source: "Pew Research Center, navegación de 900 adultos en EE. UU. (2025)"
    }
  },
  {
    slug: "mi-marca-no-aparece-en-chatgpt-por-que",
    title: "Tu marca es nueva y la IA no la conoce todavía: por dónde empezar con GEO",
    seoTitle: "Mi marca no aparece en ChatGPT: por dónde empezar",
    metaDescription:
      "Cero menciones no es un fallo, es el punto de partida. Los pasos para que un motor de IA empiece a reconocer tu marca, y por qué tarda.",
    description:
      "Cero menciones no es un fallo, es el punto de partida. Los pasos reales para que un motor generativo empiece a reconocer tu marca: entidad, primeras fuentes, y por qué tarda.",
    datePublished: "2026-09-19",
    dateUpdated: "2026-10-18",
    coverImage: "/blog/mi-marca-no-aparece-en-chatgpt-por-que/cover.webp",
    coverIcon: "compass",
    primaryKeyword: "mi marca no aparece en chatgpt por qué",
    cluster: "playbooks"
  },
  {
    slug: "geo-para-ecommerce",
    title: "GEO para ecommerce: cómo aparecer cuando la IA recomienda productos",
    seoTitle: "GEO para ecommerce: cuando la IA recomienda productos",
    description:
      "Una respuesta de IA solo nombra dos o tres tiendas. Qué mover primero si vendes online, y qué no sabemos todavía.",
    datePublished: "2026-08-05",
    coverImage: "/blog/geo-para-ecommerce/cover.webp",
    coverIcon: "target",
    primaryKeyword: "geo para ecommerce",
    cluster: "sectores",
    heroStat: {
      value: "43%",
      label: "de los compradores online en EE. UU. usó un asistente de IA para investigar un producto en los últimos 90 días.",
      source: "Capital One Shopping Research, 2026"
    }
  },
  {
    slug: "geo-para-saas-b2b",
    title: "GEO para SaaS B2B: las preguntas que hace un comprador antes de pedir demo",
    seoTitle: "GEO para SaaS B2B: lo que pregunta un comprador a la IA",
    description:
      "Tu lista corta se decide antes de que nadie rellene el formulario. Qué pregunta a la IA un comprador B2B en esa fase, y qué hacer con ello.",
    datePublished: "2026-08-05",
    coverImage: "/blog/geo-para-saas-b2b/cover.webp",
    coverIcon: "building",
    primaryKeyword: "geo para saas b2b",
    cluster: "sectores",
    heroStat: {
      value: "51%",
      label: "de los compradores de software B2B empieza a investigar en un chatbot de IA más a menudo que en Google.",
      source: "G2, 2026 Buyer Behavior Report"
    }
  },
  {
    slug: "geo-para-agencias",
    title: "GEO para agencias: cómo vender un servicio de visibilidad en IA",
    seoTitle: "GEO para agencias: vender un servicio de visibilidad en IA",
    description:
      "Los chats de IA mandan ~1% de las visitas. Qué se puede vender de verdad, qué no prometer nunca, y cómo se mide.",
    datePublished: "2026-08-05",
    coverImage: "/blog/geo-para-agencias/cover.webp",
    coverIcon: "users",
    primaryKeyword: "geo para agencias",
    cluster: "sectores",
    heroStat: {
      value: "1,08%",
      label: "del tráfico web total llega hoy desde chats de IA.",
      source: "Conductor, 2026 AEO/GEO Benchmarks Report"
    }
  },
  {
    slug: "que-software-de-facturacion-recomienda-la-ia",
    title: "¿Qué programa de facturación recomienda la IA a los autónomos y pymes españoles?",
    seoTitle: "¿Qué programa de facturación recomienda la IA en España?",
    metaDescription:
      "Preguntamos a ChatGPT, Gemini y Claude qué software de facturación recomiendan en España. Holded sale en el 72% de las respuestas. Ranking y método.",
    description:
      "Preguntamos a ChatGPT, Gemini y Claude qué software de facturación recomiendan en España. Holded aparece en el 72% de las respuestas. Ranking por motor y metodología.",
    datePublished: "2026-10-09",
    coverImage: "/blog/que-software-de-facturacion-recomienda-la-ia/cover.webp",
    coverIcon: "trendUp",
    // First own-data study (SECTOR-STUDY-1, log §246): real answers measured
    // with /admin/estudio, published as percentages only (founder rule).
    primaryKeyword: "qué software de facturación recomienda la ia",
    cluster: "sectores",
    heroStat: {
      value: "72%",
      label: "de las respuestas de ChatGPT, Gemini y Claude nombran a Holded, la marca más presente.",
      source: "Estudio GenScore, 9 oct 2026"
    }
  },
  {
    slug: "que-clinicas-dentales-recomienda-la-ia",
    title: "¿Qué clínicas dentales recomienda la IA?",
    description:
      "Preguntamos a ChatGPT, Gemini y Claude a qué dentista ir en grandes ciudades de España. El 77% de las clínicas independientes bien valoradas no aparece nunca. Ranking por motor y por qué Gemini prefiere las independientes.",
    metaDescription:
      "Qué clínicas dentales recomiendan ChatGPT, Gemini y Claude. El 77% de las independientes bien valoradas no aparece nunca. Ranking por motor y ciudad.",
    datePublished: "2026-10-10",
    coverImage: "/blog/que-clinicas-dentales-recomienda-la-ia/cover.webp",
    coverIcon: "trendUp",
    // SECTOR-STUDY-2 (log §266): second own-data study, dental clinics in
    // Madrid and Valencia, measured with /admin/estudio. Percentages only;
    // only clinics that appear are named, absent ones only in aggregate.
    primaryKeyword: "qué clínicas dentales recomienda la ia",
    cluster: "sectores",
    heroStat: {
      value: "77%",
      label: "de las clínicas independientes con mejores opiniones que analizamos no aparece en ninguna respuesta de la IA.",
      source: "Estudio GenScore, 10 oct 2026"
    }
  },
  {
    slug: "de-buscar-a-preguntar",
    title: "De buscar a preguntar: cómo la IA está cambiando la búsqueda en España",
    seoTitle: "De buscar a preguntar: la IA cambia la búsqueda en España",
    metaDescription:
      "El 22% de los españoles ya usa la IA en lugar del buscador y casi la mitad de quienes la usan se apoya en ella para comprar. Datos de AIMC, IAB, Bain y Pew.",
    description:
      "El 22% de los españoles ya usa la IA en lugar del buscador y casi la mitad de quienes la usan se apoya en ella para comprar. Los datos de AIMC, IAB Spain, Bain y Pew, con sus fuentes.",
    datePublished: "2026-10-09",
    coverImage: "/blog/de-buscar-a-preguntar/cover.webp",
    coverIcon: "trendUp",
    // STUDY-HOME-1 (log §251): blog version of the «De buscar a preguntar»
    // PDF study. Third-party figures carry source and sample size; own data
    // is percentages only.
    primaryKeyword: "búsqueda con ia en españa",
    cluster: "fundamentos",
    heroStat: {
      value: "22%",
      label: "de los españoles ya usa la IA en lugar del buscador, la cifra más alta de Europa.",
      source: "Bain & Company, 2025"
    }
  },
  {
    slug: "genscore-ya-mide-perplexity",
    title: "GenScore ya mide Perplexity: qué mirar cuando la IA busca y cita fuentes",
    seoTitle: "GenScore ya mide Perplexity: qué mirar en tu marca",
    metaDescription:
      "GenScore suma Perplexity en Pro y Agencia. Qué tiene de distinto un motor que busca y cita fuentes, y qué mirar en tu primer escaneo.",
    description:
      "Perplexity entra en GenScore como cuarto motor en Pro y Agencia. Qué tiene de distinto un motor que busca en la web y cita sus fuentes, y las tres cosas que conviene mirar en tu primer escaneo.",
    datePublished: "2026-10-11",
    coverImage: "/blog/genscore-ya-mide-perplexity/cover.webp",
    heroLogos: [[{ name: "ChatGPT", src: "/brand/engines/chatgpt.svg" }, { name: "Gemini", src: "/brand/engines/gemini.svg" }, { name: "Claude", src: "/brand/engines/claude.svg" }, { name: "Perplexity", src: "/brand/engines/perplexity.svg", badge: "Nuevo" }]],
    coverIcon: "search",
    // CONTENT-LAUNCH-1 (log §288): launch post for PERPLEXITY-ENGINE-1 Fase 2
    // (log §283). Product claims trace to that section.
    primaryKeyword: "medir marca en perplexity",
    cluster: "playbooks"
  },
  {
    slug: "auditoria-seo-y-search-console-en-genscore",
    title: "Tu posición en Google y en la IA, en el mismo sitio: GenScore conecta tu Search Console",
    seoTitle: "GenScore y Search Console: tu posición en Google y en la IA",
    metaDescription:
      "Conecta tu Search Console a GenScore: tu puesto en Google, tus oportunidades de subir y qué mejorar para Google y para la IA, junto a la Auditoría SEO.",
    description:
      "GenScore suma Google a la IA. Conecta tu Search Console y ve tu puesto en Google búsqueda a búsqueda, tus mejores oportunidades y qué mejorar para Google y para ChatGPT, Gemini, Claude y Perplexity, con la Auditoría SEO al lado.",
    datePublished: "2026-10-11",
    coverImage: "/blog/auditoria-seo-y-search-console-en-genscore/cover.webp",
    heroLogos: [[{ name: "Google", src: "/brand/engines/google.svg" }], [{ name: "ChatGPT", src: "/brand/engines/chatgpt.svg" }, { name: "Gemini", src: "/brand/engines/gemini.svg" }, { name: "Claude", src: "/brand/engines/claude.svg" }, { name: "Perplexity", src: "/brand/engines/perplexity.svg" }]],
    coverIcon: "search",
    // CONTENT-LAUNCH-2 (log §296): launch post for SEARCH-SEO-1 Fases 2, 3
    // and 3b (log §281, §284, §287). Product claims trace to those sections;
    // the figures are mockups with invented data (ADR 0028).
    primaryKeyword: "search console y posicionamiento en ia",
    cluster: "playbooks"
  },
  {
    slug: "la-ia-no-repite-la-misma-lista-de-marcas",
    title: "Pregunta lo mismo dos veces a la IA: por qué casi nunca te da la misma lista de marcas",
    seoTitle: "Por qué la IA nunca da la misma lista de marcas dos veces",
    metaDescription:
      "La IA repite la misma lista de marcas menos de 1 de cada 100 veces. Por qué pasa, qué sí es estable y cómo medir tu visibilidad sin fiarte de una captura.",
    description:
      "Un estudio de SparkToro y Gumshoe midió que ChatGPT y la IA de Google casi nunca repiten la misma lista de marcas. Por qué ocurre, por qué el puesto en una respuesta es casi ruido y cómo medir bien tu visibilidad en la IA.",
    datePublished: "2026-10-17",
    coverImage: "/blog/la-ia-no-repite-la-misma-lista-de-marcas/cover.webp",
    coverIcon: "chart",
    // BLOG-ANIM-1 (log §314). Third-party figures from SparkToro + Gumshoe
    // (2026); product claims trace to SCORE-WINDOW-1 and SAMPLE-FLOOR-1.
    primaryKeyword: "por qué la ia da respuestas distintas",
    cluster: "medicion",
    heroStat: {
      value: "<1%",
      label: "de las veces ChatGPT y la IA de Google repiten la misma lista de marcas cuando se les hace la misma pregunta.",
      source: "SparkToro y Gumshoe, casi 3.000 respuestas de 600 voluntarios (2026)"
    }
  },
  {
    slug: "query-fan-out-la-ia-no-busca-tu-pregunta",
    title: "Query fan-out: la IA no busca tu pregunta, busca muchas a la vez",
    seoTitle: "Query fan-out: qué es y por qué cambia el SEO para la IA",
    metaDescription:
      "La IA divide tu pregunta en subtemas y lanza muchas búsquedas antes de responder. Qué es el query fan-out y cómo preparar tu web para aparecer.",
    description:
      "El query fan-out es la técnica con la que un buscador con IA divide una pregunta en subtemas y lanza muchas búsquedas a la vez. Qué es, por qué la IA cita páginas que no están en el top 10 de Google y cómo preparar tu web.",
    datePublished: "2026-10-17",
    coverImage: "/blog/query-fan-out-la-ia-no-busca-tu-pregunta/cover.webp",
    coverIcon: "search",
    // BLOG-ANIM-1 (log §314). Google (Reid, May 2025; Stein, Jul 2025) and
    // Ahrefs (Aug 2025). Product claims trace to log §284, §287, §289, §305.
    primaryKeyword: "query fan-out",
    cluster: "fundamentos",
    heroStat: {
      value: "12%",
      label: "de las páginas que citan los asistentes de IA está entre los diez primeros resultados de Google para la misma pregunta.",
      source: "Ahrefs, 15.000 preguntas largas (2025)"
    }
  },
  {
    slug: "bots-de-ia-robots-txt-cuales-dejar-entrar",
    title: "Los bots de la IA leen tu web miles de veces por cada visita que te mandan: cuáles dejar entrar",
    seoTitle: "Bots de IA en robots.txt: cuáles bloquear y cuáles no",
    metaDescription:
      "GPTBot, OAI-SearchBot, ClaudeBot, PerplexityBot: qué hace cada bot de IA, qué pasa si lo bloqueas en robots.txt y cuáles dejar entrar si quieres que te citen.",
    description:
      "Hay bots de IA que entrenan modelos, otros que buscan para citarte y otros que entran cuando un usuario lo pide. Qué hace cada uno, qué pasa si lo bloqueas en robots.txt y cuánto rastrean por cada visita que mandan, según Cloudflare.",
    datePublished: "2026-10-17",
    coverImage: "/blog/bots-de-ia-robots-txt-cuales-dejar-entrar/cover.webp",
    coverIcon: "shield",
    // BLOG-ANIM-1 (log §314). Cloudflare Radar (Aug 2025) and each vendor's
    // bot documentation. Product claims trace to lib/web-audit/robots.ts and
    // lib/recommendations/citation-blockers.ts; the robots.txt sample is
    // tested in lib/blog/robots-ai-snippet.test.ts.
    primaryKeyword: "bots de ia robots.txt",
    cluster: "playbooks",
    heroStat: {
      value: "38.066",
      label: "páginas rastreó Anthropic por cada visita que mandó a las webs en julio de 2025. Google rastreó 5.",
      source: "Cloudflare Radar, enero a julio de 2025"
    }
  },
  {
    slug: "que-es-el-comercio-agentico",
    title: "Qué es el comercio agéntico y qué cambia para tu tienda online",
    seoTitle: "Qué es el comercio agéntico (agentic commerce)",
    metaDescription:
      "El comercio agéntico es la venta en la que un agente de IA busca, compara y compra por el cliente. Qué es, quién lo construye y qué cambia para tu web.",
    description:
      "El comercio agéntico (agentic commerce) es la compra en la que un agente de IA busca, compara y, si el cliente lo autoriza, paga. Qué es, en qué punto está en 2026, quién lo está construyendo y qué tiene que hacer una tienda online para no quedarse fuera.",
    datePublished: "2026-10-17",
    coverImage: "/blog/que-es-el-comercio-agentico/cover.webp",
    coverIcon: "compass",
    // AGENTIC-POSTS-1 (log §316). OpenAI (Sep 2025, Mar 2026), Google UCP
    // (Jan 2026) and I/O (May 2026), Shopify (Mar 2026), Sopra Steria (May
    // 2026). Product claims trace to lib/web-audit/robots.ts and page-checks.ts.
    primaryKeyword: "comercio agéntico",
    cluster: "fundamentos",
    heroStat: {
      value: "310.000 M€",
      label: "en compras online en Europa podrían pasar por agentes de IA en los próximos diez años.",
      source: "Sopra Steria, encuesta a 8.400 consumidores de ocho países europeos (2026)"
    }
  },
  {
    slug: "como-compra-un-agente-de-ia",
    title: "Cómo compra un agente de IA: los cinco pasos desde la pregunta hasta el pago",
    seoTitle: "Cómo compra un agente de IA, paso a paso",
    metaDescription:
      "Un agente de IA entiende el encargo, busca, filtra con datos, elige tienda y paga con permiso. Los cinco pasos y dónde puede quedarse fuera tu marca.",
    description:
      "Un agente de IA no navega tu web como una persona: interpreta el encargo, lanza muchas búsquedas, filtra con datos estructurados, elige tienda y paga dentro de los límites que le fija el cliente. Los cinco pasos, con lo que publican OpenAI, Google, Visa y Mastercard, y en cuál puede quedarse fuera tu marca.",
    datePublished: "2026-10-17",
    coverImage: "/blog/como-compra-un-agente-de-ia/cover.webp",
    coverIcon: "search",
    // AGENTIC-POSTS-1 (log §316). OpenAI shopping help page, Google UCP and
    // AP2 (TNW, May 2026), Cloudflare Web Bot Auth (Oct 2025).
    primaryKeyword: "cómo compra un agente de ia",
    cluster: "fundamentos"
  },
  {
    slug: "web-preparada-para-el-comercio-agentico",
    title: "¿Está tu web preparada para el comercio agéntico? 10 comprobaciones",
    seoTitle: "¿Tu web está preparada para el comercio agéntico?",
    metaDescription:
      "Diez comprobaciones para saber si un agente de IA puede encontrar, entender y comprar en tu tienda: bots, datos de producto, feeds, políticas y pago.",
    description:
      "Diez comprobaciones para saber si un agente de IA puede encontrar tu tienda, entender tus productos y llegar hasta el pago: acceso de los bots, datos estructurados de producto, feeds, coherencia de precio y stock, políticas legibles, protección anti-bots y si la IA te nombra.",
    datePublished: "2026-10-17",
    coverImage: "/blog/web-preparada-para-el-comercio-agentico/cover.webp",
    coverIcon: "shield",
    // AGENTIC-POSTS-1 (log §316). Adobe (Jan 2026), OpenAI shopping help
    // page, Google UCP, Cloudflare Web Bot Auth. Product claims trace to
    // lib/web-audit/robots.ts, lib/web-audit/page-checks.ts and issue-labels.ts.
    primaryKeyword: "web preparada para el comercio agéntico",
    cluster: "playbooks",
    heroStat: {
      value: "+693%",
      label: "creció el tráfico que llega desde asistentes de IA a tiendas online de EE. UU. en la campaña de Navidad de 2025, frente al año anterior.",
      source: "Adobe Analytics, más de un billón de visitas a webs de comercio (2026)"
    }
  },
  {
    slug: "la-ia-descubre-tu-web-vende",
    title: "Comprar dentro del chat se ha frenado: la IA descubre y tu web vende",
    seoTitle: "Comprar en ChatGPT se frena: la IA descubre, tu web vende",
    metaDescription:
      "OpenAI aparcó el pago dentro de ChatGPT y apuesta por el descubrimiento. Qué pasó, qué dicen los datos y por qué ahora importa más que la IA te nombre.",
    description:
      "OpenAI lanzó el pago dentro de ChatGPT en 2025 y en 2026 lo movió a las apps de cada tienda para centrarse en el descubrimiento de productos. Qué pasó, qué dicen los datos de tráfico y conversión, y por qué eso hace más importante que la IA te nombre al recomendar.",
    datePublished: "2026-10-17",
    coverImage: "/blog/la-ia-descubre-tu-web-vende/cover.webp",
    coverIcon: "trendUp",
    // AGENTIC-POSTS-1 (log §316). OpenAI (Sep 2025), Digital Commerce 360
    // quoting OpenAI (Mar 2026), Shopify (Mar 2026), Adobe (Jan 2026), Sopra
    // Steria (May 2026).
    primaryKeyword: "comprar dentro de chatgpt",
    cluster: "sectores",
    heroStat: {
      value: "31%",
      label: "más convierten las visitas que llegan desde asistentes de IA que el resto del tráfico de las tiendas online de EE. UU.",
      source: "Adobe Analytics, campaña de Navidad de 2025, más de un billón de visitas"
    }
  },
  {
    slug: "protocolos-comercio-agentico-acp-ucp-ap2",
    title: "ACP, UCP, AP2: los protocolos del comercio agéntico explicados sin tecnicismos",
    seoTitle: "ACP, UCP y AP2: protocolos del comercio agéntico",
    metaDescription:
      "Qué son ACP (OpenAI y Stripe), UCP y AP2 (Google) y los protocolos de Visa y Mastercard para agentes de IA. Qué resuelve cada uno y qué hacer en tu tienda.",
    description:
      "ACP, UCP, AP2, Trusted Agent Protocol, Agent Pay: los protocolos con los que los agentes de IA descubren productos, pagan y se identifican. Qué resuelve cada uno, quién está detrás y qué tiene que hacer hoy una tienda online en España.",
    datePublished: "2026-10-17",
    coverImage: "/blog/protocolos-comercio-agentico-acp-ucp-ap2/cover.webp",
    coverIcon: "chart",
    // AGENTIC-POSTS-1 (log §316). OpenAI and Stripe (Sep 2025), Google UCP
    // (Jan 2026), TNW on I/O 2026 (AP2 v0.2, FIDO), Cloudflare (Oct 2025).
    primaryKeyword: "protocolos comercio agéntico",
    cluster: "fundamentos"
  },
  {
    slug: "agentes-personales-de-ia-que-compran",
    title: "Muse, Dots, Instinct, Grok Bot y Tab: los agentes de IA que ya compran por ti",
    seoTitle: "Muse, Dots, Instinct, Grok Bot y Tab: agentes que compran",
    metaDescription:
      "Meta, OpenAI, Instinct, Grok y Tab ya tienen agentes que compran por ti. Qué hace cada uno, cómo pagan, si llegan a España y qué debe preparar tu tienda.",
    description:
      "Muse (Meta), Dots (OpenAI), Instinct, Grok Bot y Tab son los agentes personales de IA que en el otoño de 2026 empezaron a comprar por sus usuarios. ¿Qué hace cada uno? ¿Cómo pagan? ¿Por qué Amazon los bloquea y Shopify les abre la puerta? ¿Qué tiene que preparar una tienda online en España?",
    datePublished: "2026-10-17",
    coverImage: "/blog/agentes-personales-de-ia-que-compran/cover.webp",
    // Official logos: Meta, OpenAI and Grok from public icon packs, Instinct
    // and Tab supplied by the founder (log §316).
    heroLogos: [[{ name: "Muse", src: "/blog/agentes-personales-de-ia-que-compran/agentes/meta.svg" }, { name: "Dots", src: "/brand/engines/chatgpt.svg" }, { name: "Instinct", src: "/blog/agentes-personales-de-ia-que-compran/agentes/instinct-logo.webp" }, { name: "Grok Bot", src: "/blog/agentes-personales-de-ia-que-compran/agentes/grok.svg" }, { name: "Tab", src: "/blog/agentes-personales-de-ia-que-compran/agentes/tab-logo.webp" }]],
    coverIcon: "users",
    // AGENTIC-POSTS-1 (log §316). Meta newsroom (Sep 2026), TechCrunch on
    // Dots, Instinct and Tab (Aug-Oct 2026), WIRED's Dots test (Oct 2026),
    // Shopify via PYMNTS (Sep 2026), Yahoo Finance on Amazon blocking Grok
    // Bot (Oct 2026). The upcoming agentic check is described as "not yet
    // available": refresh this post when it ships.
    primaryKeyword: "agentes personales de ia",
    cluster: "fundamentos"
  }
];

export function getBlogPost(slug: string): BlogPost | undefined {
  return BLOG_POSTS.find((p) => p.slug === slug);
}

/** Posts belonging to a given cluster, in the same order as BLOG_POSTS. */
export function getPostsByCluster(cluster: BlogCluster["key"]): BlogPost[] {
  return BLOG_POSTS.filter((p) => p.cluster === cluster);
}

export function getBlogCluster(key: BlogCluster["key"]): BlogCluster | undefined {
  return BLOG_CLUSTERS.find((c) => c.key === key);
}

/** The single most recently published post — `datePublished` is `YYYY-MM-DD`, so string order is date order. */
export function getMostRecentPost(): BlogPost {
  return [...BLOG_POSTS].sort((a, b) => b.datePublished.localeCompare(a.datePublished))[0];
}

/**
 * Visible breadcrumb trail for an article page: Blog → its cluster.
 * Deliberately stops there — the post title is the <h1> right below it, so
 * repeating it in the trail would just say the same thing twice in a row.
 */
export function blogPostBreadcrumb(post: BlogPost): { label: string; href: string }[] {
  const cluster = getBlogCluster(post.cluster);
  const items = [{ label: "Blog", href: "/blog" }];
  if (cluster) items.push({ label: cluster.title, href: `/blog/${cluster.key}` });
  return items;
}

/**
 * schema.org BreadcrumbList items for an article page — the same trail as
 * `blogPostBreadcrumb`, with "Inicio" prepended and the post itself
 * appended. Kept as a separate function (not a re-render of the visible
 * trail) because the two audiences differ: the visible trail stops at the
 * cluster on purpose, but the structured data is expected to name the
 * current page too.
 */
export function blogPostBreadcrumbSchema(post: BlogPost): { name: string; url: string }[] {
  return [
    { name: "Inicio", url: SITE_URL },
    ...blogPostBreadcrumb(post).map((item) => ({ name: item.label, url: `${SITE_URL}${item.href}` })),
    { name: post.title, url: `${SITE_URL}/blog/${post.slug}` }
  ];
}

/** <title> for search engines: `seoTitle` when set, otherwise `title`. */
export function getSeoTitle(post: BlogPost): string {
  return post.seoTitle ?? post.title;
}

/** Meta description for search engines: `metaDescription` when set, otherwise `description`. */
export function getMetaDescription(post: BlogPost): string {
  return post.metaDescription ?? post.description;
}

/**
 * Metadata completa de un artículo, con Open Graph y Twitter propios
 * (SEO-POS-1, T5). Los 10 MDX la construían a mano y ninguno declaraba OG, así
 * que todos se compartían con el título y la imagen genéricos del layout raíz.
 * Un solo sitio donde arreglarlo, y las portadas reales ya existentes pasan a
 * ser la imagen de la tarjeta.
 */
export function blogPostMetadata(post: BlogPost) {
  return contentMetadata({
    title: `${getSeoTitle(post)} · GenScore`,
    description: getMetaDescription(post),
    path: `/blog/${post.slug}`,
    image: post.coverImage,
    type: "article",
    publishedTime: post.datePublished,
    modifiedTime: post.dateUpdated
  });
}
