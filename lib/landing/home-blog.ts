import { BLOG_CLUSTERS, BLOG_POSTS, type BlogCluster } from "@/lib/blog/posts";

/**
 * Los tres artículos de la tira «Aprender» de la portada (HOME-2026-08).
 *
 * **Se eligen, no se escriben.** El artboard fija tres títulos concretos; aquí
 * se toma **el más reciente de cada uno de tres clusters**, así que la tira
 * envejece con el blog en vez de apuntar para siempre a lo que se decidió un
 * martes. Un artículo retirado no puede dejar un enlace roto en la portada, y
 * uno nuevo entra solo. Misma regla que `home-faq.ts`: una sola fuente, o la
 * portada y el blog acaban diciendo cosas distintas.
 *
 * **Los tres clusters son una decisión editorial, no un orden alfabético.**
 * `fundamentos` responde «qué es esto», `playbooks` responde «qué hago» y
 * `medicion` responde «cómo sé si funciona» — las tres preguntas en el orden
 * en que se hacen. `sectores` queda fuera a propósito: en la portada, un
 * artículo de un sector concreto le habla a una fracción de quien llega.
 *
 * **Sin tiempo de lectura.** El artboard pone «7 min de lectura» en las tres
 * tarjetas. El producto no calcula eso en ninguna parte —no existe el campo en
 * `BlogPost` y el índice del blog enseña la fecha—, así que publicarlo sería
 * inventar una cifra. Va la fecha, la misma que enseña el blog y con el mismo
 * formato.
 */

const CLUSTERS_PORTADA: Array<BlogCluster["key"]> = ["fundamentos", "playbooks", "medicion"];

const FORMATO = new Intl.DateTimeFormat("es-ES", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC"
});

export type HomeBlogCard = {
  slug: string;
  title: string;
  /** El título del cluster, tal cual lo publica el blog. */
  cluster: string;
  fecha: string;
};

export function homeBlogStrip(): HomeBlogCard[] {
  const cards: HomeBlogCard[] = [];

  for (const key of CLUSTERS_PORTADA) {
    const reciente = BLOG_POSTS.filter((p) => p.cluster === key).sort((a, b) =>
      b.datePublished.localeCompare(a.datePublished)
    )[0];
    // Un cluster sin artículos no pinta una tarjeta vacía: la tira encoge.
    if (!reciente) continue;
    const cluster = BLOG_CLUSTERS.find((c) => c.key === key);
    cards.push({
      slug: reciente.slug,
      title: reciente.title,
      cluster: cluster?.title ?? key,
      // `T00:00:00Z` explícito: sin él, `new Date("2026-08-15")` se interpreta
      // como UTC pero se formatea en la zona del servidor, y en cualquier zona
      // al oeste de Londres la fecha publicada retrocede un día.
      fecha: FORMATO.format(new Date(`${reciente.datePublished}T00:00:00Z`))
    });
  }

  return cards;
}
