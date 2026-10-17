import type { ReactNode } from "react";
import Link from "next/link";
import { PublicHeader } from "@/components/marketing/public-header";
import { FreeReportPromoCard } from "@/components/free-report/free-report-promo-card";
import { BreadcrumbSchema } from "@/components/seo/breadcrumb-schema";
import { DOCS_NAV } from "@/lib/docs/nav";
import { PublicFooter } from "@/components/marketing/public-footer";

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
      <PublicHeader />

      <BreadcrumbSchema
        items={[
          { name: "Inicio", url: SITE_URL },
          { name: "Docs", url: `${SITE_URL}/docs` }
        ]}
      />

      <main>
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
      </main>

      <PublicFooter />
      <FreeReportPromoCard />
    </div>
  );
}
