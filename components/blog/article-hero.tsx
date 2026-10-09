import Link from "next/link";
import { blogPostBreadcrumb, getBlogCluster, type BlogPost } from "@/lib/blog/posts";

const dateFormatter = new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "long", year: "numeric" });

/**
 * BLOG-REDESIGN-1 — portada oscura del artículo, con la estética del estudio
 * PDF «De buscar a preguntar» (`docs/design-reference/blog-redesign-1/`).
 *
 * Sustituye a la cabecera anterior (ilustración `BlogCover` + `# título` +
 * `PostMeta`). La ilustración sigue existiendo para el índice `/blog` y la
 * tarjeta social; dentro del artículo ya no se pinta (fundador, 2026-10-09).
 *
 * La cifra grande SOLO sale si el post declara `heroStat` en
 * `lib/blog/posts.ts`: una cifra que el propio post ya publica, con su fuente
 * citable (estudio propio o de terceros). Un post sin ella sale sin cifra:
 * elegir una para rellenar la portada sería la métrica falsa que el producto
 * no publica. El antetítulo sólo dice «Estudio GenScore» cuando la cifra es
 * nuestra.
 */
export function ArticleHero({ post }: { post: BlogPost }) {
  const cluster = getBlogCluster(post.cluster);
  const crumbs = blogPostBreadcrumb(post);
  const stat = post.heroStat;
  const pct = stat?.value.endsWith("%") ?? false;

  return (
    <section className="art-hero">
      <div className="art-hero-inner">
        <nav className="art-hero-crumbs" aria-label="Migas de pan">
          {crumbs.map((item, index) => (
            <span key={item.href}>
              {index > 0 && <span aria-hidden="true">/</span>}
              <Link href={item.href}>{item.label}</Link>
            </span>
          ))}
        </nav>

        <div className="art-hero-eyebrow">
          {stat?.source.startsWith("Estudio GenScore") ? "Estudio GenScore" : "Blog GenScore"}
          {cluster ? ` · ${cluster.title}` : null}
        </div>
        <h1>{post.title}</h1>
        <p className="art-hero-sub">{post.description}</p>

        {stat && (
          <div className="art-hero-stat">
            <div className="art-hero-big">
              {pct ? stat.value.slice(0, -1) : stat.value}
              {pct && <small>%</small>}
            </div>
            <p>
              {stat.label}
              <span>{stat.source}</span>
            </p>
          </div>
        )}

        <dl className="art-hero-meta">
          <div>
            <dt>Publicado</dt>
            <dd>
              <time dateTime={post.datePublished}>{dateFormatter.format(new Date(post.datePublished))}</time>
            </dd>
          </div>
          {post.dateUpdated && (
            <div>
              <dt>Actualizado</dt>
              <dd>
                <time dateTime={post.dateUpdated}>{dateFormatter.format(new Date(post.dateUpdated))}</time>
              </dd>
            </div>
          )}
          {cluster && (
            <div>
              <dt>Tema</dt>
              <dd>{cluster.title}</dd>
            </div>
          )}
        </dl>
      </div>
    </section>
  );
}
