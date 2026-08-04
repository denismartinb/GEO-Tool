import Link from "next/link";
import { getBlogCluster, getPostsByCluster, type BlogPost } from "@/lib/blog/posts";

/**
 * GROWTH-2 Fase 2.5: internal linking within a cluster — every post links to
 * its siblings, satisfying the "mínimo 3 enlaces internos" rule in
 * docs/content-strategy.md §4.3.
 *
 * GROWTH-2 Fase 2.9 (B1b): also links onward to the cluster's own pillar
 * page (/blog/<cluster>) — "todo satélite enlaza a su página pilar"
 * (content-strategy.md §4.3). Unlike the sibling list, this link always
 * renders (when the cluster is known) even for a cluster with no siblings
 * yet, since the pillar page itself exists regardless.
 */
export function RelatedPosts({
  cluster,
  currentSlug
}: {
  cluster: BlogPost["cluster"];
  currentSlug: string;
}) {
  const siblings = getPostsByCluster(cluster).filter((p) => p.slug !== currentSlug);
  const clusterInfo = getBlogCluster(cluster);
  if (siblings.length === 0 && !clusterInfo) return null;

  return (
    <div className="blog-related">
      <h2>Sigue leyendo</h2>
      <ul>
        {siblings.map((post) => (
          <li key={post.slug}>
            <Link href={`/blog/${post.slug}`}>{post.title}</Link>
          </li>
        ))}
        {clusterInfo && (
          <li>
            <Link href={`/blog/${cluster}`}>Ver todos los artículos de {clusterInfo.title}</Link>
          </li>
        )}
      </ul>
    </div>
  );
}
