import type { ReactNode } from "react";
import Link from "next/link";
import { PublicHeader } from "@/components/marketing/public-header";
import { FreeReportPromoCard } from "@/components/free-report/free-report-promo-card";
import { PublicFooter } from "@/components/marketing/public-footer";

/**
 * GROWTH-1 blog shell — deliberately mirrors components/legal-page-shell.tsx
 * (same nav/footer pattern as /privacidad, /terminos, /precios) rather than
 * introducing a new layout system for what is, visually, the same marketing
 * chrome around different body content.
 */
export function BlogPageShell({
  activeHref = "/blog",
  breadcrumb,
  hero,
  children
}: {
  /** Which unified nav link to mark active. Defaults to Blog — pass "/comparativas"
   * or "/glosario" from those surfaces, which share this shell but aren't
   * themselves nav items, so they render with none highlighted. */
  activeHref?: string;
  /**
   * Optional visible breadcrumb trail (BLOG-INDEX-CARDS-2026-08, founder
   * request: "los artículos y comparativas deberían tener rastro de miga").
   * Opt-in on purpose: this shell also renders /docs, /glosario, the free
   * checker and `/que-es-genscore`, none of which asked for this, so an
   * unset prop must change nothing for them. Pair with
   * `blogPostBreadcrumb()`/`COMPARATIVAS_BREADCRUMB` — never hand-write a
   * trail at the call site.
   */
  breadcrumb?: { label: string; href: string }[];
  /**
   * BLOG-REDESIGN-1: full-bleed dark hero rendered above the body
   * (`<ArticleHero post={post} />`). When set, the body section gets the
   * `lp-article` scope that restyles the article blocks after the PDF study,
   * and the hero carries its own breadcrumb — so `breadcrumb` is ignored.
   * Blog articles and the /blog index pass it; /comparativas, /docs and
   * /glosario keep the previous look.
   */
  hero?: ReactNode;
  /** Optional: the free checker renders its whole page inside `hero`
   * (GEO-SELF-1 Fase 5), so without children the body section is skipped. */
  children?: ReactNode;
}) {
  return (
    <div className="lp">
      <PublicHeader activeHref={activeHref} />

      <main>
        {hero}
        {children !== undefined && (
        <section className={hero ? "lp-section lp-article" : "lp-section"}>
          <div className="lp-inner">
            {!hero && breadcrumb && breadcrumb.length > 0 && (
              <nav className="breadcrumb-trail" aria-label="Migas de pan">
                {breadcrumb.map((item, index) => (
                  <span key={item.href} className="breadcrumb-item">
                    {index > 0 && (
                      <span className="breadcrumb-sep" aria-hidden="true">
                        /
                      </span>
                    )}
                    <Link href={item.href}>{item.label}</Link>
                  </span>
                ))}
              </nav>
            )}
            {children}
          </div>
        </section>
        )}
      </main>

      <PublicFooter />
      <FreeReportPromoCard />
    </div>
  );
}
