import "./globals.css";
import type { Metadata, Viewport } from "next";
import { Hanken_Grotesk, Bricolage_Grotesque, Figtree, JetBrains_Mono } from "next/font/google";
import { PostHogProvider } from "@/components/posthog-provider";
import { OrganizationSchema } from "@/components/seo/organization-schema";

// TODO(BRAND-5b): Hanken Grotesk is the outgoing UI typeface (BRAND-5,
// docs/brand/brand-guidelines.md) — still loaded and wired to --font-sans so
// the current UI keeps rendering unchanged until 5b repaints it onto
// Figtree/Bricolage and this import is dropped.
const sans = Hanken_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-sans",
  display: "swap"
});

// Brand typography (BRAND-5a): Bricolage Grotesque for headings and the
// hero score number, Figtree for body/UI text and small tabular numbers.
// Not yet wired into any CSS — 5b applies them across the app.
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

export const metadata: Metadata = {
  metadataBase: new URL("https://www.genscore.es"),
  title: "Genscore",
  description: "Espacio de visibilidad de marca en motores de IA",
  icons: {
    icon: [
      { url: "/brand/favicon-16.png", sizes: "16x16", type: "image/png" },
      { url: "/brand/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/icon.svg", type: "image/svg+xml" }
    ],
    apple: [{ url: "/brand/apple-touch-icon.png", sizes: "180x180", type: "image/png" }]
  },
  openGraph: {
    title: "Genscore",
    description: "Espacio de visibilidad de marca en motores de IA",
    url: "https://www.genscore.es",
    siteName: "Genscore",
    images: [{ url: "/brand/genscore-og.png", width: 1200, height: 630 }],
    locale: "es_ES",
    type: "website"
  },
  twitter: {
    card: "summary_large_image",
    title: "Genscore",
    description: "Espacio de visibilidad de marca en motores de IA",
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
