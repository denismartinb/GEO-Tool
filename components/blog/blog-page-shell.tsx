import type { ReactNode } from "react";
import Link from "next/link";
import { BrandLogo } from "@/components/ui/brand-logo";
import { PublicHeader } from "@/components/marketing/public-header";
import { MARKETING_CONTENT_LINKS } from "@/components/marketing-content-links";

/**
 * GROWTH-1 blog shell — deliberately mirrors components/legal-page-shell.tsx
 * (same nav/footer pattern as /privacidad, /terminos, /pricing) rather than
 * introducing a new layout system for what is, visually, the same marketing
 * chrome around different body content.
 */
export function BlogPageShell({
  activeHref = "/blog",
  children
}: {
  /** Which unified nav link to mark active. Defaults to Blog — pass "/comparativas"
   * or "/glosario" from those surfaces, which share this shell but aren't
   * themselves nav items, so they render with none highlighted. */
  activeHref?: string;
  children: ReactNode;
}) {
  return (
    <div className="lp">
      <div className="lp-nav-wrap">
        <PublicHeader activeHref={activeHref} />
      </div>

      <section className="lp-section">
        <div className="lp-inner">{children}</div>
      </section>

      <footer className="lp-footer">
        <div className="lp-inner">
          <div className="row1">
            <Link href="/" className="lp-logo">
              <BrandLogo size={19} />
            </Link>
            <div className="links">
              <Link href="/#producto">Producto</Link>
              <Link href="/geo">Qué es GEO</Link>
              <Link href="/pricing">Precios</Link>
              {MARKETING_CONTENT_LINKS.map((l) => (
                <Link key={l.href} href={l.href}>
                  {l.label}
                </Link>
              ))}
              <Link href="/privacidad">Privacidad</Link>
              <Link href="/terminos">Términos</Link>
            </div>
          </div>
          <div className="copy">© 2026 GenScore · Generative Engine Optimization para empresas y agencias.</div>
        </div>
      </footer>
    </div>
  );
}
