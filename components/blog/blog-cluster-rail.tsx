"use client";

import { useState } from "react";
import Link from "next/link";
import type { BlogPost } from "@/lib/blog/posts";

/**
 * Cuántos artículos más se revelan por cada clic en "Ver más" — antes era
 * el enlace a la pillar page del clúster (`/blog/<key>`); ahora "Ver más"
 * carga más tarjetas de la misma categoría in situ, en pasos de tres, hasta
 * agotar el clúster (fundador, 2026-09-19).
 */
const LOAD_MORE_STEP = 3;

const dateFormatter = new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "long", year: "numeric" });

export function BlogClusterRail({
  title,
  description,
  dotColor,
  tileClass,
  posts,
  initialCount
}: {
  title: string;
  description: string;
  dotColor: string;
  tileClass: string;
  posts: BlogPost[];
  initialCount: number;
}) {
  const [visibleCount, setVisibleCount] = useState(initialCount);
  const shown = posts.slice(0, visibleCount);
  const hasMore = visibleCount < posts.length;

  return (
    <section className="blog-rail">
      <div className="blog-rail-head">
        <div className="blog-rail-head-left">
          <span className="blog-rail-dot" style={{ background: dotColor }} />
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
      </div>
      {shown.length > 0 ? (
        <div className="blog-rail-grid">
          {shown.map((post) => (
            <Link key={post.slug} href={`/blog/${post.slug}`} className={`blog-tile ${tileClass}`}>
              <h2>{post.title}</h2>
              <p>{post.description}</p>
              <time dateTime={post.datePublished}>{dateFormatter.format(new Date(post.datePublished))}</time>
            </Link>
          ))}
        </div>
      ) : (
        <p className="blog-cluster-soon">Próximamente.</p>
      )}
      {hasMore && (
        <button type="button" className="blog-rail-more" onClick={() => setVisibleCount((count) => count + LOAD_MORE_STEP)}>
          Ver más →
        </button>
      )}
    </section>
  );
}
