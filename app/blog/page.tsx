import type { Metadata } from "next";
import Link from "next/link";
import { BlogPageShell } from "@/components/blog/blog-page-shell";
import { BreadcrumbSchema } from "@/components/seo/breadcrumb-schema";
import { BLOG_CLUSTERS, getBlogCluster, getMostRecentPost, getPostsByCluster, type BlogCluster } from "@/lib/blog/posts";
import { COMPARATIVAS_INDEX } from "@/lib/comparativas";
import { contentMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = contentMetadata({
  title: "Blog — GenScore",
  description:
    "GEO (Generative Engine Optimization): metodología, guías y análisis sobre cómo aparecen las marcas en respuestas de IA.",
  path: "/blog",
  rss: true
});

const dateFormatter = new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "long", year: "numeric" });

/** Cuántas tarjetas se enseñan por carril antes de pasar a "Ver más →". */
const RAIL_SIZE = 3;

/**
 * Color de acento por clúster — identifica de qué carril viene cada tarjeta,
 * no es decorativo (BLOG-COVERS-2026-08, propuesta aprobada por el fundador).
 * Reutiliza la paleta de marca (azul/cian/marino) en vez de colores
 * arbitrarios: `docs/brand/brand-guidelines.md` reserva el ámbar del logo
 * (`--brand-warm`) en exclusiva para el punto del símbolo, así que no entra
 * aquí.
 */
const CLUSTER_TILE_CLASS: Record<BlogCluster["key"], string> = {
  fundamentos: "blog-tile--fundamentos",
  medicion: "blog-tile--medicion",
  playbooks: "blog-tile--playbooks",
  sectores: "blog-tile--sectores"
};
const CLUSTER_DOT_COLOR: Record<BlogCluster["key"], string> = {
  fundamentos: "#2563EB",
  medicion: "#09C5D6",
  playbooks: "#5B6B82",
  sectores: "#4F5FD6"
};
const COMPARATIVAS_DOT_COLOR = "#0E9488";

/** Decoración abstracta (anillo de evidencia del símbolo de marca) — no representa ninguna interfaz, gráfico ni métrica (ADR 0028). */
function BrandRing({ className }: { className: string }) {
  return (
    <svg className={className} width="300" height="300" viewBox="0 0 300 300" aria-hidden="true">
      <circle cx="150" cy="150" r="130" fill="none" stroke="#09C5D6" strokeWidth="2" strokeDasharray="16 12" />
      <circle cx="150" cy="150" r="90" fill="none" stroke="#4F7BFF" strokeWidth="2" strokeDasharray="10 10" />
    </svg>
  );
}

export default function BlogIndexPage() {
  const featured = getMostRecentPost();
  const featuredCluster = getBlogCluster(featured.cluster);

  return (
    <BlogPageShell>
      <BreadcrumbSchema
        items={[
          { name: "Inicio", url: "https://www.genscore.es" },
          { name: "Blog", url: "https://www.genscore.es/blog" }
        ]}
      />
      <h1 className="lp-h2">Blog</h1>
      <p className="blog-subtitle">GEO (Generative Engine Optimization): metodología, guías y análisis, organizados por tema.</p>

      {/* destacado — el artículo publicado más recientemente */}
      <Link href={`/blog/${featured.slug}`} className="blog-featured">
        <BrandRing className="blog-featured-ring" />
        <div className="blog-featured-content">
          <span className="blog-featured-tag">
            {featuredCluster?.title} · Más reciente
          </span>
          <h2>{featured.title}</h2>
          <p>{featured.description}</p>
          <time dateTime={featured.datePublished}>{dateFormatter.format(new Date(featured.datePublished))}</time>
        </div>
      </Link>

      {BLOG_CLUSTERS.map((cluster) => {
        // El destacado ya se enseña arriba — no se repite en el carril de su propio clúster.
        const posts = getPostsByCluster(cluster.key).filter((p) => p.slug !== featured.slug);
        const sorted = [...posts].sort((a, b) => b.datePublished.localeCompare(a.datePublished));
        const shown = sorted.slice(0, RAIL_SIZE);
        const hasMore = sorted.length > RAIL_SIZE;

        return (
          <section key={cluster.key} className="blog-rail">
            <div className="blog-rail-head">
              <div className="blog-rail-head-left">
                <span className="blog-rail-dot" style={{ background: CLUSTER_DOT_COLOR[cluster.key] }} />
                <h2>{cluster.title}</h2>
                <p>— {cluster.description}</p>
              </div>
              {hasMore && (
                <Link href={`/blog/${cluster.key}`} className="blog-rail-more">
                  Ver más →
                </Link>
              )}
            </div>
            {shown.length > 0 ? (
              <div className="blog-rail-grid">
                {shown.map((post) => (
                  <Link key={post.slug} href={`/blog/${post.slug}`} className={`blog-tile ${CLUSTER_TILE_CLASS[cluster.key]}`}>
                    <h2>{post.title}</h2>
                    <p>{post.description}</p>
                    <time dateTime={post.datePublished}>{dateFormatter.format(new Date(post.datePublished))}</time>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="blog-cluster-soon">Próximamente.</p>
            )}
          </section>
        );
      })}

      {/* Comparativas — carril de primer nivel, mismo patrón que los clústeres de arriba. */}
      <section className="blog-rail">
        <div className="blog-rail-head">
          <div className="blog-rail-head-left">
            <span className="blog-rail-dot" style={{ background: COMPARATIVAS_DOT_COLOR }} />
            <h2>Comparativas</h2>
            <p>— GenScore frente a otras herramientas de visibilidad en IA, de forma honesta.</p>
          </div>
          {COMPARATIVAS_INDEX.length > RAIL_SIZE && (
            <Link href="/comparativas" className="blog-rail-more">
              Ver más →
            </Link>
          )}
        </div>
        <div className="blog-rail-grid">
          {COMPARATIVAS_INDEX.slice(0, RAIL_SIZE).map((c) => (
            <Link key={c.href} href={c.href} className="blog-tile blog-tile--comparativas">
              <h2>{c.title}</h2>
              <p>{c.blurb}</p>
            </Link>
          ))}
        </div>
      </section>

      {/* RSS + comprobador gratuito, al final de la página. Antes vivían como
          dos enlaces bajo el título; el fundador pidió llevarlos aquí como un
          banner (BLOG-COVERS-2026-08). */}
      <div className="blog-banner">
        <BrandRing className="blog-banner-ring" />
        <div className="blog-banner-content">
          <h2>¿Aparece tu marca en ChatGPT?</h2>
          <p>
            Compruébalo gratis, sin registro. Y si prefieres seguir el blog desde tu lector, también puedes{" "}
            <Link href="/feed.xml" className="link-mini">
              suscribirte por RSS
            </Link>
            .
          </p>
          <Link href="/gratis/aparece-mi-marca-en-chatgpt" className="blog-banner-cta">
            Comprobar gratis
          </Link>
        </div>
      </div>
    </BlogPageShell>
  );
}
