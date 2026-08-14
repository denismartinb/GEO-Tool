"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BrandLogo } from "@/components/ui/brand-logo";
import { Icon } from "@/components/ui/icon";
import { MarketingMobileNav } from "@/components/marketing-mobile-nav";
import { avatarInitials, showsPlanBadge } from "@/lib/account-chip";
import { useSessionUser, type SessionUser } from "@/lib/use-session-user";

type NavItem = { anchor: string; label: string } | { href: string; label: string };

/**
 * The console sidebar's account chip, reused verbatim on the public header.
 * Links to the console, which is what a returning logged-in visitor actually
 * wants from a marketing page.
 *
 * The accessible name is spelled out rather than left to the visual parts: the
 * avatar is two letters with no meaning read aloud, and the plan badge is a
 * crown glyph plus a bare word ("Agencia") that says nothing about being a
 * plan. `data-testid` is what lets the pilot's interaction sweep assert on the
 * chip instead of cropping pixels out of a screenshot (ux-pilot, 2026-08-12).
 */
function AccountChip({ user, onNavigate }: { user: SessionUser; onNavigate?: () => void }) {
  const planSuffix = showsPlanBadge(user.planId) ? `, plan ${user.planName}` : "";

  return (
    <Link
      href="/dashboard"
      className="user-chip lp-user-chip"
      onClick={onNavigate}
      data-testid="account-chip"
      aria-label={`Ir al panel. Cuenta: ${user.email}${planSuffix}`}
    >
      <div className="avatar" aria-hidden="true">
        {avatarInitials(user.email)}
      </div>
      <div style={{ minWidth: 0 }} aria-hidden="true">
        <div className="lp-user-chip-email">{user.email}</div>
        {showsPlanBadge(user.planId) && (
          <span className="sb-plan-badge">
            <Icon name="crown" size={10} />
            {user.planName}
          </span>
        )}
      </div>
    </Link>
  );
}

/**
 * Single source of truth for the public-site nav links, shared by every
 * marketing surface (home, /pricing, /geo, blog/comparativas/glosario,
 * /docs, legal pages). GENSCORE-HEADER-1: previously each surface kept its
 * own hand-copied array and silently drifted (missing links, missing mobile
 * CTAs, a different burger/drawer behavior on home vs everywhere else).
 *
 * "Comparativas" carries forward COMPARATIVAS-DESIGN-1 (founder, 2026-08-11):
 * it belongs in the top nav, not only in the footer — a reader mid-article is
 * exactly who'd want to compare tools, and comparison pages are the highest
 * purchase-intent content in the portfolio.
 */
const PUBLIC_NAV_ITEMS: NavItem[] = [
  { anchor: "producto", label: "Producto" },
  { anchor: "como", label: "Cómo funciona" },
  { anchor: "recomendaciones", label: "Recomendaciones" },
  { href: "/geo", label: "Qué es GEO" },
  { href: "/pricing", label: "Precios" },
  { href: "/blog", label: "Blog" },
  { href: "/comparativas", label: "Comparativas" }
];

/**
 * `hero` mirrors the home hero repaint (BRAND-5b): transparent nav bar and
 * a two-line burger glyph. Every other public page keeps its own
 * `.lp-hero`/`.lp-nav-wrap` background untouched (that scoping is
 * deliberate — see app/globals.css around `.lp-nav--hero`). The drawer
 * itself always slides from the right (founder, 2026-08-12: "el menú tiene
 * que salir siempre desde la derecha") — that part isn't hero-only.
 */
export function PublicHeader({ hero = false, activeHref }: { hero?: boolean; activeHref?: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const isHome = pathname === "/";
  const user = useSessionUser();

  const goToLogin = () => router.push("/login");
  const goToSignup = () => router.push("/signup");

  const links = PUBLIC_NAV_ITEMS.map((item) =>
    "anchor" in item
      ? { href: isHome ? `#${item.anchor}` : `/#${item.anchor}`, label: item.label, isAnchor: true }
      : { href: item.href, label: item.label, isAnchor: false }
  );

  return (
    <nav className={hero ? "lp-nav lp-nav--hero" : "lp-nav"}>
      <Link href="/" className="lp-logo">
        <BrandLogo size={22} />
      </Link>
      <div className="lp-nav-links">
        {links.map((l) =>
          l.isAnchor ? (
            <a key={l.href} href={l.href}>
              {l.label}
            </a>
          ) : (
            <Link key={l.href} href={l.href} className={l.href === activeHref ? "active" : ""}>
              {l.label}
            </Link>
          )
        )}
      </div>
      <div className="lp-nav-right">
        {user ? (
          <AccountChip user={user} />
        ) : hero ? (
          <>
            <button type="button" className="lp-nav-btn" onClick={goToLogin}>
              Iniciar sesión
            </button>
            <button type="button" className="lp-nav-btn lp-nav-btn--primary" onClick={goToSignup}>
              Prueba gratis
            </button>
          </>
        ) : (
          <>
            <Link href="/login" className="btn btn-ghost btn-sm">
              Iniciar sesión
            </Link>
            <Link href="/signup" className="btn btn-primary btn-sm">
              Prueba gratis
            </Link>
          </>
        )}
      </div>
      <MarketingMobileNav
        links={links}
        twoLine={hero}
        fromRight
        ctas={
          user ? (
            <AccountChip user={user} />
          ) : (
            <>
              <button type="button" className="lp-cta-soft" onClick={goToLogin}>
                Iniciar sesión
              </button>
              <button type="button" className="lp-cta" onClick={goToSignup}>
                Prueba gratis
              </button>
            </>
          )
        }
      />
    </nav>
  );
}
