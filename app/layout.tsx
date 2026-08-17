import "./globals.css";
import type { Metadata, Viewport } from "next";
import { Hanken_Grotesk, Bricolage_Grotesque, Figtree, JetBrains_Mono } from "next/font/google";
import { PostHogProvider } from "@/components/posthog-provider";
import { OrganizationSchema } from "@/components/seo/organization-schema";
import { CANONICAL_DEFINITION } from "@/lib/brand/canonical-definition";

// TODO(BRAND-5b): Hanken Grotesk is the outgoing UI typeface (BRAND-5,
// docs/brand/brand-guidelines.md). It stays until 5b repaints the UI onto
// Figtree/Bricolage.
//
// Corrected 2026-08-09 (PRELAUNCH-HARDENING-1 Fase V) — the previous version
// of this comment was wrong in both directions, and a future session would
// have made the wrong call from it:
//   - it said Hanken was "wired to --font-sans". `var(--font-sans)` is read
//     **zero** times in app/globals.css. Hanken is reached by its literal
//     family name instead (`body` at globals.css:88, plus 15 fallback-chain
//     mentions). That works because next/font/google registers Google fonts
//     under their real family name here, not a hashed one — verified against
//     the built CSS, where the @font-face is literally `font-family:Hanken
//     Grotesk`. So dropping this import is NOT a free perf win: it would
//     change how the whole product renders, which is 5b's job, not a
//     refactor's.
//   - it said Bricolage/Figtree were "not yet wired into any CSS". They are:
//     `var(--font-display)` is used 45 times and `var(--font-body)` 13.
//
// Open question for BRAND-5b, measured while auditing performance: the CSS
// asks for weights 450/550/650/750 (650 alone 54 times, 750 58 times), but
// only the static instances listed below are loaded, so the browser snaps
// those to the nearest one — they are not rendering as written today.
// Switching these families to their variable versions would fix that AND load
// one file per family instead of 5+3+2, but it changes how text looks, so it
// needs a design decision and a pilot pass, not a silent optimisation.
const sans = Hanken_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-sans",
  display: "swap"
});

// Brand typography (BRAND-5a): Bricolage Grotesque for headings and the
// hero score number, Figtree for body/UI text and small tabular numbers.
// Both ARE wired into app/globals.css (see the note above); 5b is about
// finishing the migration off Hanken, not about starting to use these.
const display = Bricolage_Grotesque({
  subsets: ["latin"],
  weight: ["700", "800"],
  variable: "--font-display",
  display: "swap"
});

const body = Figtree({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-body",
  display: "swap"
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-mono",
  display: "swap"
});

// ROOT-METADATA-1. El `description` de aquí era una redacción propia más de
// qué es GenScore —la quinta— y pasa a ser la canónica, la misma cadena que
// usan `/que-es-genscore`, su FAQ y el `SoftwareApplication` (Fase E, log
// §100). No tiene efecto en buscadores: desde esta fase ninguna página
// **pública** hereda este respaldo, y las que lo heredaban eran todas de
// consola, detrás de autenticación y en el `disallow` de `robots.ts`. Se
// unifica porque una descripción divergente envejece sola, no porque nadie la
// lea.
//
// El `title` sigue siendo la marca a secas: es el respaldo de una página sin
// título propio, y ahí lo correcto es el nombre. Convertirlo en
// `{ default, template }` es la solución elegante y hoy rompería 33 títulos
// públicos que ya escriben «— GenScore» a mano — ver `console-metadata.ts`.
export const metadata: Metadata = {
  metadataBase: new URL("https://www.genscore.es"),
  title: "GenScore",
  description: CANONICAL_DEFINITION,
  icons: {
    icon: [
      { url: "/brand/favicon-16.png", sizes: "16x16", type: "image/png" },
      { url: "/brand/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icon.svg", type: "image/svg+xml" }
    ],
    apple: [{ url: "/brand/apple-touch-icon.png", sizes: "180x180", type: "image/png" }]
  },
  openGraph: {
    title: "GenScore",
    description: CANONICAL_DEFINITION,
    url: "https://www.genscore.es",
    siteName: "GenScore",
    images: [{ url: "/brand/genscore-og.png", width: 1200, height: 630 }],
    locale: "es_ES",
    type: "website"
  },
  twitter: {
    card: "summary_large_image",
    title: "GenScore",
    description: CANONICAL_DEFINITION,
    images: ["/brand/genscore-og.png"]
  },
  // GROWTH-2 Fase 2.1: Search Console ownership verification. Mirrors the
  // Sentry/PostHog pattern — no-op (tag omitted entirely) until the founder
  // creates the property and sets the env var, see docs/environment-contract.md.
  ...(process.env.GOOGLE_SITE_VERIFICATION
    ? { verification: { google: process.env.GOOGLE_SITE_VERIFICATION } }
    : {})
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={`${sans.variable} ${display.variable} ${body.variable} ${mono.variable}`}>
      <body>
        <OrganizationSchema />
        <PostHogProvider>{children}</PostHogProvider>
      </body>
    </html>
  );
}
