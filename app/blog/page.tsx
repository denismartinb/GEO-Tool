import type { Metadata } from "next";
import Link from "next/link";
import { BlogPageShell } from "@/components/blog/blog-page-shell";
import { BlogCover } from "@/components/blog/blog-cover";
import { BreadcrumbSchema } from "@/components/seo/breadcrumb-schema";
import { BLOG_CLUSTERS, BLOG_POSTS, getPostsByCluster, type BlogPost } from "@/lib/blog/posts";
import { contentMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = contentMetadata({
  title: "Blog — GenScore",
  description:
    "GEO (Generative Engine Optimization): metodología, guías y análisis sobre cómo aparecen las marcas en respuestas de IA.",
  path: "/blog",
  rss: true
});

const dateFormatter = new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "long", year: "numeric" });

/** Most recent posts first, across the whole blog. Real, automatic — no
 * hand-curated "pillar" flag, which lib/blog/posts.ts doesn't have. */
function byMostRecent(posts: BlogPost[]): BlogPost[] {
  return [...posts].sort((a, b) => b.datePublished.localeCompare(a.datePublished));
}

function clusterTitle(key: BlogPost["cluster"]): string {
  return BLOG_CLUSTERS.find((c) => c.key === key)?.title ?? key;
}

/** How many cards a cluster row shows before handing off to its own /blog/[cluster]
 * page — never a count badge next to it (fundador, 2026-08-11: "el índice del blog
 * no publica un recuento de artículos", log §61). */
const ROW_LIMIT = 3;

export default function BlogIndexPage() {
  const [hero, ...rest] = byMostRecent(BLOG_POSTS);
  const sideFeatured = rest.slice(0, 2);
  const featuredSlugs = new Set([hero.slug, ...sideFeatured.map((p) => p.slug)]);

  return (
    <BlogPageShell>
      <BreadcrumbSchema
        items={[
          { name: "Inicio", url: "https://www.genscore.es" },
          { name: "Blog", url: "https://www.genscore.es/blog" }
        ]}
      />
      <h1 className="lp-h2">Blog</h1>
      <p className="legal-updated">
        GEO (Generative Engine Optimization): metodología, guías y análisis, organizados por tema.
      </p>
      {/* SEO-POS-1 (T11): el feed existía desde GROWTH-2 2.1 y nada lo
          enlazaba. En su primera versión el enlace iba dentro del párrafo de
          arriba, y el fundador no lo encontró: `a { color: inherit }` es la
          regla global, y `.legal-updated` pinta su texto en `--ink-4`, así que
          el enlace salía del mismo gris que la frase y sin subrayado. Va
          aparte y con `.link-mini`, que es el estilo de enlace pequeño que ya
          usa el resto del producto. */}
      <p style={{ margin: "10px 0 32px" }}>
        <a href="/feed.xml" className="link-mini">
          Suscríbete por RSS
        </a>
      </p>

      {/* Destacado (más reciente de todo el blog) + dos laterales. Misma
          portada y mismo recorte que el resto del índice (`.blog-cover`,
          sin cambios) — sólo cambia el tamaño de la tarjeta. */}
      <section className="blog-featured">
        <Link href={`/blog/${hero.slug}`} className="blog-index-card blog-featured-hero">
          <BlogCover icon={hero.coverIcon} image={hero.coverImage} alt={hero.title} priority />
          <div className="blog-index-card-body">
            <span className="blog-card-tag">{clusterTitle(hero.cluster)}</span>
            <h2>{hero.title}</h2>
            <p>{hero.description}</p>
            <p className="blog-post-meta">{dateFormatter.format(new Date(hero.datePublished))}</p>
          </div>
        </Link>
        <div className="blog-featured-side">
          {sideFeatured.map((post) => (
            <Link key={post.slug} href={`/blog/${post.slug}`} className="blog-index-card">
              <BlogCover icon={post.coverIcon} image={post.coverImage} alt={post.title} />
              <div className="blog-index-card-body">
                <span className="blog-card-tag">{clusterTitle(post.cluster)}</span>
                <h2>{post.title}</h2>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Comparativas como sección propia del índice, no solo como enlace de
          navegación (fundador, 2026-08-11: "sigo sin verlo en blog, no puede
          ser una sección más normal?"). En móvil la nav superior se pliega
          tras el menú de hamburguesa, así que añadirla a NAV_LINKS la dejaba
          invisible justo en la anchura donde más se lee. Sigue yendo antes de
          los clusters — justo después del destacado, que ahora es lo primero
          de la página — porque es el contenido con más intención de compra
          del portfolio y no debería exigir bajar por toda la lista de
          artículos. */}
      <section className="blog-cluster">
        <div className="blog-cluster-head">
          <div>
            <h2>Comparativas</h2>
            <p>
              GenScore frente a las otras herramientas de visibilidad en IA, comparado de forma honesta —
              con las filas donde gana cada una.
            </p>
          </div>
          <Link href="/comparativas" className="blog-cluster-more">
            Ver las comparativas →
          </Link>
        </div>
      </section>

      {BLOG_CLUSTERS.map((cluster) => {
        const posts = byMostRecent(getPostsByCluster(cluster.key).filter((p) => !featuredSlugs.has(p.slug)));
        const shown = posts.slice(0, ROW_LIMIT);
        return (
          <section key={cluster.key} className="blog-cluster">
            <div className="blog-cluster-head">
              <div>
                <h2>{cluster.title}</h2>
                <p>{cluster.description}</p>
              </div>
              {/* Enlaza siempre a la página del cluster, tenga o no más
                  artículos que los mostrados aquí: esa página lleva además su
                  propia síntesis (`pillarIntro`) que el índice no repite. */}
              <Link href={`/blog/${cluster.key}`} className="blog-cluster-more">
                Ver todos →
              </Link>
            </div>
            {shown.length > 0 ? (
              <div className="blog-cluster-grid">
                {shown.map((post) => (
                  <Link key={post.slug} href={`/blog/${post.slug}`} className="blog-index-card">
                    <BlogCover icon={post.coverIcon} image={post.coverImage} alt={post.title} />
                    <div className="blog-index-card-body">
                      <h2>{post.title}</h2>
                      <p>{post.description}</p>
                      <p className="blog-post-meta">{dateFormatter.format(new Date(post.datePublished))}</p>
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="blog-cluster-soon">Próximamente.</p>
            )}
          </section>
        );
      })}
    </BlogPageShell>
  );
}
