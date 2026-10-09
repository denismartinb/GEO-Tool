import type { Metadata } from "next";
import Link from "next/link";
import { BlogPageShell } from "@/components/blog/blog-page-shell";
import { BlogClusterRail } from "@/components/blog/blog-cluster-rail";
import { ComparativasRail } from "@/components/blog/comparativas-rail";
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

/** Cuántas tarjetas se enseñan por carril al cargar la página, antes del primer clic en «Ver N más». */
const RAIL_SIZE = 3;

/**
 * Color de acento por clúster — identifica de qué carril viene cada tarjeta,
 * no es decorativo (BLOG-COVERS-2026-08, propuesta aprobada por el fundador).
 * Reutiliza la paleta de marca (azul/cian/marino) en vez de colores
 * arbitrarios: `docs/brand/brand-guidelines.md` reserva el ámbar del logo
 * (`--brand-warm`) en exclusiva para el punto del símbolo, así que no entra
 * aquí.
 *
 * Superseded en pantalla por BLOG-REDESIGN-1 Fase 2 (log §247): bajo
 * `.lp-article` las tarjetas son blancas y el carril se identifica por su
 * número (01, 02…), como las secciones del artículo. Las clases se siguen
 * pasando para no tocar los carriles, que no tienen otro consumidor.
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

export default function BlogIndexPage() {
  const featured = getMostRecentPost();
  const featuredCluster = getBlogCluster(featured.cluster);

  const stat = featured.heroStat;
  const statPct = stat?.value.endsWith("%") ?? false;

  // BLOG-REDESIGN-1 Fase 2: la portada del índice usa la misma portada oscura
  // que los artículos (`.art-hero`), con el último artículo como destacado.
  const hero = (
    <section className="art-hero blog-idx-hero">
      <div className="lp-inner blog-idx-hero-inner">
        <div className="art-hero-eyebrow">Blog GenScore</div>
        <h1>Blog</h1>
        <p className="art-hero-sub">GEO (Generative Engine Optimization): metodología, guías y análisis, organizados por tema.</p>

        {/* destacado — el artículo publicado más recientemente */}
        <Link href={`/blog/${featured.slug}`} className="blog-idx-featured">
          <div className="blog-idx-featured-body">
            <span className="blog-idx-featured-tag">
              Más reciente{featuredCluster ? ` · ${featuredCluster.title}` : null}
            </span>
            <h2>{featured.title}</h2>
            <p>{featured.description}</p>
            <span className="blog-idx-featured-foot">
              <time dateTime={featured.datePublished}>{dateFormatter.format(new Date(featured.datePublished))}</time>
              <span className="blog-idx-featured-go">Leer el artículo →</span>
            </span>
          </div>
          {stat && (
            <div className="blog-idx-featured-stat">
              <div className="art-hero-big">
                {statPct ? stat.value.slice(0, -1) : stat.value}
                {statPct && <small>%</small>}
              </div>
              <p>
                {stat.label}
                <span>{stat.source}</span>
              </p>
            </div>
          )}
        </Link>
      </div>
    </section>
  );

  return (
    <BlogPageShell hero={hero}>
      <BreadcrumbSchema
        items={[
          { name: "Inicio", url: "https://www.genscore.es" },
          { name: "Blog", url: "https://www.genscore.es/blog" }
        ]}
      />

      {BLOG_CLUSTERS.map((cluster) => {
        // El destacado ya se enseña arriba — no se repite en el carril de su propio clúster.
        const posts = getPostsByCluster(cluster.key).filter((p) => p.slug !== featured.slug);
        const sorted = [...posts].sort((a, b) => b.datePublished.localeCompare(a.datePublished));

        return (
          <BlogClusterRail
            key={cluster.key}
            title={cluster.title}
            description={cluster.description}
            dotColor={CLUSTER_DOT_COLOR[cluster.key]}
            tileClass={CLUSTER_TILE_CLASS[cluster.key]}
            posts={sorted}
            initialCount={RAIL_SIZE}
          />
        );
      })}

      {/* Comparativas — carril de primer nivel, mismo patrón que los clústeres de arriba. */}
      <ComparativasRail dotColor={COMPARATIVAS_DOT_COLOR} items={COMPARATIVAS_INDEX} initialCount={RAIL_SIZE} />

      {/* RSS + comprobador gratuito, al final de la página. Antes vivían como
          dos enlaces bajo el título; el fundador pidió llevarlos aquí como un
          banner (BLOG-COVERS-2026-08). */}
      <div className="blog-banner">
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
