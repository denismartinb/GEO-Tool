"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { BLOG_CLUSTERS } from "@/lib/blog/posts";

/**
 * "Blog" nav item on the public header: was a plain Link, now opens a panel
 * with the real cluster taxonomy (BLOG_CLUSTERS) instead of only being
 * reachable by landing on /blog and scrolling. Desktop only — PublicHeader's
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
      <button
        type="button"
        className={`lp-nav-drop-trigger${active ? " active" : ""}`}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        Blog
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
              <span className="lp-nav-drop-item-title">{cluster.title}</span>
              <span className="lp-nav-drop-item-desc">{cluster.description}</span>
            </Link>
          ))}
          <Link
            href="/comparativas"
            className="lp-nav-drop-item lp-nav-drop-item--full"
            onClick={() => setOpen(false)}
          >
            <span className="lp-nav-drop-item-title">Comparativas</span>
            <span className="lp-nav-drop-item-desc">
              GenScore frente a otras herramientas de visibilidad en IA, comparado de forma honesta.
            </span>
          </Link>
        </div>
      )}
    </div>
  );
}
