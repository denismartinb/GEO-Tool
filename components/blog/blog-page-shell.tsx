import type { ReactNode } from "react";
import Link from "next/link";
import { BrandLogo } from "@/components/ui/brand-logo";
import { PublicHeader } from "@/components/marketing/public-header";
import { MARKETING_CONTENT_LINKS, MARKETING_ENTITY_LINKS } from "@/components/marketing-content-links";

/**
 * GROWTH-1 blog shell — deliberately mirrors components/legal-page-shell.tsx
 * (same nav/footer pattern as /privacidad, /terminos, /pricing) rather than
 * introducing a new layout system for what is, visually, the same marketing
 * chrome around different body content.
 */
export function BlogPageShell({
  activeHref = "/blog",
  breadcrumb,
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
  children: ReactNode;
}) {
  return (
    <div className="lp">
      <PublicHeader activeHref={activeHref} />

      <main>
        <section className="lp-section">
          <div className="lp-inner">
            {breadcrumb && breadcrumb.length > 0 && (
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
      </main>

      <footer className="lp-footer">
        <div className="lp-inner">
          <div className="row1">
            <Link href="/" className="lp-logo">
              <BrandLogo size={19} />
            </Link>
            <nav className="links" aria-label="Pie de página">
              <Link href="/#producto">Producto</Link>
              <Link href="/geo">Qué es GEO</Link>
              <Link href="/pricing">Precios</Link>
              {MARKETING_CONTENT_LINKS.map((l) => (
                <Link key={l.href} href={l.href}>
                  {l.label}
                </Link>
              ))}
              {MARKETING_ENTITY_LINKS.map((l) => (
                <Link key={l.href} href={l.href}>
                  {l.label}
                </Link>
              ))}
              <Link href="/privacidad">Privacidad</Link>
              <Link href="/terminos">Términos</Link>
            </nav>
          </div>
          <div className="copy">© 2026 GenScore · Generative Engine Optimization para empresas y agencias.</div>
        </div>
      </footer>
    </div>
  );
}
