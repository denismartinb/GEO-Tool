import type { ReactNode } from "react";
import Link from "next/link";
import { BrandLogo } from "@/components/ui/brand-logo";
import { PublicHeader } from "@/components/marketing/public-header";
import { MARKETING_CONTENT_LINKS, MARKETING_ENTITY_LINKS } from "@/components/marketing-content-links";

/**
 * Cross-nav between the three legal docs. Not part of the unified
 * PublicHeader (GENSCORE-HEADER-1) — Privacidad/Cookies/Términos aren't
 * public nav items — but /cookies has no other in-page link on legal pages,
 * so it stays as a lightweight secondary row under the shared header.
 */
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
        <PublicHeader />
      </div>

      <section className="lp-section" style={{ paddingBottom: 0 }}>
        <div className="lp-inner">
          <h1 className="lp-h2">{title}</h1>
          <p className="legal-updated">Última actualización: {updated}</p>
          <div className="legal-subnav">
            {LEGAL_NAV_LINKS.map((l) =>
              l.href === activeHref ? (
                <span key={l.href} className="legal-subnav-current">
                  {l.label}
                </span>
              ) : (
                <Link key={l.href} href={l.href} className="link-mini">
                  {l.label}
                </Link>
              )
            )}
          </div>
        </div>
      </section>

      <section className="lp-section">
        <div className="lp-inner legal-body">{children}</div>
      </section>

      <footer className="lp-footer">
        <div className="lp-inner">
          <div className="row1">
            <Link href="/" className="lp-logo">
              <BrandLogo size={19} />
            </Link>
            <div className="links">
              <Link href="/#producto">Producto</Link>
              <Link href="/#como">Cómo funciona</Link>
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
            </div>
          </div>
          <div className="copy">© 2026 GenScore · Generative Engine Optimization para empresas y agencias.</div>
        </div>
      </footer>
    </div>
  );
}
