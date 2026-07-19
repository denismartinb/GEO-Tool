import type { ReactNode } from "react";
import Link from "next/link";
import { BrandLogo } from "@/components/ui/brand-logo";
import { MarketingMobileNav } from "@/components/marketing-mobile-nav";

const LEGAL_NAV_LINKS = [
  { href: "/privacidad", label: "Privacidad" },
  { href: "/cookies", label: "Cookies" },
  { href: "/terminos", label: "Términos" }
];

export function LegalPageShell({
  title,
  updated,
  activeHref,
  children
}: {
  title: string;
  updated: string;
  activeHref: string;
  children: ReactNode;
}) {
  return (
    <div className="lp">
      <div className="lp-nav-wrap">
        <nav className="lp-nav">
          <MarketingMobileNav links={[{ href: "/", label: "Inicio" }, ...LEGAL_NAV_LINKS]} />
          <Link href="/" className="lp-logo">
            <BrandLogo size={22} textSize={16} />
          </Link>
          <div className="lp-nav-links">
            {LEGAL_NAV_LINKS.map((l) => (
              <Link key={l.href} href={l.href} className={l.href === activeHref ? "active" : ""}>
                {l.label}
              </Link>
            ))}
          </div>
          <div className="lp-nav-right">
            <Link href="/login" className="btn btn-ghost btn-sm">
              Iniciar sesión
            </Link>
            <Link href="/signup?plan=free" className="btn btn-primary btn-sm">
              Prueba gratis
            </Link>
          </div>
        </nav>
      </div>

      <section className="lp-section" style={{ paddingBottom: 0 }}>
        <div className="lp-inner">
          <h1 className="lp-h2">{title}</h1>
          <p className="legal-updated">Última actualización: {updated}</p>
        </div>
      </section>

      <section className="lp-section">
        <div className="lp-inner legal-body">{children}</div>
      </section>

      <footer className="lp-footer">
        <div className="lp-inner">
          <div className="row1">
            <Link href="/" className="lp-logo">
              <BrandLogo size={20} textSize={15} />
            </Link>
            <div className="links">
              <Link href="/#producto">Producto</Link>
              <Link href="/#como">Cómo funciona</Link>
              <Link href="/pricing">Precios</Link>
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
