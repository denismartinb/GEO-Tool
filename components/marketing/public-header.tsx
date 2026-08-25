"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BrandLogo } from "@/components/ui/brand-logo";
import { Icon } from "@/components/ui/icon";
import { MarketingMobileNav } from "@/components/marketing-mobile-nav";
import { PromoStrip } from "@/components/landing/session-ctas";
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
      <div className="lp-user-chip-identity" aria-hidden="true">
        <div className="lp-user-chip-email">{user.email}</div>
        {showsPlanBadge(user.planId) && (
          <span className="sb-plan-badge">
            {/* ux-pilot, pro-badge-alignment-flickering-v4brfv: 12px instead of
                the sidebar's 10px — this chip's own mobile-drawer capture is
                where the glyph sat closest to the legibility floor. */}
            <Icon name="crown" size={12} />
            {user.planName}
          </span>
        )}
      </div>
    </Link>
  );
}

/**
 * header-flicker-skeleton-prehydration (2026-08-20): a content-free
 * placeholder, always in the DOM next to the real anonymous CTAs / account
 * chip, hidden by default (`app/globals.css`). The blocking inline script in
 * `app/layout.tsx` can flip it on before React ever runs, because it never
 * renders anything from the cached identity — no email, no plan — so it's
 * safe to show before anyone has verified that cache is still true. Once
 * `useSessionUser`'s layout effect clears `data-session-hint`
 * (`lib/use-session-user.ts`), this goes back to hidden and whichever real
 * content React rendered (chip or CTAs) is what's on screen.
 */
function SessionSkeleton() {
  return (
    <span className="lp-session-skeleton" aria-hidden="true">
      <span className="lp-session-skeleton-avatar" />
      <span className="lp-session-skeleton-bar" />
    </span>
  );
}

/**
 * Single source of truth for the public-site nav links, shared by every
 * marketing surface (home, /pricing, /geo, blog/comparativas/glosario,
 * /docs, legal pages). GENSCORE-HEADER-1: previously each surface kept its
 * own hand-copied array and silently drifted (missing links, missing mobile
 * CTAs, a different burger/drawer behavior on home vs everywhere else).
 *
 * **"Comparativas" salió de aquí** (fundador, 2026-08-24: "Quitamos
 * comparativas de la cabecera"), supersediendo COMPARATIVAS-DESIGN-1
 * (2026-08-11), que lo puso en la cabecera además del pie. Las páginas de
 * `/comparativas` y su enlace del pie de página siguen ahí — esto retira sólo
 * la entrada de la cabecera.
 *
 * **"Recomendaciones" también sale** (fundador, 2026-08-24: "ya no apunta a
 * nada"). El ancla `#recomendaciones` era la sección SPOTLIGHT, retirada de
 * la portada en HOME-2026-08 (log §159) — el enlace llevaba desde entonces a
 * ningún sitio. Quitado "de momento": si «Cinco pantallas» u otra sección
 * gana un ancla equivalente, el enlace puede volver apuntando ahí.
 */
const PUBLIC_NAV_ITEMS: NavItem[] = [
  { anchor: "producto", label: "Producto" },
  { anchor: "como", label: "Cómo funciona" },
  { href: "/geo", label: "Qué es GEO" },
  { href: "/pricing", label: "Precios" },
  { href: "/blog", label: "Blog" }
];

/**
 * `hero` mirrors the home hero repaint (BRAND-5b). Hasta HEADER-FLAT-1
 * también decidía el fondo de la barra, y cada superficie no-portada
 * conservaba el suyo; eso ya no es así — ver el párrafo de HEADER-FLAT-1
 * abajo, que es lo que manda hoy sobre el fondo.
 *
 * header-consistency-public-private, 2026-08-15 (founder-approved on the
 * real preview, in two steps: first the burger-left/logo-centered side, then
 * the full shared-chassis pass below): the drawer opens from the left
 * (MarketingMobileNav's default — `fromRight` is no longer passed) and the
 * mobile burger sits at the left with the logo centered, matching
 * WorkspaceTopbar's anatomy (`.hdr-burger` left / `.hdr-brand-mobile`
 * centered). This SUPERSEDES the 2026-08-12 "el menú siempre sale desde la
 * derecha" decision (GENSCORE-HEADER-1, design-decisions-log §63) — closed
 * out in §101, same PR. `.lp-mobnav--right` stays in globals.css unused,
 * same as it was before. The drawer's own brand row (`brand` prop below) is
 * new in this same pass — see MarketingMobileNav and the `.lp-mobnav-brand`
 * rule in globals.css.
 *
 * HEADER-FLAT-1 (2026-08-15): este componente pone ahora su propio
 * `.lp-nav-wrap`. Antes lo envolvían a mano las seis superficies y la portada
 * no lo hacía en absoluto — de ahí la diferencia que el fundador señaló:
 * portada plana, resto con barra blanca. Ahora las siete son planas, y el
 * glifo de dos rayas (`twoLine`, que sólo usaba la portada) es el de todas.
 *
 * `hero` ya no controla el fondo — lo controla el wrap, igual para todas — y
 * queda sólo para lo que siempre fue suyo: el relleno y la tipografía del
 * hero de portada (`.lp-nav--hero`, BRAND-5b).
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
    <>
      {/* PROMO-EVERYWHERE-1 (fundador, 2026-08-25: "lleva la misma tira de
          promocion a todas las urls públicas si el usuario no está logado").
          Vivía sólo en el hero de la home (`LandingPage`); movida aquí para
          que salga en las siete superficies públicas que comparten
          `PublicHeader` (home, /geo, /pricing, /blog, /comparativas,
          /glosario, /docs, legales) sin copiar el render en cada una — el
          mismo motivo por el que `PUBLIC_NAV_ITEMS` vive en un solo sitio
          (GENSCORE-HEADER-1, comentario de arriba). El propio componente
          decide si se muestra (`showsPromoStrip`, `lib/account-chip.ts`):
          nada logado que ya pague la ve, pero sí un anónimo o un Free
          logado — no es "sólo si no está logado" en sentido estricto, y se
          mantiene así a propósito (fundador, 2026-08-12, GENSCORE-HEADER-3).
          No es sticky: ocupa su propio alto y empuja `.lp-nav-wrap` hacia
          abajo, igual que hacía dentro de `.lp-hero--home`. */}
      <PromoStrip />
      <div className="lp-nav-wrap">
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
        <SessionSkeleton />
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
        twoLine
        brand={
          <Link href="/" className="lp-mobnav-brandmark">
            <BrandLogo size={22} />
          </Link>
        }
        ctas={
          <>
            <SessionSkeleton />
            {user ? (
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
            )}
          </>
        }
      />
    </nav>
    </div>
    </>
  );
}
