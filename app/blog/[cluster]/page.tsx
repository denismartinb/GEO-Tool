import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BlogPageShell } from "@/components/blog/blog-page-shell";
import { BlogCover } from "@/components/blog/blog-cover";
import { BreadcrumbSchema } from "@/components/seo/breadcrumb-schema";
import { BLOG_CLUSTERS, getBlogCluster, getPostsByCluster } from "@/lib/blog/posts";
import { contentMetadata } from "@/lib/seo/metadata";

const SITE_URL = "https://www.genscore.es";

const dateFormatter = new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "long", year: "numeric" });

export function generateStaticParams() {
  return BLOG_CLUSTERS.map((c) => ({ cluster: c.key }));
}

export async function generateMetadata({
  params
}: {
  params: Promise<{ cluster: string }>;
}): Promise<Metadata> {
  const { cluster: key } = await params;
  const cluster = getBlogCluster(key as (typeof BLOG_CLUSTERS)[number]["key"]);
  if (!cluster) return {};
  return {
    ...contentMetadata({
      title: `${cluster.title} — Blog — GenScore`,
      description: cluster.description,
      path: `/blog/${cluster.key}`,
      rss: true
    })
  };
}

export default async function BlogClusterPillarPage({ params }: { params: Promise<{ cluster: string }> }) {
  const { cluster: key } = await params;
  const cluster = getBlogCluster(key as (typeof BLOG_CLUSTERS)[number]["key"]);
  if (!cluster) notFound();

  const posts = getPostsByCluster(cluster.key);
  const introParagraphs = cluster.pillarIntro?.split("\n\n") ?? [];

  return (
    <BlogPageShell>
      <BreadcrumbSchema
        items={[
          { name: "Inicio", url: SITE_URL },
          { name: "Blog", url: `${SITE_URL}/blog` },
          { name: cluster.title, url: `${SITE_URL}/blog/${cluster.key}` }
        ]}
      />
      <p className="legal-updated">
        <Link href="/blog">Blog</Link>
      </p>
      <h1 className="lp-h2">{cluster.title}</h1>
      <p className="legal-updated" style={{ marginBottom: 32 }}>
        {cluster.description}
      </p>

      <div className="legal-body">
        {introParagraphs.length > 0 ? (
          introParagraphs.map((p, i) => <p key={i}>{p}</p>)
        ) : (
          <p>
            Todavía no hay artículos publicados en esta sección — está planificada en nuestro{" "}
            <Link href="/blog">calendario de contenido</Link> y llegará más adelante. Mientras tanto,
            échale un vistazo al resto del blog.
          </p>
        )}
      </div>

      {posts.length > 0 && (
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
      )}
    </BlogPageShell>
  );
}
