import type { Metadata } from "next";
import Link from "next/link";
import { BlogPageShell } from "@/components/blog/blog-page-shell";
import { BlogCover } from "@/components/blog/blog-cover";
import { BreadcrumbSchema } from "@/components/seo/breadcrumb-schema";
import { BLOG_CLUSTERS, BLOG_POSTS, getPostsByCluster } from "@/lib/blog/posts";
import { contentMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = contentMetadata({
  title: "Blog — Genscore",
  description:
    "GEO (Generative Engine Optimization): metodología, guías y análisis sobre cómo aparecen las marcas en respuestas de IA.",
  path: "/blog",
  rss: true
});

const dateFormatter = new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "long", year: "numeric" });

export default function BlogIndexPage() {
  return (
    <BlogPageShell>
      <BreadcrumbSchema
        items={[
          { name: "Inicio", url: "https://www.genscore.es" },
          { name: "Blog", url: "https://www.genscore.es/blog" }
        ]}
      />
      <h1 className="lp-h2">Blog</h1>
      <p className="legal-updated" style={{ marginBottom: 32 }}>
        GEO (Generative Engine Optimization): metodología, guías y análisis, organizados por tema.{" "}
        {/* SEO-POS-1 (T11): el feed existía desde GROWTH-2 2.1 pero nada lo
            enlazaba ni lo declaraba, así que ni una persona ni un lector de
            feeds podía descubrirlo. */}
        <a href="/feed.xml">Suscríbete por RSS</a>.
      </p>
      {BLOG_CLUSTERS.map((cluster) => {
        const posts = getPostsByCluster(cluster.key);
        return (
          <section key={cluster.key} className="blog-cluster">
            <div className="blog-cluster-head">
              <h2>{cluster.title}</h2>
              <p>{cluster.description}</p>
            </div>
            {posts.length > 0 ? (
              <div>
                {posts.map((post) => (
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
      <p className="legal-updated" style={{ marginTop: 8 }}>
        {BLOG_POSTS.length} artículos publicados.
      </p>
    </BlogPageShell>
  );
}
