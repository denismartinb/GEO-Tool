import type { Metadata } from "next";
import { PricingPage } from "@/components/pricing/pricing-page";
import { contentMetadata } from "@/lib/seo/metadata";

/**
 * SEO-POS-1 (T1). Mismo caso que la home: `/pricing` era cliente entero, sin
 * título ni descripción ni canonical propios pese a ser la segunda URL
 * comercial del sitio y una consulta con intención de compra
 * ("cuánto cuesta el posicionamiento GEO" aparece entre las preguntas reales
 * del sector, docs/seo-positioning-plan.md §3.3).
 *
 * Los precios de la descripción salen de `plans-data.ts` — si cambian ahí,
 * cambian aquí (lo cubre `app/pricing/pricing-metadata.test.ts`).
 */
export const metadata: Metadata = contentMetadata({
  title: "Precios de GenScore — planes de posicionamiento GEO desde 0 €",
  description:
    "Empieza gratis con un escaneo puntual y sube a Starter (45 €/mes) o Pro (179 €/mes) cuando quieras seguimiento continuo de tu visibilidad en ChatGPT, Gemini y Claude. Sin permanencia.",
  path: "/pricing"
});

export default function Page() {
  return <PricingPage />;
}
