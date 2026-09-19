"use client";

import { useState } from "react";
import Link from "next/link";
import type { ComparativaLink } from "@/lib/comparativas";

/** Mismo paso que `BlogClusterRail` — "Ver más" carga tres comparativas más in situ. */
const LOAD_MORE_STEP = 3;

export function ComparativasRail({
  dotColor,
  items,
  initialCount
}: {
  dotColor: string;
  items: ComparativaLink[];
  initialCount: number;
}) {
  const [visibleCount, setVisibleCount] = useState(initialCount);
  const shown = items.slice(0, visibleCount);
  const hasMore = visibleCount < items.length;

  return (
    <section className="blog-rail">
      <div className="blog-rail-head">
        <div className="blog-rail-head-left">
          <span className="blog-rail-dot" style={{ background: dotColor }} />
          <h2>Comparativas</h2>
          <p>GenScore frente a otras herramientas de visibilidad en IA, de forma honesta.</p>
        </div>
        {hasMore && (
          <button type="button" className="blog-rail-more" onClick={() => setVisibleCount((count) => count + LOAD_MORE_STEP)}>
            Ver más →
          </button>
        )}
      </div>
      <div className="blog-rail-grid">
        {shown.map((c) => (
          <Link key={c.href} href={c.href} className="blog-tile blog-tile--comparativas">
            <h2>{c.title}</h2>
            <p>{c.blurb}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}
