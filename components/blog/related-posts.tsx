import Link from "next/link";
import { getPostsByCluster, type BlogPost } from "@/lib/blog/posts";

/**
 * GROWTH-2 Fase 2.5: internal linking within a cluster — every post links to
 * its siblings, satisfying the "mínimo 3 enlaces internos" rule in
 * docs/content-strategy.md §4.3. Renders nothing if the cluster has no other
 * posts yet, rather than an empty section.
 */
export function RelatedPosts({
  cluster,
  currentSlug
}: {
  cluster: BlogPost["cluster"];
  currentSlug: string;
}) {
  const siblings = getPostsByCluster(cluster).filter((p) => p.slug !== currentSlug);
  if (siblings.length === 0) return null;

  return (
    <div className="blog-related">
      <h2>Sigue leyendo</h2>
      <ul>
        {siblings.map((post) => (
          <li key={post.slug}>
            <Link href={`/blog/${post.slug}`}>{post.title}</Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
