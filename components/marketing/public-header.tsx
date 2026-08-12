"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BrandLogo } from "@/components/ui/brand-logo";
import { MarketingMobileNav } from "@/components/marketing-mobile-nav";

type NavItem = { anchor: string; label: string } | { href: string; label: string };

/**
 * Single source of truth for the public-site nav links, shared by every
 * marketing surface (home, /pricing, /geo, blog/comparativas/glosario,
 * /docs, legal pages). GENSCORE-HEADER-1: previously each surface kept its
 * own hand-copied array and silently drifted (missing links, missing mobile
 * CTAs, a different burger/drawer behavior on home vs everywhere else).
 */
const PUBLIC_NAV_ITEMS: NavItem[] = [
  { anchor: "producto", label: "Producto" },
  { anchor: "como", label: "Cómo funciona" },
  { anchor: "recomendaciones", label: "Recomendaciones" },
  { href: "/geo", label: "Qué es GEO" },
  { href: "/pricing", label: "Precios" },
  { href: "/blog", label: "Blog" }
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
        {hero ? (
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
          <>
            <button type="button" className="lp-cta-soft" onClick={goToLogin}>
              Iniciar sesión
            </button>
            <button type="button" className="lp-cta" onClick={goToSignup}>
              Prueba gratis
            </button>
          </>
        }
      />
    </nav>
  );
}
