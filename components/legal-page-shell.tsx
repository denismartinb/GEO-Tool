import type { ReactNode } from "react";
import Link from "next/link";
import { PublicHeader } from "@/components/marketing/public-header";
import { PublicFooter } from "@/components/marketing/public-footer";
import { BrandLogo } from "@/components/ui/brand-logo";
import { isInApp } from "@/lib/app-mode-server";

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

/**
 * APP-LEGAL-1 (log §400). Inside the Android app (`gs_app`) the legal pages
 * are reachable from the login, but the public header and footer carry the
 * launch-price strip, «Precios» and the payment logos, which Google Play does
 * not allow in the app. There they get a bare bar with the brand and a way
 * back, and no footer.
 */
function AppLegalBar() {
  return (
    <div className="legal-appbar">
      <BrandLogo size={22} />
      <Link href="/login" className="link-mini">
        Volver
      </Link>
    </div>
  );
}

export async function LegalPageShell({
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
  const inApp = await isInApp();
  return (
    <div className="lp">
      {inApp ? <AppLegalBar /> : <PublicHeader />}

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

      {inApp ? null : <PublicFooter />}
    </div>
  );
}
