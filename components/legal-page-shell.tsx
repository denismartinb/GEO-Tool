import type { ReactNode } from "react";
import Link from "next/link";
import { PublicHeader } from "@/components/marketing/public-header";
import { PublicFooter } from "@/components/marketing/public-footer";

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
      <PublicHeader />

      <main>
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
      </main>

      <PublicFooter />
    </div>
  );
}
