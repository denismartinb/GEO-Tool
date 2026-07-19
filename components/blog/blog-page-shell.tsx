import type { ReactNode } from "react";
import Link from "next/link";
import { Icon } from "@/components/ui/icon";
import { MarketingMobileNav } from "@/components/marketing-mobile-nav";

const NAV_LINKS = [
  { href: "/geo", label: "Qué es GEO" },
  { href: "/blog", label: "Blog" },
  { href: "/pricing", label: "Precios" }
];

/**
 * GROWTH-1 blog shell — deliberately mirrors components/legal-page-shell.tsx
 * (same nav/footer pattern as /privacidad, /terminos, /pricing) rather than
 * introducing a new layout system for what is, visually, the same marketing
 * chrome around different body content.
 */
export function BlogPageShell({ children }: { children: ReactNode }) {
  return (
    <div className="lp">
      <div className="lp-nav-wrap">
        <nav className="lp-nav">
          <MarketingMobileNav links={[{ href: "/", label: "Inicio" }, ...NAV_LINKS]} />
          <Link href="/" className="lp-logo">
            <div className="brand-mark">
              <Icon name="resonance" size={17} />
            </div>
            <div className="brand-name">GenScore</div>
          </Link>
          <div className="lp-nav-links">
            {NAV_LINKS.map((l) => (
              <Link key={l.href} href={l.href} className={l.href === "/blog" ? "active" : ""}>
                {l.label}
              </Link>
            ))}
          </div>
          <div className="lp-nav-right">
            <Link href="/login" className="btn btn-ghost btn-sm">
              Iniciar sesión
            </Link>
            <Link href="/signup" className="btn btn-primary btn-sm">
              Prueba gratis
            </Link>
          </div>
        </nav>
      </div>

      <section className="lp-section">
        <div className="lp-inner">{children}</div>
      </section>

      <footer className="lp-footer">
        <div className="lp-inner">
          <div className="row1">
            <Link href="/" className="lp-logo">
              <div className="brand-mark">
                <Icon name="resonance" size={16} />
              </div>
              <div className="brand-name">GenScore</div>
            </Link>
            <div className="links">
              <Link href="/#producto">Producto</Link>
              <Link href="/geo">Qué es GEO</Link>
              <Link href="/pricing">Precios</Link>
              <Link href="/blog">Blog</Link>
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
