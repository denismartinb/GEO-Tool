"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { BLOG_CLUSTERS } from "@/lib/blog/posts";

/**
 * "Blog" nav item on the public header. Split in two, on purpose: "Blog"
 * itself is a plain link straight to /blog (the founder's first pass wrapped
 * the whole label in a toggle button, which meant clicking "Blog" only opened
 * a panel and there was no way to reach /blog from the header at all), and a
 * small caret next to it opens a compact panel with the real cluster
 * taxonomy (BLOG_CLUSTERS) + Comparativas. Desktop only — PublicHeader's
 * mobile drawer (MarketingMobileNav) takes a flat `links` array with no
 * nesting, so "Blog" stays a plain link there, same as every other item.
 */
export function BlogNavDropdown({ active }: { active: boolean }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!wrapRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className="lp-nav-drop" ref={wrapRef}>
      <Link href="/blog" className={active ? "active" : ""}>
        Blog
      </Link>
      <button
        type="button"
        className="lp-nav-drop-toggle"
        aria-expanded={open}
        aria-label="Ver categorías del blog"
        onClick={() => setOpen((v) => !v)}
      >
        <svg width="9" height="6" viewBox="0 0 10 6" fill="none" aria-hidden="true">
          <path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.6" />
        </svg>
      </button>
      {open && (
        <div className="lp-nav-drop-panel">
          {BLOG_CLUSTERS.map((cluster) => (
            <Link
              key={cluster.key}
              href={`/blog/${cluster.key}`}
              className="lp-nav-drop-item"
              onClick={() => setOpen(false)}
            >
              {cluster.title}
            </Link>
          ))}
          <Link href="/comparativas" className="lp-nav-drop-item" onClick={() => setOpen(false)}>
            Comparativas
          </Link>
        </div>
      )}
    </div>
  );
}
