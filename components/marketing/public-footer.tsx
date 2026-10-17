import Link from "next/link";
import { BrandLogo } from "@/components/ui/brand-logo";
import { PaymentBadgesRow } from "@/components/marketing/payment-badges";
import { FooterConsentLink } from "@/components/marketing/footer-consent-link";
import { PUBLIC_FOOTER_GROUPS, PUBLIC_FOOTER_LEGAL_LINKS } from "@/components/marketing-content-links";
import { SUPPORT_EMAIL } from "@/lib/support";

/**
 * FOOTER-UNIFY-1 (2026-10-17, log §312): the one footer of every public page,
 * founder-approved as «Opción A · Cuatro columnas»
 * (`docs/design-reference/footer-unify-1/`). Pages render this component and
 * never a `<footer>` of their own, which is what let seven versions drift
 * apart before.
 */
export function PublicFooter() {
  return (
    <footer className="lp-footer">
      <div className="lp-inner">
        <div className="pf-top">
          <div className="pf-brand">
            <Link href="/" className="lp-logo" aria-label="Inicio de GenScore">
              <BrandLogo size={19} />
            </Link>
            <p>Generative Engine Optimization para empresas y agencias.</p>
          </div>
          <nav className="pf-cols" aria-label="Pie de página">
            {PUBLIC_FOOTER_GROUPS.map((group) => (
              <div key={group.title} className="pf-col">
                <h2>{group.title}</h2>
                {group.links.map((l) => (
                  <Link key={l.href} href={l.href}>
                    {l.label}
                  </Link>
                ))}
                {group.title === "Empresa" ? <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a> : null}
              </div>
            ))}
          </nav>
        </div>
        <div className="lp-footer-pay">
          <PaymentBadgesRow />
        </div>
        <div className="pf-bottom">
          <span>© 2026 GenScore</span>
          <nav className="pf-legal" aria-label="Legal">
            {PUBLIC_FOOTER_LEGAL_LINKS.map((l) => (
              <Link key={l.href} href={l.href}>
                {l.label}
              </Link>
            ))}
            <FooterConsentLink />
          </nav>
        </div>
      </div>
    </footer>
  );
}
