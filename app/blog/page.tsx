import type { Metadata } from "next";
import Link from "next/link";
import { BlogPageShell } from "@/components/blog/blog-page-shell";
import { BlogCover } from "@/components/blog/blog-cover";
import { BLOG_POSTS } from "@/lib/blog/posts";

export const metadata: Metadata = {
  title: "Blog — GenScore",
  description: "GEO (Generative Engine Optimization): metodología, guías y análisis sobre cómo aparecen las marcas en respuestas de IA."
};

const dateFormatter = new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "long", year: "numeric" });

export default function BlogIndexPage() {
  return (
    <BlogPageShell>
      <h1 className="lp-h2">Blog</h1>
      <p className="legal-updated" style={{ marginBottom: 32 }}>
        GEO (Generative Engine Optimization): metodología, guías y análisis.
      </p>
      <div>
        {BLOG_POSTS.map((post) => (
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
    </BlogPageShell>
  );
}
