import type { Metadata } from "next";
import { PricingPage } from "@/components/pricing/pricing-page";
import { contentMetadata } from "@/lib/seo/metadata";
import { FaqPageSchema } from "@/components/seo/faq-page-schema";
import { PLAN_FAQ } from "./plans-data";

/**
 * PRICING-PROMO-1. `/pricing` is otherwise fully static — prerendered once
 * at build time — which means `getActivePromoPlanIds()` (date + Stripe
 * coupon check) would only ever be re-evaluated on the next deploy. Without
 * this, the promo band and struck-through price would keep showing forever
 * after `PROMO_ENDS_AT` passes: the Stripe coupon itself stops working at
 * `redeem_by` (checkout correctly reverts to the real price, since that path
 * is a Server Action and always runs fresh), but the static page would go on
 * advertising a discount nobody could actually get. An hour of staleness in
 * either direction is an acceptable trade for not needing a deploy to keep
 * the promo honest.
 */
export const revalidate = 3600;

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

/**
 * SEO-POS-1 (T8). `PLAN_FAQ` es la única lista de preguntas que la página
 * renderiza de verdad (`components/pricing/pricing-page.tsx`, acordeón de
 * "Lo que suelen preguntarnos") — el schema reusa exactamente esas mismas
 * preguntas y respuestas, nunca una lista aparte. `/geo` se queda fuera de
 * esta fase a propósito: no tiene ningún bloque de preguntas y respuestas
 * real, y `FaqPageSchema` existe para marcar contenido que ya está en la
 * página, no para fabricarlo (content-strategy.md §4.3).
 */
export default function Page() {
  return (
    <>
      <FaqPageSchema items={PLAN_FAQ.map((f) => ({ question: f.q, answer: f.a }))} />
      <PricingPage />
    </>
  );
}
