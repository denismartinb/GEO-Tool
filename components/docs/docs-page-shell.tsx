import type { ReactNode } from "react";
import Link from "next/link";
import { BrandLogo } from "@/components/ui/brand-logo";
import { MarketingMobileNav } from "@/components/marketing-mobile-nav";
import { BreadcrumbSchema } from "@/components/seo/breadcrumb-schema";
import { DOCS_NAV } from "@/lib/docs/nav";

const NAV_LINKS = [
  { href: "/geo", label: "Qué es GEO" },
  { href: "/docs", label: "Docs" },
  { href: "/blog", label: "Blog" },
  { href: "/pricing", label: "Precios" }
];

const SITE_URL = "https://www.genscore.es";

/**
 * GROWTH-2 Fase 2.3 doc page shell — a sidebar mirroring the product's own
 * report structure (same idea as Semrush's Knowledge Base nav: the
 * documentation tree is a 1:1 mirror of the product, not a generic docs
 * template). Reuses the marketing chrome (lp-nav/lp-footer) from
 * BlogPageShell/LegalPageShell rather than inventing a new one.
 */
export function DocsPageShell({
  activeSlug,
  children
}: {
  /** Slug of the current page in lib/docs/nav.ts, or undefined for the /docs index. */
  activeSlug?: string;
  children: ReactNode;
}) {
  return (
    <div className="lp">
      <div className="lp-nav-wrap">
        <nav className="lp-nav">
          <MarketingMobileNav links={[{ href: "/", label: "Inicio" }, ...NAV_LINKS]} />
          <Link href="/" className="lp-logo">
            <BrandLogo size={22} />
          </Link>
          <div className="lp-nav-links">
            {NAV_LINKS.map((l) => (
              <Link key={l.href} href={l.href} className={l.href === "/docs" ? "active" : ""}>
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

      <BreadcrumbSchema
        items={[
          { name: "Inicio", url: SITE_URL },
          { name: "Docs", url: `${SITE_URL}/docs` }
        ]}
      />

      <section className="lp-section">
        <div className="lp-inner docs-layout">
          <aside className="docs-side" aria-label="Navegación de la documentación">
            <Link href="/docs" className={`docs-side-home${!activeSlug ? " active" : ""}`}>
              Documentación
            </Link>
            {DOCS_NAV.map((section) => (
              <div key={section.title} className="docs-side-section">
                <div className="docs-side-title">{section.title}</div>
                {section.pages.map((page) => (
                  <Link
                    key={page.slug}
                    href={`/docs/${page.slug}`}
                    className={page.slug === activeSlug ? "active" : ""}
                  >
                    {page.title}
                  </Link>
                ))}
              </div>
            ))}
          </aside>
          <div className="docs-content">{children}</div>
        </div>
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
              <Link href="/docs">Docs</Link>
              <Link href="/pricing">Precios</Link>
              <Link href="/blog">Blog</Link>
              <Link href="/privacidad">Privacidad</Link>
              <Link href="/terminos">Términos</Link>
            </div>
          </div>
          <div className="copy">© 2026 Genscore · Generative Engine Optimization para empresas y agencias.</div>
        </div>
      </footer>
    </div>
  );
}
